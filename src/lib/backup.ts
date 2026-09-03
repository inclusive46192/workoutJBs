/**
 * Backup / restore.
 *
 * The on-disk format is deliberately *domain-shaped* rather than a raw dump of
 * localStorage keys, because the same payload is meant to become the wire
 * format for a future cloud account:
 *
 *  - every collection is a list of records with a stable natural key
 *    (days: dateKey+category, goals: id, routines: category+name), so a server
 *    can upsert instead of replacing a blob
 *  - every record carries `updatedAt`, which is what a sync layer needs for
 *    last-write-wins conflict resolution
 *  - `owner` is reserved for a user id, so an exported file can be attached to
 *    an account later without changing the schema
 *  - `schemaVersion` is explicit and importers stay backward compatible
 *
 * Older backups (v1 flat sections, v2 raw localStorage snapshot) are still
 * importable so existing files keep working.
 */

export const backupSchemaVersion = 3;

export const storageKeys = {
  customExercises: "momentum-config:custom-exercises:v1",
  hiddenExercises: "momentum-config:hidden-exercises:v1",
  exerciseOrder: "momentum-config:exercise-order:v1",
  hitWorkoutSets: "momentum-hit:sets:v1",
  workoutBuilderTemplates: "momentum-builder:templates:v1",
  routineComposer: "momentum-builder:routine-composer:v1",
  lastQuickLoad: "momentum-quickload:last-by-category:v1",
  profile: "momentum-profile:v1",
  dashboardGraphConfig: "momentum-dashboard:graph-config:v1",
  intervalSettings: "momentum-interval:settings:v1",
  signalPrefs: "momentum-signals:prefs:v1",
  lastSetValues: "momentum-sets:last-values:v1",
  goals: "momentum-goals:v1",
  journalArchive: "momentum-journal:archive:v1",
} as const;

export const dayKeyPrefix = "momentum-lite:";
export const bodyWeightKeyPrefix = "momentum-bodyweight:";
/** Per-record modification times, kept alongside the data for sync. */
const revisionsKey = "momentum-sync:revisions:v1";

export type DayRecord = {
  dateKey: string;
  category: string;
  payload: unknown;
  updatedAt: string;
};

export type BodyWeightRecord = {
  dateKey: string;
  value: string;
  updatedAt: string;
};

export type BackupBundle = {
  schemaVersion: number;
  app: "momentum-journal";
  exportedAt: string;
  /** Reserved for cloud accounts; null while the app is offline-only. */
  owner: { userId: string | null; deviceId: string };
  data: {
    days: DayRecord[];
    bodyWeight: BodyWeightRecord[];
    /** Singleton documents, stored parsed so a server can validate them. */
    documents: Record<string, unknown>;
  };
};

