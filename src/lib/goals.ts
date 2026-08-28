/**
 * Goal model.
 *
 * Design follows the evidence on what actually sustains adherence:
 * - specific + time-bound targets outperform vague intent (Locke & Latham)
 * - visible progress toward a goal is the strongest daily motivator
 *   (Amabile & Kramer 2011; goal-gradient effect, Kivetz et al. 2006)
 * - an optional implementation intention ("when/where") roughly doubles
 *   follow-through (Gollwitzer & Sheeran 2006, d = 0.65)
 * - streaks need grace days, otherwise one missed day triggers abandonment
 *   (what-the-hell effect, Polivy & Herman 1985; Lally et al. 2010)
 */

export type GoalType =
  | "strength"
  | "consistency"
  | "frequency"
  | "volume"
  | "bodyweight"
  | "endurance"
  | "cardioEfficiency";

export type GoalDirection = "increase" | "decrease";

export type Goal = {
  id: string;
  type: GoalType;
  title: string;
  /** Exercise or activity the goal refers to, when applicable. */
  subject: string;
  targetValue: number;
  /** Only used by strength goals: "5x100kg" keeps the rep context. */
  targetReps?: number;
  unit: string;
  targetDate: string;
  createdAt: string;
  startValue: number;
  /** Manual entries for goals the app cannot measure automatically. */
  manualEntries?: Array<{ dateKey: string; value: number }>;
  /** Implementation intention: when and where the work happens. */
  planWhen?: string;
  category?: string;
  archived?: boolean;
};

export type GoalTypeMeta = {
  type: GoalType;
  label: string;
  description: string;
  unit: string;
  direction: GoalDirection;
  /** False means the user has to log values by hand. */
  automatic: boolean;
  needsSubject: boolean;
  example: string;
};

export const goalTypes: GoalTypeMeta[] = [
  {
    type: "strength",
    label: "Kraft",
    description: "Zielgewicht für eine Übung, gemessen über das geschätzte 1RM.",
    unit: "kg",
    direction: "increase",
    automatic: true,
    needsSubject: true,
    example: "5x100 kg Bankdrücken bis Oktober",
  },
  {
    type: "consistency",
    label: "Konsistenz",
    description: "Tage in Folge mit erledigtem Training.",
    unit: "Tage",
    direction: "increase",
    automatic: true,
    needsSubject: false,
    example: "10 Tage in Folge Morgenroutine",
  },
  {
    type: "frequency",
    label: "Frequenz",
    description: "Trainingseinheiten pro Woche über einen Zeitraum.",
    unit: "Einheiten/Woche",
    direction: "increase",
    automatic: true,
    needsSubject: false,
    example: "4x pro Woche trainieren",
  },
  {
    type: "volume",
    label: "Volumen",
    description: "Bewegte Gesamtlast bis zum Stichtag.",
    unit: "kg",
    direction: "increase",
    automatic: true,
    needsSubject: false,
    example: "50.000 kg bis Monatsende",
  },
  {
    type: "bodyweight",
    label: "Körpergewicht",
    description: "Zielgewicht auf Basis des 7-Tage-Mittels.",
    unit: "kg",
    direction: "decrease",
    automatic: true,
    needsSubject: false,
    example: "80 kg bis März",
  },
  {
    type: "endurance",
    label: "Ausdauer",
    description: "Bestzeit für eine feste Distanz - Zeit wird manuell erfasst.",
    unit: "min",
    direction: "decrease",
    automatic: false,
    needsSubject: true,
    example: "5 km unter 25 Minuten",
  },
  {
    type: "cardioEfficiency",
    label: "Cardio-Effizienz",
    description: "Puls bei fester Distanz - Herzfrequenz wird manuell erfasst.",
    unit: "bpm",
    direction: "decrease",
    automatic: false,
    needsSubject: true,
    example: "6 km unter 130 Puls",
  },
];

export function getGoalTypeMeta(type: GoalType): GoalTypeMeta {
  return goalTypes.find((item) => item.type === type) ?? goalTypes[0];
}

export type GoalProgress = {
  currentValue: number;
  /** 0..1, clamped. */
  ratio: number;
  reached: boolean;
  daysLeft: number;
  /** Value per day still required to land on target in time. */
  requiredPace: number | null;
  onTrack: boolean | null;
  summary: string;
};

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`).getTime();
  const to = new Date(`${toKey}T00:00:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/**
 * Progress framing differs by direction:
 * - increase goals report current/target, so an athlete already close to the
 *   target sees 98% rather than 0% (goal-gradient effect)
 * - decrease goals report distance travelled from the starting measurement,
 *   because current/target would be meaningless for weight or times
 */
export function computeGoalProgress(
  goal: Goal,
  currentValue: number,
  todayKey: string,
): GoalProgress {
  const meta = getGoalTypeMeta(goal.type);
  const daysLeft = daysBetween(todayKey, goal.targetDate);

  let ratio: number;
  if (meta.direction === "increase") {
    ratio = goal.targetValue > 0 ? currentValue / goal.targetValue : 0;
  } else {
    const span = goal.startValue - goal.targetValue;
    ratio = span > 0 ? (goal.startValue - currentValue) / span : 0;
  }
  ratio = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));

  const reached =
    meta.direction === "increase"
      ? currentValue >= goal.targetValue
      : currentValue > 0 && currentValue <= goal.targetValue;

  const remaining = Math.abs(goal.targetValue - currentValue);
  const requiredPace = daysLeft > 0 ? remaining / daysLeft : null;

  const totalDays = Math.max(1, daysBetween(goal.createdAt, goal.targetDate));
  const elapsed = Math.max(0, totalDays - Math.max(0, daysLeft));
  const expectedRatio = Math.min(1, elapsed / totalDays);
  const onTrack = reached ? true : ratio >= expectedRatio - 0.05;

  let summary: string;
  if (reached) {
    summary = "Ziel erreicht";
  } else if (daysLeft < 0) {
    summary = `Termin vorbei · ${Math.round(ratio * 100)}% geschafft`;
  } else if (currentValue === 0) {
    summary = `Noch keine Daten · ${daysLeft} Tage`;
  } else {
    summary = `noch ${formatGoalValue(remaining, goal.unit)} · ${daysLeft} Tage`;
  }

  return { currentValue, ratio, reached, daysLeft, requiredPace, onTrack, summary };
}

export function formatGoalValue(value: number, unit: string): string {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${unit}`;
}

export function createGoalId(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Consistency streaks tolerate a limited number of missed days so a single
 * slip does not collapse the whole run.
 */
export const graceDaysPerStreak = 1;

export function computeStreakWithGrace(
  doneDays: Set<string>,
  todayKey: string,
): { streak: number; graceUsed: number } {
  let streak = 0;
  let graceUsed = 0;

  for (let offset = 0; offset < 400; offset += 1) {
    const date = new Date(`${todayKey}T00:00:00`);
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);

    if (doneDays.has(key)) {
      streak += 1;
      continue;
    }
    // Today may still be pending and never counts as a break.
    if (offset === 0) {
      continue;
    }
    if (graceUsed < graceDaysPerStreak) {
      graceUsed += 1;
      continue;
    }
    break;
  }

  return { streak, graceUsed };
}
