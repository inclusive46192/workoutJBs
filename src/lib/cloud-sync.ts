import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBackupBundle,
  restoreBackupBundle,
  type BackupBundle,
  type RestoreSummary,
} from "@/lib/backup";

/**
 * Cloud mirror of the local data.
 *
 * Deliberately reuses the file-backup bundle and its merge logic rather than
 * introducing a second data model:
 *  - one row per user, holding the exact same v3 payload as a file export
 *  - pulling merges instead of overwriting, with the same conflict rule
 *    ("more logged exercises wins, updatedAt breaks ties"), so a stale cloud
 *    copy can never delete a session logged offline on this device
 *  - local storage stays the source of truth; the cloud is a mirror
 */

export type CloudResult =
  | { ok: true; kind: "pushed"; dayCount: number }
  | { ok: true; kind: "pulled"; summary: RestoreSummary }
  | { ok: true; kind: "empty" }
  | { ok: false; error: string; missingTable?: boolean };

export type CloudStatus = {
  hasRemote: boolean;
  remoteUpdatedAt: string | null;
  remoteDayCount: number;
};

const table = "backups";

type PostgrestLikeError = {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
};

/**
 * Turns a Postgres error into something actionable. The common setup mistakes
 * have distinct SQLSTATE codes, so they get a concrete instruction instead of
 * a raw driver message.
 */
function describe(error: PostgrestLikeError): CloudResult {
  const code = error.code ?? "";
  const message = error.message ?? "";

  // 42703 undefined_column - an older/partial table shape. Checked before the
  // table case because its message also contains "relation ... does not exist".
  if (code === "42703" || /column .* does not exist/i.test(message)) {
    return {
      ok: false,
      error: `Spalte fehlt (${message}). Tabelle 'backups' löschen und schema.sql erneut ausführen.`,
    };
  }
  // 42P01 undefined_table - schema.sql was never applied.
  if (code === "42P01" || /relation .* does not exist/i.test(message)) {
    return {
      ok: false,
      missingTable: true,
      error:
        "Tabelle 'backups' fehlt. Bitte supabase/schema.sql im SQL-Editor ausführen.",
    };
  }
  // 42501 insufficient_privilege / RLS rejected the write.
  if (code === "42501" || /row-level security/i.test(message)) {
    return {
      ok: false,
      error:
        "Row Level Security hat den Zugriff abgelehnt. Bitte die Policies aus schema.sql anlegen.",
    };
  }
  // PGRST301 / 401 - the JWT was not accepted.
  if (code === "PGRST301" || /jwt|unauthor/i.test(message)) {
    return { ok: false, error: "Anmeldung abgelaufen. Bitte ab- und wieder anmelden." };
  }

  const extra = [error.details, error.hint].filter(Boolean).join(" · ");
  return {
    ok: false,
    error: `${message}${code ? ` [${code}]` : ""}${extra ? ` – ${extra}` : ""}`,
  };
}

export async function readCloudStatus(
  client: SupabaseClient,
  userId: string,
): Promise<CloudStatus | null> {
  const { data, error } = await client
    .from(table)
    .select("updated_at, day_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return error ? null : { hasRemote: false, remoteUpdatedAt: null, remoteDayCount: 0 };
  }
  return {
    hasRemote: true,
    remoteUpdatedAt: (data.updated_at as string) ?? null,
    remoteDayCount: (data.day_count as number) ?? 0,
  };
}

export async function pushToCloud(
  client: SupabaseClient,
  userId: string,
): Promise<CloudResult> {
  const bundle = buildBackupBundle();
  // Stamp ownership so an exported file and a cloud row are interchangeable.
  const owned: BackupBundle = {
    ...bundle,
    owner: { ...bundle.owner, userId },
  };

  // select() so the write is confirmed rather than assumed: without it an RLS
  // rejection that affects zero rows can look like success.
  const { data, error } = await client
    .from(table)
    .upsert(
      {
        user_id: userId,
        bundle: owned,
        device_id: owned.owner.deviceId,
        day_count: owned.data.days.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("day_count");

  if (error) {
    return describe(error);
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "Es wurde keine Zeile geschrieben. Meist fehlen die RLS-Policies aus schema.sql.",
    };
  }
  return { ok: true, kind: "pushed", dayCount: owned.data.days.length };
}

export async function pullFromCloud(
  client: SupabaseClient,
  userId: string,
): Promise<CloudResult> {
  const { data, error } = await client
    .from(table)
    .select("bundle")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return describe(error);
  }
  if (!data?.bundle) {
    return { ok: true, kind: "empty" };
  }

  // Merge, never replace: the device may hold sessions the cloud has not seen.
  const summary = restoreBackupBundle(data.bundle as BackupBundle, "merge");
  return { ok: true, kind: "pulled", summary };
}

/**
 * Startup reconciliation: pull first so remote history is merged in, then push
 * the combined state back so both sides converge. Safe to call on every login
 * because the merge is idempotent.
 */
export async function syncWithCloud(
  client: SupabaseClient,
  userId: string,
): Promise<CloudResult> {
  const pulled = await pullFromCloud(client, userId);
  if (!pulled.ok) {
    return pulled;
  }
  const pushed = await pushToCloud(client, userId);
  if (!pushed.ok) {
    return pushed;
  }
  // Report the merge when there was one, otherwise the confirmed upload.
  return pulled.kind === "pulled" ? pulled : pushed;
}
