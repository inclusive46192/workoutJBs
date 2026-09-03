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

/** Postgres error for "relation does not exist" - schema not applied yet. */
function isMissingTable(code: string | undefined, message: string): boolean {
  return code === "42P01" || /relation .* does not exist/i.test(message);
}

function describe(error: { code?: string; message: string }): CloudResult {
  const missingTable = isMissingTable(error.code, error.message);
  return {
    ok: false,
    missingTable,
    error: missingTable
      ? "Cloud-Tabelle fehlt. Bitte supabase/schema.sql im Supabase-Projekt ausführen."
      : error.message,
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

  const { error } = await client.from(table).upsert(
    {
      user_id: userId,
      bundle: owned,
      device_id: owned.owner.deviceId,
      day_count: owned.data.days.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return describe(error);
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
  return pulled.kind === "pulled" ? pulled : { ok: true, kind: "pushed", dayCount: 0 };
}