function readRevisions(): Record<string, string> {
  try {
    const raw = localStorage.getItem(revisionsKey);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Stamps a storage key as modified now. Used by the autosave path. */
export function touchRevision(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }
  setRevision(storageKey, new Date().toISOString());
}

/** Records an explicit revision timestamp, e.g. one carried in from a backup. */
function setRevision(storageKey: string, isoTimestamp?: string) {
  try {
    const revisions = readRevisions();
    revisions[storageKey] = isoTimestamp ?? new Date().toISOString();
    localStorage.setItem(revisionsKey, JSON.stringify(revisions));
  } catch {
    // Storage full or unavailable: revisions are an optimisation, not critical.
  }
}

function revisionFor(revisions: Record<string, string>, storageKey: string, fallback: string) {
  return revisions[storageKey] ?? fallback;
}

/** Stable per-device id so a future server can distinguish sources. */
export function getDeviceId(): string {
  const key = "momentum-sync:device-id:v1";
  try {
    const existing = localStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const generated = `device-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, generated);
    return generated;
  } catch {
    return "device-unknown";
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Keys that must never leave the device.
 *
 * `momentum-auth:*` holds the Supabase session including access and refresh
 * tokens. Putting it in a backup would ship credentials into a cloud row and
 * into an export file that the user may store in iCloud or share - and
 * restoring one would hijack the session on another device.
 * `momentum-sync:*` is local bookkeeping that is rebuilt on import.
 */
function isExcludedFromBackup(storageKey: string): boolean {
  return storageKey.startsWith("momentum-auth:") || storageKey.startsWith("momentum-sync:");
}

export function buildBackupBundle(): BackupBundle {
  const revisions = readRevisions();
  const fallback = new Date().toISOString();

  const days: DayRecord[] = [];
  const bodyWeight: BodyWeightRecord[] = [];
  const documents: Record<string, unknown> = {};

  for (const storageKey of Object.keys(localStorage)) {
    if (!storageKey.startsWith("momentum-") || isExcludedFromBackup(storageKey)) {
      continue;
    }
    const value = localStorage.getItem(storageKey);
    if (value === null) {
      continue;
    }

    if (storageKey.startsWith(dayKeyPrefix)) {
      const rest = storageKey.slice(dayKeyPrefix.length);
      const separator = rest.indexOf(":");
      if (separator === -1) {
        continue;
      }
      days.push({
        dateKey: rest.slice(0, separator),
        category: rest.slice(separator + 1),
        payload: safeParse(value),
        updatedAt: revisionFor(revisions, storageKey, fallback),
      });
      continue;
    }

    if (storageKey.startsWith(bodyWeightKeyPrefix)) {
      bodyWeight.push({
        dateKey: storageKey.slice(bodyWeightKeyPrefix.length),
        value,
        updatedAt: revisionFor(revisions, storageKey, fallback),
      });
      continue;
    }

    documents[storageKey] = safeParse(value);
  }

  days.sort((a, b) =>
    a.dateKey === b.dateKey
      ? a.category.localeCompare(b.category)
      : a.dateKey.localeCompare(b.dateKey),
  );
  bodyWeight.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    schemaVersion: backupSchemaVersion,
    app: "momentum-journal",
    exportedAt: fallback,
    owner: { userId: null, deviceId: getDeviceId() },
    data: { days, bodyWeight, documents },
  };
}

/**
 * Summary of what is currently stored. Drives the startup prompt and the
 * export reminder.
 */
export type LocalHistory = {
  totalDays: number;
  /** Days that actually contain a completed exercise. */
  loggedDays: number;
  firstDay: string | null;
  lastDay: string | null;
  lastExportAt: string | null;
  /** Logged days recorded after the most recent export. */
  daysSinceExport: number;
};

const lastExportKey = "momentum-sync:last-export:v1";

/**
 * Records that the data is safe somewhere off this device. Both the file
 * export and a confirmed cloud upload count, otherwise the reminder keeps
 * nagging after a successful sync.
 */
export function markExported() {
  try {
    localStorage.setItem(lastExportKey, new Date().toISOString());
  } catch {
    // ignore
  }
}

export function readLocalHistory(): LocalHistory {
  const empty: LocalHistory = {
    totalDays: 0,
    loggedDays: 0,
    firstDay: null,
    lastDay: null,
    lastExportAt: null,
    daysSinceExport: 0,
  };
  if (typeof window === "undefined") {
    return empty;
  }

  const lastExportAt = localStorage.getItem(lastExportKey);
  const revisions = readRevisions();
  const dayKeys: string[] = [];
  let loggedDays = 0;
  let daysSinceExport = 0;

  for (const storageKey of Object.keys(localStorage)) {
    if (!storageKey.startsWith(dayKeyPrefix)) {
      continue;
    }
    const rest = storageKey.slice(dayKeyPrefix.length);
    const separator = rest.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const dateKey = rest.slice(0, separator);
    dayKeys.push(dateKey);

    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      continue;
    }
    let completed = 0;
    try {
      completed = countCompleted(JSON.parse(raw));
    } catch {
      completed = 0;
    }
    if (completed > 0) {
      loggedDays += 1;
      const revision = revisions[storageKey];
      if (!lastExportAt || (revision && revision > lastExportAt)) {
        daysSinceExport += 1;
      }
    }
  }

  dayKeys.sort();
  return {
    totalDays: dayKeys.length,
    loggedDays,
    firstDay: dayKeys[0] ?? null,
    lastDay: dayKeys[dayKeys.length - 1] ?? null,
    lastExportAt,
    daysSinceExport,
  };
}

function withDayRange(summary: RestoreSummary): RestoreSummary {
  const history = readLocalHistory();
  return {
    ...summary,
    rangeStart: history.firstDay,
    rangeEnd: history.lastDay,
    totalDays: history.totalDays,
  };
}

type LegacyBundle = {  version?: number;
  schemaVersion?: number;
  records?: Record<string, string>;
  liteRecords?: Record<string, string>;
  hitWorkoutSets?: unknown;
  workoutBuilderTemplates?: unknown;
  routineComposerByCategory?: unknown;
  lastQuickLoadByCategory?: unknown;
  profile?: unknown;
  data?: BackupBundle["data"];
};

function writeValue(storageKey: string, value: unknown): boolean {
  const serialised = typeof value === "string" ? value : JSON.stringify(value);
  if (serialised === undefined) {
    return false;
  }
  localStorage.setItem(storageKey, serialised);
  return true;
}

export type RestoreMode = "merge" | "replace";

export type RestoreSummary = {
  daysAdded: number;
  daysUpdated: number;
  daysKept: number;
  bodyWeightAdded: number;
  documentsMerged: number;
  /** Oldest and newest day present after the restore. */
  rangeStart: string | null;
  rangeEnd: string | null;
  totalDays: number;
};

function emptySummary(): RestoreSummary {
  return {
    daysAdded: 0,
    daysUpdated: 0,
    daysKept: 0,
    bodyWeightAdded: 0,
    documentsMerged: 0,
    rangeStart: null,
    rangeEnd: null,
    totalDays: 0,
  };
}

/** True when the incoming record should win over what is already stored. */
function incomingIsNewer(incomingUpdatedAt: string | undefined, storageKey: string): boolean {
  if (!incomingUpdatedAt) {
    return false;
  }
  const localRevision = readRevisions()[storageKey];
  if (!localRevision) {
    // No local revision recorded: the local copy predates revision tracking, so
    // prefer the incoming record which at least carries a timestamp.
    return true;
  }
  return incomingUpdatedAt > localRevision;
}

function countCompleted(payload: unknown): number {
  const entries = (payload as { entries?: Array<{ completed?: boolean }> } | null)?.entries;
  return Array.isArray(entries) ? entries.filter((entry) => entry?.completed).length : 0;
}

/**
 * Merges the goal/routine/archive documents instead of replacing them, so
 * restoring an older backup cannot delete goals created on this device.
 */
function mergeDocument(storageKey: string, incoming: unknown): boolean {
  const rawLocal = localStorage.getItem(storageKey);
  if (rawLocal === null) {
    return writeValue(storageKey, incoming);
  }

  let local: unknown;
  try {
    local = JSON.parse(rawLocal);
  } catch {
    return writeValue(storageKey, incoming);
  }

  // Goals and journal entries: union by a stable identity.
  if (Array.isArray(local) && Array.isArray(incoming)) {
    const identity = (item: Record<string, unknown>) =>
      (item.id as string) ??
      `${(item.dateKey as string) ?? ""}|${(item.category as string) ?? ""}|${
        (item.name as string) ?? ""
      }`;
    const byId = new Map<string, unknown>();
    for (const item of incoming as Array<Record<string, unknown>>) {
      byId.set(identity(item), item);
    }
    // Local wins on collision: it is the more recently used copy.
    for (const item of local as Array<Record<string, unknown>>) {
      byId.set(identity(item), item);
    }
    return writeValue(storageKey, Array.from(byId.values()));
  }

  // Per-category maps (routines, custom/hidden exercises, order).
  if (
    local &&
    incoming &&
    typeof local === "object" &&
    typeof incoming === "object" &&
    !Array.isArray(local) &&
    !Array.isArray(incoming)
  ) {
    const merged: Record<string, unknown> = { ...(incoming as Record<string, unknown>) };
    for (const [key, value] of Object.entries(local as Record<string, unknown>)) {
      const incomingValue = (incoming as Record<string, unknown>)[key];
      if (Array.isArray(value) && Array.isArray(incomingValue)) {
        // Named routines: union by name, local wins.
        const named = value.every((item) => item && typeof item === "object" && "name" in item);
        if (named) {
          const byName = new Map<string, unknown>();
          for (const item of incomingValue as Array<Record<string, unknown>>) {
            byName.set(String(item.name), item);
          }
          for (const item of value as Array<Record<string, unknown>>) {
            byName.set(String(item.name), item);
          }
          merged[key] = Array.from(byName.values());
          continue;
        }
      }
      merged[key] = value;
    }
    return writeValue(storageKey, merged);
  }

  // Scalars and settings: the local device configuration wins.
  return false;
}

/**
 * Restores a bundle of any known schema version.
 *
 * `merge` (the default) never deletes local data: days are unioned and
 * conflicts resolved by `updatedAt`, so pulling in an older backup on a device
 * that already has newer sessions keeps both. That is what makes a continuous,
 * gap-free history possible across devices and reinstalls.
 */
export function restoreBackupBundle(
  parsed: LegacyBundle,
  mode: RestoreMode = "merge",
): RestoreSummary {
  const summary = emptySummary();

  // v3: domain-shaped payload.
  if (parsed.data && Array.isArray(parsed.data.days)) {
    if (mode === "replace") {
      for (const key of Object.keys(localStorage)) {
        // Never clear the live session while replacing data.
        if (key.startsWith("momentum-") && !isExcludedFromBackup(key)) {
          localStorage.removeItem(key);
        }
      }
    }

    for (const day of parsed.data.days) {
      if (!day?.dateKey || !day?.category) {
        continue;
      }
      const storageKey = `${dayKeyPrefix}${day.dateKey}:${day.category}`;
      const existing = localStorage.getItem(storageKey);

      if (existing === null) {
        if (writeValue(storageKey, day.payload)) {
          summary.daysAdded += 1;
          setRevision(storageKey, day.updatedAt);
        }
        continue;
      }

      // Never trade a logged session for an empty one, even if it is newer.
      let localCompleted = 0;
      try {
        localCompleted = countCompleted(JSON.parse(existing));
      } catch {
        localCompleted = 0;
      }
      const incomingCompleted = countCompleted(day.payload);
      const preferIncoming =
        incomingCompleted > localCompleted ||
        (incomingCompleted === localCompleted && incomingIsNewer(day.updatedAt, storageKey));

      if (preferIncoming) {
        writeValue(storageKey, day.payload);
        setRevision(storageKey, day.updatedAt);
        summary.daysUpdated += 1;
      } else {
        summary.daysKept += 1;
      }
    }

    for (const entry of parsed.data.bodyWeight ?? []) {
      if (!entry?.dateKey) {
        continue;
      }
      const storageKey = `${bodyWeightKeyPrefix}${entry.dateKey}`;
      if (localStorage.getItem(storageKey) === null) {
        if (writeValue(storageKey, entry.value)) {
          summary.bodyWeightAdded += 1;
        }
      }
    }

    for (const [storageKey, value] of Object.entries(parsed.data.documents ?? {})) {
      // Older bundles may still carry a session; refuse to restore it.
      if (!storageKey.startsWith("momentum-") || isExcludedFromBackup(storageKey)) {
        continue;
      }
      if (mergeDocument(storageKey, value)) {
        summary.documentsMerged += 1;
      }
    }

    return withDayRange(summary);
  }

  // v2: raw localStorage snapshot.
  if (parsed.records) {
    for (const [storageKey, value] of Object.entries(parsed.records)) {
      if (!storageKey.startsWith("momentum-") || isExcludedFromBackup(storageKey)) {
        continue;
      }
      const isDay = storageKey.startsWith(dayKeyPrefix);
      const exists = localStorage.getItem(storageKey) !== null;
      if (mode === "merge" && exists && isDay) {
        summary.daysKept += 1;
        continue;
      }
      localStorage.setItem(storageKey, value);
      if (isDay) {
        summary.daysAdded += 1;
      } else {
        summary.documentsMerged += 1;
      }
    }
    return withDayRange(summary);
  }

  // v1: individually exported sections.
  for (const [storageKey, value] of Object.entries(parsed.liteRecords ?? {})) {
    if (mode === "merge" && localStorage.getItem(storageKey) !== null) {
      summary.daysKept += 1;
      continue;
    }
    localStorage.setItem(storageKey, value);
    summary.daysAdded += 1;
  }
  const legacySections: Array<[string, unknown]> = [
    [storageKeys.hitWorkoutSets, parsed.hitWorkoutSets],
    [storageKeys.workoutBuilderTemplates, parsed.workoutBuilderTemplates],
    [storageKeys.routineComposer, parsed.routineComposerByCategory],
    [storageKeys.lastQuickLoad, parsed.lastQuickLoadByCategory],
    [storageKeys.profile, parsed.profile],
  ];
  for (const [storageKey, value] of legacySections) {
    if (value !== undefined && mergeDocument(storageKey, value)) {
      summary.documentsMerged += 1;
    }
  }

  return withDayRange(summary);
}
