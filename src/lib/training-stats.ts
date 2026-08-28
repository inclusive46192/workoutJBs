import { getSetKindMeta, type SetKind } from "@/lib/set-types";

/**
 * Derived training statistics.
 *
 * Tonnage is the standard load metric (sets x reps x weight). Counting reps
 * alone makes progressive overload invisible, which is the primary intrinsic
 * motivator for resistance training (Deci & Ryan, competence need).
 *
 * Estimated 1RM uses the Epley formula, the most widely used estimate in
 * commercial training apps: 1RM = w * (1 + reps/30).
 */

export type StatSetLog = {
  reps: string;
  weightKg: string;
  done: boolean;
  kind: SetKind;
};

export type StatEntry = {
  exercise: string;
  completed: boolean;
  sets: string;
  setLogs: StatSetLog[];
  reps: string;
  weightKg: string;
  trackedSeconds?: number;
};

export type BestSet = {
  exercise: string;
  weightKg: number;
  reps: number;
  estimatedOneRepMax: number;
  dateKey: string;
};

const toNumber = (value: string | undefined): number => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Epley estimate; a single rep returns the lifted weight unchanged. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) {
    return 0;
  }
  if (reps === 1) {
    return weightKg;
  }
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** Tonnage for one exercise entry. Warmup sets are preparation, not load. */
export function computeEntryTonnage(entry: StatEntry): number {
  if (entry.setLogs.length > 0) {
    return entry.setLogs.reduce((sum, set) => {
      if (!getSetKindMeta(set.kind).countsAsVolume) {
        return sum;
      }
      const reps = toNumber(set.reps);
      const weight = toNumber(set.weightKg);
      if (reps <= 0) {
        return sum;
      }
      // Bodyweight work still counts as volume via reps.
      return sum + (weight > 0 ? reps * weight : reps);
    }, 0);
  }

  const reps = toNumber(entry.reps);
  const weight = toNumber(entry.weightKg);
  const sets = Math.max(1, Number.parseInt(entry.sets || "1", 10) || 1);
  if (reps <= 0) {
    return 0;
  }
  return weight > 0 ? sets * reps * weight : sets * reps;
}

export function computeDayTonnage(entries: StatEntry[]): number {
  return entries.reduce(
    (sum, entry) => (entry.completed ? sum + computeEntryTonnage(entry) : sum),
    0,
  );
}

/** Highest estimated 1RM per exercise across all logged days. */
export function collectPersonalRecords(
  days: Array<{ dateKey: string; entries: StatEntry[] }>,
): Map<string, BestSet> {
  const records = new Map<string, BestSet>();

  for (const day of days) {
    for (const entry of day.entries) {
      for (const set of entry.setLogs) {
        if (!set.done) {
          continue;
        }
        if (!getSetKindMeta(set.kind).countsAsVolume) {
          continue;
        }
        const reps = toNumber(set.reps);
        const weight = toNumber(set.weightKg);
        if (reps <= 0 || weight <= 0) {
          continue;
        }
        const estimatedOneRepMax = estimateOneRepMax(weight, reps);
        const existing = records.get(entry.exercise);
        if (!existing || estimatedOneRepMax > existing.estimatedOneRepMax) {
          records.set(entry.exercise, {
            exercise: entry.exercise,
            weightKg: weight,
            reps,
            estimatedOneRepMax,
            dateKey: day.dateKey,
          });
        }
      }
    }
  }

  return records;
}

/** Best estimated 1RM for one exercise per day, for trend charts. */
export function buildOneRepMaxSeries(
  days: Array<{ dateKey: string; entries: StatEntry[] }>,
  exercise: string,
): Array<{ dateKey: string; value: number }> {
  const byDay = new Map<string, number>();

  for (const day of days) {
    for (const entry of day.entries) {
      if (entry.exercise !== exercise) {
        continue;
      }
      for (const set of entry.setLogs) {
        if (!set.done || !getSetKindMeta(set.kind).countsAsVolume) {
          continue;
        }
        const value = estimateOneRepMax(toNumber(set.weightKg), toNumber(set.reps));
        if (value <= 0) {
          continue;
        }
        byDay.set(day.dateKey, Math.max(byDay.get(day.dateKey) ?? 0, value));
      }
    }
  }

  return Array.from(byDay.entries())
    .map(([dateKey, value]) => ({ dateKey, value }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * Pearson correlation between two aligned series.
 * Used for the mood-versus-load insight.
 */
export function correlate(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 4) {
    return null;
  }
  const meanA = a.slice(0, n).reduce((sum, value) => sum + value, 0) / n;
  const meanB = b.slice(0, n).reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let varA = 0;
  let varB = 0;
  for (let index = 0; index < n; index += 1) {
    const deltaA = a[index] - meanA;
    const deltaB = b[index] - meanB;
    numerator += deltaA * deltaB;
    varA += deltaA * deltaA;
    varB += deltaB * deltaB;
  }

  if (varA === 0 || varB === 0) {
    return null;
  }
  return numerator / Math.sqrt(varA * varB);
}

export function formatTonnage(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}t`;
  }
  return `${Math.round(value)}kg`;
}
