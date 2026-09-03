/**
 * Category behaviour is data, not branching.
 *
 * Every category differs on only three axes:
 *  - how time is structured (mode)
 *  - which values are logged per exercise (logs)
 *  - how the audio cues should feel (tone)
 *
 * Adding a category means adding one entry here, not new conditionals.
 */

export type CategoryMode = "interval" | "sets" | "open";
export type SignalTone = "calm" | "intense";
export type LogField = "reps" | "weight" | "duration";

export type CategoryProfile = {
  /** Short label used in session headings and buttons. */
  label: string;
  mode: CategoryMode;
  tone: SignalTone;
  /** Countdown before the first work interval. */
  prepSeconds: number;
  /** Default work duration per exercise (overridable per exercise). */
  workSeconds: number;
  /** Pause between exercises; 0 disables the rest phase entirely. */
  restSeconds: number;
  /** How often the exercise list repeats. */
  rounds: number;
  logs: LogField[];
  /** Rounds/work/rest are user-configurable in the UI. */
  configurable: boolean;
};

const fallbackProfile: CategoryProfile = {
  label: "Training",
  mode: "open",
  tone: "intense",
  prepSeconds: 0,
  workSeconds: 60,
  restSeconds: 0,
  rounds: 1,
  logs: ["duration"],
  configurable: false,
};

export const categoryProfiles: Record<string, CategoryProfile> = {
  "Morning Routine": {
    label: "Morning",
    mode: "interval",
    tone: "calm",
    prepSeconds: 5,
    workSeconds: 60,
    restSeconds: 0,
    rounds: 1,
    logs: ["duration"],
    configurable: false,
  },
  Yoga: {
    label: "Yoga",
    mode: "interval",
    tone: "calm",
    prepSeconds: 5,
    workSeconds: 45,
    restSeconds: 0,
    rounds: 1,
    logs: ["duration"],
    configurable: false,
  },
  "HIT Workouts": {
    label: "HIT",
    mode: "interval",
    tone: "intense",
    prepSeconds: 10,
    workSeconds: 40,
    restSeconds: 20,
    rounds: 3,
    logs: ["reps"],
    configurable: true,
  },
  Bodybuilding: {
    label: "Bodybuilding",
    mode: "sets",
    tone: "intense",
    prepSeconds: 0,
    workSeconds: 0,
    restSeconds: 90,
    rounds: 1,
    logs: ["reps", "weight"],
    configurable: false,
  },
};

export function getCategoryProfile(categoryName: string): CategoryProfile {
  return categoryProfiles[categoryName] ?? fallbackProfile;
}
