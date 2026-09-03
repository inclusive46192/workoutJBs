"use client";

import Image from "next/image";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  exerciseDefaultSeconds,
  exerciseMuscleGroupMap,
  type JournalCategory,
} from "@/lib/exercises";
import { getExerciseGuide } from "@/lib/exercise-guides";
import {
  buildBackupBundle,
  markExported,
  readLocalHistory,
  restoreBackupBundle,
  touchRevision,
  type LocalHistory,
  type RestoreSummary,
} from "@/lib/backup";
import { ExerciseAnimation } from "@/components/exercise-animation";
import { getCategoryProfile } from "@/lib/category-profiles";
import { normalizeSetKind, setKinds, type SetKind } from "@/lib/set-types";
import { presetRoutines, type PresetRoutine } from "@/lib/preset-routines";
import {
  collectPersonalRecords,
  computeDayTonnage,
  correlate,
  formatTonnage,
  type BestSet,
  type StatEntry,
} from "@/lib/training-stats";
import {
  computeGoalProgress,
  computeStreakWithGrace,
  createGoalId,
  formatGoalValue,
  getGoalTypeMeta,
  goalTypes,
  type Goal,
  type GoalType,
} from "@/lib/goals";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useAuth, type AuthProvider } from "@/hooks/use-auth";
import { syncWithCloud } from "@/lib/cloud-sync";
import {
  cancelScheduledCues,
  playHapticClick,
  playRestStart,
  playSessionComplete,
  playWorkStart,
  releaseAudio,
  schedulePhaseCues,
  setSignalsEnabled,
  unlockAudio,
  type SignalProfile,
} from "@/lib/workout-audio";

type RoutineJournalProps = {
  categories: JournalCategory[];
  hiddenLiteHero?: boolean;
};

type PageViewTab = "training" | "builder" | "dashboard";

type SetLog = {
  reps: string;
  weightKg: string;
  done: boolean;
  kind: SetKind;
};

type EntryState = {
  exercise: string;
  completed: boolean;
  sets: string;
  completedSets: number;
  setLogs: SetLog[];
  reps: string;
  /**
   * Prescription from a preset, e.g. "8-12". Kept separate from `reps` because
   * the logging field is numeric: assigning a range there is rejected by the
   * browser and the guidance would be lost. Shown as a placeholder instead.
   */
  targetReps?: string;
  weightKg: string;
  durationMinutes: string;
  targetMinutes: string;
  trackedSeconds: number;
  notes: string;
};

type ReflectionState = {
  mood: string;
  text: string;
  flowScore: string;
  flowJournal: string;
};

type LiteDayPayload = {
  entries: EntryState[];
  reflection: ReflectionState;
  overallSeconds: number;
};

type ExerciseSecondMap = Record<string, number>;

type JournalArchiveEntry = {
  dateKey: string;
  category: string;
  mood: string;
  text: string;
};

type HitWorkoutSet = {
  name: string;
  items: Array<{ exercise: string; reps: string; sets: string }>;
};

type WorkoutBuilderTemplate = {
  name: string;
  category: string;
  entries: EntryState[];
  exerciseCustomSeconds: ExerciseSecondMap;
  /** Interval timing the routine was designed for (e.g. Tabata 20/10 x8). */
  intervals?: { workSeconds: number; restSeconds: number; rounds: number };
  /** ISO timestamp of the last time this template was loaded. */
  lastUsedAt?: string;
};

type QuickLoadType = "favorite" | "builder" | "hit-set" | "bb-plan";

type LastQuickLoad = {
  type: QuickLoadType;
  name: string;
};

type UserProfile = {
  displayName: string;
  goal: string;
  preferredCategories: string[];
  weightUnit: "kg" | "lbs";
  reminderTime: string;
};

type DashboardGraphKey = "weight" | "duration" | "volume" | "categoryMix" | "consistency";

type IntervalPhase = "idle" | "prep" | "work" | "rest" | "complete";

type IntervalSettings = {
  prepSeconds: number;
  restSeconds: number;
  totalRounds: number;
  defaultWorkSeconds: number;
  profile: SignalProfile;
};

type BuilderMuscleGroup =
  | "Alle"
  | "Brust"
  | "Rücken"
  | "Schultern"
  | "Arme"
  | "Beine"
  | "Core"
  | "Cardio"
  | "Mobility";

const encouragement = [
  "Dranbleiben: 1% besser jeden Tag.",
  "Fokus, Atem, Bewegung - du bist im Flow.",
  "Sanfte Disziplin ist starke Disziplin.",
];

const scoreChoices = Array.from({ length: 11 }, (_, idx) => idx);
const customExercisesStorageKey = "momentum-config:custom-exercises:v1";
const hiddenExercisesStorageKey = "momentum-config:hidden-exercises:v1";
const exerciseOrderStorageKey = "momentum-config:exercise-order:v1";
const hitWorkoutSetsStorageKey = "momentum-hit:sets:v1";
const workoutBuilderTemplatesStorageKey = "momentum-builder:templates:v1";
const routineComposerStorageKey = "momentum-builder:routine-composer:v1";
const lastQuickLoadStorageKey = "momentum-quickload:last-by-category:v1";
const profileStorageKey = "momentum-profile:v1";
const dashboardGraphConfigStorageKey = "momentum-dashboard:graph-config:v1";
const intervalSettingsStorageKey = "momentum-interval:settings:v1";
const signalPrefsStorageKey = "momentum-signals:prefs:v1";
const lastSetValuesStorageKey = "momentum-sets:last-values:v1";
const goalsStorageKey = "momentum-goals:v1";
const restorePromptDismissedKey = "momentum-sync:restore-prompt-dismissed:v1";
/** One-shot message that survives the reload after a restore. */
const lastRestoreStorageKey = "momentum-sync:last-restore:v1";
/** Upper bound for sets seeded from a preset or default. */
const maxDefaultSets = 3;
/** Sentinel for goals that are not scoped to a single category. */
const allCategoriesOption = "Alle Kategorien";
const bodyWeightStorageKeyPrefix = "momentum-bodyweight:";
const defaultDashboardGraphConfig: Record<DashboardGraphKey, boolean> = {
  weight: true,
  duration: true,
  volume: true,
  categoryMix: true,
  consistency: true,
};
const builderMuscleGroups: BuilderMuscleGroup[] = [
  "Alle",
  "Brust",
  "Rücken",
  "Schultern",
  "Arme",
  "Beine",
  "Core",
  "Cardio",
  "Mobility",
];
const muscleGroupLookup: Record<string, BuilderMuscleGroup> = {
  Chest: "Brust",
  Back: "Rücken",
  Shoulders: "Schultern",
  Arms: "Arme",
  Legs: "Beine",
  Core: "Core",
  Cardio: "Cardio",
  Mobility: "Mobility",
};
const journalArchiveStorageKey = "momentum-journal:archive:v1";

/**
 * Local calendar date key. Must NOT use toISOString(): that converts to UTC, so
 * east of Greenwich an early-morning session (the main use case here) would be
 * filed under the previous day.
 */
function getDateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateKey() {
  return getDateKeyFromDate(new Date());
}

function getLastNDays(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    return getDateKeyFromDate(date);
  });
}

function getWeekKeysMondayToSunday(anchorDateKey: string) {
  const anchor = new Date(`${anchorDateKey}T00:00:00`);
  const day = anchor.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + diffToMonday);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return getDateKeyFromDate(date);
  });
}

function getMonthMeta(anchorDateKey: string) {
  const anchor = new Date(`${anchorDateKey}T00:00:00`);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayWeek = firstDay.getDay();
  const offset = firstDayWeek === 0 ? 6 : firstDayWeek - 1; // Monday first

  const keys = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month, day);
    return getDateKeyFromDate(date);
  });

  return {
    label: anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
    offset,
    keys,
  };
}

