/**
 * Set classification used across logging, presets and analytics.
 *
 * Evidence context (Schoenfeld & Grgic 2019; Fink et al. 2018; Kelleher et al. 2010):
 * - working sets should sit at 1-3 RIR for most of the session
 * - failure is best reserved for the last set of an isolation exercise
 * - dropsets/supersets mainly buy time efficiency at equal hypertrophy
 *
 * Failure and dropset are deliberately one kind: both are "take this set past
 * the normal stopping point", they are logged identically, and splitting them
 * only added a decision without changing any downstream calculation.
 */

export type SetKind = "warmup" | "working" | "failure" | "superset";

/** Legacy kinds that must still load from older backups. */
const legacyKindAliases: Record<string, SetKind> = {
  dropset: "failure",
};

export type SetKindMeta = {
  value: SetKind;
  label: string;
  short: string;
  /** Styling for the active state chip. */
  className: string;
  hint: string;
  /** Warmups are preparation, not training volume. */
  countsAsVolume: boolean;
};

export const setKinds: SetKindMeta[] = [
  {
    value: "warmup",
    label: "Warmup",
    short: "W",
    className: "bg-amber-500 text-white",
    hint: "Aufwärmsatz mit reduziertem Gewicht - zählt nicht als Volumen.",
    countsAsVolume: false,
  },
  {
    value: "working",
    label: "Arbeitssatz",
    short: "A",
    className: "bg-emerald-600 text-white",
    hint: "Zielgewicht, 1-3 Wiederholungen vor dem Muskelversagen.",
    countsAsVolume: true,
  },
  {
    value: "failure",
    label: "Failure / Dropset",
    short: "F",
    className: "bg-rose-600 text-white",
    hint: "Bis zum Muskelversagen, optional mit reduziertem Gewicht weiter.",
    countsAsVolume: true,
  },
  {
    value: "superset",
    label: "Superset",
    short: "S",
    className: "bg-violet-600 text-white",
    hint: "Direkt an die nächste Übung ohne Pause.",
    countsAsVolume: true,
  },
];

export function isSetKind(value: unknown): value is SetKind {
  return setKinds.some((item) => item.value === value);
}

/** Normalises a stored kind, mapping retired values onto their replacement. */
export function normalizeSetKind(value: unknown): SetKind | null {
  if (isSetKind(value)) {
    return value;
  }
  if (typeof value === "string" && value in legacyKindAliases) {
    return legacyKindAliases[value];
  }
  return null;
}

export function getSetKindMeta(kind: SetKind): SetKindMeta {
  return setKinds.find((item) => item.value === kind) ?? setKinds[1];
}