function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationCompact(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/** Relative day label for "last used" hints, e.g. "heute" / "vor 3 Tagen". */
function formatLastUsed(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return "";
  }
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return then.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/** Human summary of a merge, so the user can see nothing was lost. */
function formatRestoreSummary(summary: RestoreSummary): string {
  const parts: string[] = [];
  if (summary.daysAdded > 0) parts.push(`${summary.daysAdded} Tage ergänzt`);
  if (summary.daysUpdated > 0) parts.push(`${summary.daysUpdated} aktualisiert`);
  if (summary.daysKept > 0) parts.push(`${summary.daysKept} lokal behalten`);
  const range =
    summary.rangeStart && summary.rangeEnd
      ? ` · Historie ${summary.rangeStart} bis ${summary.rangeEnd}`
      : "";
  const detail = parts.length > 0 ? parts.join(", ") : "keine neuen Tage";
  return `Backup geladen: ${detail}${range}`;
}

function localStorageKey(dateKey: string, category: string): string {
  return `momentum-lite:${dateKey}:${category}`;
}

function bodyWeightStorageKey(dateKey: string): string {
  return `${bodyWeightStorageKeyPrefix}${dateKey}`;
}

function buildDefaultEntries(exercises: string[]): EntryState[] {
  return exercises.map((exercise) => ({
    exercise,
    completed: false,
    sets: "1",
    completedSets: 0,
    setLogs: normalizeSetLogs(undefined, "1"),
    reps: "",
    weightKg: "",
    durationMinutes: "",
    targetMinutes: "",
    trackedSeconds: 0,
    notes: "",
  }));
}

function buildDefaultReflection(): ReflectionState {
  return {
    mood: "",
    text: "",
    flowScore: "",
    flowJournal: "",
  };
}

function normalizeSetLogs(rawSetLogs: unknown, targetSetsRaw: string): SetLog[] {
  const targetSets = Math.max(0, Number.parseInt(targetSetsRaw || "0", 10) || 0);
  if (targetSets === 0) {
    return [];
  }

  const source = Array.isArray(rawSetLogs) ? rawSetLogs : [];
  return Array.from({ length: targetSets }, (_, index) => {
    const raw = source[index] as
      | { reps?: string; weightKg?: string; done?: boolean; kind?: string }
      | undefined;
    const reps = raw?.reps ?? "";
    const weightKg = raw?.weightKg ?? "";
    const done = Boolean(raw?.done && reps.trim() && weightKg.trim());
    const kind = normalizeSetKind(raw?.kind) ?? "working";
    return { reps, weightKg, done, kind };
  });
}

function normalizeReflection(raw?: Partial<ReflectionState> | null): ReflectionState {
  return {
    ...buildDefaultReflection(),
    ...(raw ?? {}),
    flowScore: raw?.flowScore ?? "",
    flowJournal: raw?.flowJournal ?? "",
  };
}

function normalizeEntries(entries: Partial<EntryState>[], exercises: string[]): EntryState[] {
  const byExercise = new Map(
    entries
      .filter((entry): entry is Partial<EntryState> & { exercise: string } =>
        Boolean(entry.exercise),
      )
      .map((entry) => [entry.exercise, entry]),
  );

  return exercises.map((exercise) => {
    const row = byExercise.get(exercise);
    return {
      exercise,
      completed: row?.completed ?? false,
      sets: row?.sets ?? "",
      completedSets: row?.completedSets ?? 0,
      setLogs: normalizeSetLogs(row?.setLogs, row?.sets ?? ""),
      reps: row?.reps ?? "",
      targetReps: row?.targetReps,
      weightKg: row?.weightKg ?? "",
      durationMinutes: row?.durationMinutes ?? "",
      targetMinutes: row?.targetMinutes ?? "",
      trackedSeconds: row?.trackedSeconds ?? 0,
      notes: row?.notes ?? "",
    };
  });
}

function getExerciseTargetSeconds(
  customSeconds: ExerciseSecondMap,
  exercise: string,
  fallbackSeconds = 60,
): number {
  // Per-exercise defaults (e.g. the 30s mobility drills) win over the category
  // default, but an explicit user override still wins over both.
  return customSeconds[exercise] ?? exerciseDefaultSeconds[exercise] ?? fallbackSeconds;
}

function createEntryTemplate(exercise: string, defaults?: Partial<EntryState>): EntryState {
  // Every exercise ships with at least one working set so nothing is loggable-but-empty.
  const targetSets = defaults?.sets && defaults.sets.trim() !== "" ? defaults.sets : "1";
  const normalizedLogs = normalizeSetLogs(defaults?.setLogs, targetSets);
  const completedSets = normalizedLogs.filter((setLog) => setLog.done).length;
  const base: EntryState = {
    exercise,
    completed: false,
    sets: "",
    completedSets: 0,
    setLogs: [],
    reps: "",
    weightKg: "",
    durationMinutes: "",
    targetMinutes: "",
    trackedSeconds: 0,
    notes: "",
  };
  return {
    ...base,
    ...defaults,
    sets: targetSets,
    setLogs: normalizedLogs,
    completedSets,
  };
}

function buildDefaultProfile(): UserProfile {
  return {
    displayName: "",
    goal: "",
    preferredCategories: [],
    weightUnit: "kg",
    reminderTime: "07:00",
  };
}

function resolveExerciseMuscleGroup(exercise: string): BuilderMuscleGroup {
  const mapped = exerciseMuscleGroupMap[exercise];
  if (mapped && muscleGroupLookup[mapped]) {
    return muscleGroupLookup[mapped];
  }

  const lower = exercise.toLowerCase();
  if (
    lower.includes("run") ||
    lower.includes("cardio") ||
    lower.includes("interval") ||
    lower.includes("jog") ||
    lower.includes("sprint") ||
    lower.includes("rope")
  ) {
    return "Cardio";
  }
  if (
    lower.includes("stretch") ||
    lower.includes("twist") ||
    lower.includes("pose") ||
    lower.includes("breathing") ||
    lower.includes("opener")
  ) {
    return "Mobility";
  }
  if (lower.includes("plank") || lower.includes("core") || lower.includes("crunch")) {
    return "Core";
  }
  if (lower.includes("squat") || lower.includes("lunge") || lower.includes("leg")) {
    return "Beine";
  }
  if (lower.includes("push") || lower.includes("chest") || lower.includes("bench")) {
    return "Brust";
  }
  if (lower.includes("row") || lower.includes("pull") || lower.includes("lat")) {
    return "Rücken";
  }
  if (lower.includes("press") || lower.includes("raise") || lower.includes("shoulder")) {
    return "Schultern";
  }
  if (lower.includes("curl") || lower.includes("triceps") || lower.includes("arm")) {
    return "Arme";
  }
  return "Mobility";
}

export function RoutineJournal({ categories, hiddenLiteHero = false }: RoutineJournalProps) {
  const [pageViewTab, setPageViewTab] = useState<PageViewTab>("training");
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.name ?? "");
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [profile, setProfile] = useState<UserProfile>(() => {
    if (typeof window === "undefined") {
      return buildDefaultProfile();
    }
    const raw = window.localStorage.getItem(profileStorageKey);
    if (!raw) {
      return buildDefaultProfile();
    }
    try {
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      return {
        ...buildDefaultProfile(),
        ...parsed,
        preferredCategories: Array.isArray(parsed.preferredCategories)
          ? parsed.preferredCategories
          : [],
        weightUnit: parsed.weightUnit === "lbs" ? "lbs" : "kg",
      };
    } catch {
      return buildDefaultProfile();
    }
  });
  const [entries, setEntries] = useState<EntryState[]>(() =>
    buildDefaultEntries(categories[0]?.exercises ?? []),
  );
  const [reflection, setReflection] = useState<ReflectionState>(buildDefaultReflection);
  const [overallBaseSeconds, setOverallBaseSeconds] = useState(0);
  const [overallStartedAtMs, setOverallStartedAtMs] = useState<number | null>(null);
  const [activeExerciseTimer, setActiveExerciseTimer] = useState<{
    exercise: string;
    startedAtMs: number;
  } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hasMounted, setHasMounted] = useState(false);
  // These three drive the rendered exercise list. They must start empty so the
  // first client render matches the server HTML; localStorage is applied in an
  // effect right after mount.
  const [customExercisesByCategory, setCustomExercisesByCategory] = useState<
    Record<string, string[]>
  >({});
  const [hiddenExercisesByCategory, setHiddenExercisesByCategory] = useState<
    Record<string, string[]>
  >({});
  const [exerciseOrderByCategory, setExerciseOrderByCategory] = useState<
    Record<string, string[]>
  >({});
  const [newExerciseName, setNewExerciseName] = useState("");
  const [bodyWeightKg, setBodyWeightKg] = useState("");
  const [dashboardRange, setDashboardRange] = useState<"7" | "30" | "90" | "all">("7");
  /** Bumped whenever stored day data changes so the dashboard memo recomputes. */
  const [statsVersion, setStatsVersion] = useState(0);
  const [exerciseDurationFilter, setExerciseDurationFilter] = useState<string>("all");
  const [dashboardGraphConfig, setDashboardGraphConfig] = useState<Record<DashboardGraphKey, boolean>>(() => {
    if (typeof window === "undefined") {
      return defaultDashboardGraphConfig;
    }
    const raw = window.localStorage.getItem(dashboardGraphConfigStorageKey);
    if (!raw) {
      return defaultDashboardGraphConfig;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<Record<DashboardGraphKey, boolean>>;
      return {
        ...defaultDashboardGraphConfig,
        ...parsed,
      };
    } catch {
      return defaultDashboardGraphConfig;
    }
  });
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  const [intervalPhase, setIntervalPhase] = useState<IntervalPhase>("idle");
  const [phaseEndsAtMs, setPhaseEndsAtMs] = useState<number | null>(null);
  const [phaseExercise, setPhaseExercise] = useState<string | null>(null);
  const [phaseRound, setPhaseRound] = useState(1);
  const [phaseTotalSeconds, setPhaseTotalSeconds] = useState(0);
  const [showFocusOverlay, setShowFocusOverlay] = useState(true);
  const [showExerciseGuide, setShowExerciseGuide] = useState(true);
  /** Snapshot of stored history, drives the startup prompt and export nudge. */
  const [historyInfo, setHistoryInfo] = useState<LocalHistory | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  /** Feedback for the backup import, shown inside the startup dialog. */
  const [importFeedback, setImportFeedback] = useState<{
    phase: "idle" | "picking" | "busy" | "success" | "error";
    message: string;
  }>({ phase: "idle", message: "" });

  // ---------------------------------------------------------------- cloud
  const auth = useAuth();
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );
  const [hitWorkSeconds, setHitWorkSeconds] = useState(40);
  const [hitRestSeconds, setHitRestSeconds] = useState(20);
  const [prepSecondsSetting, setPrepSecondsSetting] = useState(10);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lastSetValues, setLastSetValues] = useState<Record<string, { reps: string; weightKg: string }>>({});
  const [restTimerEndsAtMs, setRestTimerEndsAtMs] = useState<number | null>(null);
  const [restTimerExercise, setRestTimerExercise] = useState<string | null>(null);
  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalDraft, setGoalDraft] = useState<{
    type: GoalType;
    subject: string;
    targetValue: string;
    targetReps: string;
    targetDate: string;
    planWhen: string;
    category: string;
  }>({
    type: "strength",
    subject: "",
    targetValue: "",
    targetReps: "",
    targetDate: "",
    planWhen: "",
    category: allCategoriesOption,
  });
  const [goalManualDraft, setGoalManualDraft] = useState<Record<string, string>>({});
  const cancelCuesRef = useRef<() => void>(() => {});

  const [exerciseCustomSeconds, setExerciseCustomSeconds] = useState<ExerciseSecondMap>({});
  const [halfwayAlertEnabled, setHalfwayAlertEnabled] = useState(false);
  const [showJournalArchive, setShowJournalArchive] = useState(false);
  const [journalArchive, setJournalArchive] = useState<JournalArchiveEntry[]>([]);
  const [expandedArchiveKeys, setExpandedArchiveKeys] = useState<Set<string>>(new Set());
  const [hitWorkoutSets, setHitWorkoutSets] = useState<HitWorkoutSet[]>([]);
  const [newHitSetName, setNewHitSetName] = useState("");
  const [selectedHitSetName, setSelectedHitSetName] = useState("");
  const [hitTargetRounds, setHitTargetRounds] = useState(3);
  const [hitCurrentRound, setHitCurrentRound] = useState(1);
  const [bodybuildingFlowActive, setBodybuildingFlowActive] = useState(false);
  const [bodybuildingFocusExercise, setBodybuildingFocusExercise] = useState<string | null>(null);
  const [workoutBuilderTemplates, setWorkoutBuilderTemplates] = useState<
    Record<string, WorkoutBuilderTemplate[]>
  >({});
  const [workoutBuilderName, setWorkoutBuilderName] = useState("");
  const [selectedWorkoutBuilderName, setSelectedWorkoutBuilderName] = useState("");
  const [routineComposerByCategory, setRoutineComposerByCategory] = useState<Record<string, string[]>>(
    {},
  );
  const [selectedBuilderMuscleGroup, setSelectedBuilderMuscleGroup] =
    useState<BuilderMuscleGroup>("Alle");
  const [builderStep, setBuilderStep] = useState<1 | 2 | 3>(1);
  const [workoutCardOpenExercise, setWorkoutCardOpenExercise] = useState<string | null>(null);
  const [lastQuickLoadByCategory, setLastQuickLoadByCategory] = useState<
    Record<string, LastQuickLoad>
  >({});
  const [draggingExercise, setDraggingExercise] = useState<string | null>(null);
  const offlineImportRef = useRef<HTMLInputElement | null>(null);

  const defaultWorkoutBuilderTemplates = useMemo<Record<string, WorkoutBuilderTemplate[]>>(() => {
    const knownExercises = new Set(
      categories.flatMap((category) => category.exercises),
    );

    const toTemplate = (preset: PresetRoutine): WorkoutBuilderTemplate => {
      const customSeconds: ExerciseSecondMap = {};

      const entries = preset.exercises
        .filter((item) => knownExercises.has(item.exercise))
        .map((item) => {
          // Never seed more than three rows per exercise: longer prescriptions
          // are unwieldy to log on a phone. Working sets take priority over
          // warmups, and the user can still add sets manually.
          const workingSets = Math.min(Math.max(1, item.sets), maxDefaultSets);
          const warmups = Math.min(item.warmupSets ?? 0, maxDefaultSets - workingSets);
          const totalSets = warmups + workingSets;
          const setLogs: SetLog[] = Array.from({ length: totalSets }, (_, index) => ({
            reps: "",
            weightKg: "",
            done: false,
            kind: index < warmups ? "warmup" : item.kind,
          }));

          if (item.workSeconds) {
            customSeconds[item.exercise] = item.workSeconds;
          }

          return createEntryTemplate(item.exercise, {
            sets: String(totalSets),
            setLogs,
            // Numeric field stays empty; the prescription lives in targetReps.
            reps: /^\d+$/.test(item.reps) ? item.reps : "",
            targetReps: item.reps,
            targetMinutes: item.restSeconds
              ? String(Math.round(item.restSeconds / 60))
              : "",
          });
        });

      return {
        category: preset.category,
        name: preset.name,
        entries,
        exerciseCustomSeconds: customSeconds,
        intervals: preset.intervals,
      };
    };

    const defaults: Record<string, WorkoutBuilderTemplate[]> = {};
    for (const preset of presetRoutines) {
      const template = toTemplate(preset);
      if (template.entries.length === 0) {
        continue;
      }
      defaults[preset.category] = [...(defaults[preset.category] ?? []), template];
    }

    return defaults;
  }, [categories]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  /**
   * Startup restore prompt. Only asked when this install has no logged history
   * yet - a fresh install, a cleared Safari storage or a new device. That is
   * exactly the moment where continuing from a backup keeps the history
   * gap-free; asking on every launch would just train the user to dismiss it.
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const history = readLocalHistory();
    setHistoryInfo(history);

    const dismissed = localStorage.getItem(restorePromptDismissedKey) === "1";
    if (history.loggedDays === 0 && !dismissed) {
      setShowRestorePrompt(true);
    }

    // Confirmation from a restore that happened just before this reload.
    const lastRestore = localStorage.getItem(lastRestoreStorageKey);
    if (lastRestore) {
      localStorage.removeItem(lastRestoreStorageKey);
      setStatusText(lastRestore);
      setShowRestorePrompt(false);
    }
  }, []);

  // Keep the history/export hints in sync as sessions are logged.
  useEffect(() => {
    if (typeof window === "undefined" || statsVersion === 0) {
      return;
    }
    setHistoryInfo(readLocalHistory());
  }, [statsVersion]);

  /**
   * The file picker fires "cancel" when it is dismissed without a selection.
   * Without this the dialog would keep showing "waiting for file" forever and
   * the user could not tell whether anything had been loaded.
   * Attached imperatively because React's typings have no onCancel for inputs.
   */
  useEffect(() => {
    const input = offlineImportRef.current;
    if (!input) {
      return;
    }
    const onCancel = () =>
      setImportFeedback({
        phase: "error",
        message: "Keine Datei ausgewählt – es wurde nichts geladen.",
      });
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, []);

  /**
   * Reconcile with the cloud once per signed-in session. Runs after login and
   * on every app start while signed in, so a new device pulls the history
   * automatically instead of the user hunting for a backup file.
   */
  const syncedForUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.session || !auth.userId || auth.loading) {
      return;
    }
    if (syncedForUserRef.current === auth.userId) {
      return;
    }
    syncedForUserRef.current = auth.userId;
    // Signing in replaces the file-based restore path.
    setShowRestorePrompt(false);
    void runCloudSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.session, auth.userId]);

  /** Push local changes up, debounced, so the cloud copy stays current. */
  useEffect(() => {
    if (!auth.client || !auth.userId || statsVersion === 0) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void runCloudSync(true);
    }, 4000);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsVersion, auth.client, auth.userId]);

  // Hydrate the list-shaping stores after mount to avoid an SSR mismatch.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const readMap = (storageKey: string): Record<string, string[]> | null => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw) as Record<string, string[]>;
      } catch {
        return null;
      }
    };

    const custom = readMap(customExercisesStorageKey);
    if (custom) setCustomExercisesByCategory(custom);
    const hidden = readMap(hiddenExercisesStorageKey);
    if (hidden) {
      setHiddenExercisesByCategory(hidden);
    } else {
      // First run: switch off the extended add-ons so the default routine is
      // movement only. Users can re-enable them in the builder at any time.
      const seeded: Record<string, string[]> = {};
      for (const category of categories) {
        if (category.defaultHidden?.length) {
          seeded[category.name] = [...category.defaultHidden];
        }
      }
      if (Object.keys(seeded).length > 0) {
        setHiddenExercisesByCategory(seeded);
        localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(seeded));
      }
    }
    const order = readMap(exerciseOrderStorageKey);
    if (order) setExerciseOrderByCategory(order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const isTicking =
      intervalPhase === "prep" || intervalPhase === "work" || intervalPhase === "rest";
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, isTicking ? 200 : 1000);
    return () => {
      window.clearInterval(tick);
    };
  }, [intervalPhase]);

  // Re-sync immediately when returning from background: iOS throttles timers,
  // so the wall clock is the single source of truth.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === "visible") {
        setNowMs(Date.now());
      }
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(journalArchiveStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as JournalArchiveEntry[];
      setJournalArchive(parsed);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawSets = localStorage.getItem(hitWorkoutSetsStorageKey);
    if (rawSets) {
      try {
        setHitWorkoutSets(JSON.parse(rawSets) as HitWorkoutSet[]);
      } catch (error) {
        setErrorText(`HIT-Sets konnten nicht geladen werden: ${String(error)}`);
      }
    }

    const rawWorkoutBuilders = localStorage.getItem(workoutBuilderTemplatesStorageKey);
    if (rawWorkoutBuilders) {
      try {
        setWorkoutBuilderTemplates(
          JSON.parse(rawWorkoutBuilders) as Record<string, WorkoutBuilderTemplate[]>,
        );
      } catch (error) {
        setErrorText(`Workout-Builder konnten nicht geladen werden: ${String(error)}`);
      }
    }

    const rawRoutineComposer = localStorage.getItem(routineComposerStorageKey);
    if (rawRoutineComposer) {
      try {
        setRoutineComposerByCategory(JSON.parse(rawRoutineComposer) as Record<string, string[]>);
      } catch (error) {
        setErrorText(`Routine Composer konnte nicht geladen werden: ${String(error)}`);
      }
    }

    const rawQuickLoad = localStorage.getItem(lastQuickLoadStorageKey);
    if (rawQuickLoad) {
      try {
        setLastQuickLoadByCategory(JSON.parse(rawQuickLoad) as Record<string, LastQuickLoad>);
      } catch (error) {
        setErrorText(`Quick-Load konnte nicht geladen werden: ${String(error)}`);
      }
    }
  }, []);

  useEffect(() => {
    setWorkoutBuilderTemplates((current) => {
      const merged: Record<string, WorkoutBuilderTemplate[]> = { ...current };
      let changed = false;

      for (const [category, defaults] of Object.entries(defaultWorkoutBuilderTemplates)) {
        const existing = merged[category] ?? [];
        const existingNames = new Set(existing.map((item) => item.name));
        const missingDefaults = defaults.filter((item) => !existingNames.has(item.name));
        if (missingDefaults.length > 0) {
          merged[category] = [...existing, ...missingDefaults];
          changed = true;
        }
      }

      if (changed && typeof window !== "undefined") {
        localStorage.setItem(workoutBuilderTemplatesStorageKey, JSON.stringify(merged));
      }

      return changed ? merged : current;
    });
  }, [defaultWorkoutBuilderTemplates]);

  useEffect(() => {
    if (hitCurrentRound > hitTargetRounds) {
      setHitCurrentRound(hitTargetRounds);
    }
  }, [hitCurrentRound, hitTargetRounds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(profileStorageKey, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(dashboardGraphConfigStorageKey, JSON.stringify(dashboardGraphConfig));
  }, [dashboardGraphConfig]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const rawIntervals = localStorage.getItem(intervalSettingsStorageKey);
    if (rawIntervals) {
      try {
        const parsed = JSON.parse(rawIntervals) as {
          hitWorkSeconds?: number;
          hitRestSeconds?: number;
          hitRounds?: number;
          prepSeconds?: number;
        };
        if (parsed.hitWorkSeconds) setHitWorkSeconds(parsed.hitWorkSeconds);
        if (parsed.hitRestSeconds !== undefined) setHitRestSeconds(parsed.hitRestSeconds);
        if (parsed.hitRounds) setHitTargetRounds(parsed.hitRounds);
        if (parsed.prepSeconds !== undefined) setPrepSecondsSetting(parsed.prepSeconds);
      } catch {
        // ignore malformed settings
      }
    }

    const rawSignals = localStorage.getItem(signalPrefsStorageKey);
    if (rawSignals) {
      try {
        const parsed = JSON.parse(rawSignals) as { sound?: boolean; halfway?: boolean; rest?: number };
        if (parsed.sound !== undefined) setSoundEnabled(parsed.sound);
        if (parsed.halfway !== undefined) setHalfwayAlertEnabled(parsed.halfway);
        if (parsed.rest !== undefined) setRestTimerSeconds(parsed.rest);
      } catch {
        // ignore malformed settings
      }
    }

    const rawLastSets = localStorage.getItem(lastSetValuesStorageKey);
    if (rawLastSets) {
      try {
        setLastSetValues(JSON.parse(rawLastSets) as Record<string, { reps: string; weightKg: string }>);
      } catch {
        // ignore malformed history
      }
    }

    const rawGoals = localStorage.getItem(goalsStorageKey);
    if (rawGoals) {
      try {
        setGoals(JSON.parse(rawGoals) as Goal[]);
      } catch {
        // ignore malformed goals
      }
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motionQuery.matches);
    const onMotionChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    motionQuery.addEventListener("change", onMotionChange);
    return () => motionQuery.removeEventListener("change", onMotionChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(
      intervalSettingsStorageKey,
      JSON.stringify({
        hitWorkSeconds,
        hitRestSeconds,
        hitRounds: hitTargetRounds,
        prepSeconds: prepSecondsSetting,
      }),
    );
  }, [hitRestSeconds, hitTargetRounds, hitWorkSeconds, prepSecondsSetting]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(
      signalPrefsStorageKey,
      JSON.stringify({ sound: soundEnabled, halfway: halfwayAlertEnabled, rest: restTimerSeconds }),
    );
    setSignalsEnabled(soundEnabled);
  }, [halfwayAlertEnabled, restTimerSeconds, soundEnabled]);

  // Rest timer between strength sets: fires once when it reaches zero.
  useEffect(() => {
    if (!restTimerEndsAtMs || nowMs < restTimerEndsAtMs) {
      return;
    }
    setRestTimerEndsAtMs(null);
    playWorkStart("intense");
    setStatusText(
      restTimerExercise ? `Pause vorbei - weiter mit ${restTimerExercise}.` : "Pause vorbei.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, restTimerEndsAtMs]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedWeight = window.localStorage.getItem(bodyWeightStorageKey(selectedDate)) ?? "";
    setBodyWeightKg(storedWeight);
  }, [selectedDate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storageKey = bodyWeightStorageKey(selectedDate);
    const trimmedWeight = bodyWeightKg.trim();
    if (!trimmedWeight) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, trimmedWeight);
  }, [bodyWeightKg, selectedDate]);

  const overviewStats = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        totalSessions: 0,
        totalCompleted: 0,
        topExercises: [] as Array<{ name: string; count: number }>,
        topExerciseDurations: [] as Array<{ name: string; seconds: number }>,
        weightTrend: [] as Array<{ key: string; value: number | null }>,
        weightDailySeries: [] as Array<{ key: string; value: number }>,
        volumeTrend: [] as Array<{ key: string; value: number }>,
        categoryMix: [] as Array<{ name: string; value: number }>,
        personalRecords: new Map<string, BestSet>(),
        topRecords: [] as BestSet[],
        weekComparison: {
          sessionsThisWeek: 0,
          sessionsLastWeek: 0,
          volumeThisWeek: 0,
          volumeLastWeek: 0,
          durationThisWeek: 0,
          durationLastWeek: 0,
        },
        moodSeries: [] as Array<{ key: string; value: number }>,
        moodVolumeCorrelation: null as number | null,
        moodPairedCount: 0,
        doneDayKeys: [] as string[],
        doneDaysByCategory: new Map<string, Set<string>>(),
        totalTrackedSeconds: 0,
        totalWorkoutSeconds: 0,
        avgWorkoutSeconds: 0,
        recent7DurationSeconds: getLastNDays(7).map((key) => ({ key, seconds: 0 })),
        recent7Days: getLastNDays(7).map((key) => ({ key, count: 0 })),
        weekView: getWeekKeysMondayToSunday(selectedDate).map((key) => ({
          key,
          count: 0,
          done: false,
        })),
        monthLabel: getMonthMeta(selectedDate).label,
        monthOffset: getMonthMeta(selectedDate).offset,
        monthView: getMonthMeta(selectedDate).keys.map((key) => ({
          key,
          day: Number.parseInt(key.slice(8, 10), 10),
          done: false,
        })),
      };
    }

    const rangeDays = dashboardRange === "all" ? 365 : Number(dashboardRange);
    const activeRangeKeys = dashboardRange === "all" ? getLastNDays(365) : getLastNDays(rangeDays);
    const activeRangeSet = new Set(activeRangeKeys);
    const recent7 = getLastNDays(Math.min(7, Math.max(rangeDays, 7)));
    const weekKeys = getWeekKeysMondayToSunday(selectedDate);
    const monthMeta = getMonthMeta(selectedDate);
    const counts = new Map<string, number>();
    const dayDone = new Map<string, boolean>();
    const doneDaysByCategory = new Map<string, Set<string>>();
    const exerciseCounts = new Map<string, number>();
    const exerciseDurations = new Map<string, number>();
    const durationByDay = new Map<string, number>();
    const weightByDay = new Map<string, number[]>();
    const categoryMix = new Map<string, number>();
    const volumeByDay = new Map<string, number>();
    const allDays: Array<{ dateKey: string; entries: StatEntry[] }> = [];
    const moodByDay = new Map<string, number>();
    let totalSessions = 0;
    let totalCompleted = 0;
    let totalTrackedSeconds = 0;
    let totalWorkoutSeconds = 0;

    for (const dayKey of [...recent7, ...weekKeys, ...monthMeta.keys]) {
      counts.set(dayKey, 0);
      dayDone.set(dayKey, false);
      durationByDay.set(dayKey, 0);
    }

    const localKeys = Object.keys(localStorage);
    for (const key of localKeys) {
      if (key.startsWith(bodyWeightStorageKeyPrefix)) {
        const dateKey = key.replace(bodyWeightStorageKeyPrefix, "");
        if (dashboardRange !== "all" && !activeRangeSet.has(dateKey)) {
          continue;
        }
        const rawBodyWeight = localStorage.getItem(key) ?? "";
        const parsedBodyWeight = Number.parseFloat(rawBodyWeight);
        if (!Number.isNaN(parsedBodyWeight) && parsedBodyWeight > 0) {
          const existing = weightByDay.get(dateKey) ?? [];
          existing.push(parsedBodyWeight);
          weightByDay.set(dateKey, existing);
        }
        continue;
      }

      if (!key.startsWith("momentum-lite:")) {
        continue;
      }

      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          continue;
        }
        const keyParts = key.replace("momentum-lite:", "").split(":");
        const dateKey = keyParts[0];
        const categoryName = keyParts.slice(1).join(":") || "Unsortiert";
        if (dashboardRange !== "all" && !activeRangeSet.has(dateKey)) {
          continue;
        }

        const parsed = JSON.parse(raw) as LiteDayPayload | EntryState[];
        const dayEntries = Array.isArray(parsed) ? parsed : parsed.entries ?? [];
        const completedEntries = dayEntries.filter((entry) => entry.completed);
        const trackedSecondsFromEntries = dayEntries.reduce(
          (sum, entry) => sum + Math.max(0, entry.trackedSeconds ?? 0),
          0,
        );
        const workoutSeconds =
          Array.isArray(parsed) || typeof parsed.overallSeconds !== "number"
            ? trackedSecondsFromEntries
            : Math.max(0, parsed.overallSeconds);
        // Tonnage: sets x reps x weight, warmups excluded.
        const volumeForDay = computeDayTonnage(dayEntries as StatEntry[]);
        if (volumeForDay > 0) {
          volumeByDay.set(dateKey, (volumeByDay.get(dateKey) ?? 0) + volumeForDay);
        }
        allDays.push({ dateKey, entries: dayEntries as StatEntry[] });
        if (!Array.isArray(parsed)) {
          const moodValue = Number.parseInt(parsed.reflection?.flowScore ?? "", 10);
          if (Number.isFinite(moodValue) && moodValue >= 0 && moodValue <= 10) {
            moodByDay.set(dateKey, moodValue);
          }
        }
        if (completedEntries.length > 0) {
          categoryMix.set(categoryName, (categoryMix.get(categoryName) ?? 0) + completedEntries.length);
        }

        if (completedEntries.length > 0) {
          totalSessions += 1;
          dayDone.set(dateKey, true);
          // Per-category done days so a goal like "10 days morning routine"
          // is not satisfied by an unrelated bodybuilding session.
          const categorySet = doneDaysByCategory.get(categoryName) ?? new Set<string>();
          categorySet.add(dateKey);
          doneDaysByCategory.set(categoryName, categorySet);
        }
        totalCompleted += completedEntries.length;
        totalTrackedSeconds += trackedSecondsFromEntries;
        totalWorkoutSeconds += workoutSeconds;
        durationByDay.set(dateKey, (durationByDay.get(dateKey) ?? 0) + workoutSeconds);

        for (const entry of completedEntries) {
          exerciseCounts.set(entry.exercise, (exerciseCounts.get(entry.exercise) ?? 0) + 1);
        }

        for (const entry of dayEntries) {
          const trackedSeconds = Math.max(0, entry.trackedSeconds ?? 0);
          if (trackedSeconds > 0) {
            exerciseDurations.set(
              entry.exercise,
              (exerciseDurations.get(entry.exercise) ?? 0) + trackedSeconds,
            );
          }
          // Bodyweight comes only from the dedicated bodyweight store; lifted
          // weights must never be mixed into the bodyweight series.
        }

        if (counts.has(dateKey)) {
          counts.set(dateKey, (counts.get(dateKey) ?? 0) + completedEntries.length);
        }
        if (completedEntries.length > 0) {
          dayDone.set(dateKey, true);
        }
      } catch {
        // ignore invalid cached data
      }
    }

    const topExercises = Array.from(exerciseCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topExerciseDurations = Array.from(exerciseDurations.entries())
      .map(([name, seconds]) => ({ name, seconds }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 5);

    const weightTrendKeys = dashboardRange === "all" ? getLastNDays(30) : getLastNDays(Math.min(14, rangeDays));
    const weightTrend = weightTrendKeys.map((key) => {
      const values = weightByDay.get(key) ?? [];
      if (values.length === 0) {
        return { key, value: null };
      }
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { key, value: Math.round(avg * 10) / 10 };
    });
    const weightDailySeries = Array.from(weightByDay.entries())
      .map(([key, values]) => ({
        key,
        value: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const volumeTrend = getLastNDays(dashboardRange === "all" ? 30 : Math.min(30, Number(dashboardRange))).map((key) => ({
      key,
      value: volumeByDay.get(key) ?? 0,
    }));
    const categoryMixSeries = Array.from(categoryMix.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const personalRecords = collectPersonalRecords(allDays);
    const topRecords = Array.from(personalRecords.values())
      .sort((a, b) => b.estimatedOneRepMax - a.estimatedOneRepMax)
      .slice(0, 5);

    // This week versus last week: temporal self-comparison beats absolute
    // benchmarks for solo users.
    const last7Keys = getLastNDays(7);
    const prev7Keys = getLastNDays(14).slice(0, 7);
    const sumFor = (keys: string[], source: Map<string, number>) =>
      keys.reduce((sum, key) => sum + (source.get(key) ?? 0), 0);
    const sessionsFor = (keys: string[]) =>
      keys.filter((key) => dayDone.get(key)).length;

    const weekComparison = {
      sessionsThisWeek: sessionsFor(last7Keys),
      sessionsLastWeek: sessionsFor(prev7Keys),
      volumeThisWeek: sumFor(last7Keys, volumeByDay),
      volumeLastWeek: sumFor(prev7Keys, volumeByDay),
      durationThisWeek: sumFor(last7Keys, durationByDay),
      durationLastWeek: sumFor(prev7Keys, durationByDay),
    };

    // Mood versus training load: only reported when enough paired days exist.
    const pairedDays = Array.from(moodByDay.entries())
      .filter(([key]) => (volumeByDay.get(key) ?? 0) > 0)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const moodVolumeCorrelation = correlate(
      pairedDays.map(([, mood]) => mood),
      pairedDays.map(([key]) => volumeByDay.get(key) ?? 0),
    );
    const moodSeries = Array.from(moodByDay.entries())
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return {
      totalSessions,
      totalCompleted,
      topExercises,
      topExerciseDurations,
      weightTrend,
      weightDailySeries,
      volumeTrend,
      categoryMix: categoryMixSeries,
      personalRecords,
      topRecords,
      weekComparison,
      moodSeries,
      moodVolumeCorrelation,
      moodPairedCount: pairedDays.length,
      doneDayKeys: Array.from(dayDone.entries())
        .filter(([, done]) => done)
        .map(([key]) => key),
      doneDaysByCategory,
      totalTrackedSeconds,
      totalWorkoutSeconds,
      avgWorkoutSeconds:
        totalSessions > 0 ? Math.round(totalWorkoutSeconds / totalSessions) : 0,
      recent7DurationSeconds: recent7.map((key) => ({ key, seconds: durationByDay.get(key) ?? 0 })),
      recent7Days: recent7.map((key) => ({ key, count: counts.get(key) ?? 0 })),
      weekView: weekKeys.map((key) => ({
        key,
        count: counts.get(key) ?? 0,
        done: dayDone.get(key) ?? false,
      })),
      monthLabel: monthMeta.label,
      monthOffset: monthMeta.offset,
      monthView: monthMeta.keys.map((key) => ({
        key,
        day: Number.parseInt(key.slice(8, 10), 10),
        done: dayDone.get(key) ?? false,
      })),
    };
    // bodyWeightKg is included so the weight chart refreshes right after the
    // value is persisted to localStorage, which this memo reads from.
    // statsVersion does the same for saved workout days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyWeightKg, dashboardRange, selectedDate, statsVersion]);

  const toggleDashboardGraph = (key: DashboardGraphKey) => {
    setDashboardGraphConfig((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const baseExercises = useMemo(
    () => categories.find((item) => item.name === selectedCategory)?.exercises ?? [],
    [categories, selectedCategory],
  );
  const customExercises = useMemo(
    () => customExercisesByCategory[selectedCategory] ?? [],
    [customExercisesByCategory, selectedCategory],
  );
  const hiddenExercises = useMemo(
    () => hiddenExercisesByCategory[selectedCategory] ?? [],
    [hiddenExercisesByCategory, selectedCategory],
  );

  const allExercisesForCategory = useMemo(() => {
    return Array.from(new Set([...baseExercises, ...customExercises]));
  }, [baseExercises, customExercises]);

  const orderedExercisesForCategory = useMemo(() => {
    const preferredOrder = exerciseOrderByCategory[selectedCategory] ?? [];
    const preferredSet = new Set(preferredOrder);
    const inPreferred = preferredOrder.filter((exercise) =>
      allExercisesForCategory.includes(exercise),
    );
    const missing = allExercisesForCategory.filter((exercise) => !preferredSet.has(exercise));
    return [...inPreferred, ...missing];
  }, [allExercisesForCategory, exerciseOrderByCategory, selectedCategory]);

  const activeExercises = useMemo(() => {
    return orderedExercisesForCategory.filter((exercise) => !hiddenExercises.includes(exercise));
  }, [hiddenExercises, orderedExercisesForCategory]);

  const activeExercisesRef = useRef<string[]>(activeExercises);
  useEffect(() => {
    activeExercisesRef.current = activeExercises;
  }, [activeExercises]);

  // Refs feed the debounced autosave without making the timer restart on every
  // clock tick (overallLiveSeconds changes once per second).
  const loadedKeyRef = useRef<string>("");
  const entriesRef = useRef<EntryState[]>(entries);
  const reflectionRef = useRef<ReflectionState>(reflection);
  const overallSecondsRef = useRef<number>(0);

  useEffect(() => {
    const currentOrder = exerciseOrderByCategory[selectedCategory] ?? [];
    const currentSet = new Set(currentOrder);
    const normalized = [
      ...currentOrder.filter((exercise) => allExercisesForCategory.includes(exercise)),
      ...allExercisesForCategory.filter((exercise) => !currentSet.has(exercise)),
    ];

    if (
      normalized.length === currentOrder.length &&
      normalized.every((exercise, index) => currentOrder[index] === exercise)
    ) {
      return;
    }

    setExerciseOrderByCategory((current) => {
      const next = { ...current, [selectedCategory]: normalized };
      localStorage.setItem(exerciseOrderStorageKey, JSON.stringify(next));
      return next;
    });
  }, [allExercisesForCategory, exerciseOrderByCategory, selectedCategory]);

  const visibleEntries = useMemo(() => {
    const map = new Map(entries.map((entry) => [entry.exercise, entry]));
    return activeExercises.map(
      (exercise) =>
        map.get(exercise) ?? {
          exercise,
          completed: false,
          sets: "",
          completedSets: 0,
          setLogs: [],
          reps: "",
          weightKg: "",
          durationMinutes: "",
          targetMinutes: "",
          trackedSeconds: 0,
          notes: "",
        },
    );
  }, [activeExercises, entries]);

  const builderEntries = useMemo(() => {
    const byExercise = new Map(entries.map((entry) => [entry.exercise, entry]));
    // Must follow the user-defined order, otherwise reordering has no visible
    // effect in the builder.
    return orderedExercisesForCategory.map(
      (exercise) =>
        byExercise.get(exercise) ?? {
          exercise,
          completed: false,
          sets: "",
          completedSets: 0,
          setLogs: [],
          reps: "",
          weightKg: "",
          durationMinutes: "",
          targetMinutes: "",
          trackedSeconds: 0,
          notes: "",
        },
    );
  }, [orderedExercisesForCategory, entries]);

  const completedCount = visibleEntries.filter((entry) => entry.completed).length;
  const categoryProfile = getCategoryProfile(selectedCategory);
  const isIntervalCategory = categoryProfile.mode === "interval";
  const isSetsCategory = categoryProfile.mode === "sets";
  const logsWeight = categoryProfile.logs.includes("weight");
  const logsReps = categoryProfile.logs.includes("reps");
  // Every interval category is driven by the focus overlay, so they all use the
  // compact step list instead of the per-exercise logging cards.
  const isFlowCategory = isIntervalCategory;
  const isHitWorkout = selectedCategory === "HIT Workouts";
  const isBodybuilding = isSetsCategory;
  const flowLabel = categoryProfile.label;

  const intervalSettings = useMemo<IntervalSettings>(() => {
    // User-tunable categories override the profile defaults.
    const rounds = isHitWorkout ? hitTargetRounds : categoryProfile.rounds;
    const work = isHitWorkout ? hitWorkSeconds : categoryProfile.workSeconds;
    const rest = isHitWorkout ? hitRestSeconds : categoryProfile.restSeconds;
    const prep = categoryProfile.configurable
      ? prepSecondsSetting
      : Math.min(categoryProfile.prepSeconds, prepSecondsSetting);

    return {
      prepSeconds: prep,
      restSeconds: rest,
      totalRounds: rounds,
      defaultWorkSeconds: work,
      profile: categoryProfile.tone,
    };
  }, [
    categoryProfile,
    hitRestSeconds,
    hitTargetRounds,
    hitWorkSeconds,
    isHitWorkout,
    prepSecondsSetting,
  ]);

  const intervalRunning = intervalPhase === "prep" || intervalPhase === "work" || intervalPhase === "rest";
  useWakeLock(intervalRunning);
  const filteredBuilderEntries = useMemo(() => {
    if (selectedBuilderMuscleGroup === "Alle") {
      return builderEntries;
    }

    return builderEntries.filter(
      (entry) => resolveExerciseMuscleGroup(entry.exercise) === selectedBuilderMuscleGroup,
    );
  }, [builderEntries, selectedBuilderMuscleGroup]);
  const completionPercent =
    visibleEntries.length === 0
      ? 0
      : Math.round((completedCount / visibleEntries.length) * 100);

  const overallLiveSeconds =
    overallBaseSeconds +
    (overallStartedAtMs ? Math.floor((nowMs - overallStartedAtMs) / 1000) : 0);

  entriesRef.current = entries;
  reflectionRef.current = reflection;
  overallSecondsRef.current = overallLiveSeconds;

  useEffect(() => {
    const loadLite = async () => {
      const key = localStorageKey(selectedDate, selectedCategory);
      const raw = localStorage.getItem(key);
      const exercises = activeExercisesRef.current;

      // Marks which day/category the entries in state belong to. The autosave
      // effect below refuses to write until this matches the current selection,
      // otherwise switching day would flush the previous day's entries into the
      // newly selected key.
      loadedKeyRef.current = key;

      if (!raw) {
        setEntries(buildDefaultEntries(exercises));
        setReflection(normalizeReflection());
        setOverallBaseSeconds(0);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as LiteDayPayload | EntryState[];
        if (Array.isArray(parsed)) {
          setEntries(normalizeEntries(parsed, exercises));
          setReflection(normalizeReflection());
          setOverallBaseSeconds(0);
          return;
        }

        setEntries(normalizeEntries(parsed.entries ?? [], exercises));
        setReflection(normalizeReflection(parsed.reflection));
        setOverallBaseSeconds(parsed.overallSeconds ?? 0);
      } catch (error) {
        setEntries(buildDefaultEntries(exercises));
        setReflection(normalizeReflection());
        setOverallBaseSeconds(0);
        setErrorText(`Lokale Daten sind ungültig: ${String(error)}`);
      }
    };

    void loadLite();
    // Deliberately not keyed on activeExercises: loading a routine changes the
    // active list and must not wipe the entries that routine just supplied.
  }, [selectedCategory, selectedDate]);

  /**
   * Autosave. Without this a finished workout only counted if the user happened
   * to press a save button, so goals and streaks stayed empty. Writing on every
   * change also keeps the dashboard honest after a crash or app switch.
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const key = localStorageKey(selectedDate, selectedCategory);
    if (loadedKeyRef.current !== key) {
      return;
    }
    const timeout = window.setTimeout(() => {
      const payload: LiteDayPayload = {
        entries: entriesRef.current,
        reflection: reflectionRef.current,
        overallSeconds: overallSecondsRef.current,
      };
      localStorage.setItem(key, JSON.stringify(payload));
      touchRevision(key);
      // Tells the dashboard memo that stored data changed.
      setStatsVersion((current) => current + 1);

      const reflectionText = reflectionRef.current.text.trim();
      if (reflectionText) {
        appendJournalArchiveRef.current({
          dateKey: selectedDate,
          category: selectedCategory,
          mood: reflectionRef.current.flowScore
            ? `Score ${reflectionRef.current.flowScore}`
            : "Score -",
          text: reflectionText,
        });
      }
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [entries, reflection, selectedCategory, selectedDate]);

  // Newly activated exercises get a default entry without touching existing logs.
  useEffect(() => {
    setEntries((current) => {
      const known = new Set(current.map((entry) => entry.exercise));
      const missing = activeExercises.filter((exercise) => !known.has(exercise));
      if (missing.length === 0) {
        return current;
      }
      return [...current, ...buildDefaultEntries(missing)];
    });
  }, [activeExercises]);

  const handleEntryChange = (
    exercise: string,
    patch: Partial<Omit<EntryState, "exercise">>,
  ) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.exercise === exercise ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const handleSetCountChange = (exercise: string, setsValue: string) => {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.exercise !== exercise) {
          return entry;
        }
        const normalizedLogs = normalizeSetLogs(entry.setLogs, setsValue);
        const completedSets = normalizedLogs.filter((setLog) => setLog.done).length;
        const targetSets = Math.max(0, Number.parseInt(setsValue || "0", 10) || 0);
        return {
          ...entry,
          sets: setsValue,
          setLogs: normalizedLogs,
          completedSets,
          completed: targetSets > 0 ? completedSets >= targetSets : entry.completed,
        };
      }),
    );
  };

  const updateSetLogValue = (
    exercise: string,
    setIndex: number,
    field: "reps" | "weightKg",
    value: string,
  ) => {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.exercise !== exercise) {
          return entry;
        }
        const setLogs = [...entry.setLogs];
        if (!setLogs[setIndex]) {
          return entry;
        }
        const nextLog = { ...setLogs[setIndex], [field]: value };
        if (!nextLog.reps.trim() || !nextLog.weightKg.trim()) {
          nextLog.done = false;
        }
        setLogs[setIndex] = nextLog;
        const completedSets = setLogs.filter((setLog) => setLog.done).length;
        const targetSets = Math.max(0, Number.parseInt(entry.sets || "0", 10) || 0);
        return {
          ...entry,
          setLogs,
          completedSets,
          completed: targetSets > 0 ? completedSets >= targetSets : entry.completed,
        };
      }),
    );
  };

  const updateSetLogKind = (exercise: string, setIndex: number, kind: SetKind) => {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.exercise !== exercise) {
          return entry;
        }
        const setLogs = [...entry.setLogs];
        if (!setLogs[setIndex]) {
          return entry;
        }
        setLogs[setIndex] = { ...setLogs[setIndex], kind };
        return { ...entry, setLogs };
      }),
    );
  };

  const toggleSetDone = (exercise: string, setIndex: number, done: boolean): boolean => {
    let success = true;
    setEntries((current) =>
      current.map((entry) => {
        if (entry.exercise !== exercise) {
          return entry;
        }
        const setLogs = [...entry.setLogs];
        const setLog = setLogs[setIndex];
        if (!setLog) {
          return entry;
        }
        if (done) {
          const repsValue = Number.parseInt(setLog.reps || "", 10);
          const weightValue = Number.parseFloat(setLog.weightKg || "");
          if (
            Number.isNaN(repsValue) ||
            repsValue <= 0 ||
            Number.isNaN(weightValue) ||
            weightValue <= 0
          ) {
            success = false;
            return entry;
          }
        }
        setLogs[setIndex] = { ...setLog, done };
        const completedSets = setLogs.filter((item) => item.done).length;
        const targetSets = Math.max(0, Number.parseInt(entry.sets || "0", 10) || 0);
        return {
          ...entry,
          setLogs,
          completedSets,
          completed: targetSets > 0 ? completedSets >= targetSets : entry.completed,
        };
      }),
    );

    if (!success) {
      setErrorText("Für DONE pro Satz bitte Reps und Gewicht > 0 eintragen.");
      return false;
    }
    setErrorText("");

    if (done) {
      const completedLog = entries.find((entry) => entry.exercise === exercise)?.setLogs[setIndex];
      if (completedLog) {
        const nextValues = {
          ...lastSetValues,
          [exercise]: { reps: completedLog.reps, weightKg: completedLog.weightKg },
        };
        setLastSetValues(nextValues);
        if (typeof window !== "undefined") {
          localStorage.setItem(lastSetValuesStorageKey, JSON.stringify(nextValues));
        }
      }
      // Hevy/Strong pattern: rest countdown starts automatically after a set.
      if (restTimerSeconds > 0) {
        setRestTimerExercise(exercise);
        setRestTimerEndsAtMs(Date.now() + restTimerSeconds * 1000);
        playHapticClick();
      }
    }

    return true;
  };

  const pauseExerciseTimer = (exercise: string) => {
    if (!activeExerciseTimer || activeExerciseTimer.exercise !== exercise) {
      return;
    }
    const delta = Math.max(0, Math.floor((Date.now() - activeExerciseTimer.startedAtMs) / 1000));
    if (delta > 0) {
      setEntries((current) =>
        current.map((entry) =>
          entry.exercise === exercise
            ? { ...entry, trackedSeconds: entry.trackedSeconds + delta }
            : entry,
        ),
      );
    }
    setActiveExerciseTimer(null);
  };

  const startExerciseTimer = (exercise: string) => {
    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }
    setActiveExerciseTimer({ exercise, startedAtMs: Date.now() });
  };

  const handleCompletedToggle = (exercise: string, checked: boolean) => {
    const matchingEntry = visibleEntries.find((entry) => entry.exercise === exercise);
    if (isBodybuilding && checked) {
      const requiredSets = Math.max(0, Number.parseInt(matchingEntry?.sets || "0", 10) || 0);
      const allSetsDone =
        requiredSets > 0 &&
        matchingEntry?.setLogs.length === requiredSets &&
        matchingEntry.setLogs.every((setLog) => {
          const repsValue = Number.parseInt(setLog.reps || "", 10);
          const weightValue = Number.parseFloat(setLog.weightKg || "");
          return setLog.done && repsValue > 0 && weightValue > 0;
        });
      if (!allSetsDone) {
        setErrorText("Bodybuilding: erst alle Sätze mit Reps + Gewicht als DONE markieren.");
        return;
      }
    }

    handleEntryChange(exercise, {
      completed: checked,
      completedSets: checked ? matchingEntry?.completedSets ?? 0 : 0,
    });

    if (isBodybuilding && checked && bodybuildingFlowActive) {
      const currentIndex = visibleEntries.findIndex((entry) => entry.exercise === exercise);
      const nextEntry = visibleEntries.slice(currentIndex + 1).find((entry) => !entry.completed);
      setBodybuildingFocusExercise(nextEntry?.exercise ?? null);
      if (!nextEntry) {
        setBodybuildingFlowActive(false);
        setStatusText("Bodybuilding Session abgeschlossen - stark!");
      }
      return;
    }

    if (!checked || !isFlowCategory || !intervalRunning) {
      return;
    }

    // The interval engine owns advancing; a manual check just skips ahead.
    if (phaseExercise === exercise) {
      handleIntervalPhaseEnd();
    }
  };

  const getWorkSecondsFor = (exercise: string) =>
    getExerciseTargetSeconds(exerciseCustomSeconds, exercise, intervalSettings.defaultWorkSeconds);

  const resolveNextIntervalStep = (
    currentExercise: string | null,
    round: number,
  ): { exercise: string; round: number } | null => {
    if (activeExercises.length === 0) {
      return null;
    }
    if (!currentExercise) {
      return { exercise: activeExercises[0], round };
    }
    const currentIndex = activeExercises.indexOf(currentExercise);
    const nextExercise = activeExercises[currentIndex + 1];
    if (nextExercise) {
      return { exercise: nextExercise, round };
    }
    if (round < intervalSettings.totalRounds) {
      return { exercise: activeExercises[0], round: round + 1 };
    }
    return null;
  };

  const resetRoundCompletions = () => {
    const visibleNames = new Set(activeExercises);
    setEntries((current) =>
      current.map((entry) =>
        visibleNames.has(entry.exercise)
          ? {
              ...entry,
              completed: false,
              completedSets: 0,
              setLogs: entry.setLogs.map((setLog) => ({ ...setLog, done: false })),
            }
          : entry,
      ),
    );
  };

  const beginWorkPhase = (exercise: string, round: number) => {
    const seconds = getWorkSecondsFor(exercise);
    cancelCuesRef.current();
    setPhaseExercise(exercise);
    setPhaseRound(round);
    setPhaseTotalSeconds(seconds);
    setIntervalPhase("work");
    setPhaseEndsAtMs(Date.now() + seconds * 1000);
    startExerciseTimer(exercise);
    playWorkStart(intervalSettings.profile);
    cancelCuesRef.current = schedulePhaseCues({
      durationSeconds: seconds,
      profile: intervalSettings.profile,
      halfway: halfwayAlertEnabled,
    });
    setStatusText(`${exercise} läuft.`);
    setErrorText("");
  };

  const beginRestPhase = (upcomingExercise: string, round: number) => {
    const seconds = intervalSettings.restSeconds;
    cancelCuesRef.current();
    setPhaseExercise(upcomingExercise);
    setPhaseRound(round);
    setPhaseTotalSeconds(seconds);
    setIntervalPhase("rest");
    setPhaseEndsAtMs(Date.now() + seconds * 1000);
    playRestStart(intervalSettings.profile);
    cancelCuesRef.current = schedulePhaseCues({
      durationSeconds: seconds,
      profile: intervalSettings.profile,
      halfway: false,
    });
    setStatusText(`Pause - als Nächstes: ${upcomingExercise}`);
  };

  const completeIntervalSession = () => {
    cancelCuesRef.current();
    cancelScheduledCues();
    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }
    setIntervalPhase("complete");
    setPhaseEndsAtMs(null);
    setPhaseTotalSeconds(0);
    if (overallStartedAtMs) {
      const delta = Math.max(0, Math.floor((Date.now() - overallStartedAtMs) / 1000));
      setOverallBaseSeconds((current) => current + delta);
      setOverallStartedAtMs(null);
    }
    playSessionComplete(intervalSettings.profile);
    setStatusText(`${isHitWorkout ? "HIT" : flowLabel} abgeschlossen - stark durchgezogen!`);
    setErrorText("");
  };

  const handleIntervalPhaseEnd = () => {
    if (intervalPhase === "prep") {
      const target = phaseExercise ?? activeExercises[0];
      if (!target) {
        completeIntervalSession();
        return;
      }
      beginWorkPhase(target, phaseRound);
      return;
    }

    if (intervalPhase === "work") {
      const current = phaseExercise;
      if (current) {
        handleEntryChange(current, { completed: true });
        pauseExerciseTimer(current);
      }
      const nextStep = resolveNextIntervalStep(current, phaseRound);
      if (!nextStep) {
        completeIntervalSession();
        return;
      }
      if (nextStep.round !== phaseRound) {
        resetRoundCompletions();
        setHitCurrentRound(nextStep.round);
      }
      if (intervalSettings.restSeconds > 0) {
        beginRestPhase(nextStep.exercise, nextStep.round);
      } else {
        beginWorkPhase(nextStep.exercise, nextStep.round);
      }
      return;
    }

    if (intervalPhase === "rest") {
      const target = phaseExercise;
      if (!target) {
        completeIntervalSession();
        return;
      }
      beginWorkPhase(target, phaseRound);
    }
  };

  const startIntervalSession = async () => {
    if (activeExercises.length === 0) {
      setErrorText("Keine aktiven Übungen - bitte im Builder eine Routine laden.");
      return;
    }

    const unlocked = await unlockAudio();
    if (!unlocked && soundEnabled) {
      setStatusText("Ton konnte nicht aktiviert werden - visuelle Signale laufen weiter.");
    }

    const firstExercise =
      visibleEntries.find((entry) => !entry.completed)?.exercise ?? activeExercises[0];

    setHitCurrentRound(1);
    setPhaseRound(1);
    setPhaseExercise(firstExercise);
    setShowFocusOverlay(true);
    if (!overallStartedAtMs) {
      setOverallStartedAtMs(Date.now());
    }

    if (intervalSettings.prepSeconds > 0) {
      cancelCuesRef.current();
      setIntervalPhase("prep");
      setPhaseTotalSeconds(intervalSettings.prepSeconds);
      setPhaseEndsAtMs(Date.now() + intervalSettings.prepSeconds * 1000);
      playHapticClick();
      cancelCuesRef.current = schedulePhaseCues({
        durationSeconds: intervalSettings.prepSeconds,
        profile: intervalSettings.profile,
        halfway: false,
      });
      setStatusText(`Gleich geht's los: ${firstExercise}`);
      setErrorText("");
      return;
    }

    beginWorkPhase(firstExercise, 1);
  };

  const pauseIntervalSession = () => {
    cancelCuesRef.current();
    cancelScheduledCues();
    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }
    if (overallStartedAtMs) {
      const delta = Math.max(0, Math.floor((Date.now() - overallStartedAtMs) / 1000));
      setOverallBaseSeconds((current) => current + delta);
      setOverallStartedAtMs(null);
    }
    setIntervalPhase("idle");
    setPhaseEndsAtMs(null);
    setStatusText("Session pausiert.");
  };

  const skipIntervalPhase = () => {
    if (!intervalRunning) {
      return;
    }
    playHapticClick();
    handleIntervalPhaseEnd();
  };

  const exitIntervalSession = () => {
    cancelCuesRef.current();
    cancelScheduledCues();
    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }
    if (overallStartedAtMs) {
      const delta = Math.max(0, Math.floor((Date.now() - overallStartedAtMs) / 1000));
      setOverallBaseSeconds((current) => current + delta);
      setOverallStartedAtMs(null);
    }
    setIntervalPhase("idle");
    setPhaseEndsAtMs(null);
    setPhaseExercise(null);
    // Hands the iOS audio session back so the user's music resumes and the
    // lock-screen transport controls disappear.
    releaseAudio();
    };

  const addCustomExercise = (nameOverride?: string) => {
    const trimmed = (nameOverride ?? newExerciseName).trim();
    if (!trimmed) {
      setErrorText("Bitte zuerst einen Übungsnamen eingeben.");
      return;
    }
    if (allExercisesForCategory.includes(trimmed)) {
      setErrorText("Diese Übung existiert bereits in der Kategorie.");
      return;
    }

    setCustomExercisesByCategory((current) => {
      const next = {
        ...current,
        [selectedCategory]: [...(current[selectedCategory] ?? []), trimmed],
      };
      localStorage.setItem(customExercisesStorageKey, JSON.stringify(next));
      return next;
    });

    setEntries((current) => [
      ...current,
      {
        exercise: trimmed,
        completed: false,
        sets: "",
        completedSets: 0,
        setLogs: [],
        reps: "",
        weightKg: "",
        durationMinutes: "",
        targetMinutes: "",
        trackedSeconds: 0,
        notes: "",
      },
    ]);
    setNewExerciseName("");
    setStatusText(`Übung "${trimmed}" hinzugefügt.`);
    setErrorText("");
  };

  const removeCustomExercise = (exercise: string) => {
    setCustomExercisesByCategory((current) => {
      const nextList = (current[selectedCategory] ?? []).filter((item) => item !== exercise);
      const next = { ...current, [selectedCategory]: nextList };
      localStorage.setItem(customExercisesStorageKey, JSON.stringify(next));
      return next;
    });
    setHiddenExercisesByCategory((current) => {
      const nextList = (current[selectedCategory] ?? []).filter((item) => item !== exercise);
      const next = { ...current, [selectedCategory]: nextList };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });
    setEntries((current) => current.filter((entry) => entry.exercise !== exercise));
  };

  /**
   * Precise reason why "Done & Next" cannot complete this exercise yet.
   * Returned as a sentence so it can be shown next to the button *before* the
   * user taps it, instead of only as an error afterwards.
   */
  const describeBodybuildingBlocker = (entry: EntryState | undefined): string | null => {
    if (!entry) {
      return null;
    }
    const requiredSets = Math.max(0, Number.parseInt(entry.sets || "0", 10) || 0);
    if (requiredSets === 0) {
      return "Lege zuerst eine Satzzahl größer als 0 fest.";
    }
    if (entry.setLogs.length !== requiredSets) {
      return `Satzzahl (${requiredSets}) und angelegte Sätze (${entry.setLogs.length}) stimmen nicht überein.`;
    }

    const missing: string[] = [];
    entry.setLogs.forEach((setLog, index) => {
      const reps = Number.parseInt(setLog.reps || "", 10);
      const weight = Number.parseFloat(setLog.weightKg || "");
      const gaps: string[] = [];
      if (!Number.isFinite(reps) || reps <= 0) gaps.push("Reps");
      if (!Number.isFinite(weight) || weight <= 0) gaps.push("Gewicht");
      if (!setLog.done) gaps.push("DONE");
      if (gaps.length > 0) {
        missing.push(`Satz ${index + 1}: ${gaps.join(" + ")}`);
      }
    });

    if (missing.length === 0) {
      return null;
    }
    // Keep it short on mobile: name the first two gaps explicitly.
    const shown = missing.slice(0, 2).join(" · ");
    const rest = missing.length > 2 ? ` · +${missing.length - 2} weitere` : "";
    return `Noch offen – ${shown}${rest}`;
  };

  const completeBodybuildingAndNext = (exercise: string): boolean => {
    const currentEntry = visibleEntries.find((entry) => entry.exercise === exercise);
    if (!currentEntry) {
      return false;
    }
    const blocker = describeBodybuildingBlocker(currentEntry);
    if (blocker) {
      setErrorText(blocker);
      return false;
    }
    const requiredSets = Math.max(0, Number.parseInt(currentEntry.sets || "0", 10) || 0);

    handleEntryChange(exercise, {
      completed: true,
      completedSets: requiredSets,
    });
    const currentIndex = visibleEntries.findIndex((entry) => entry.exercise === exercise);
    const nextEntry = visibleEntries.slice(currentIndex + 1).find((entry) => !entry.completed);
    setBodybuildingFocusExercise(nextEntry?.exercise ?? null);
    setErrorText("");
    if (!nextEntry) {
      setBodybuildingFlowActive(false);
      setStatusText("Bodybuilding Session abgeschlossen - stark!");
    } else {
      setStatusText(`Weiter mit: ${nextEntry.exercise}`);
    }
    return true;
  };

  const toggleBuilderExercise = (exercise: string, enabled: boolean) => {
    setHiddenExercisesByCategory((current) => {
      const currentSet = new Set(current[selectedCategory] ?? []);
      if (enabled) {
        currentSet.delete(exercise);
      } else {
        currentSet.add(exercise);
      }
      const next = { ...current, [selectedCategory]: Array.from(currentSet) };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const reorderExercises = (sourceExercise: string, targetExercise: string) => {
    if (sourceExercise === targetExercise) {
      return;
    }
    setExerciseOrderByCategory((current) => {
      const currentOrder = current[selectedCategory] ?? orderedExercisesForCategory;
      const sourceIndex = currentOrder.indexOf(sourceExercise);
      const targetIndex = currentOrder.indexOf(targetExercise);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }
      const nextOrder = [...currentOrder];
      const [moved] = nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, moved);
      const next = { ...current, [selectedCategory]: nextOrder };
      localStorage.setItem(exerciseOrderStorageKey, JSON.stringify(next));
      return next;
    });
  };

  /**
   * Moves an exercise one slot up or down within the *visible* list.
   *
   * The stored order also contains deactivated exercises, so the two entries
   * are swapped by position instead of spliced. That keeps hidden exercises in
   * their slot and makes the visible move predictable.
   */
  const moveExerciseInOrder = (exercise: string, direction: -1 | 1) => {
    const visible = activeExercises;
    const visibleIndex = visible.indexOf(exercise);
    const neighbour = visible[visibleIndex + direction];
    if (visibleIndex < 0 || !neighbour) {
      return;
    }

    setExerciseOrderByCategory((current) => {
      const currentOrder = current[selectedCategory] ?? orderedExercisesForCategory;
      const from = currentOrder.indexOf(exercise);
      const to = currentOrder.indexOf(neighbour);
      if (from < 0 || to < 0) {
        return current;
      }
      const nextOrder = [...currentOrder];
      nextOrder[from] = neighbour;
      nextOrder[to] = exercise;
      const next = { ...current, [selectedCategory]: nextOrder };
      localStorage.setItem(exerciseOrderStorageKey, JSON.stringify(next));
      return next;
    });
    playHapticClick();
  };

  /** Sends an exercise straight to the first visible slot. */
  const moveExerciseToStart = (exercise: string) => {
    const firstVisible = activeExercises[0];
    if (!firstVisible || firstVisible === exercise) {
      return;
    }
    setExerciseOrderByCategory((current) => {
      const currentOrder = current[selectedCategory] ?? orderedExercisesForCategory;
      if (!currentOrder.includes(exercise)) {
        return current;
      }
      const withoutExercise = currentOrder.filter((item) => item !== exercise);
      const anchor = withoutExercise.indexOf(firstVisible);
      if (anchor < 0) {
        return current;
      }
      const nextOrder = [...withoutExercise];
      nextOrder.splice(anchor, 0, exercise);
      const next = { ...current, [selectedCategory]: nextOrder };
      localStorage.setItem(exerciseOrderStorageKey, JSON.stringify(next));
      return next;
    });
    playHapticClick();
  };

  const rememberQuickLoad = (type: QuickLoadType, name: string) => {
    setLastQuickLoadByCategory((current) => {
      const next = { ...current, [selectedCategory]: { type, name } };
      localStorage.setItem(lastQuickLoadStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const saveWorkoutBuilderTemplate = () => {
    const trimmed = workoutBuilderName.trim();
    if (!trimmed) {
      setErrorText("Bitte einen Namen für den Workout-Builder eingeben.");
      return;
    }

    const selectedEntries = builderEntries.filter((entry) => !hiddenExercises.includes(entry.exercise));
    if (selectedEntries.length === 0) {
      setErrorText("Bitte mindestens eine Übung im Workout-Builder aktivieren.");
      return;
    }

    const template: WorkoutBuilderTemplate = {
      name: trimmed,
      category: selectedCategory,
      entries: selectedEntries,
      exerciseCustomSeconds,
    };

    setWorkoutBuilderTemplates((current) => {
      const categoryTemplates = current[selectedCategory] ?? [];
      const nextCategory = [
        ...categoryTemplates.filter((item) => item.name !== trimmed),
        template,
      ];
      const next = { ...current, [selectedCategory]: nextCategory };
      localStorage.setItem(workoutBuilderTemplatesStorageKey, JSON.stringify(next));
      return next;
    });
    setSelectedWorkoutBuilderName(trimmed);
    setStatusText(`Workout-Builder "${trimmed}" gespeichert.`);
    setErrorText("");
  };

  /**
   * Applies a template's exercise sequence as the category order. Without this
   * a loaded routine kept whatever order was stored before, so exercises
   * appeared to be appended at the bottom instead of following the routine.
   */
  const applyExerciseOrderFromEntries = (entries: EntryState[]) => {
    const fromTemplate = entries.map((entry) => entry.exercise);
    setExerciseOrderByCategory((current) => {
      const previous = current[selectedCategory] ?? [];
      const templateSet = new Set(fromTemplate);
      // Exercises not in the routine keep their relative order behind it.
      const remainder = [...previous, ...allExercisesForCategory].filter(
        (exercise, index, list) =>
          !templateSet.has(exercise) && list.indexOf(exercise) === index,
      );
      const next = { ...current, [selectedCategory]: [...fromTemplate, ...remainder] };
      localStorage.setItem(exerciseOrderStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const markTemplateUsed = (category: string, name: string) => {
    setWorkoutBuilderTemplates((current) => {
      const categoryTemplates = current[category] ?? [];
      const nextCategory = categoryTemplates.map((item) =>
        item.name === name ? { ...item, lastUsedAt: new Date().toISOString() } : item,
      );
      const next = { ...current, [category]: nextCategory };
      localStorage.setItem(workoutBuilderTemplatesStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const loadWorkoutBuilderTemplate = (nameOverride?: string) => {
    const targetName = nameOverride ?? selectedWorkoutBuilderName;
    const template = (workoutBuilderTemplates[selectedCategory] ?? []).find(
      (item) => item.name === targetName,
    );
    if (!template) {
      setErrorText("Bitte zuerst einen Workout-Builder auswählen.");
      return;
    }

    const templateSet = new Set(template.entries.map((entry) => entry.exercise));
    setHiddenExercisesByCategory((current) => {
      const nextHidden = allExercisesForCategory.filter((exercise) => !templateSet.has(exercise));
      const next = { ...current, [selectedCategory]: nextHidden };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });

    applyExerciseOrderFromEntries(template.entries);

    setEntries((current) => {
      const byExercise = new Map(current.map((entry) => [entry.exercise, entry]));
      for (const entry of template.entries) {
        byExercise.set(entry.exercise, entry);
      }
      // Emit in template order so the workout list matches the routine.
      const ordered = template.entries.map(
        (entry) => byExercise.get(entry.exercise) ?? entry,
      );
      const rest = Array.from(byExercise.values()).filter(
        (entry) => !templateSet.has(entry.exercise),
      );
      return [...ordered, ...rest];
    });
    setExerciseCustomSeconds(template.exerciseCustomSeconds ?? {});
    if (template.intervals) {
      // Tabata and generic HIT share a category but need different timing.
      setHitWorkSeconds(template.intervals.workSeconds);
      setHitRestSeconds(template.intervals.restSeconds);
      setHitTargetRounds(template.intervals.rounds);
    }
    if (selectedCategory === "Bodybuilding") {
      setBodybuildingFlowActive(false);
      setBodybuildingFocusExercise(null);
    }
    if (selectedCategory === "HIT Workouts") {
      setHitCurrentRound(1);
    }
    setSelectedWorkoutBuilderName(template.name);
    markTemplateUsed(selectedCategory, template.name);
    rememberQuickLoad("builder", template.name);
    setStatusText(`Workout-Builder "${template.name}" geladen.`);
    setErrorText("");
  };

  const toggleRoutineComposerTemplate = (templateName: string, checked: boolean) => {
    setRoutineComposerByCategory((current) => {
      const selected = new Set(current[selectedCategory] ?? []);
      if (checked) {
        selected.add(templateName);
      } else {
        selected.delete(templateName);
      }
      const next = {
        ...current,
        [selectedCategory]: Array.from(selected),
      };
      localStorage.setItem(routineComposerStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const combineRoutineComposerTemplates = () => {
    const selectedNames = routineComposerByCategory[selectedCategory] ?? [];
    if (selectedNames.length === 0) {
      setErrorText("Bitte mindestens einen gespeicherten Builder für die Routine-Auswahl markieren.");
      return;
    }

    const templates = (workoutBuilderTemplates[selectedCategory] ?? []).filter((template) =>
      selectedNames.includes(template.name),
    );
    if (templates.length === 0) {
      setErrorText("Ausgewählte Builder konnten nicht gefunden werden.");
      return;
    }

    const combinedByExercise = new Map<string, EntryState>();
    const combinedSeconds: ExerciseSecondMap = {};
    for (const template of templates) {
      for (const entry of template.entries) {
        if (!combinedByExercise.has(entry.exercise)) {
          combinedByExercise.set(entry.exercise, entry);
        }
      }
      for (const [exercise, seconds] of Object.entries(template.exerciseCustomSeconds ?? {})) {
        combinedSeconds[exercise] = seconds;
      }
    }

    const activeSet = new Set(combinedByExercise.keys());
    setHiddenExercisesByCategory((current) => {
      const nextHidden = allExercisesForCategory.filter((exercise) => !activeSet.has(exercise));
      const next = { ...current, [selectedCategory]: nextHidden };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });

    setEntries((current) => {
      const byExercise = new Map(current.map((entry) => [entry.exercise, entry]));
      for (const [exercise, entry] of combinedByExercise.entries()) {
        byExercise.set(exercise, entry);
      }
      return Array.from(byExercise.values());
    });
    setExerciseCustomSeconds((current) => ({ ...current, ...combinedSeconds }));

    if (selectedCategory === "Bodybuilding") {
    }
    if (selectedCategory === "HIT Workouts") {
      setHitCurrentRound(1);
    }

    setStatusText(`Routine kombiniert aus: ${templates.map((template) => template.name).join(" + ")}`);
    setErrorText("");
  };

  const completeHitRound = () => {
    if (!isHitWorkout) {
      setErrorText("Rundenabschluss ist nur in HIT Workouts verfügbar.");
      return;
    }

    if (visibleEntries.length === 0) {
      setErrorText("Keine aktiven HIT-Übungen vorhanden.");
      return;
    }

    const allDone = visibleEntries.every((entry) => entry.completed);
    if (!allDone) {
      setErrorText("Bitte zuerst alle Übungen dieser Runde mit Done abhaken.");
      return;
    }

    advanceHitRound();
  };

  const saveHitWorkoutSet = () => {
    if (!isHitWorkout) {
      setErrorText("Workout-Sets können nur in HIT Workouts gespeichert werden.");
      return;
    }

    const trimmed = newHitSetName.trim();
    if (!trimmed) {
      setErrorText("Bitte einen Namen für das HIT-Set eingeben.");
      return;
    }

    const items = visibleEntries.map((entry) => ({
      exercise: entry.exercise,
      reps: entry.reps.trim() || "0",
      sets: entry.sets.trim() || "",
    }));
    const filteredItems = items.filter((item) => item.exercise.trim().length > 0);
    if (filteredItems.length === 0) {
      setErrorText("Für das HIT-Set wurden keine Übungen gefunden.");
      return;
    }

    setHitWorkoutSets((current) => {
      const next = [
        ...current.filter((setItem) => setItem.name !== trimmed),
        { name: trimmed, items: filteredItems },
      ];
      localStorage.setItem(hitWorkoutSetsStorageKey, JSON.stringify(next));
      return next;
    });
    setSelectedHitSetName(trimmed);
    setStatusText(`HIT-Set "${trimmed}" gespeichert.`);
    setErrorText("");
  };

  const loadHitWorkoutSet = (nameOverride?: string) => {
    if (!isHitWorkout) {
      setErrorText("Workout-Sets können nur in HIT Workouts geladen werden.");
      return;
    }

    const targetName = nameOverride ?? selectedHitSetName;
    const setToLoad = hitWorkoutSets.find((setItem) => setItem.name === targetName);
    if (!setToLoad) {
      setErrorText("Bitte zuerst ein HIT-Set auswählen.");
      return;
    }

    const missingExercises = setToLoad.items
      .map((item) => item.exercise)
      .filter((exercise) => !allExercisesForCategory.includes(exercise));

    if (missingExercises.length > 0) {
      setCustomExercisesByCategory((current) => {
        const existing = current[selectedCategory] ?? [];
        const next = {
          ...current,
          [selectedCategory]: Array.from(new Set([...existing, ...missingExercises])),
        };
        localStorage.setItem(customExercisesStorageKey, JSON.stringify(next));
        return next;
      });
    }

    setHiddenExercisesByCategory((current) => {
      const currentSet = new Set(current[selectedCategory] ?? []);
      for (const item of setToLoad.items) {
        currentSet.delete(item.exercise);
      }
      const next = { ...current, [selectedCategory]: Array.from(currentSet) };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });

    setEntries((current) => {
      const byExercise = new Map(current.map((entry) => [entry.exercise, entry]));
      for (const item of setToLoad.items) {
        const existing = byExercise.get(item.exercise);
        byExercise.set(item.exercise, {
          exercise: item.exercise,
          completed: false,
          sets: item.sets || existing?.sets || "",
          completedSets: existing?.completedSets ?? 0,
          setLogs: normalizeSetLogs(existing?.setLogs, item.sets || existing?.sets || ""),
          reps: item.reps,
          weightKg: existing?.weightKg ?? "",
          durationMinutes: existing?.durationMinutes ?? "",
          targetMinutes: existing?.targetMinutes ?? "",
          trackedSeconds: existing?.trackedSeconds ?? 0,
          notes: existing?.notes ?? "",
        });
      }
      return Array.from(byExercise.values());
    });

    setHitCurrentRound(1);
    setSelectedHitSetName(setToLoad.name);
    rememberQuickLoad("hit-set", setToLoad.name);
    setStatusText(`HIT-Set "${setToLoad.name}" geladen.`);
    setErrorText("");
  };

  const exportOfflineData = () => {
    if (typeof window === "undefined") {
      return;
    }

    const bundle = buildBackupBundle();
    const fileName = `momentum-backup-${getTodayDateKey()}.json`;
    const json = JSON.stringify(bundle, null, 2);
    const count =
      bundle.data.days.length +
      bundle.data.bodyWeight.length +
      Object.keys(bundle.data.documents).length;

    // On iOS the share sheet allows saving straight into Files / iCloud Drive,
    // which is far more useful than a download that lands in Downloads.
    const file = new File([json], fileName, { type: "application/json" });
    const shareData = { files: [file], title: "Momentum Backup" };
    const canShareFile =
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare(shareData);

    const downloadFallback = () => {
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      markExported();
      setHistoryInfo(readLocalHistory());
      setStatusText(`Backup exportiert (${count} Einträge).`);
      setErrorText("");
    };

    if (canShareFile) {
      void navigator
        .share(shareData)
        .then(() => {
          markExported();
          setHistoryInfo(readLocalHistory());
          setStatusText(`Backup geteilt (${count} Einträge).`);
          setErrorText("");
        })
        .catch((error: unknown) => {
          // AbortError means the user closed the sheet on purpose - stay quiet
          // and do NOT claim the data was saved. Anything else is a real
          // failure, so fall back to a download rather than silently no-op.
          const aborted = error instanceof DOMException && error.name === "AbortError";
          if (!aborted) {
            downloadFallback();
          }
        });
      return;
    }

    downloadFallback();
  };

  const triggerOfflineImport = () => {
    setImportFeedback({ phase: "picking", message: "Warte auf Dateiauswahl ..." });
    offlineImportRef.current?.click();
  };

  // ------------------------------------------------------- cloud handlers
  const handleSendCode = async () => {
    setAuthBusy(true);
    const result = await auth.sendEmailCode(authEmail);
    setAuthBusy(false);
    setAuthMessage({ tone: result.ok ? "ok" : "error", text: result.message });
    if (result.ok) {
      setCodeSent(true);
    }
  };

  const handleVerifyCode = async () => {
    setAuthBusy(true);
    const result = await auth.verifyEmailCode(authEmail, authCode);
    setAuthBusy(false);
    setAuthMessage({ tone: result.ok ? "ok" : "error", text: result.message });
    if (result.ok) {
      setAuthCode("");
      setCodeSent(false);
    }
  };

  const handleProviderSignIn = async (provider: AuthProvider) => {
    setAuthBusy(true);
    const result = await auth.signInWithProvider(provider);
    // On success the browser navigates away, so only failures land here.
    if (!result.ok) {
      setAuthBusy(false);
      setAuthMessage({ tone: "error", text: result.message });
    }
  };

  const handleSignOut = async () => {
    setCloudBusy(true);
    const result = await auth.signOut();
    setCloudBusy(false);
    setCloudMessage(null);
    setAuthMessage({ tone: result.ok ? "ok" : "error", text: result.message });
  };

  /** Pull-then-push so both sides converge without losing local sessions. */
  const runCloudSync = async (silent = false) => {
    if (!auth.client || !auth.userId) {
      return;
    }
    setCloudBusy(true);
    const result = await syncWithCloud(auth.client, auth.userId);
    setCloudBusy(false);

    if (!result.ok) {
      setCloudMessage({ tone: "error", text: result.error });
      return;
    }
    if (result.kind === "pulled") {
      const { daysAdded, daysUpdated } = result.summary;
      const changed = daysAdded + daysUpdated;
      setCloudMessage({
        tone: "ok",
        text:
          changed > 0
            ? `Cloud geladen: ${daysAdded} ergänzt, ${daysUpdated} aktualisiert.`
            : "Cloud ist auf dem aktuellen Stand.",
      });
      if (changed > 0) {
        // Re-read storage so the dashboard reflects the merged history.
        setStatsVersion((current) => current + 1);
        setHistoryInfo(readLocalHistory());
      }
      return;
    }
    if (!silent) {
      setCloudMessage({ tone: "ok", text: "In der Cloud gesichert." });
    }
  };

  const handleOfflineImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImportFeedback({ phase: "idle", message: "" });
      return;
    }

    setImportFeedback({ phase: "busy", message: `Lese ${file.name} ...` });

    try {
      const text = await file.text();
      // Merge: an older backup must never delete newer local sessions.
      const summary = restoreBackupBundle(JSON.parse(text), "merge");
      const touched = summary.daysAdded + summary.daysUpdated + summary.documentsMerged;

      if (touched === 0 && summary.daysKept === 0) {
        const message = "Die Datei enthält keine Momentum-Daten.";
        setErrorText(message);
        setImportFeedback({ phase: "error", message });
        return;
      }

      const summaryText = formatRestoreSummary(summary);
      // Survives the reload below, so the confirmation is still visible once
      // the app comes back up with the restored data.
      localStorage.setItem(lastRestoreStorageKey, summaryText);
      setStatusText(summaryText);
      setErrorText("");
      setImportFeedback({
        phase: "success",
        message: `${summaryText} – wird geöffnet ...`,
      });
      // A reload is the safest way to re-hydrate every piece of state from the
      // restored storage without stale values lingering in memory.
      window.setTimeout(() => window.location.reload(), 1400);
    } catch (error) {
      const message = `Import fehlgeschlagen: ${String(error)}`;
      setErrorText(message);
      setImportFeedback({ phase: "error", message });
    } finally {
      event.target.value = "";
    }
  };

  const appendJournalArchive = (entry: JournalArchiveEntry) => {
    try {
      const raw = localStorage.getItem(journalArchiveStorageKey);
      const existing = raw ? (JSON.parse(raw) as JournalArchiveEntry[]) : [];
      const filtered = existing.filter(
        (e) => !(e.dateKey === entry.dateKey && e.category === entry.category),
      );
      const next = [...filtered, entry];
      // Skip the write when nothing actually changed, so the debounced autosave
      // cannot loop through the archive state update.
      const previous = existing.find(
        (e) => e.dateKey === entry.dateKey && e.category === entry.category,
      );
      if (previous && previous.text === entry.text && previous.mood === entry.mood) {
        return;
      }
      localStorage.setItem(journalArchiveStorageKey, JSON.stringify(next));
      touchRevision(journalArchiveStorageKey);
      setJournalArchive(next);
    } catch {
      // ignore
    }
  };

  // Kept in a ref so the autosave effect does not need it as a dependency.
  const appendJournalArchiveRef = useRef(appendJournalArchive);
  appendJournalArchiveRef.current = appendJournalArchive;

  useEffect(() => {
    if (!phaseEndsAtMs) {
      return;
    }
    if (intervalPhase !== "prep" && intervalPhase !== "work" && intervalPhase !== "rest") {
      return;
    }
    if (nowMs < phaseEndsAtMs) {
      return;
    }
    handleIntervalPhaseEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, phaseEndsAtMs, intervalPhase]);

  useEffect(() => {
    return () => {
      cancelScheduledCues();
    };
  }, []);

  const phaseRemainingSeconds = phaseEndsAtMs
    ? Math.max(0, Math.ceil((phaseEndsAtMs - nowMs) / 1000))
    : 0;
  const phaseProgress =
    phaseTotalSeconds > 0
      ? Math.max(0, Math.min(1, phaseRemainingSeconds / phaseTotalSeconds))
      : 0;
  const phaseUpcomingExercise =
    intervalPhase === "rest"
      ? phaseExercise
      : resolveNextIntervalStep(phaseExercise, phaseRound)?.exercise ?? null;
  const phaseTheme =
    intervalPhase === "work"
      ? {
          label: intervalSettings.profile === "calm" ? "HALTEN" : "WORK",
          surface: "bg-green-700",
          ring: "#bbf7d0",
        }
      : intervalPhase === "rest"
        ? { label: "PAUSE", surface: "bg-blue-800", ring: "#bfdbfe" }
        : intervalPhase === "prep"
          ? { label: "GLEICH LOS", surface: "bg-amber-700", ring: "#fde68a" }
          : { label: "FERTIG", surface: "bg-violet-800", ring: "#ddd6fe" };

  const activeHeroExercise =
    intervalRunning && phaseExercise
      ? phaseExercise
      : isFlowCategory
        ? (visibleEntries.find((e) => !e.completed)?.exercise ?? activeExercises[0])
        : null;

  const flowExerciseStates = activeExercises.map((exercise) => {
    const matchingEntry = visibleEntries.find((entry) => entry.exercise === exercise);
    const done = matchingEntry?.completed ?? false;
    const active = activeHeroExercise === exercise;
    return { exercise, done, active };
  });
  const exerciseDurationOptions = ["all", ...new Set(overviewStats.topExerciseDurations.map((item) => item.name))];
  const filteredExerciseDurations =
    exerciseDurationFilter === "all"
      ? overviewStats.topExerciseDurations
      : overviewStats.topExerciseDurations.filter((item) => item.name === exerciseDurationFilter);

  const displayEntries = useMemo(() => {
    if (!isBodybuilding || !bodybuildingFocusExercise) {
      return visibleEntries;
    }
    const focused = visibleEntries.find((entry) => entry.exercise === bodybuildingFocusExercise);
    if (!focused) {
      return visibleEntries;
    }
    return [
      focused,
      ...visibleEntries.filter((entry) => entry.exercise !== bodybuildingFocusExercise),
    ];
  }, [bodybuildingFocusExercise, isBodybuilding, visibleEntries]);

  const routineComposerSelection = routineComposerByCategory[selectedCategory] ?? [];
  const savedRoutines = workoutBuilderTemplates[selectedCategory] ?? [];
  const selectedPresetNote =
    presetRoutines.find(
      (preset) =>
        preset.category === selectedCategory && preset.name === selectedWorkoutBuilderName,
    )?.note ?? null;
  const estimatedRoutineSeconds = (() => {
    if (isIntervalCategory) {
      const perRound = activeExercises.reduce(
        (sum, exercise) => sum + getWorkSecondsFor(exercise) + intervalSettings.restSeconds,
        0,
      );
      return perRound * intervalSettings.totalRounds + intervalSettings.prepSeconds;
    }
    if (isSetsCategory) {
      return builderEntries
        .filter((entry) => !hiddenExercises.includes(entry.exercise))
        .reduce((sum, entry) => {
          const sets = Math.max(1, Number.parseInt(entry.sets || "3", 10) || 3);
          return sum + sets * (35 + restTimerSeconds);
        }, 0);
    }
    return builderEntries
      .filter((entry) => !hiddenExercises.includes(entry.exercise))
      .reduce(
        (sum, entry) => sum + (Number.parseInt(entry.durationMinutes || "0", 10) || 0) * 60,
        0,
      );
  })();
  const categoryLastQuickLoad = lastQuickLoadByCategory[selectedCategory] ?? null;
  const currentWorkoutExercise =
    workoutCardOpenExercise ??
    (isBodybuilding
      ? bodybuildingFocusExercise ??
        displayEntries.find((entry) => !entry.completed)?.exercise ??
        displayEntries[0]?.exercise
      : displayEntries.find((entry) => !entry.completed)?.exercise ?? displayEntries[0]?.exercise);
  const currentWorkoutEntry = currentWorkoutExercise
    ? displayEntries.find((entry) => entry.exercise === currentWorkoutExercise) ?? null
    : null;
  const nextWorkoutExercise = currentWorkoutExercise
    ? displayEntries.find(
        (entry) => entry.exercise !== currentWorkoutExercise && !entry.completed,
      )?.exercise ?? null
    : null;
  /** What still needs filling before "Done & Next" will accept this exercise. */
  const stickyBlocker = isBodybuilding
    ? describeBodybuildingBlocker(currentWorkoutEntry ?? undefined)
    : null;

  useEffect(() => {
    const templates = workoutBuilderTemplates[selectedCategory] ?? [];
    if (templates.length === 0) {
      setSelectedWorkoutBuilderName("");
      return;
    }
    const lastBuilder =
      categoryLastQuickLoad?.type === "builder" ? categoryLastQuickLoad.name : "";
    if (lastBuilder && templates.some((template) => template.name === lastBuilder)) {
      setSelectedWorkoutBuilderName(lastBuilder);
      return;
    }
    setSelectedWorkoutBuilderName((current) => {
      if (current && templates.some((template) => template.name === current)) {
        return current;
      }
      // Fall back to the most recently loaded routine rather than list order.
      const used = templates.filter((template) => template.lastUsedAt);
      if (used.length > 0) {
        return used.reduce((best, item) =>
          (item.lastUsedAt ?? "") > (best.lastUsedAt ?? "") ? item : best,
        ).name;
      }
      return templates[templates.length - 1]?.name ?? "";
    });
  }, [categoryLastQuickLoad, selectedCategory, workoutBuilderTemplates]);

  useEffect(() => {
    if (isFlowCategory || displayEntries.length === 0) {
      return;
    }
    const stillVisible = displayEntries.some((entry) => entry.exercise === workoutCardOpenExercise);
    if (stillVisible) {
      return;
    }
    const firstIncomplete = displayEntries.find((entry) => !entry.completed)?.exercise;
    setWorkoutCardOpenExercise(firstIncomplete ?? displayEntries[0].exercise);
  }, [displayEntries, isFlowCategory, workoutCardOpenExercise]);

  const startWorkoutSession = () => {
    if (!overallStartedAtMs) {
      setOverallStartedAtMs(Date.now());
    }
    const firstExercise = currentWorkoutExercise ?? visibleEntries[0]?.exercise;
    if (firstExercise) {
      startExerciseTimer(firstExercise);
      setWorkoutCardOpenExercise(firstExercise);
    }
    setStatusText(isHitWorkout ? "HIT gestartet." : "Training gestartet.");
    setErrorText("");
  };

  const pauseWorkoutSession = () => {
    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }
    if (overallStartedAtMs) {
      const delta = Math.max(0, Math.floor((Date.now() - overallStartedAtMs) / 1000));
      setOverallBaseSeconds((current) => current + delta);
      setOverallStartedAtMs(null);
    }
    setStatusText(isHitWorkout ? "HIT pausiert." : "Training pausiert.");
    setErrorText("");
  };

  const advanceHitRound = () => {
    if (hitCurrentRound >= hitTargetRounds) {
      setStatusText(`HIT abgeschlossen: ${hitTargetRounds}/${hitTargetRounds} Runden geschafft.`);
      setErrorText("");
      return;
    }
    const visibleNames = new Set(visibleEntries.map((entry) => entry.exercise));
    setEntries((current) =>
      current.map((entry) =>
        visibleNames.has(entry.exercise)
          ? {
              ...entry,
              completed: false,
              completedSets: 0,
              setLogs: entry.setLogs.map((setLog) => ({ ...setLog, done: false })),
            }
          : entry,
      ),
    );
    const firstExercise = visibleEntries[0]?.exercise ?? null;
    if (firstExercise) {
      setWorkoutCardOpenExercise(firstExercise);
      startExerciseTimer(firstExercise);
    }
    setHitCurrentRound((current) => current + 1);
    setStatusText(`Runde ${hitCurrentRound} erledigt. Starte Runde ${hitCurrentRound + 1}.`);
    setErrorText("");
  };

  const runStickyDoneNext = () => {
    if (!currentWorkoutEntry) {
      return;
    }
    if (!overallStartedAtMs) {
      setOverallStartedAtMs(Date.now());
    }
    if (isBodybuilding) {
      const completed = completeBodybuildingAndNext(currentWorkoutEntry.exercise);
      if (!completed) {
        return;
      }
      const nextFocus =
        displayEntries.find((entry) => entry.exercise !== currentWorkoutEntry.exercise && !entry.completed)
          ?.exercise ?? null;
      if (nextFocus) {
        setWorkoutCardOpenExercise(nextFocus);
        startExerciseTimer(nextFocus);
      }
      return;
    }
    if (isHitWorkout) {
      const repsValue = Number.parseInt(currentWorkoutEntry.reps || "", 10);
      if (Number.isNaN(repsValue) || repsValue <= 0) {
        setErrorText("Für HIT bitte Reps > 0 eintragen, dann Done & Next drücken.");
        return;
      }
    }
    handleCompletedToggle(currentWorkoutEntry.exercise, true);
    if (activeExerciseTimer?.exercise === currentWorkoutEntry.exercise) {
      pauseExerciseTimer(currentWorkoutEntry.exercise);
    }
    if (nextWorkoutExercise) {
      setWorkoutCardOpenExercise(nextWorkoutExercise);
      startExerciseTimer(nextWorkoutExercise);
      setStatusText(`Erledigt. Weiter mit: ${nextWorkoutExercise}`);
      setErrorText("");
      return;
    }
    if (isHitWorkout) {
      advanceHitRound();
    } else {
      setStatusText("Workout abgeschlossen - starke Session!");
      setErrorText("");
    }
  };

  const togglePreferredCategory = (categoryName: string) => {
    setProfile((current) => {
      const currentSet = new Set(current.preferredCategories);
      if (currentSet.has(categoryName)) {
        currentSet.delete(categoryName);
      } else {
        currentSet.add(categoryName);
      }
      return {
        ...current,
        preferredCategories: Array.from(currentSet),
      };
    });
  };

  const weightUnitLabel = profile.weightUnit;

  const persistGoals = (next: Goal[]) => {
    setGoals(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(goalsStorageKey, JSON.stringify(next));
    }
  };

  /** Current measured value for a goal, per archetype. */
  const resolveGoalCurrentValue = (goal: Goal): number => {
    // A goal scoped to a category must only count that category's sessions,
    // otherwise "10 days morning routine" ticks up from a leg day.
    const scopedDoneDays =
      goal.category && goal.category !== allCategoriesOption
        ? overviewStats.doneDaysByCategory.get(goal.category) ?? new Set<string>()
        : new Set(overviewStats.doneDayKeys);

    switch (goal.type) {
      case "strength": {
        const record = overviewStats.personalRecords.get(goal.subject);
        return record?.estimatedOneRepMax ?? 0;
      }
      case "consistency":
        return computeStreakWithGrace(scopedDoneDays, getTodayDateKey()).streak;
      case "frequency": {
        if (goal.category && goal.category !== allCategoriesOption) {
          return getLastNDays(7).filter((key) => scopedDoneDays.has(key)).length;
        }
        return overviewStats.weekComparison.sessionsThisWeek;
      }
      case "volume":
        return overviewStats.volumeTrend.reduce((sum, item) => sum + item.value, 0);
      case "bodyweight": {
        const series = overviewStats.weightDailySeries.slice(-7);
        if (series.length === 0) return 0;
        return (
          Math.round(
            (series.reduce((sum, item) => sum + item.value, 0) / series.length) * 10,
          ) / 10
        );
      }
      case "endurance":
      case "cardioEfficiency": {
        const entries = goal.manualEntries ?? [];
        return entries.length > 0 ? entries[entries.length - 1].value : 0;
      }
      default:
        return 0;
    }
  };

  const goalCards = goals
    .filter((goal) => !goal.archived)
    .map((goal) => {
      const currentValue = resolveGoalCurrentValue(goal);
      const progress = computeGoalProgress(goal, currentValue, getTodayDateKey());
      return { goal, progress, meta: getGoalTypeMeta(goal.type) };
    })
    .sort((a, b) => a.progress.daysLeft - b.progress.daysLeft);

  const primaryGoal = goalCards.find((item) => !item.progress.reached) ?? goalCards[0] ?? null;

  /** Most recently loaded routine of the active category, for the hint line. */
  const lastUsedTemplateLabel = useMemo(() => {
    const used = (workoutBuilderTemplates[selectedCategory] ?? []).filter(
      (template) => template.lastUsedAt,
    );
    if (used.length === 0) {
      return null;
    }
    const newest = used.reduce((best, item) =>
      (item.lastUsedAt ?? "") > (best.lastUsedAt ?? "") ? item : best,
    );
    return `${newest.name} (${formatLastUsed(newest.lastUsedAt!)})`;
  }, [selectedCategory, workoutBuilderTemplates]);

  /**
   * Nudge to export once unsaved history has built up. Without this the local
   * copy is the only copy, and clearing site data would leave a permanent gap.
   */
  const exportReminder = useMemo(() => {
    if (!historyInfo || historyInfo.loggedDays === 0) {
      return null;
    }
    if (!historyInfo.lastExportAt) {
      return `${historyInfo.loggedDays} Trainingstage sind noch nirgends gesichert. Jetzt exportieren, damit nichts verloren geht.`;
    }
    if (historyInfo.daysSinceExport >= 3) {
      return `${historyInfo.daysSinceExport} neue Tage seit dem letzten Backup (${formatLastUsed(
        historyInfo.lastExportAt,
      )}). Kurz exportieren?`;
    }
    return null;
  }, [historyInfo]);

  const overlayGuide = useMemo(() => {    const exercise = phaseExercise;
    if (!exercise) {
      return null;
    }
    const guide = getExerciseGuide(exercise);
    return guide ? { exercise, guide } : null;
  }, [phaseExercise]);

  const submitGoal = () => {
    const meta = getGoalTypeMeta(goalDraft.type);
    const targetValue = Number.parseFloat(goalDraft.targetValue);

    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      setErrorText("Bitte einen Zielwert eintragen.");
      return;
    }
    if (!goalDraft.targetDate) {
      setErrorText("Bitte ein Zieldatum wählen.");
      return;
    }
    if (meta.needsSubject && !goalDraft.subject.trim()) {
      setErrorText("Bitte eine Übung bzw. Distanz angeben.");
      return;
    }

    const subject = goalDraft.subject.trim();
    const draftGoal: Goal = {
      id: createGoalId(),
      type: goalDraft.type,
      title: meta.needsSubject ? `${subject}: ${targetValue} ${meta.unit}` : `${targetValue} ${meta.unit}`,
      subject,
      targetValue,
      targetReps: goalDraft.targetReps ? Number.parseInt(goalDraft.targetReps, 10) : undefined,
      unit: meta.unit,
      targetDate: goalDraft.targetDate,
      createdAt: getTodayDateKey(),
      startValue: 0,
      planWhen: goalDraft.planWhen.trim() || undefined,
      category: goalDraft.category,
      manualEntries: meta.automatic ? undefined : [],
    };
    // Anchor progress on today's measurement so the bar shows real movement.
    draftGoal.startValue = resolveGoalCurrentValue(draftGoal);

    persistGoals([...goals, draftGoal]);
    setShowGoalForm(false);
    setGoalDraft({
      type: "strength",
      subject: "",
      targetValue: "",
      targetReps: "",
      targetDate: "",
      planWhen: "",
      category: allCategoriesOption,
    });
    setStatusText("Ziel angelegt.");
    setErrorText("");
  };

  const addGoalManualValue = (goalId: string) => {
    const raw = goalManualDraft[goalId];
    const value = Number.parseFloat(raw ?? "");
    if (!Number.isFinite(value) || value <= 0) {
      setErrorText("Bitte einen gültigen Messwert eintragen.");
      return;
    }
    persistGoals(
      goals.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              manualEntries: [
                ...(goal.manualEntries ?? []),
                { dateKey: getTodayDateKey(), value },
              ],
            }
          : goal,
      ),
    );
    setGoalManualDraft((current) => ({ ...current, [goalId]: "" }));
    setStatusText("Messwert gespeichert.");
    setErrorText("");
  };

  const removeGoal = (goalId: string) => {
    persistGoals(goals.filter((goal) => goal.id !== goalId));
    setStatusText("Ziel entfernt.");
  };

  const restTimerRemaining = restTimerEndsAtMs
    ? Math.max(0, Math.ceil((restTimerEndsAtMs - nowMs) / 1000))
    : 0;
  // One grace day keeps a single missed session from collapsing the streak.
  const streakInfo = computeStreakWithGrace(
    new Set(overviewStats.doneDayKeys),
    getTodayDateKey(),
  );
  const currentStreak = streakInfo.streak;
  const graceUsed = streakInfo.graceUsed;
  const weekDeltaSessions =
    overviewStats.weekComparison.sessionsThisWeek -
    overviewStats.weekComparison.sessionsLastWeek;
  const weekDeltaVolume =
    overviewStats.weekComparison.volumeLastWeek > 0
      ? ((overviewStats.weekComparison.volumeThisWeek -
          overviewStats.weekComparison.volumeLastWeek) /
          overviewStats.weekComparison.volumeLastWeek) *
        100
      : 0;
  const weightTrendValues = overviewStats.weightTrend.filter(
    (item): item is { key: string; value: number } => item.value !== null,
  );
  const weightMin = weightTrendValues.length > 0 ? Math.min(...weightTrendValues.map((item) => item.value)) : 0;
  const weightMax = weightTrendValues.length > 0 ? Math.max(...weightTrendValues.map((item) => item.value)) : 0;
  const weightRange = Math.max(1, weightMax - weightMin);
  const weightChartPoints = weightTrendValues.map((item) => {
    const index = overviewStats.weightTrend.findIndex((trendItem) => trendItem.key === item.key);
    const x = 12 + (index / Math.max(1, overviewStats.weightTrend.length - 1)) * 276;
    const y = 96 - ((item.value - weightMin) / weightRange) * 72;
    return { ...item, x, y };
  });
  const maxExerciseDuration = Math.max(
    1,
    ...overviewStats.topExerciseDurations.map((exerciseItem) => exerciseItem.seconds),
  );
  const maxRecentDuration = Math.max(
    1,
    ...overviewStats.recent7DurationSeconds.map((item) => item.seconds),
  );
  const maxVolumeValue = Math.max(
    1,
    ...overviewStats.volumeTrend.map((item) => item.value),
  );
  const maxCategoryValue = Math.max(
    1,
    ...overviewStats.categoryMix.map((item) => item.value),
  );
  const avgLast7Weight =
    overviewStats.weightDailySeries.length === 0
      ? null
      : (() => {
          const last7 = overviewStats.weightDailySeries.slice(-7).map((item) => item.value);
          return Math.round((last7.reduce((sum, value) => sum + value, 0) / last7.length) * 10) / 10;
        })();
  const avgPrev7Weight =
    overviewStats.weightDailySeries.length < 8
      ? null
      : (() => {
          const prev7 = overviewStats.weightDailySeries.slice(-14, -7).map((item) => item.value);
          if (prev7.length === 0) {
            return null;
          }
          return Math.round((prev7.reduce((sum, value) => sum + value, 0) / prev7.length) * 10) / 10;
        })();
  const weekReduction = avgLast7Weight !== null && avgPrev7Weight !== null ? avgPrev7Weight - avgLast7Weight : null;

  return (
    <section className="flex flex-1 flex-col gap-4 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.14),transparent_44%)] pb-32 sm:pb-28">
      {/* Kept at the root so the startup prompt can open it regardless of tab. */}
      <input
        ref={offlineImportRef}
        type="file"
        accept="application/json,text/json,.json"
        onChange={(event) => {
          void handleOfflineImport(event);
        }}
        className="hidden"
      />

      {showRestorePrompt ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-prompt-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2
              id="restore-prompt-title"
              className="text-lg font-black text-slate-900 dark:text-slate-100"
            >
              Frühere Daten laden?
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Auf diesem Gerät ist noch kein Training gespeichert. Lade dein
              letztes Backup, um nahtlos weiterzumachen.
            </p>
            <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              Vorhandene Tage bleiben immer erhalten – beim Laden wird
              zusammengeführt, nichts überschrieben.
            </p>

            {importFeedback.phase !== "idle" ? (
              <p
                role="status"
                aria-live="polite"
                className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${
                  importFeedback.phase === "success"
                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                    : importFeedback.phase === "error"
                      ? "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {importFeedback.phase === "success" ? "✓ " : ""}
                {importFeedback.message}
              </p>
            ) : null}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={importFeedback.phase === "busy" || importFeedback.phase === "success"}
                onClick={() => {
                  triggerOfflineImport();
                }}
                className="min-h-12 w-full touch-manipulation rounded-xl bg-indigo-700 text-sm font-black text-white disabled:opacity-50"
              >
                {importFeedback.phase === "busy"
                  ? "Wird geladen ..."
                  : importFeedback.phase === "error"
                    ? "Andere Datei wählen"
                    : "Backup-Datei laden"}
              </button>
              <button
                type="button"
                disabled={importFeedback.phase === "busy" || importFeedback.phase === "success"}
                onClick={() => {
                  localStorage.setItem(restorePromptDismissedKey, "1");
                  setShowRestorePrompt(false);
                }}
                className="min-h-12 w-full touch-manipulation rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
              >
                Ohne alte Daten starten
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hiddenLiteHero ? (
        <div className="overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 via-orange-50 to-yellow-50 shadow-sm">
          <div className="relative h-64 w-full bg-rose-100 sm:h-72">
            <Image
              src="/hero-love.jpg"
              alt="Herzgesicht / Motivationsbild"
              fill
              priority
              className="object-contain object-top p-2"
            />
          </div>
          <div className="p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">
              Motivation
            </p>
            <h1 className="mt-2 text-2xl font-black text-rose-700 sm:text-3xl dark:text-rose-300">
              Einfach machen Bljad. 💪 Für eine bessere Zukunft. Für LUIS. ❤️ 👨‍👩‍👦
            </h1>
          </div>
        </div>
      ) : (
        <header className="rounded-[28px] bg-gradient-to-br from-slate-900 via-teal-900 to-emerald-700 p-5 text-white shadow-[0_18px_40px_rgba(13,148,136,0.18)] sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-100/90">
            Momentum Journal
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
            Sportlich motivierend. Ruhig wie ein Tagebuch.
          </h1>
          <p className="mt-2 text-sm font-medium text-cyan-50/90">
            {hasMounted
              ? encouragement[new Date().getDate() % encouragement.length]
              : encouragement[0]}
          </p>
        </header>
      )}

      <div className="relative rounded-[24px] border border-slate-200 bg-white/90 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
              Profil
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {/* Gated on hasMounted: the Supabase client only exists in the
                  browser, so rendering auth state during SSR would mismatch. */}
              {!hasMounted
                ? "Offline Modus — alles bleibt lokal auf diesem Gerät."
                : auth.session
                  ? `Cloud aktiv · ${auth.email}`
                  : auth.configured
                    ? "Offline Modus — anmelden für Cloud-Backup."
                    : "Offline Modus — alles bleibt lokal auf diesem Gerät."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowProfilePanel((current) => !current)}
            className="touch-manipulation rounded-full border border-slate-300 bg-slate-100 p-2 text-lg dark:border-slate-600 dark:bg-slate-800"
            aria-label="Profil Einstellungen öffnen"
          >
            👤
          </button>
        </div>

        {showProfilePanel ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
                Profil & Einstellungen
              </p>
            </div>

            {auth.configured && hasMounted ? (
              <div className="mt-3 rounded-xl border border-teal-200 bg-white p-3 dark:border-teal-900 dark:bg-slate-900">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-800 dark:text-teal-300">
                  Cloud-Backup
                </p>

                {auth.loading ? (
                  <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    Prüfe Anmeldung ...
                  </p>
                ) : auth.session ? (
                  <>
                    <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                      Angemeldet als <strong>{auth.email}</strong>
                    </p>
                    {cloudMessage ? (
                      <p
                        role="status"
                        aria-live="polite"
                        className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                          cloudMessage.tone === "error"
                            ? "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
                            : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                        }`}
                      >
                        {cloudMessage.text}
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={cloudBusy}
                        onClick={() => void runCloudSync()}
                        className="min-h-11 touch-manipulation rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {cloudBusy ? "Synchronisiere ..." : "Jetzt synchronisieren"}
                      </button>
                      <button
                        type="button"
                        disabled={cloudBusy}
                        onClick={() => void handleSignOut()}
                        className="min-h-11 touch-manipulation rounded-lg border border-slate-400 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                      >
                        Abmelden
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Wird beim Start und nach dem Training automatisch gesichert.
                      Deine Daten bleiben zusätzlich lokal auf dem Gerät.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                      Optional. Ohne Anmeldung funktioniert alles wie bisher – nur
                      ohne geräteübergreifende Sicherung.
                    </p>

                    <div className="mt-3 grid gap-2">
                      <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={authEmail}
                        onChange={(event) => setAuthEmail(event.target.value)}
                        placeholder="deine@email.de"
                        className="min-h-11 rounded-lg border border-slate-400 px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        disabled={authBusy || !authEmail.trim()}
                        onClick={() => void handleSendCode()}
                        className="min-h-11 touch-manipulation rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {authBusy ? "Sende ..." : "Link & Code senden"}
                      </button>

                      {codeSent ? (
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <input
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={authCode}
                            onChange={(event) => setAuthCode(event.target.value)}
                            placeholder="6-stelliger Code"
                            className="min-h-11 rounded-lg border border-slate-400 px-3 text-sm tracking-[0.3em] text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            disabled={authBusy || !authCode.trim()}
                            onClick={() => void handleVerifyCode()}
                            className="min-h-11 touch-manipulation rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Bestätigen
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Oder mit Konto
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {(["google", "github"] as const).map((provider) => (
                          <button
                            key={`idp-${provider}`}
                            type="button"
                            disabled={authBusy}
                            onClick={() => void handleProviderSignIn(provider)}
                            className="min-h-11 flex-1 touch-manipulation rounded-lg border border-slate-400 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                          >
                            {provider === "google" ? "Google" : "GitHub"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {authMessage ? (
                      <p
                        role="status"
                        aria-live="polite"
                        className={`mt-3 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                          authMessage.tone === "error"
                            ? "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
                            : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                        }`}
                      >
                        {authMessage.text}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                Name
                <input
                  value={profile.displayName}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder="Dein Name"
                  className="rounded-lg border border-slate-400 px-3 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                Reminder Uhrzeit
                <input
                  type="time"
                  value={profile.reminderTime}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, reminderTime: event.target.value }))
                  }
                  className="rounded-lg border border-slate-400 px-3 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 dark:text-slate-100 sm:col-span-2">
                Ziel
                <textarea
                  rows={3}
                  value={profile.goal}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, goal: event.target.value }))
                  }
                  placeholder="z. B. 4x Training/Woche + konstante Morning Routine"
                  className="rounded-lg border border-slate-400 px-3 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                Gewichtseinheit
              </p>
              <div className="mt-2 flex gap-2">
                {(["kg", "lbs"] as const).map((unit) => (
                  <button
                    key={`unit-${unit}`}
                    type="button"
                    onClick={() => setProfile((current) => ({ ...current, weightUnit: unit }))}
                    className={`touch-manipulation rounded-lg px-3 py-2 text-sm font-semibold ${
                      profile.weightUnit === unit
                        ? "bg-teal-700 text-white"
                        : "border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    {unit.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                Bevorzugte Kategorien
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map((category) => {
                  const selected = profile.preferredCategories.includes(category.name);
                  return (
                    <button
                      key={`profile-category-${category.name}`}
                      type="button"
                      onClick={() => togglePreferredCategory(category.name)}
                      className={`touch-manipulation rounded-full px-3 py-1.5 text-xs font-semibold ${
                        selected
                          ? "bg-emerald-600 text-white"
                          : "border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      }`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 rounded-2xl bg-[#edf8f5] p-1.5 shadow-inner shadow-emerald-100 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setPageViewTab("training")}
          className={`touch-manipulation flex-1 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${
            pageViewTab === "training"
              ? "bg-white text-slate-900 shadow-sm ring-1 ring-teal-200 dark:bg-slate-900 dark:text-teal-300"
              : "text-slate-700 dark:text-slate-200"
          }`}
        >
          Workout
        </button>
        <button
          type="button"
          onClick={() => setPageViewTab("builder")}
          className={`touch-manipulation flex-1 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${
            pageViewTab === "builder"
              ? "bg-white text-slate-900 shadow-sm ring-1 ring-teal-200 dark:bg-slate-900 dark:text-teal-300"
              : "text-slate-700 dark:text-slate-200"
          }`}
        >
          Builder
        </button>
        <button
          type="button"
          onClick={() => setPageViewTab("dashboard")}
          className={`touch-manipulation flex-1 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${
            pageViewTab === "dashboard"
              ? "bg-white text-slate-900 shadow-sm ring-1 ring-teal-200 dark:bg-slate-900 dark:text-teal-300"
              : "text-slate-700 dark:text-slate-200"
          }`}
        >
          Activity Tracker
        </button>
      </div>

      <div className="w-full max-w-full overflow-x-hidden rounded-[24px] border border-slate-200 bg-white/95 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 sm:p-4">
        {pageViewTab === "dashboard" ? (
        <>
        {/* Hero row: goal progress, consistency and self-comparison come first.
            Visible progress toward a goal is the strongest daily motivator. */}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border-2 border-teal-300 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-950/40">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-800 dark:text-teal-300">
              Aktives Ziel
            </p>
            {primaryGoal ? (
              <>
                <p className="mt-1 truncate text-sm font-black text-teal-950 dark:text-teal-100">
                  {primaryGoal.goal.title}
                </p>
                <div className="mt-2 h-3 w-full rounded-full bg-white dark:bg-slate-900">
                  <div
                    className={`h-3 rounded-full ${
                      primaryGoal.progress.reached ? "bg-emerald-500" : "bg-teal-600"
                    }`}
                    style={{ width: `${Math.max(3, primaryGoal.progress.ratio * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300">
                  {Math.round(primaryGoal.progress.ratio * 100)}% · {primaryGoal.progress.summary}
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowGoalForm(true)}
                className="mt-2 min-h-11 w-full rounded-lg bg-teal-700 text-sm font-bold text-white"
              >
                + Erstes Ziel setzen
              </button>
            )}
          </div>

          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-300">
              Diese Woche
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-amber-950 dark:text-amber-100">
              {overviewStats.weekComparison.sessionsThisWeek}
              <span className="text-base font-bold opacity-60"> Einheiten</span>
            </p>
            <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
              🔥 {currentStreak} {currentStreak === 1 ? "Tag" : "Tage"} in Folge
              {graceUsed > 0 ? " (1 Joker)" : ""}
            </p>
          </div>

          <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/40">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-800 dark:text-indigo-300">
              vs. Vorwoche
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-indigo-950 dark:text-indigo-100">
              {weekDeltaSessions > 0 ? "+" : ""}
              {weekDeltaSessions}
            </p>
            <p className="mt-1 text-xs font-semibold text-indigo-800 dark:text-indigo-300">
              Last: {formatTonnage(overviewStats.weekComparison.volumeThisWeek)}
              {overviewStats.weekComparison.volumeLastWeek > 0
                ? ` (${weekDeltaVolume > 0 ? "+" : ""}${Math.round(weekDeltaVolume)}%)`
                : ""}
            </p>
          </div>
        </div>

        {/* Goal list and creation */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
              Ziele
            </p>
            <button
              type="button"
              onClick={() => setShowGoalForm((current) => !current)}
              className="min-h-11 touch-manipulation rounded-lg bg-teal-700 px-3 text-sm font-bold text-white"
            >
              {showGoalForm ? "Abbrechen" : "+ Neues Ziel"}
            </button>
          </div>

          {showGoalForm ? (
            <div className="mt-3 rounded-lg border border-teal-200 bg-white p-3 dark:border-teal-800 dark:bg-slate-900">
              <div className="flex flex-wrap gap-1.5">
                {goalTypes.map((type) => (
                  <button
                    key={`goal-type-${type.type}`}
                    type="button"
                    onClick={() => setGoalDraft((current) => ({ ...current, type: type.type }))}
                    className={`min-h-9 rounded-full px-3 text-xs font-bold ${
                      goalDraft.type === type.type
                        ? "bg-teal-700 text-white"
                        : "border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                {getGoalTypeMeta(goalDraft.type).description}
                {!getGoalTypeMeta(goalDraft.type).automatic
                  ? " · Werte trägst du nach jeder Einheit selbst ein."
                  : ""}
              </p>
              <p className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-400">
                Beispiel: {getGoalTypeMeta(goalDraft.type).example}
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {getGoalTypeMeta(goalDraft.type).needsSubject ? (
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                    Übung / Distanz
                    <input
                      list="goal-subject-options"
                      value={goalDraft.subject}
                      onChange={(event) =>
                        setGoalDraft((current) => ({ ...current, subject: event.target.value }))
                      }
                      placeholder="z. B. Bench Press"
                      className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <datalist id="goal-subject-options">
                      {allExercisesForCategory.map((exercise) => (
                        <option key={`goal-subject-${exercise}`} value={exercise} />
                      ))}
                    </datalist>
                  </label>
                ) : null}
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                  Zielwert ({getGoalTypeMeta(goalDraft.type).unit})
                  <input
                    type="number"
                    step={getGoalTypeMeta(goalDraft.type).unit === "kg" ? "1" : "0.5"}
                    value={goalDraft.targetValue}
                    onChange={(event) =>
                      setGoalDraft((current) => ({ ...current, targetValue: event.target.value }))
                    }
                    className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                  Zieldatum
                  <input
                    type="date"
                    value={goalDraft.targetDate}
                    onChange={(event) =>
                      setGoalDraft((current) => ({ ...current, targetDate: event.target.value }))
                    }
                    className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                  Wann? (optional)
                  <input
                    value={goalDraft.planWhen}
                    onChange={(event) =>
                      setGoalDraft((current) => ({ ...current, planWhen: event.target.value }))
                    }
                    placeholder="z. B. Mo + Do, 7 Uhr"
                    className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                {goalDraft.type === "consistency" || goalDraft.type === "frequency" ? (
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                    Gilt für
                    <select
                      value={goalDraft.category}
                      onChange={(event) =>
                        setGoalDraft((current) => ({ ...current, category: event.target.value }))
                      }
                      className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value={allCategoriesOption}>{allCategoriesOption}</option>
                      {categories.map((category) => (
                        <option key={`goal-cat-${category.name}`} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Ein fester Termin erhöht die Umsetzungswahrscheinlichkeit deutlich.
              </p>

              <button
                type="button"
                onClick={submitGoal}
                className="mt-3 min-h-12 w-full touch-manipulation rounded-xl bg-teal-700 text-sm font-black text-white"
              >
                Ziel speichern
              </button>
            </div>
          ) : null}

          {goalCards.length === 0 && !showGoalForm ? (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Noch keine Ziele. Ein konkretes Ziel mit Datum wirkt stärker als ein vager Vorsatz.
            </p>
          ) : null}

          <div className="mt-3 grid gap-2">
            {goalCards.map(({ goal, progress, meta }) => (
              <div
                key={goal.id}
                className={`rounded-lg border p-3 ${
                  progress.reached
                    ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                      {progress.reached ? "🏆 " : ""}
                      {goal.title}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {meta.label}
                      {goal.planWhen ? ` · ${goal.planWhen}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGoal(goal.id)}
                    className="min-h-9 shrink-0 px-2 text-xs font-bold text-slate-400 hover:text-rose-600"
                    aria-label={`${goal.title} entfernen`}
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-2.5 rounded-full ${
                      progress.reached
                        ? "bg-emerald-500"
                        : progress.onTrack === false
                          ? "bg-amber-500"
                          : "bg-teal-600"
                    }`}
                    style={{ width: `${Math.max(3, progress.ratio * 100)}%` }}
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold">
                  <span className="text-slate-700 dark:text-slate-200">
                    {formatGoalValue(progress.currentValue, goal.unit)} /{" "}
                    {formatGoalValue(goal.targetValue, goal.unit)}
                  </span>
                  <span
                    className={
                      progress.reached
                        ? "text-emerald-700 dark:text-emerald-300"
                        : progress.onTrack === false
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-slate-600 dark:text-slate-300"
                    }
                  >
                    {progress.summary}
                  </span>
                </div>

                {!meta.automatic ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="number"
                      step="0.1"
                      value={goalManualDraft[goal.id] ?? ""}
                      onChange={(event) =>
                        setGoalManualDraft((current) => ({
                          ...current,
                          [goal.id]: event.target.value,
                        }))
                      }
                      placeholder={`Heutiger Wert in ${goal.unit}`}
                      className="min-h-11 rounded-md border border-slate-300 px-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => addGoalManualValue(goal.id)}
                      className="min-h-11 touch-manipulation rounded-lg border-2 border-teal-700 px-3 text-sm font-bold text-teal-800 dark:text-teal-300"
                    >
                      Eintragen
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
              Überblick
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                <span>Zeitraum</span>
                <select
                  value={dashboardRange}
                  onChange={(event) => setDashboardRange(event.target.value as "7" | "30" | "90" | "all")}
                  className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="7">7 Tage</option>
                  <option value="30">30 Tage</option>
                  <option value="90">90 Tage</option>
                  <option value="all">Gesamt</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                <span>Übung</span>
                <select
                  value={exerciseDurationFilter}
                  onChange={(event) => setExerciseDurationFilter(event.target.value)}
                  className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">Alle</option>
                  {exerciseDurationOptions
                    .filter((option) => option !== "all")
                    .map((option) => (
                      <option key={`duration-filter-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 dark:bg-emerald-900/40">
              {overviewStats.totalSessions} Sessions
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              ["weight", "Gewicht"],
              ["duration", "Workoutdauer"],
              ["volume", "Volumen"],
              ["categoryMix", "Kategorien"],
              ["consistency", "Konsistenz"],
            ] as Array<[DashboardGraphKey, string]>).map(([key, label]) => (
              <button
                key={`graph-toggle-${key}`}
                type="button"
                onClick={() => toggleDashboardGraph(key)}
                className={`touch-manipulation rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  dashboardGraphConfig[key]
                    ? "border-teal-500 bg-teal-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                }`}
              >
                {dashboardGraphConfig[key] ? "✓ " : "○ "}
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/40">
              <p className="text-xs uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">Absolviert</p>
              <p className="mt-2 text-2xl font-black text-emerald-900 dark:text-emerald-200">{overviewStats.totalSessions}</p>
            </div>
            <div className="rounded-lg bg-cyan-50 p-3 dark:bg-cyan-950/40">
              <p className="text-xs uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">Übungen</p>
              <p className="mt-2 text-2xl font-black text-cyan-900 dark:text-cyan-200">{overviewStats.totalCompleted}</p>
            </div>
            <div className="rounded-lg bg-violet-50 p-3 dark:bg-violet-950/40">
              <p className="text-xs uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">🏆 Bester Lift</p>
              <p className="mt-2 text-sm font-black text-violet-900 dark:text-violet-200">
                {overviewStats.topRecords[0]
                  ? `${overviewStats.topRecords[0].exercise} · ${overviewStats.topRecords[0].estimatedOneRepMax} ${weightUnitLabel}`
                  : "Noch keine"}
              </p>
            </div>
            <div className="rounded-lg bg-sky-50 p-3 dark:bg-sky-950/40">
              <p className="text-xs uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                Gewicht (7-Tage-Ø)
              </p>
              <p className="mt-2 text-2xl font-black text-sky-900 dark:text-sky-200">
                {avgLast7Weight !== null ? `${avgLast7Weight} ${weightUnitLabel}` : "—"}
              </p>
              {weekReduction !== null ? (
                <p className="mt-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  {weekReduction > 0 ? "−" : "+"}
                  {Math.abs(weekReduction).toFixed(1)} {weightUnitLabel} vs. Vorwoche
                </p>
              ) : null}
            </div>
            <div className="rounded-lg bg-lime-50 p-3 dark:bg-lime-950/40">
              <p className="text-xs uppercase tracking-[0.12em] text-lime-700 dark:text-lime-300">Gesamt Workoutzeit</p>
              <p className="mt-2 text-sm font-black text-lime-900 dark:text-lime-200">
                {formatDurationCompact(overviewStats.totalWorkoutSeconds)}
              </p>
            </div>
            <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-950/40">
              <p className="text-xs uppercase tracking-[0.12em] text-orange-700 dark:text-orange-300">Ø Dauer pro Session</p>
              <p className="mt-2 text-sm font-black text-orange-900 dark:text-orange-200">
                {formatDurationCompact(overviewStats.avgWorkoutSeconds)}
              </p>
            </div>
          </div>

          {dashboardGraphConfig.consistency ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                  Wochenview (Mo-So)
                </p>
                <div className="mt-2 grid grid-cols-7 gap-2">
                  {overviewStats.weekView.map((day) => (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => {
                        setOverallStartedAtMs(null);
                        setActiveExerciseTimer(null);
                        setBodybuildingFlowActive(false);
                        setBodybuildingFocusExercise(null);
                        setSelectedDate(day.key);
                      }}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-center transition hover:border-teal-400 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-500 dark:hover:bg-slate-800"
                    >
                      <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                        {new Date(`${day.key}T00:00:00`).toLocaleDateString("de-DE", { weekday: "short" })}
                      </div>
                      <div
                        className={`mt-2 mx-auto flex h-10 w-10 items-center justify-center rounded-full text-xs font-black ${
                          day.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {day.done ? "✓" : "–"}
                      </div>
                      <div className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{day.count}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                  Häufigste Übungen
                </p>
              <ul className="mt-2 space-y-2">
                {overviewStats.topExercises.length === 0 ? (
                  <li className="text-sm text-slate-500 dark:text-slate-400">Noch keine erledigten Übungen gespeichert.</li>
                ) : (
                  overviewStats.topExercises.map((item, index) => (
                    <li key={item.name} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {index + 1}. {item.name}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                        {item.count}x
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
          ) : null}

          {dashboardGraphConfig.weight ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                  🏆 Persönliche Rekorde (geschätztes 1RM)
                </p>
                {overviewStats.topRecords.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Noch keine Sätze mit Gewicht erfasst.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {overviewStats.topRecords.map((record) => (
                      <li
                        key={`pr-${record.exercise}`}
                        className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        <span className="truncate pr-2 font-semibold text-slate-800 dark:text-slate-100">
                          {record.exercise}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="font-black text-violet-700 dark:text-violet-300">
                            {record.estimatedOneRepMax} {weightUnitLabel}
                          </span>
                          <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            {record.weightKg}×{record.reps}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                  Gewichtstrend ({dashboardRange === "all" ? "Gesamt" : `${dashboardRange} Tage`})
                </p>
                {weightTrendValues.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Noch keine Gewichts-Einträge vorhanden.
                  </p>
                ) : (
                  <>
                    <svg viewBox="0 0 300 110" className="mt-3 h-32 w-full">
                      <line x1="12" y1="96" x2="288" y2="96" stroke="currentColor" className="text-slate-300 dark:text-slate-600" />
                      <polyline
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="2.5"
                        points={weightChartPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                      />
                      {weightChartPoints.map((point) => (
                        <circle key={`weight-${point.key}`} cx={point.x} cy={point.y} r="3" fill="#0ea5e9" />
                      ))}
                    </svg>
                    <div className="mt-1 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                      <span>{weightTrendValues[0]?.value} {weightUnitLabel}</span>
                      <span>{weightTrendValues[weightTrendValues.length - 1]?.value} {weightUnitLabel}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {overviewStats.moodSeries.length > 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                Stimmung & Training
              </p>
              <div className="mt-3 flex items-end gap-1">
                {overviewStats.moodSeries.slice(-21).map((item) => (
                  <div key={`mood-${item.key}`} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-cyan-500"
                      style={{ height: `${Math.max(6, (item.value / 10) * 56)}px` }}
                      title={`${item.key}: ${item.value}/10`}
                    />
                    <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
              {overviewStats.moodVolumeCorrelation !== null ? (
                <p className="mt-2 rounded-md bg-cyan-100 px-2.5 py-2 text-[11px] font-medium text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200">
                  {overviewStats.moodVolumeCorrelation > 0.3
                    ? `An Tagen mit besserer Stimmung trainierst du deutlich mehr (r = ${overviewStats.moodVolumeCorrelation.toFixed(2)}).`
                    : overviewStats.moodVolumeCorrelation < -0.3
                      ? `An Tagen mit niedriger Stimmung fällt dein Volumen höher aus (r = ${overviewStats.moodVolumeCorrelation.toFixed(2)}).`
                      : `Stimmung und Trainingslast hängen bei dir kaum zusammen (r = ${overviewStats.moodVolumeCorrelation.toFixed(2)}).`}
                  {` · ${overviewStats.moodPairedCount} Tage ausgewertet`}
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Ab etwa 4 Tagen mit Check-in und Training zeigen wir hier den Zusammenhang.
                </p>
              )}
            </div>
          ) : null}

          {dashboardGraphConfig.duration ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                  Workoutdauer im Zeitraum
                </p>
                <div className="mt-3 grid grid-cols-7 gap-1">
                  {overviewStats.recent7DurationSeconds.map((day) => (
                    <div key={`duration-day-${day.key}`} className="flex flex-col items-center gap-1">
                      <div className="flex h-20 w-full items-end rounded bg-slate-200 px-1 dark:bg-slate-700">
                        <div
                          className="w-full rounded bg-cyan-500"
                          style={{ height: `${Math.max(6, (day.seconds / maxRecentDuration) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        {new Date(`${day.key}T00:00:00`).toLocaleDateString("de-DE", { weekday: "short" })}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {formatDurationCompact(day.seconds)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                  Dauer pro Übung (Top 5)
                </p>
                {filteredExerciseDurations.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    {exerciseDurationFilter === "all"
                      ? "Noch keine getrackte Übungsdauer vorhanden."
                      : `Keine Daten für "${exerciseDurationFilter}" in diesem Zeitraum.`}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {filteredExerciseDurations.map((exerciseItem) => (
                      <div key={`exercise-duration-${exerciseItem.name}`}>
                        <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200">
                          <span className="truncate pr-2">{exerciseItem.name}</span>
                          <span>{formatDurationCompact(exerciseItem.seconds)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                          <div
                            className="h-2 rounded-full bg-indigo-500"
                            style={{
                              width: `${Math.max(8, (exerciseItem.seconds / maxExerciseDuration) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {dashboardGraphConfig.volume ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                Trainingsvolumen (Reps / 30 Tage)
              </p>
              <div className="mt-3 grid grid-cols-7 gap-1">
                {overviewStats.volumeTrend.map((entry) => (
                  <div key={`volume-day-${entry.key}`} className="flex flex-col items-center gap-1">
                    <div className="flex h-20 w-full items-end rounded bg-slate-200 px-1 dark:bg-slate-700">
                      <div
                        className="w-full rounded bg-violet-500"
                        style={{ height: `${Math.max(6, (entry.value / maxVolumeValue) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {new Date(`${entry.key}T00:00:00`).toLocaleDateString("de-DE", { day: "2-digit" })}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{entry.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {dashboardGraphConfig.categoryMix ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                Kategorien-Verteilung
              </p>
              {overviewStats.categoryMix.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Noch keine Kategorien erfasst.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {overviewStats.categoryMix.map((item) => (
                    <div key={`category-mix-${item.name}`}>
                      <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200">
                        <span>{item.name}</span>
                        <span>{item.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-2 rounded-full bg-amber-500"
                          style={{ width: `${Math.max(8, (item.value / maxCategoryValue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
              Monatsview ({overviewStats.monthLabel})
            </p>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {Array.from({ length: overviewStats.monthOffset }).map((_, index) => (
                <div key={`empty-${index}`} />
              ))}
              {overviewStats.monthView.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => {
                    setOverallStartedAtMs(null);
                    setActiveExerciseTimer(null);
                    setBodybuildingFlowActive(false);
                    setBodybuildingFocusExercise(null);
                    setSelectedDate(day.key);
                  }}
                  className={`rounded-md border p-1 text-center text-[11px] font-semibold transition ${
                    day.done
                      ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-500"
                  }`}
                >
                  <div>{day.day}</div>
                  <div className="text-[10px]">{day.done ? "✓" : ""}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        </>
        ) : null}

        {pageViewTab === "training" || pageViewTab === "builder" ? (
        <>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            Datum
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
                setHitCurrentRound(1);
                setBodybuildingFlowActive(false);
                setBodybuildingFocusExercise(null);
                setSelectedDate(event.target.value);
              }}
              className="rounded-lg border border-slate-400 px-3 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            <span>Heute</span>
            <button
              type="button"
              onClick={() => {
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
                setHitCurrentRound(1);
                setBodybuildingFlowActive(false);
                setBodybuildingFocusExercise(null);
                setSelectedDate(getTodayDateKey());
              }}
              className="touch-manipulation rounded-lg border border-teal-500 bg-teal-50 px-3 py-2.5 font-semibold text-teal-800 dark:text-teal-300 dark:bg-teal-950/40"
            >
              Today
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 dark:text-slate-100 sm:col-span-2">
            Kategorie
            <select
              value={selectedCategory}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
                setHitCurrentRound(1);
                setBodybuildingFlowActive(false);
                setBodybuildingFocusExercise(null);
                setSelectedBuilderMuscleGroup("Alle");
                setSelectedCategory(nextCategory);
              }}
              className="rounded-lg border border-slate-400 px-3 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              {categories.map((category) => (
                <option key={category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            Körpergewicht ({weightUnitLabel})
            <input
              type="number"
              min={0}
              step="0.1"
              value={bodyWeightKg}
              onChange={(event) => setBodyWeightKg(event.target.value)}
              placeholder="z. B. 82.4"
              className="rounded-lg border border-slate-400 px-3 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>

        {pageViewTab === "training" ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
              Workout Auswahl
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <select
                value={selectedWorkoutBuilderName}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setSelectedWorkoutBuilderName(nextName);
                  if (nextName) {
                    loadWorkoutBuilderTemplate(nextName);
                  }
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Workout-Builder wählen</option>
                {(workoutBuilderTemplates[selectedCategory] ?? []).map((template) => (
                  <option key={`${template.category}-${template.name}`} value={template.name}>
                    {template.name}
                    {template.lastUsedAt ? ` · zuletzt ${formatLastUsed(template.lastUsedAt)}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadWorkoutBuilderTemplate()}
                className="touch-manipulation rounded-lg border border-teal-700 px-3 py-2.5 text-sm font-semibold text-teal-800 dark:text-teal-300"
              >
                Laden
              </button>
            </div>
            {lastUsedTemplateLabel ? (
              <p className="mt-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Zuletzt verwendet: {lastUsedTemplateLabel}
              </p>
            ) : null}
          </div>
        ) : null}
        {pageViewTab === "builder" ? (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/80 p-3 dark:border-teal-900 dark:bg-teal-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-teal-900 dark:text-teal-200">
              Routine Builder · {selectedCategory}
            </p>
            <span className="rounded-full bg-teal-700 px-2.5 py-1 text-[11px] font-bold text-white">
              {activeExercises.length} gewählt
            </span>
          </div>

          <div className="mt-3 flex gap-1.5">
            {([1, 2, 3] as const).map((step) => (
              <button
                key={`builder-step-${step}`}
                type="button"
                onClick={() => setBuilderStep(step)}
                className={`min-h-11 flex-1 rounded-lg px-2 text-xs font-bold transition ${
                  builderStep === step
                    ? "bg-teal-700 text-white"
                    : "border border-teal-300 bg-white text-teal-800 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-300"
                }`}
              >
                {step === 1 ? "① Übungen" : step === 2 ? "② Feinschliff" : "③ Speichern"}
              </button>
            ))}
          </div>

          {builderStep === 1 ? (
            <div className="mt-3">
              <div className="rounded-lg border border-teal-200 bg-white p-2 dark:border-teal-800 dark:bg-slate-900">
                <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                  Gespeicherte Routine laden
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    value={selectedWorkoutBuilderName}
                    onChange={(event) => setSelectedWorkoutBuilderName(event.target.value)}
                    className="min-h-11 rounded-md border border-teal-300 bg-white px-3 text-sm text-slate-900 dark:border-teal-800 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Routine wählen</option>
                    {savedRoutines.map((template) => (
                      <option key={`${template.category}-${template.name}`} value={template.name}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => loadWorkoutBuilderTemplate()}
                    className="min-h-11 touch-manipulation rounded-lg border-2 border-teal-700 px-3 text-sm font-bold text-teal-800 dark:text-teal-300"
                  >
                    Laden
                  </button>
                </div>

                {selectedPresetNote ? (
                  <p className="mt-2 rounded-md bg-teal-100 px-2.5 py-2 text-[11px] font-medium text-teal-900 dark:bg-teal-900/40 dark:text-teal-200">
                    📚 {selectedPresetNote}
                  </p>
                ) : null}

                {savedRoutines.length > 1 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                      Mehrere Routinen kombinieren (z. B. Brust + Arme)
                    </summary>
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {savedRoutines.map((template) => (
                        <label
                          key={`composer-${template.category}-${template.name}`}
                          className="flex min-h-11 items-center gap-2 rounded-md border border-teal-200 bg-slate-50 px-2 text-xs font-medium text-slate-800 dark:border-teal-800 dark:bg-slate-950/60 dark:text-slate-100"
                        >
                          <input
                            type="checkbox"
                            checked={routineComposerSelection.includes(template.name)}
                            onChange={(event) =>
                              toggleRoutineComposerTemplate(template.name, event.target.checked)
                            }
                            className="h-4 w-4"
                          />
                          {template.name}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={combineRoutineComposerTemplates}
                      className="mt-2 min-h-11 rounded-lg border-2 border-teal-600 px-3 text-xs font-bold text-teal-900 dark:text-teal-300"
                    >
                      Kombinieren
                    </button>
                  </details>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {builderMuscleGroups.map((group) => (
                  <button
                    key={`builder-group-${group}`}
                    type="button"
                    onClick={() => setSelectedBuilderMuscleGroup(group)}
                    className={`min-h-9 rounded-full px-3 text-xs font-bold ${
                      selectedBuilderMuscleGroup === group
                        ? "bg-teal-700 text-white"
                        : "border border-teal-300 bg-white text-teal-800 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-300"
                    }`}
                  >
                    {group}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid gap-1.5">
                {filteredBuilderEntries.length === 0 ? (
                  <p className="rounded-md border border-teal-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-teal-800 dark:bg-slate-900 dark:text-slate-300">
                    Keine Übungen für diese Muskelgruppe.
                  </p>
                ) : null}
                {filteredBuilderEntries.map((entry) => {
                  const enabled = !hiddenExercises.includes(entry.exercise);
                  const isCustom = customExercises.includes(entry.exercise);
                  return (
                    <div
                      key={`builder-pick-${entry.exercise}`}
                      className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 ${
                        enabled
                          ? "border-teal-500 bg-teal-100 dark:border-teal-600 dark:bg-teal-900/40"
                          : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleBuilderExercise(entry.exercise, !enabled)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-slate-900 dark:text-slate-100"
                        aria-pressed={enabled}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-black ${
                            enabled
                              ? "bg-teal-700 text-white"
                              : "border border-slate-400 text-transparent dark:border-slate-600"
                          }`}
                        >
                          ✓
                        </span>
                        <span className="min-w-0 break-words">{entry.exercise}</span>
                      </button>
                      <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                        {resolveExerciseMuscleGroup(entry.exercise)}
                      </span>
                      {isCustom ? (
                        <button
                          type="button"
                          onClick={() => removeCustomExercise(entry.exercise)}
                          className="min-h-11 shrink-0 px-1 text-xs font-bold text-rose-600 dark:text-rose-400"
                          aria-label={`${entry.exercise} entfernen`}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={newExerciseName}
                  onChange={(event) => setNewExerciseName(event.target.value)}
                  placeholder="Eigene Übung hinzufügen"
                  className="min-h-11 rounded-md border border-teal-300 bg-white px-3 text-sm text-slate-900 dark:border-teal-800 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => addCustomExercise()}
                  className="min-h-11 touch-manipulation rounded-lg bg-slate-800 px-3 text-sm font-bold text-white"
                >
                  Hinzufügen
                </button>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                  Alle Übungen aller Kategorien ansehen
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {categories.map((category) => {
                    const customForCategory = customExercisesByCategory[category.name] ?? [];
                    const all = Array.from(new Set([...category.exercises, ...customForCategory]));
                    return (
                      <article
                        key={category.name}
                        className="rounded-md border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {category.name} ({all.length})
                        </h3>
                        <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-700 dark:text-slate-300">
                          {all.map((exercise) => (
                            <li key={`${category.name}-${exercise}`}>{exercise}</li>
                          ))}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              </details>

              <button
                type="button"
                onClick={() => setBuilderStep(2)}
                className="mt-4 min-h-12 w-full touch-manipulation rounded-xl bg-teal-700 text-sm font-black text-white"
              >
                Weiter zum Feinschliff →
              </button>
            </div>
          ) : null}

          {builderStep === 2 ? (
            <div className="mt-3">
              <p className="text-xs text-teal-800 dark:text-teal-300">
                {isIntervalCategory
                  ? "Dauer pro Übung festlegen. Reihenfolge über ↑ ↓ ändern."
                  : "Sätze, Reps und Gewicht vorbelegen. Reihenfolge über ↑ ↓ ändern."}
              </p>

              {activeExercises.length === 0 ? (
                <p className="mt-3 rounded-md border border-teal-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-teal-800 dark:bg-slate-900 dark:text-slate-300">
                  Noch keine Übungen gewählt – zurück zu Schritt ①.
                </p>
              ) : null}

              <div className="mt-3 grid gap-2">
                {builderEntries
                  .filter((entry) => !hiddenExercises.includes(entry.exercise))
                  .map((entry) => {
                    const position = activeExercises.indexOf(entry.exercise);
                    const isFirst = position === 0;
                    const isLast = position === activeExercises.length - 1;
                    return (
                    <div
                      key={`builder-tune-${entry.exercise}`}
                      className="min-w-0 rounded-lg border border-teal-200 bg-white p-2 dark:border-teal-800 dark:bg-slate-900"
                      draggable
                      onDragStart={() => setDraggingExercise(entry.exercise)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggingExercise) {
                          reorderExercises(draggingExercise, entry.exercise);
                          setDraggingExercise(null);
                        }
                      }}
                      onDragEnd={() => setDraggingExercise(null)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveExerciseToStart(entry.exercise)}
                          disabled={isFirst}
                          title="Nach ganz oben"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-sm font-black text-white disabled:opacity-40"
                        >
                          {position + 1}
                        </button>
                        <span className="min-w-0 flex-1 break-words text-sm font-bold text-slate-900 dark:text-slate-100">
                          {entry.exercise}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => moveExerciseInOrder(entry.exercise, -1)}
                            disabled={isFirst}
                            aria-label={`${entry.exercise} nach oben`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-teal-600 text-base font-black text-teal-800 disabled:opacity-30 dark:border-teal-700 dark:text-teal-300"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveExerciseInOrder(entry.exercise, 1)}
                            disabled={isLast}
                            aria-label={`${entry.exercise} nach unten`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-teal-600 text-base font-black text-teal-800 disabled:opacity-30 dark:border-teal-700 dark:text-teal-300"
                          >
                            ↓
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {isIntervalCategory ? (
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                            Sekunden
                            <input
                              type="number"
                              min={5}
                              max={600}
                              value={getWorkSecondsFor(entry.exercise)}
                              onChange={(event) =>
                                setExerciseCustomSeconds((current) => ({
                                  ...current,
                                  [entry.exercise]: Math.max(
                                    5,
                                    Number.parseInt(event.target.value || "5", 10),
                                  ),
                                }))
                              }
                              className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                        ) : null}
                        {isSetsCategory ? (
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                            Sätze
                            <input
                              type="number"
                              min={0}
                              value={entry.sets}
                              onChange={(event) =>
                                handleSetCountChange(entry.exercise, event.target.value)
                              }
                              className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                        ) : null}
                        {logsReps ? (
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                            Reps
                            <input
                              type="number"
                              min={0}
                              value={entry.reps}
                              placeholder={entry.targetReps ? `Ziel ${entry.targetReps}` : "Reps"}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { reps: event.target.value })
                              }
                              className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                        ) : null}
                        {logsWeight ? (
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                            Gewicht {weightUnitLabel}
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={entry.weightKg}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { weightKg: event.target.value })
                              }
                              className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                        ) : null}
                        {!isIntervalCategory && !isSetsCategory ? (
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                            Dauer min
                            <input
                              type="number"
                              min={0}
                              value={entry.durationMinutes}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, {
                                  durationMinutes: event.target.value,
                                })
                              }
                              className="min-h-11 rounded-md border border-slate-300 px-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>
                    );
                  })}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBuilderStep(1)}
                  className="min-h-12 touch-manipulation rounded-xl border-2 border-teal-700 text-sm font-bold text-teal-800 dark:text-teal-300"
                >
                  ← Zurück
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderStep(3)}
                  className="min-h-12 touch-manipulation rounded-xl bg-teal-700 text-sm font-black text-white"
                >
                  Weiter →
                </button>
              </div>
            </div>
          ) : null}

          {builderStep === 3 ? (
            <div className="mt-3">
              <div className="rounded-lg border border-teal-200 bg-white p-3 dark:border-teal-800 dark:bg-slate-900">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                  Zusammenfassung
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {activeExercises.length} Übungen
                  {intervalSettings.totalRounds > 1 ? ` · ${intervalSettings.totalRounds} Runden` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Geschätzte Dauer: {formatDurationCompact(estimatedRoutineSeconds)}
                </p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={workoutBuilderName}
                  onChange={(event) => setWorkoutBuilderName(event.target.value)}
                  placeholder="Name der Routine (z. B. Brust 1)"
                  className="min-h-12 rounded-md border border-teal-300 bg-white px-3 text-sm text-slate-900 dark:border-teal-800 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={saveWorkoutBuilderTemplate}
                  className="min-h-12 touch-manipulation rounded-xl bg-teal-700 px-4 text-sm font-black text-white"
                >
                  Speichern
                </button>
              </div>

              {savedRoutines.length > 0 ? (
                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                    Bereits gespeichert
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {savedRoutines.map((template) => (
                      <span
                        key={`saved-${template.name}`}
                        className="rounded-full border border-teal-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-900 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-300"
                      >
                        {template.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setBuilderStep(2)}
                className="mt-4 min-h-12 w-full touch-manipulation rounded-xl border-2 border-teal-700 text-sm font-bold text-teal-800 dark:text-teal-300"
              >
                ← Zurück
              </button>
            </div>
          ) : null}
        </div>
        ) : null}

        {pageViewTab === "training" && !isFlowCategory ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Aktives Workout</p>
              <div className="flex items-center gap-2">
                {currentWorkoutEntry ? (
                  <div className="rounded-lg border border-indigo-300 bg-indigo-700 px-3 py-1.5 text-sm font-black text-white shadow-sm dark:border-indigo-800">
                    Aktuell: {currentWorkoutEntry.exercise}
                  </div>
                ) : null}
              </div>
            </div>
            {displayEntries.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {displayEntries.map((entry, index) => (
                  <button
                    key={`queue-${entry.exercise}`}
                    type="button"
                    onClick={() => setWorkoutCardOpenExercise(entry.exercise)}
                    className={`touch-manipulation max-w-full break-words rounded-full border px-2.5 py-1.5 text-left text-xs font-semibold ${
                      currentWorkoutExercise === entry.exercise
                        ? "border-indigo-500 bg-indigo-100 text-indigo-900"
                        : entry.completed
                          ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                          : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    {index + 1}. {entry.exercise}
                  </button>
                ))}
              </div>
            ) : null}
            {(
              <div className="mt-2 grid gap-3">
                {displayEntries.map((entry) => {
                  const timerRunning =
                    activeExerciseTimer?.exercise === entry.exercise ? activeExerciseTimer : null;
                  const liveTrackedSeconds =
                    entry.trackedSeconds +
                    (timerRunning ? Math.floor((nowMs - timerRunning.startedAtMs) / 1000) : 0);
                  const isFocusedCard = currentWorkoutExercise === entry.exercise;

                  return (
                    <article
                      key={`active-${entry.exercise}`}
                      className={`min-w-0 rounded-xl border p-3 ${
                        isFocusedCard
                          ? "border-indigo-500 bg-indigo-50 shadow-sm dark:bg-indigo-950/40"
                          : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                      }`}
                    >
                      <div className="flex min-w-0 flex-wrap items-start gap-2">
                        <label className="flex min-w-0 flex-1 items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={entry.completed}
                            onChange={(event) =>
                              handleCompletedToggle(entry.exercise, event.target.checked)
                            }
                            className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-700"
                          />
                          <span className="min-w-0 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {activeExercises.indexOf(entry.exercise) + 1}. {entry.exercise}
                          </span>
                        </label>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveExerciseInOrder(entry.exercise, -1)}
                            disabled={activeExercises.indexOf(entry.exercise) === 0}
                            aria-label={`${entry.exercise} nach oben`}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-400 text-sm font-black text-slate-700 disabled:opacity-25 dark:border-slate-600 dark:text-slate-200"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveExerciseInOrder(entry.exercise, 1)}
                            disabled={
                              activeExercises.indexOf(entry.exercise) === activeExercises.length - 1
                            }
                            aria-label={`${entry.exercise} nach unten`}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-400 text-sm font-black text-slate-700 disabled:opacity-25 dark:border-slate-600 dark:text-slate-200"
                          >
                            ↓
                          </button>
                          {isBodybuilding ? (
                            <button
                              type="button"
                              onClick={() => completeBodybuildingAndNext(entry.exercise)}
                              className="touch-manipulation rounded-md bg-indigo-700 px-2.5 py-1.5 text-xs font-semibold text-white"
                            >
                              Done &amp; Next
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {isFocusedCard ? (
                        <>
                          <div className="mt-3 rounded-md bg-cyan-50 px-2 py-2 dark:bg-cyan-950/30">
                            <p className="text-xs font-semibold text-cyan-900 dark:text-cyan-200">
                              Getrackte Zeit: {formatSeconds(liveTrackedSeconds)}
                            </p>
                            <p className="mt-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300">
                              Zeit läuft über Session Start/Pause und wechselt automatisch bei Done & Next.
                            </p>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-4">
                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                              Sätze
                              <input
                                type="number"
                                min={0}
                                value={entry.sets}
                                onChange={(event) =>
                                  handleSetCountChange(entry.exercise, event.target.value)
                                }
                                className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900 dark:text-slate-100 dark:border-slate-600"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                              Reps
                              <input
                                type="number"
                                min={0}
                                value={entry.reps}
                                placeholder={entry.targetReps ? `Ziel ${entry.targetReps}` : "Reps"}
                                onChange={(event) =>
                                  handleEntryChange(entry.exercise, { reps: event.target.value })
                                }
                                className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900 dark:text-slate-100 dark:border-slate-600"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                              Gewicht {weightUnitLabel}
                              <input
                                type="number"
                                min={0}
                                step="1"
                                value={entry.weightKg}
                                onChange={(event) =>
                                  handleEntryChange(entry.exercise, { weightKg: event.target.value })
                                }
                                className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900 dark:text-slate-100 dark:border-slate-600"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 dark:text-slate-100">
                              Dauer min
                              <input
                                type="number"
                                min={0}
                                value={entry.durationMinutes}
                                onChange={(event) =>
                                  handleEntryChange(entry.exercise, {
                                    durationMinutes: event.target.value,
                                  })
                                }
                                className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900 dark:text-slate-100 dark:border-slate-600"
                              />
                            </label>
                          </div>

                          {isBodybuilding && Number.parseInt(entry.sets || "0", 10) > 0 ? (
                            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                                  Satz-Tracker: {entry.completedSets} / {entry.sets}
                                </p>
                                {lastSetValues[entry.exercise] ? (
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                    Zuletzt: {lastSetValues[entry.exercise].weightKg} {weightUnitLabel} ×{" "}
                                    {lastSetValues[entry.exercise].reps}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 space-y-2">
                                {entry.setLogs.map((setLog, setIndex) => {
                                  const ghost = lastSetValues[entry.exercise];
                                  const currentWeight = Number.parseFloat(setLog.weightKg || "0") || 0;
                                  const adjustWeight = (delta: number) =>
                                    updateSetLogValue(
                                      entry.exercise,
                                      setIndex,
                                      "weightKg",
                                      String(Math.max(0, Math.round((currentWeight + delta) * 100) / 100)),
                                    );
                                  return (
                                  <div
                                    key={`${entry.exercise}-set-${setIndex + 1}`}
                                    className={`rounded-md border p-2 ${
                                      setLog.done
                                        ? "border-emerald-400 bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/40"
                                        : "border-emerald-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                                    }`}
                                  >
                                    <div className="grid gap-2 sm:grid-cols-[64px_1fr_1fr_auto]">
                                    <span className="self-center text-xs font-bold text-emerald-900 dark:text-emerald-200">
                                      Satz {setIndex + 1}
                                    </span>                                    <input
                                      type="number"
                                      min={1}
                                      value={setLog.reps}
                                      onChange={(event) =>
                                        updateSetLogValue(
                                          entry.exercise,
                                          setIndex,
                                          "reps",
                                          event.target.value,
                                        )
                                      }
                                      placeholder={
                                        ghost
                                          ? `${ghost.reps} Reps`
                                          : entry.targetReps
                                            ? `Ziel ${entry.targetReps}`
                                            : "Reps"
                                      }
                                      className="min-h-11 rounded-md border border-slate-400 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      step="1"
                                      value={setLog.weightKg}
                                      onChange={(event) =>
                                        updateSetLogValue(
                                          entry.exercise,
                                          setIndex,
                                          "weightKg",
                                          event.target.value,
                                        )
                                      }
                                      placeholder={ghost ? `${ghost.weightKg} ${weightUnitLabel}` : `Gewicht ${weightUnitLabel}`}
                                      className="min-h-11 rounded-md border border-slate-400 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => toggleSetDone(entry.exercise, setIndex, !setLog.done)}
                                      className={`min-h-11 min-w-16 rounded-md px-3 text-sm font-bold ${
                                        setLog.done
                                          ? "bg-emerald-600 text-white"
                                          : "border-2 border-emerald-600 text-emerald-800 dark:text-emerald-300"
                                      }`}
                                      aria-pressed={setLog.done}
                                    >
                                      {setLog.done ? "✓" : "Done"}
                                    </button>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {setKinds.map((kind) => (
                                        <button
                                          key={`kind-${entry.exercise}-${setIndex}-${kind.value}`}
                                          type="button"
                                          onClick={() =>
                                            updateSetLogKind(entry.exercise, setIndex, kind.value)
                                          }
                                          aria-pressed={setLog.kind === kind.value}
                                          className={`min-h-9 rounded-full px-2.5 text-[11px] font-bold ${
                                            setLog.kind === kind.value
                                              ? kind.className
                                              : "border border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                                          }`}
                                        >
                                          {kind.label}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {ghost ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateSetLogValue(entry.exercise, setIndex, "reps", ghost.reps);
                                            updateSetLogValue(entry.exercise, setIndex, "weightKg", ghost.weightKg);
                                          }}
                                          className="min-h-9 rounded-full border border-slate-300 px-3 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                                        >
                                          ↺ Wie zuletzt
                                        </button>
                                      ) : null}
                                      {[-5, -2.5, 2.5, 5].map((delta) => (
                                        <button
                                          key={`adjust-${entry.exercise}-${setIndex}-${delta}`}
                                          type="button"
                                          onClick={() => adjustWeight(delta)}
                                          className="min-h-9 min-w-12 rounded-full border border-slate-300 px-2 text-xs font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                                        >
                                          {delta > 0 ? `+${delta}` : delta}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                          Kompaktansicht - antippen in der Queue für Details.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {pageViewTab === "training" && isHitWorkout ? (
          <div className="mt-4 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 dark:bg-fuchsia-950/40 dark:border-fuchsia-800">
            <p className="text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-200">HIT Runden & Workout-Set</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-fuchsia-900 dark:text-fuchsia-200">
                Ziel-Runden
                <input
                  type="number"
                  min={1}
                  value={hitTargetRounds}
                  onChange={(event) =>
                    setHitTargetRounds(
                      Math.max(1, Number.parseInt(event.target.value || "1", 10)),
                    )
                  }
                  className="rounded-md border border-fuchsia-300 bg-white px-2 py-1.5 text-slate-900 dark:text-slate-100 dark:bg-slate-900 dark:border-fuchsia-800"
                />
              </label>
              <div className="rounded-md border border-fuchsia-200 bg-white px-2 py-1.5 text-xs font-semibold text-fuchsia-900 dark:text-fuchsia-200 dark:bg-slate-900 dark:border-fuchsia-800">
                Runde: {Math.min(hitCurrentRound, hitTargetRounds)} / {hitTargetRounds}
              </div>
              <button
                type="button"
                onClick={completeHitRound}
                className="rounded-lg bg-fuchsia-700 px-3 py-2 text-xs font-semibold text-white"
              >
                Runde DONE
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-fuchsia-900 dark:text-fuchsia-200">
                Belastung pro Übung (Sek.)
                <input
                  type="number"
                  min={5}
                  max={600}
                  value={hitWorkSeconds}
                  onChange={(event) =>
                    setHitWorkSeconds(Math.max(5, Number.parseInt(event.target.value || "5", 10)))
                  }
                  className="rounded-md border border-fuchsia-300 bg-white px-2 py-1.5 text-slate-900 dark:text-slate-100 dark:bg-slate-900 dark:border-fuchsia-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-fuchsia-900 dark:text-fuchsia-200">
                Pause zwischen Übungen (Sek.)
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={hitRestSeconds}
                  onChange={(event) =>
                    setHitRestSeconds(Math.max(0, Number.parseInt(event.target.value || "0", 10)))
                  }
                  className="rounded-md border border-fuchsia-300 bg-white px-2 py-1.5 text-slate-900 dark:text-slate-100 dark:bg-slate-900 dark:border-fuchsia-800"
                />
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={newHitSetName}
                onChange={(event) => setNewHitSetName(event.target.value)}
                placeholder="Name für HIT-Workout-Set"
                className="rounded-md border border-fuchsia-300 bg-white px-2 py-2 text-sm text-slate-900 dark:text-slate-100 dark:bg-slate-900 dark:border-fuchsia-800"
              />
              <button
                type="button"
                onClick={saveHitWorkoutSet}
                className="rounded-lg border border-fuchsia-600 px-3 py-2 text-sm font-semibold text-fuchsia-800 dark:text-fuchsia-300"
              >
                Set speichern
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <select
                value={selectedHitSetName}
                onChange={(event) => setSelectedHitSetName(event.target.value)}
                className="rounded-md border border-fuchsia-300 bg-white px-2 py-2 text-sm text-slate-900 dark:text-slate-100 dark:bg-slate-900 dark:border-fuchsia-800"
              >
                <option value="">Workout-Set wählen</option>
                {hitWorkoutSets.map((setItem) => (
                  <option key={setItem.name} value={setItem.name}>
                    {setItem.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadHitWorkoutSet()}
                className="rounded-lg bg-fuchsia-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Set laden
              </button>
            </div>
            {hitWorkoutSets.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {hitWorkoutSets.slice(-4).reverse().map((setItem) => (
                  <button
                    key={`quick-hit-${setItem.name}`}
                    type="button"
                    onClick={() => loadHitWorkoutSet(setItem.name)}
                    className="rounded-full border border-fuchsia-300 bg-white px-2.5 py-1 text-xs font-semibold text-fuchsia-900 dark:text-fuchsia-200 dark:bg-slate-900 dark:border-fuchsia-800"
                  >
                    ⚡ {setItem.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {pageViewTab === "training" ? (
          <div className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-950 dark:text-emerald-100 dark:bg-emerald-900/40">
            Tagesfortschritt: <strong>{completedCount}</strong> / {visibleEntries.length} erledigt (
            {completionPercent}%)
          </div>
        ) : null}

        {pageViewTab === "training" ? (
        <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-900 dark:bg-cyan-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cyan-950 dark:text-cyan-100">Session-Steuerung</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-cyan-900 dark:text-cyan-200">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(event) => setSoundEnabled(event.target.checked)}
                  className="h-4 w-4"
                />
                🔊 Signale
              </label>
              <button
                type="button"
                onClick={async () => {
                  const unlocked = await unlockAudio();
                  if (!unlocked) {
                    setStatusText("Ton blockiert. Bitte Seite antippen und erneut testen.");
                    return;
                  }
                  playWorkStart(intervalSettings.profile);
                  setStatusText("Testton gespielt. Falls stumm: Lautstärke am Gerät prüfen.");
                }}
                className="touch-manipulation rounded-md border border-cyan-500 px-2.5 py-1.5 text-xs font-semibold text-cyan-900 dark:border-cyan-700 dark:text-cyan-200"
              >
                Ton testen
              </button>
              {isIntervalCategory ? (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-cyan-900 dark:text-cyan-200">
                  Vorlauf
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={prepSecondsSetting}
                    onChange={(event) =>
                      setPrepSecondsSetting(
                        Math.min(30, Math.max(0, Number.parseInt(event.target.value || "0", 10))),
                      )
                    }
                    className="w-16 rounded-md border border-cyan-300 bg-white px-2 py-1 text-slate-900 dark:border-cyan-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-3xl font-black tabular-nums text-cyan-900 dark:text-cyan-100">
            {formatSeconds(overallLiveSeconds)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isIntervalCategory ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void startIntervalSession();
                  }}
                  className="min-h-14 flex-1 touch-manipulation rounded-xl bg-cyan-700 px-4 text-base font-black text-white"
                >
                  ▶ {isHitWorkout ? "HIT Start" : `${flowLabel} Start`}
                </button>
                {intervalRunning ? (
                  <button
                    type="button"
                    onClick={pauseIntervalSession}
                    className="min-h-14 touch-manipulation rounded-xl border-2 border-cyan-700 px-4 text-base font-bold text-cyan-900 dark:text-cyan-200"
                  >
                    ⏸ Pause
                  </button>
                ) : null}
                {intervalPhase !== "idle" && !showFocusOverlay ? (
                  <button
                    type="button"
                    onClick={() => setShowFocusOverlay(true)}
                    className="min-h-14 touch-manipulation rounded-xl bg-slate-900 px-4 text-base font-bold text-white"
                  >
                    Vollbild
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={overallStartedAtMs ? pauseWorkoutSession : startWorkoutSession}
                className="min-h-14 flex-1 touch-manipulation rounded-xl bg-cyan-700 px-4 text-base font-black text-white"
              >
                {overallStartedAtMs ? "⏸ Pause" : "▶ Training Start"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOverallBaseSeconds(0);
                setOverallStartedAtMs(null);
              }}
              className="min-h-14 touch-manipulation rounded-xl border border-rose-500 px-4 text-sm font-semibold text-rose-700 dark:text-rose-300"
            >
              Reset
            </button>
          </div>
          {isIntervalCategory ? (
            <p className="mt-2 text-[11px] font-medium text-cyan-800 dark:text-cyan-300">
              {isHitWorkout
                ? `HIT: ${hitWorkSeconds}s Belastung / ${hitRestSeconds}s Pause · ${hitTargetRounds} Runden`
                : "Signale: sanfter Gong bei jedem Übungswechsel."}
            </p>
          ) : null}
        </div>
        ) : null}

        {pageViewTab === "training" && isFlowCategory ? (
          <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                {flowLabel} Ablauf
              </p>
              <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
                {flowExerciseStates.filter((item) => item.done).length} / {flowExerciseStates.length}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                <input
                  type="checkbox"
                  checked={halfwayAlertEnabled}
                  onChange={(e) => setHalfwayAlertEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                Halbzeit-Signal
              </label>
            </div>

            <div className="mt-3 grid gap-1.5">
              {flowExerciseStates.map((item, index) => (
                <div
                  key={`flow-step-${item.exercise}`}
                  className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold ${
                    item.done
                      ? "border-emerald-500 bg-emerald-600 text-white"
                      : item.active
                        ? "border-cyan-500 bg-cyan-100 text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-100"
                        : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  }`}
                >
                  {/* Long names wrap instead of being cut off, so the controls
                      on the right stay reachable on narrow screens. */}
                  <span className="min-w-0 flex-1 break-words">
                    {index + 1}. {item.done ? "✓ " : ""}
                    {item.exercise}
                  </span>
                  <span className="shrink-0 tabular-nums opacity-80">
                    {getWorkSecondsFor(item.exercise)}s
                  </span>
                  {/* Reordering only outside a running session, so the phase
                      engine never changes course mid-exercise. */}
                  {intervalPhase === "idle" ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => moveExerciseInOrder(item.exercise, -1)}
                        disabled={index === 0}
                        aria-label={`${item.exercise} nach oben`}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-current text-sm font-black disabled:opacity-25"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveExerciseInOrder(item.exercise, 1)}
                        disabled={index === flowExerciseStates.length - 1}
                        aria-label={`${item.exercise} nach unten`}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-current text-sm font-black disabled:opacity-25"
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {flowExerciseStates.length > 0 && flowExerciseStates.every((item) => item.done) ? (
              <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Alle Übungen erledigt – super gemacht! 🎉
              </p>
            ) : null}
          </div>
        ) : null}

        {pageViewTab === "training" ? (
        <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tages-Check-in</p>
            <button
              type="button"
              onClick={() => setShowJournalArchive((v) => !v)}
              className="rounded-lg border border-slate-400 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 dark:border-slate-600"
            >
              📖 Archiv {showJournalArchive ? "ausblenden" : "anzeigen"}
            </button>
          </div>
          <div className="mt-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Score (0 = letzter Kraftakt, 10 = super gut)
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {scoreChoices.map((score) => (
                <button
                  key={`journal-score-${score}`}
                  type="button"
                  onClick={() => setReflection((current) => ({ ...current, flowScore: String(score) }))}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    reflection.flowScore === String(score)
                      ? "bg-cyan-600 text-white"
                      : "border border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 relative">
            <textarea
              value={reflection.text}
              onChange={(event) =>
                setReflection((current) => ({ ...current, text: event.target.value }))
              }
              rows={3}
              placeholder="Freitext: Wie war dein Tag/Flow?"
              className="w-full rounded-md border border-slate-400 px-2 py-2 pr-8 text-sm text-slate-900 dark:text-slate-100 dark:border-slate-600"
            />
            {reflection.text ? (
              <button
                type="button"
                onClick={() => setReflection((c) => ({ ...c, text: "" }))}
                title="Text löschen"
                className="absolute right-2 top-2 text-xs font-bold text-rose-500 hover:text-rose-700"
              >
                ✕
              </button>
            ) : null}
          </div>

          {showJournalArchive && (
            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:bg-slate-900 dark:border-slate-700">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Archiv ({journalArchive.length} Einträge)
              </p>
              {journalArchive.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Noch keine archivierten Einträge.</p>
              ) : (
                [...journalArchive]
                  .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
                  .map((entry) => {
                    const archiveKey = `${entry.dateKey}:${entry.category}`;
                    const expanded = expandedArchiveKeys.has(archiveKey);
                    return (
                      <div
                        key={archiveKey}
                        className="mb-2 rounded-md border border-slate-200 p-2 text-xs dark:border-slate-700"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{entry.dateKey}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 dark:bg-slate-800">
                            {entry.category}
                          </span>
                          <span className="text-slate-600 dark:text-slate-300">{entry.mood}</span>
                        </div>
                        <p className={`mt-1 text-slate-700 ${expanded ? "" : "line-clamp-3"}`}>
                          {entry.text}
                        </p>
                        {entry.text.length > 120 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedArchiveKeys((prev) => {
                                const next = new Set(prev);
                                if (expanded) {
                                  next.delete(archiveKey);
                                } else {
                                  next.add(archiveKey);
                                }
                                return next;
                              })
                            }
                            className="mt-1 text-teal-700 underline"
                          >
                            {expanded ? "Weniger" : "Mehr anzeigen"}
                          </button>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          )}
        </div>
        ) : null}



        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={exportOfflineData}
            className="touch-manipulation rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Datei exportieren
          </button>
          <button
            type="button"
            onClick={triggerOfflineImport}
            className="touch-manipulation rounded-lg border border-indigo-600 px-4 py-2.5 text-sm font-semibold text-indigo-800 dark:text-indigo-300"
          >
            Datei laden
          </button>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Änderungen werden automatisch gespeichert.
          </span>
        </div>

        {exportReminder ? (
          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {exportReminder}
          </p>
        ) : historyInfo && historyInfo.loggedDays > 0 ? (
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            Historie: {historyInfo.loggedDays} Trainingstage
            {historyInfo.firstDay && historyInfo.lastDay
              ? ` · ${historyInfo.firstDay} bis ${historyInfo.lastDay}`
              : ""}
            {historyInfo.lastExportAt
              ? ` · zuletzt gesichert ${formatLastUsed(historyInfo.lastExportAt)}`
              : ""}
          </p>
        ) : null}
        </>
        ) : null}

        {statusText ? <p className="mt-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300" role="status" aria-live="polite">{statusText}</p> : null}
        {errorText ? <p className="mt-2 text-sm font-semibold text-rose-800 dark:text-rose-300" role="alert">{errorText}</p> : null}
      </div>

      {pageViewTab === "training" && !isFlowCategory && currentWorkoutEntry ? (
        <div className="fixed inset-x-3 bottom-2 z-30 rounded-2xl border border-slate-300 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:inset-x-auto sm:right-4 sm:w-[360px] sm:pb-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Quick Logging
          </p>
          <div className="mt-2 rounded-lg border border-indigo-300 bg-indigo-700 px-3 py-2 text-base font-black text-white dark:border-indigo-800">
            {currentWorkoutEntry.exercise}
          </div>
          {restTimerRemaining > 0 ? (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-700 px-3 py-2 text-white">
              <span className="text-xs font-bold uppercase tracking-wide">Satzpause</span>
              <span className="text-xl font-black tabular-nums">{formatSeconds(restTimerRemaining)}</span>
              <button
                type="button"
                onClick={() => setRestTimerEndsAtMs(null)}
                className="min-h-9 rounded-md bg-white/20 px-2 text-xs font-bold"
              >
                Skip
              </button>
            </div>
          ) : null}
          {isHitWorkout ? (
            <p className="mt-2 px-1 text-[11px] font-semibold text-fuchsia-800 dark:text-fuchsia-300">
              HIT benötigt pro Übung Reps &gt; 0 vor Done & Next.
            </p>
          ) : null}
          {isBodybuilding && stickyBlocker ? (
            <p className="mt-2 rounded-md bg-amber-100 px-2 py-1.5 text-[11px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
              {stickyBlocker}
            </p>
          ) : null}
          <div className="mt-2">
            <button
              type="button"
              onClick={runStickyDoneNext}
              className="touch-manipulation min-h-11 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white"
            >
              ✓ Done &amp; Next
            </button>
          </div>
        </div>
      ) : null}

      {isIntervalCategory && intervalPhase !== "idle" && showFocusOverlay ? (
        <div
          className={`fixed inset-0 z-50 flex flex-col text-white ${phaseTheme.surface}`}
          style={{ transition: reducedMotion ? "none" : "background-color 80ms ease-in" }}
          role="dialog"
          aria-modal="true"
          aria-label="Aktive Trainingssession"
        >
          <div className="flex items-center justify-between px-5 pt-[calc(1rem+env(safe-area-inset-top))]">
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-white/90">
              {isHitWorkout ? "HIT" : flowLabel}
              {intervalSettings.totalRounds > 1
                ? ` · Runde ${phaseRound} / ${intervalSettings.totalRounds}`
                : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExerciseGuide((current) => !current)}
                aria-pressed={showExerciseGuide}
                className="min-h-11 rounded-full bg-black/25 px-3 text-xs font-bold text-white"
              >
                {showExerciseGuide ? "Anleitung aus" : "Anleitung"}
              </button>
              <button
                type="button"
                onClick={() => setShowFocusOverlay(false)}
                className="min-h-11 min-w-11 rounded-full bg-black/25 px-4 text-sm font-bold text-white"
                aria-label="Vollbild verlassen"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
            <p
              className="text-sm font-black uppercase tracking-[0.3em] text-white/85"
              aria-live="polite"
            >
              {phaseTheme.label}
            </p>

            <h2 className="mt-3 text-[clamp(24px,7vw,40px)] font-black leading-tight text-white">
              {intervalPhase === "rest" ? `Als Nächstes: ${phaseExercise ?? "-"}` : phaseExercise ?? "-"}
            </h2>

            <div className="relative mt-6 flex h-[min(62vw,300px)] w-[min(62vw,300px)] items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke={phaseTheme.ring}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 54}
                  strokeDashoffset={2 * Math.PI * 54 * (1 - phaseProgress)}
                  style={{ transition: reducedMotion ? "none" : "stroke-dashoffset 0.2s linear" }}
                />
              </svg>
              <span
                className="z-10 font-black tabular-nums text-white"
                style={{
                  fontSize: "clamp(72px, 22vw, 128px)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {phaseRemainingSeconds}
              </span>
            </div>

            {intervalPhase !== "rest" && phaseUpcomingExercise ? (
              <p className="mt-6 rounded-full bg-black/25 px-4 py-2 text-sm font-semibold text-white">
                Next: {phaseUpcomingExercise}
              </p>
            ) : null}

            {/* Movement guide for whatever is on deck: during a rest phase the
                upcoming exercise is the useful one to prepare for. */}
            {overlayGuide && showExerciseGuide ? (
              <div className="mt-5 w-full max-w-md rounded-2xl bg-black/25 p-3 text-left">
                <div className="flex items-start gap-3">
                  {overlayGuide.guide.motion ? (
                    <div className="h-20 w-20 shrink-0 text-white/90">
                      <ExerciseAnimation motion={overlayGuide.guide.motion} />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                      {overlayGuide.exercise}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-white/85">
                      {overlayGuide.guide.setup}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {overlayGuide.guide.cues.slice(0, 3).map((cue) => (
                        <li
                          key={`overlay-cue-${cue}`}
                          className="text-xs font-semibold text-white before:mr-1.5 before:content-['·']"
                        >
                          {cue}
                        </li>
                      ))}
                    </ul>
                    {overlayGuide.guide.focus ? (
                      <p className="mt-1.5 text-[11px] font-medium italic text-white/70">
                        {overlayGuide.guide.focus}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {intervalPhase === "complete" ? (
              <p className="mt-6 text-lg font-bold text-white">Session abgeschlossen 🎉</p>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-3 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={pauseIntervalSession}
              disabled={intervalPhase === "complete"}
              className="min-h-16 rounded-2xl bg-black/30 text-base font-bold text-white disabled:opacity-40"
            >
              Pause
            </button>
            <button
              type="button"
              onClick={skipIntervalPhase}
              disabled={intervalPhase === "complete"}
              className="min-h-16 rounded-2xl bg-white text-base font-black text-slate-900 disabled:opacity-40 dark:text-slate-100 dark:bg-slate-900"
            >
              {intervalPhase === "rest" ? "Weiter" : "Done"}
            </button>
            <button
              type="button"
              onClick={() => {
                exitIntervalSession();
                setShowFocusOverlay(false);
              }}
              className="min-h-16 rounded-2xl bg-black/30 text-base font-bold text-white"
            >
              Ende
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
