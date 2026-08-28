"use client";

import Image from "next/image";
import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { exerciseMuscleGroupMap, type JournalCategory } from "@/lib/exercises";
import { getSupabaseClient } from "@/lib/supabase";

type RoutineJournalProps = {
  initialTab: "cloud" | "lite";
  categories: JournalCategory[];
  showLiteLink?: boolean;
  showOfflineCopyButton?: boolean;
  hiddenLiteHero?: boolean;
};

type JournalTab = "cloud" | "lite";
type PageViewTab = "training" | "dashboard";

type EntryState = {
  exercise: string;
  completed: boolean;
  sets: string;
  completedSets: number;
  reps: string;
  weightKg: string;
  durationMinutes: string;
  targetMinutes: string;
  trackedSeconds: number;
  notes: string;
};

type CloudRow = {
  exercise: string;
  completed: boolean;
  sets?: number | null;
  completed_sets?: number | null;
  reps: number | null;
  weight_kg?: number | null;
  duration_minutes: number | null;
  target_minutes?: number | null;
  tracked_seconds?: number | null;
  notes: string | null;
};

type ReflectionState = {
  mood: string;
  text: string;
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

type CategoryFavorite = {
  name: string;
  category: string;
  entries: EntryState[];
  reflection: ReflectionState;
  exerciseCustomSeconds: ExerciseSecondMap;
  hitTargetRounds: number;
};

type BodybuildingPlan = {
  name: string;
  exercises: string[];
};

type WorkoutBuilderTemplate = {
  name: string;
  category: string;
  entries: EntryState[];
  exerciseCustomSeconds: ExerciseSecondMap;
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

const moodTemplates: Record<string, string> = {
  "Fokussiert": "Ich starte klar und konzentriert. Heute setze ich eine kleine, starke Gewohnheit.",
  "Energielos": "Ich halte es leicht und beginne mit kleinen Schritten. Bewegung bringt Energie in Fahrt.",
  "Gestresst": "Ich atme ruhig ein und aus. Mit jeder Übung lasse ich Druck los.",
  "Dankbar": "Ich nehme bewusst wahr, was heute schon gut ist, und starte positiv in den Tag.",
  "Neutral": "Ich checke kurz meinen Körper und Geist ein und bewege mich mit Ruhe weiter.",
};

const moodOptions = Object.keys(moodTemplates);
const customExercisesStorageKey = "momentum-config:custom-exercises:v1";
const hiddenExercisesStorageKey = "momentum-config:hidden-exercises:v1";
const exerciseOrderStorageKey = "momentum-config:exercise-order:v1";
const hitWorkoutSetsStorageKey = "momentum-hit:sets:v1";
const favoritesByCategoryStorageKey = "momentum-favorites:by-category:v1";
const bodybuildingPlansStorageKey = "momentum-bodybuilding:plans:v1";
const workoutBuilderTemplatesStorageKey = "momentum-builder:templates:v1";
const routineComposerStorageKey = "momentum-builder:routine-composer:v1";
const lastQuickLoadStorageKey = "momentum-quickload:last-by-category:v1";
const profileStorageKey = "momentum-profile:v1";
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
const bodybuildingPlanMap: Record<string, string[]> = {
  "Push / Pull / Legs": [
    "Bench Press",
    "Incline Dumbbell Press",
    "Chest Dip",
    "Barbell Row",
    "One-Arm Dumbbell Row",
    "Pull-Up",
    "Lat Pulldown",
    "Overhead Press",
    "Dumbbell Shoulder Press",
    "Barbell Squat",
    "Goblet Squat",
    "Romanian Deadlift",
    "Walking Lunge",
    "Leg Press",
    "Seated Leg Curl",
  ],
  "4er Split": [
    "Bench Press",
    "Incline Dumbbell Press",
    "Barbell Row",
    "Lat Pulldown",
    "Overhead Press",
    "Barbell Squat",
    "Romanian Deadlift",
    "Dumbbell Curl",
    "Triceps Dip",
    "Lateral Raise",
  ],
  "5er Split": [
    "Bench Press",
    "Incline Dumbbell Press",
    "Barbell Row",
    "Pull-Up",
    "Overhead Press",
    "Barbell Squat",
    "Romanian Deadlift",
    "Dumbbell Curl",
    "Cable Fly",
    "Seated Leg Curl",
  ],
  "Upper / Lower": [
    "Bench Press",
    "Chest Dip",
    "Barbell Row",
    "Pull-Up",
    "Overhead Press",
    "Barbell Squat",
    "Leg Press",
    "Romanian Deadlift",
    "Dumbbell Curl",
    "Skull Crusher",
  ],
};
const bodybuildingMuscleGroups = [
  "Alle",
  "Brust",
  "Rücken",
  "Schultern",
  "Arme",
  "Beine",
  "Core",
] as const;
const bodybuildingMuscleMap: Record<string, string[]> = {
  Alle: [],
  Brust: ["Bench Press", "Incline Dumbbell Press", "Cable Fly", "Chest Dip"],
  Rücken: [
    "Barbell Row",
    "One-Arm Dumbbell Row",
    "Pull-Up",
    "Lat Pulldown",
    "Seated Cable Row",
  ],
  Schultern: ["Overhead Press", "Dumbbell Shoulder Press", "Lateral Raise", "Face Pull"],
  Arme: [
    "Dumbbell Curl",
    "Barbell Curl",
    "Hammer Curl",
    "Triceps Dip",
    "Skull Crusher",
    "Cable Triceps Pushdown",
  ],
  Beine: [
    "Barbell Squat",
    "Front Squat",
    "Goblet Squat",
    "Romanian Deadlift",
    "Walking Lunge",
    "Leg Press",
    "Seated Leg Curl",
    "Leg Extension",
    "Standing Calf Raise",
  ],
  Core: ["Plank", "Cable Crunch", "Hanging Leg Raise"],
};
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

function getDateKeyFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
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

function parsePositiveInt(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function localStorageKey(dateKey: string, category: string): string {
  return `momentum-lite:${dateKey}:${category}`;
}

function buildDefaultEntries(exercises: string[]): EntryState[] {
  return exercises.map((exercise) => ({
    exercise,
    completed: false,
    sets: "",
    completedSets: 0,
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
    mood: "Neutral",
    text: moodTemplates["Neutral"],
  };
}

function toEntryMap(rows: CloudRow[], exercises: string[]): EntryState[] {
  const byExercise = new Map(rows.map((row) => [row.exercise, row]));
  return exercises.map((exercise) => {
    const row = byExercise.get(exercise);
    return {
      exercise,
      completed: row?.completed ?? false,
      sets: row?.sets?.toString() ?? "",
      completedSets: row?.completed_sets ?? 0,
      reps: row?.reps?.toString() ?? "",
      weightKg: row?.weight_kg?.toString() ?? "",
      durationMinutes: row?.duration_minutes?.toString() ?? "",
      targetMinutes: row?.target_minutes?.toString() ?? "",
      trackedSeconds: row?.tracked_seconds ?? 0,
      notes: row?.notes ?? "",
    };
  });
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
      reps: row?.reps ?? "",
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
  return customSeconds[exercise] ?? fallbackSeconds;
}

function createEntryTemplate(exercise: string, defaults?: Partial<EntryState>): EntryState {
  return {
    exercise,
    completed: false,
    sets: "",
    completedSets: 0,
    reps: "",
    weightKg: "",
    durationMinutes: "",
    targetMinutes: "",
    trackedSeconds: 0,
    notes: "",
    ...defaults,
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

export function RoutineJournal({
  initialTab,
  categories,
  showLiteLink = false,
  showOfflineCopyButton = false,
  hiddenLiteHero = false,
}: RoutineJournalProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const supabaseReady = Boolean(supabase);

  const [activeTab, setActiveTab] = useState<JournalTab>(initialTab);
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
  const [morningFlowActive, setMorningFlowActive] = useState(false);
  const [minuteAlertedExercise, setMinuteAlertedExercise] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [customExercisesByCategory, setCustomExercisesByCategory] = useState<
    Record<string, string[]>
  >(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const raw = window.localStorage.getItem(customExercisesStorageKey);
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, string[]>;
    } catch {
      return {};
    }
  });
  const [hiddenExercisesByCategory, setHiddenExercisesByCategory] = useState<
    Record<string, string[]>
  >(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const raw = window.localStorage.getItem(hiddenExercisesStorageKey);
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, string[]>;
    } catch {
      return {};
    }
  });
  const [exerciseOrderByCategory, setExerciseOrderByCategory] = useState<
    Record<string, string[]>
  >(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const raw = window.localStorage.getItem(exerciseOrderStorageKey);
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, string[]>;
    } catch {
      return {};
    }
  });
  const [newExerciseName, setNewExerciseName] = useState("");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [exerciseCustomSeconds, setExerciseCustomSeconds] = useState<ExerciseSecondMap>({});
  const [halfwayAlertEnabled, setHalfwayAlertEnabled] = useState(false);
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false);
  const [showJournalArchive, setShowJournalArchive] = useState(false);
  const [bodybuildingMuscleFilter, setBodybuildingMuscleFilter] = useState<(typeof bodybuildingMuscleGroups)[number]>('Alle');
  const [journalArchive, setJournalArchive] = useState<JournalArchiveEntry[]>([]);
  const [expandedArchiveKeys, setExpandedArchiveKeys] = useState<Set<string>>(new Set());
  const [hitWorkoutSets, setHitWorkoutSets] = useState<HitWorkoutSet[]>([]);
  const [newHitSetName, setNewHitSetName] = useState("");
  const [selectedHitSetName, setSelectedHitSetName] = useState("");
  const [hitTargetRounds, setHitTargetRounds] = useState(3);
  const [hitCurrentRound, setHitCurrentRound] = useState(1);
  const [favoritesByCategory, setFavoritesByCategory] = useState<Record<string, CategoryFavorite[]>>(
    {},
  );
  const [newFavoriteName, setNewFavoriteName] = useState("");
  const [selectedFavoriteName, setSelectedFavoriteName] = useState("");
  const [bodybuildingPlans, setBodybuildingPlans] = useState<BodybuildingPlan[]>([]);
  const [newBodybuildingPlanName, setNewBodybuildingPlanName] = useState("");
  const [selectedBodybuildingPlanName, setSelectedBodybuildingPlanName] = useState("");
  const [selectedBodybuildingPlanExercises, setSelectedBodybuildingPlanExercises] = useState<
    string[]
  >([]);
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
  const [showBuilderPanel, setShowBuilderPanel] = useState(false);
  const [selectedBuilderMuscleGroup, setSelectedBuilderMuscleGroup] =
    useState<BuilderMuscleGroup>("Alle");
  const [showAdvancedBuilderFields, setShowAdvancedBuilderFields] = useState(false);
  const [workoutCardOpenExercise, setWorkoutCardOpenExercise] = useState<string | null>(null);
  const [lastQuickLoadByCategory, setLastQuickLoadByCategory] = useState<
    Record<string, LastQuickLoad>
  >({});
  const [draggingExercise, setDraggingExercise] = useState<string | null>(null);
  const [profileCloudStatus, setProfileCloudStatus] = useState<
    "idle" | "synced" | "missing" | "unavailable"
  >("idle");
  const [profileLastSyncAt, setProfileLastSyncAt] = useState<string | null>(null);
  const offlineImportRef = useRef<HTMLInputElement | null>(null);

  const defaultWorkoutBuilderTemplates = useMemo<Record<string, WorkoutBuilderTemplate[]>>(() => {
    const categoryByName = new Map(categories.map((category) => [category.name, category.exercises]));
    const morningExercises = categoryByName.get("Morning Routine") ?? [];
    const yogaExercises = categoryByName.get("Yoga") ?? [];
    const tabataExercises = categoryByName.get("Tabata") ?? [];
    const hitExercises = categoryByName.get("HIT Workouts") ?? [];
    const runningExercises = categoryByName.get("Running/Cardio") ?? [];
    const bodybuildingExercises = categoryByName.get("Bodybuilding") ?? [];

    const fromExercises = (
      category: string,
      name: string,
      exercises: string[],
      defaults?: Partial<EntryState>,
    ): WorkoutBuilderTemplate => ({
      category,
      name,
      entries: exercises.map((exercise) => createEntryTemplate(exercise, defaults)),
      exerciseCustomSeconds: {},
    });

    const defaults: Record<string, WorkoutBuilderTemplate[]> = {
      "Morning Routine": [
        fromExercises("Morning Routine", "Morning Standard 1m", morningExercises),
      ],
      Yoga: [fromExercises("Yoga", "Yoga Mobility Flow", yogaExercises)],
      Tabata: [
        fromExercises(
          "Tabata",
          "Tabata 20s Power",
          tabataExercises.slice(0, 6),
          { reps: "12", sets: "1" },
        ),
      ],
      "HIT Workouts": [
        fromExercises("HIT Workouts", "HIT Ganzkoerper Basis", hitExercises, {
          reps: "12",
          sets: "4",
        }),
      ],
      "Running/Cardio": [
        fromExercises("Running/Cardio", "Interval Run 6x1", runningExercises, {
          durationMinutes: "30",
          targetMinutes: "30",
        }),
      ],
      Bodybuilding: Object.entries(bodybuildingPlanMap).map(([planName, exercises]) =>
        fromExercises(
          "Bodybuilding",
          `Plan: ${planName}`,
          exercises.filter((exercise) => bodybuildingExercises.includes(exercise)),
          { sets: "3", reps: "10" },
        ),
      ),
    };

    return defaults;
  }, [categories]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(tick);
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

    const rawFavorites = localStorage.getItem(favoritesByCategoryStorageKey);
    if (rawFavorites) {
      try {
        setFavoritesByCategory(JSON.parse(rawFavorites) as Record<string, CategoryFavorite[]>);
      } catch (error) {
        setErrorText(`Favoriten konnten nicht geladen werden: ${String(error)}`);
      }
    }

    const rawBodyPlans = localStorage.getItem(bodybuildingPlansStorageKey);
    if (rawBodyPlans) {
      try {
        setBodybuildingPlans(JSON.parse(rawBodyPlans) as BodybuildingPlan[]);
      } catch (error) {
        setErrorText(`Bodybuilding-Pläne konnten nicht geladen werden: ${String(error)}`);
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
    if (activeTab !== "cloud" || !supabase || !session?.user.id) {
      return;
    }
    void saveProfileToCloud(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, profile, session?.user.id, supabase]);

  const overviewStats = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        totalSessions: 0,
        totalCompleted: 0,
        topExercises: [] as Array<{ name: string; count: number }>,
        weightTrend: [] as Array<{ key: string; value: number | null }>,
        weightDailySeries: [] as Array<{ key: string; value: number }>,
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

    const recent7 = getLastNDays(7);
    const weekKeys = getWeekKeysMondayToSunday(selectedDate);
    const monthMeta = getMonthMeta(selectedDate);
    const counts = new Map<string, number>();
    const dayDone = new Map<string, boolean>();
    const exerciseCounts = new Map<string, number>();
    const weightByDay = new Map<string, number[]>();
    let totalSessions = 0;
    let totalCompleted = 0;

    for (const dayKey of [...recent7, ...weekKeys, ...monthMeta.keys]) {
      counts.set(dayKey, 0);
      dayDone.set(dayKey, false);
    }

    const localKeys = Object.keys(localStorage);
    for (const key of localKeys) {
      if (!key.startsWith("momentum-lite:")) {
        continue;
      }

      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          continue;
        }
        const dateKey = key.replace("momentum-lite:", "").split(":")[0];

        const parsed = JSON.parse(raw) as LiteDayPayload | EntryState[];
        const dayEntries = Array.isArray(parsed) ? parsed : parsed.entries ?? [];
        const completedEntries = dayEntries.filter((entry) => entry.completed);

        if (completedEntries.length > 0) {
          totalSessions += 1;
          dayDone.set(dateKey, true);
        }
        totalCompleted += completedEntries.length;

        for (const entry of completedEntries) {
          exerciseCounts.set(entry.exercise, (exerciseCounts.get(entry.exercise) ?? 0) + 1);
        }

        for (const entry of dayEntries) {
          const parsedWeight = Number.parseFloat(entry.weightKg || "");
          if (!Number.isNaN(parsedWeight) && parsedWeight > 0) {
            const current = weightByDay.get(dateKey) ?? [];
            current.push(parsedWeight);
            weightByDay.set(dateKey, current);
          }
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

    const weightTrendKeys = getLastNDays(14);
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

    return {
      totalSessions,
      totalCompleted,
      topExercises,
      weightTrend,
      weightDailySeries,
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
  }, [selectedDate]);

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

  const filteredBodybuildingExercises = useMemo(() => {
    if (selectedCategory !== "Bodybuilding") {
      return activeExercises;
    }

    const selectedGroup = bodybuildingMuscleFilter;
    const allowed = bodybuildingMuscleMap[selectedGroup] ?? [];
    if (selectedGroup === "Alle") {
      return activeExercises;
    }

    return activeExercises.filter((exercise) => allowed.includes(exercise));
  }, [activeExercises, bodybuildingMuscleFilter, selectedCategory]);

  const visibleEntries = useMemo(() => {
    const exercisesForView = selectedCategory === "Bodybuilding" ? filteredBodybuildingExercises : activeExercises;
    const map = new Map(entries.map((entry) => [entry.exercise, entry]));
    return exercisesForView.map(
      (exercise) =>
        map.get(exercise) ?? {
          exercise,
          completed: false,
          sets: "",
          completedSets: 0,
          reps: "",
          weightKg: "",
          durationMinutes: "",
          targetMinutes: "",
          trackedSeconds: 0,
          notes: "",
        },
    );
  }, [activeExercises, entries, filteredBodybuildingExercises, selectedCategory]);

  const builderEntries = useMemo(() => {
    const byExercise = new Map(entries.map((entry) => [entry.exercise, entry]));
    return allExercisesForCategory.map(
      (exercise) =>
        byExercise.get(exercise) ?? {
          exercise,
          completed: false,
          sets: "",
          completedSets: 0,
          reps: "",
          weightKg: "",
          durationMinutes: "",
          targetMinutes: "",
          trackedSeconds: 0,
          notes: "",
        },
    );
  }, [allExercisesForCategory, entries]);

  const completedCount = visibleEntries.filter((entry) => entry.completed).length;
  const isMorningRoutine = selectedCategory === "Morning Routine";
  const isYoga = selectedCategory === "Yoga";
  const isTabata = selectedCategory === "Tabata";
  const isHitWorkout = selectedCategory === "HIT Workouts";
  const isBodybuilding = selectedCategory === "Bodybuilding";
  const isFlowCategory = isMorningRoutine || isTabata || isYoga;
  const flowLabel = isTabata ? "Tabata" : isYoga ? "Yoga" : "Morning";
  const defaultFlowSeconds = isTabata ? 20 : isYoga ? 45 : 60;
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

  useEffect(() => {
    if (!isBodybuilding) {
      return;
    }

    setSelectedBodybuildingPlanExercises((current) => {
      if (current.length === 0) {
        return activeExercises;
      }
      return current.filter((exercise) => activeExercises.includes(exercise));
    });
  }, [activeExercises, isBodybuilding]);

  useEffect(() => {
    if (activeTab !== "cloud") {
      return;
    }

    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setErrorText(error.message);
        return;
      }
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setSession(authSession);
      setErrorText("");
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [activeTab, supabase]);

  useEffect(() => {
    if (activeTab !== "cloud" || !session?.user.id || !supabase) {
      return;
    }

    let disposed = false;
    const loadCloud = async () => {
      setLoadingEntries(true);
      setErrorText("");

      const selectWithTimers = await supabase
        .from("daily_entries")
        .select(
          "exercise,completed,sets,completed_sets,reps,weight_kg,duration_minutes,target_minutes,tracked_seconds,notes",
        )
        .eq("user_id", session.user.id)
        .eq("entry_date", selectedDate)
        .eq("category", selectedCategory);

      let rows: CloudRow[] = [];
      let error = selectWithTimers.error;

      if (
        error?.message.includes("sets") ||
        error?.message.includes("completed_sets") ||
        error?.message.includes("weight_kg") ||
        error?.message.includes("target_minutes") ||
        error?.message.includes("tracked_seconds")
      ) {
        const fallback = await supabase
          .from("daily_entries")
          .select("exercise,completed,reps,duration_minutes,notes")
          .eq("user_id", session.user.id)
          .eq("entry_date", selectedDate)
          .eq("category", selectedCategory);
        error = fallback.error;
        rows = (fallback.data ?? []) as CloudRow[];
      } else {
        rows = (selectWithTimers.data ?? []) as CloudRow[];
      }

      if (disposed) {
        return;
      }
      if (error) {
        setErrorText(error.message);
        setLoadingEntries(false);
        return;
      }

      setEntries(toEntryMap(rows, activeExercises));
      setLoadingEntries(false);

      const reflectionResult = await supabase
        .from("daily_reflections")
        .select("mood,reflection,overall_seconds")
        .eq("user_id", session.user.id)
        .eq("entry_date", selectedDate)
        .eq("category", selectedCategory)
        .maybeSingle();

      if (disposed) {
        return;
      }

      if (
        reflectionResult.error &&
        !reflectionResult.error.message.includes("relation \"daily_reflections\" does not exist")
      ) {
        setErrorText(reflectionResult.error.message);
        return;
      }

      setReflection({
        mood: reflectionResult.data?.mood ?? "Neutral",
        text: reflectionResult.data?.reflection ?? moodTemplates["Neutral"],
      });
      setOverallBaseSeconds(reflectionResult.data?.overall_seconds ?? 0);
    };

    void loadCloud();

    return () => {
      disposed = true;
    };
  }, [activeExercises, activeTab, selectedCategory, selectedDate, session?.user.id, supabase]);

  useEffect(() => {
    if (activeTab !== "cloud" || !session?.user.id || !supabase) {
      return;
    }

    void loadProfileFromCloud(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, session?.user.id, supabase]);

  useEffect(() => {
    if (activeTab !== "lite") {
      return;
    }

    const loadLite = async () => {
      const key = localStorageKey(selectedDate, selectedCategory);
      const raw = localStorage.getItem(key);

      if (!raw) {
        setEntries(buildDefaultEntries(activeExercises));
        setReflection(buildDefaultReflection());
        setOverallBaseSeconds(0);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as LiteDayPayload | EntryState[];
        if (Array.isArray(parsed)) {
          setEntries(normalizeEntries(parsed, activeExercises));
          setReflection(buildDefaultReflection());
          setOverallBaseSeconds(0);
          return;
        }

        setEntries(normalizeEntries(parsed.entries ?? [], activeExercises));
        setReflection(parsed.reflection ?? buildDefaultReflection());
        setOverallBaseSeconds(parsed.overallSeconds ?? 0);
      } catch (error) {
        setEntries(buildDefaultEntries(activeExercises));
        setReflection(buildDefaultReflection());
        setOverallBaseSeconds(0);
        setErrorText(`Lokale Daten sind ungültig: ${String(error)}`);
      }
    };

    void loadLite();
  }, [activeExercises, activeTab, selectedCategory, selectedDate]);

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

  const emitSwitchSignal = () => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([120, 80, 120]);
    }

    if (typeof AudioContext === "undefined") {
      return;
    }

    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 900;
      gainNode.gain.value = 0.08;
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.18);
    } catch (error) {
      console.error("Audio signal failed", error);
    }
  };

  const startExerciseTimer = (exercise: string) => {
    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }
    setMinuteAlertedExercise(null);
    setActiveExerciseTimer({ exercise, startedAtMs: Date.now() });
  };

  const advanceMorningFlow = (currentExercise: string) => {
    const currentIndex = activeExercises.findIndex((exercise) => exercise === currentExercise);
    const nextExercise = activeExercises[currentIndex + 1];

    pauseExerciseTimer(currentExercise);

    if (!nextExercise) {
      setMorningFlowActive(false);
      setStatusText(
        `${flowLabel} Flow abgeschlossen - stark durchgezogen!`,
      );
      return;
    }

    setMinuteAlertedExercise(null);
    setActiveExerciseTimer({ exercise: nextExercise, startedAtMs: Date.now() });
    setStatusText(`Weiter mit: ${nextExercise}`);
  };

  const handleCompletedToggle = (exercise: string, checked: boolean) => {
    handleEntryChange(exercise, {
      completed: checked,
      completedSets: checked
        ? visibleEntries.find((entry) => entry.exercise === exercise)?.completedSets ?? 0
        : 0,
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

    if (!checked || !isFlowCategory || !morningFlowActive) {
      return;
    }

    advanceMorningFlow(exercise);
  };

  const startMorningFlow = () => {
    if (!isFlowCategory || activeExercises.length === 0) {
      setErrorText("Flow ist nur in Morning Routine, Yoga oder Tabata verfügbar.");
      return;
    }

    const firstIncomplete = activeExercises.find(
      (ex) => !visibleEntries.find((e) => e.exercise === ex)?.completed,
    );
    const firstExercise = firstIncomplete ?? activeExercises[0];

    setMorningFlowActive(true);
    setMinuteAlertedExercise(null);
    setActiveExerciseTimer({ exercise: firstExercise, startedAtMs: Date.now() });
    setStatusText(
      `${flowLabel} Flow gestartet mit: ${firstExercise}`,
    );
    setErrorText("");

    if (!overallStartedAtMs) {
      setOverallStartedAtMs(Date.now());
    }
  };

  const toggleExerciseVisibility = (exercise: string) => {
    setHiddenExercisesByCategory((current) => {
      const currentSet = new Set(current[selectedCategory] ?? []);
      if (currentSet.has(exercise)) {
        currentSet.delete(exercise);
      } else {
        currentSet.add(exercise);
      }
      const next = {
        ...current,
        [selectedCategory]: Array.from(currentSet),
      };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const addCustomExercise = () => {
    const trimmed = newExerciseName.trim();
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

  const saveBodybuildingPlan = () => {
    if (!isBodybuilding) {
      setErrorText("Trainingspläne sind nur in Bodybuilding verfügbar.");
      return;
    }
    const trimmed = newBodybuildingPlanName.trim();
    if (!trimmed) {
      setErrorText("Bitte einen Namen für den Trainingsplan eingeben.");
      return;
    }
    if (selectedBodybuildingPlanExercises.length === 0) {
      setErrorText("Bitte mindestens eine Übung für den Trainingsplan wählen.");
      return;
    }

    const nextPlan: BodybuildingPlan = {
      name: trimmed,
      exercises: selectedBodybuildingPlanExercises,
    };
    setBodybuildingPlans((current) => {
      const next = [...current.filter((plan) => plan.name !== trimmed), nextPlan];
      localStorage.setItem(bodybuildingPlansStorageKey, JSON.stringify(next));
      return next;
    });
    setSelectedBodybuildingPlanName(trimmed);
    setStatusText(`Trainingsplan "${trimmed}" gespeichert.`);
    setErrorText("");
  };

  const loadBodybuildingPlan = (nameOverride?: string) => {
    if (!isBodybuilding) {
      setErrorText("Trainingspläne sind nur in Bodybuilding verfügbar.");
      return;
    }
    const targetName = nameOverride ?? selectedBodybuildingPlanName;
    const plan = bodybuildingPlans.find((item) => item.name === targetName);
    if (!plan) {
      setErrorText("Bitte zuerst einen Trainingsplan auswählen.");
      return;
    }

    const missingExercises = plan.exercises.filter(
      (exercise) => !allExercisesForCategory.includes(exercise),
    );
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

    setSelectedBodybuildingPlanExercises(plan.exercises);
    const planSet = new Set(plan.exercises);
    setHiddenExercisesByCategory((current) => {
      const nextHidden = allExercisesForCategory.filter((exercise) => !planSet.has(exercise));
      const next = { ...current, [selectedCategory]: nextHidden };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });
    setSelectedBodybuildingPlanName(plan.name);
    rememberQuickLoad("bb-plan", plan.name);
    setStatusText(`Trainingsplan "${plan.name}" geladen.`);
    setErrorText("");
  };

  const applyPresetBodybuildingPlan = (planName: string) => {
    if (!isBodybuilding) {
      return;
    }
    const exercises = bodybuildingPlanMap[planName];
    if (!exercises) {
      setErrorText("Preset-Trainingsplan nicht gefunden.");
      return;
    }
    setSelectedBodybuildingPlanName(planName);
    setSelectedBodybuildingPlanExercises(exercises);
    const mapSet = new Set(exercises);
    setHiddenExercisesByCategory((current) => {
      const nextHidden = allExercisesForCategory.filter((exercise) => !mapSet.has(exercise));
      const next = { ...current, [selectedCategory]: nextHidden };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });
    rememberQuickLoad("bb-plan", planName);
    setStatusText(`Trainingsplan "${planName}" geladen.`);
    setErrorText("");
  };

  const applyBodybuildingSelection = () => {
    if (!isBodybuilding) {
      return;
    }
    if (selectedBodybuildingPlanExercises.length === 0) {
      setErrorText("Bitte mindestens eine Übung auswählen.");
      return;
    }
    const selectedSet = new Set(selectedBodybuildingPlanExercises);
    setHiddenExercisesByCategory((current) => {
      const nextHidden = allExercisesForCategory.filter((exercise) => !selectedSet.has(exercise));
      const next = { ...current, [selectedCategory]: nextHidden };
      localStorage.setItem(hiddenExercisesStorageKey, JSON.stringify(next));
      return next;
    });
    setStatusText("Übungsauswahl für Bodybuilding angewendet.");
    setErrorText("");
  };

  const startBodybuildingFlow = () => {
    if (!isBodybuilding || visibleEntries.length === 0) {
      setErrorText("Bodybuilding-Flow braucht mindestens eine aktive Übung.");
      return;
    }
    const firstExercise = visibleEntries.find((entry) => !entry.completed)?.exercise ?? visibleEntries[0].exercise;
    setBodybuildingFlowActive(true);
    setBodybuildingFocusExercise(firstExercise);
    setStatusText(`Bodybuilding gestartet mit: ${firstExercise}`);
    setErrorText("");
  };

  const completeBodybuildingAndNext = (exercise: string) => {
    const targetSets =
      visibleEntries.find((entry) => entry.exercise === exercise)?.sets ?? "0";
    handleEntryChange(exercise, {
      completed: true,
      completedSets: Math.max(0, Number.parseInt(targetSets || "0", 10) || 0),
    });
    const currentIndex = visibleEntries.findIndex((entry) => entry.exercise === exercise);
    const nextEntry = visibleEntries.slice(currentIndex + 1).find((entry) => !entry.completed);
    setBodybuildingFocusExercise(nextEntry?.exercise ?? null);
    if (!nextEntry) {
      setBodybuildingFlowActive(false);
      setStatusText("Bodybuilding Session abgeschlossen - stark!");
    } else {
      setStatusText(`Weiter mit: ${nextEntry.exercise}`);
    }
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

    if (isBodybuilding) {
      setSelectedBodybuildingPlanExercises((current) => {
        if (enabled) {
          return current.includes(exercise) ? current : [...current, exercise];
        }
        return current.filter((item) => item !== exercise);
      });
    }
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

  const updateCompletedSets = (exercise: string, delta: number) => {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.exercise !== exercise) {
          return entry;
        }
        const targetSets = Number.parseInt(entry.sets || "0", 10);
        const maxSets = Number.isNaN(targetSets) ? 0 : Math.max(0, targetSets);
        const nextCompleted = Math.min(
          Math.max((entry.completedSets ?? 0) + delta, 0),
          maxSets > 0 ? maxSets : Number.MAX_SAFE_INTEGER,
        );
        return {
          ...entry,
          completedSets: nextCompleted,
          completed: maxSets > 0 ? nextCompleted >= maxSets : entry.completed,
        };
      }),
    );
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

    setEntries((current) => {
      const byExercise = new Map(current.map((entry) => [entry.exercise, entry]));
      for (const entry of template.entries) {
        byExercise.set(entry.exercise, entry);
      }
      return Array.from(byExercise.values());
    });
    setExerciseCustomSeconds(template.exerciseCustomSeconds ?? {});
    if (selectedCategory === "Bodybuilding") {
      setSelectedBodybuildingPlanExercises(template.entries.map((entry) => entry.exercise));
      setBodybuildingFlowActive(false);
      setBodybuildingFocusExercise(null);
    }
    if (selectedCategory === "HIT Workouts") {
      setHitCurrentRound(1);
    }
    setSelectedWorkoutBuilderName(template.name);
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
      setSelectedBodybuildingPlanExercises(Array.from(activeSet));
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

    if (hitCurrentRound >= hitTargetRounds) {
      setStatusText(`HIT abgeschlossen: ${hitTargetRounds}/${hitTargetRounds} Runden geschafft.`);
      setErrorText("");
      return;
    }

    const visibleNames = new Set(visibleEntries.map((entry) => entry.exercise));
    setEntries((current) =>
      current.map((entry) =>
        visibleNames.has(entry.exercise) ? { ...entry, completed: false, completedSets: 0 } : entry,
      ),
    );
    setHitCurrentRound((current) => current + 1);
    setStatusText(`Runde ${hitCurrentRound} erledigt. Starte Runde ${hitCurrentRound + 1}.`);
    setErrorText("");
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

  const saveCategoryFavorite = () => {
    const trimmed = newFavoriteName.trim();
    if (!trimmed) {
      setErrorText("Bitte einen Namen für den Favoriten eingeben.");
      return;
    }

    const favorite: CategoryFavorite = {
      name: trimmed,
      category: selectedCategory,
      entries: visibleEntries,
      reflection,
      exerciseCustomSeconds,
      hitTargetRounds,
    };

    setFavoritesByCategory((current) => {
      const categoryItems = current[selectedCategory] ?? [];
      const nextCategoryItems = [
        ...categoryItems.filter((item) => item.name !== trimmed),
        favorite,
      ];
      const next = { ...current, [selectedCategory]: nextCategoryItems };
      localStorage.setItem(favoritesByCategoryStorageKey, JSON.stringify(next));
      return next;
    });
    setSelectedFavoriteName(trimmed);
    setStatusText(`Favorit "${trimmed}" gespeichert.`);
    setErrorText("");
  };

  const loadCategoryFavorite = (nameOverride?: string) => {
    const targetName = nameOverride ?? selectedFavoriteName;
    const favorite = (favoritesByCategory[selectedCategory] ?? []).find(
      (item) => item.name === targetName,
    );
    if (!favorite) {
      setErrorText("Bitte zuerst einen Favoriten auswählen.");
      return;
    }

    const missingExercises = favorite.entries
      .map((entry) => entry.exercise)
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

    setEntries((current) => {
      const byExercise = new Map(current.map((entry) => [entry.exercise, entry]));
      for (const entry of favorite.entries) {
        byExercise.set(entry.exercise, entry);
      }
      return Array.from(byExercise.values());
    });
    setReflection(favorite.reflection);
    setExerciseCustomSeconds(favorite.exerciseCustomSeconds);
    setHitTargetRounds(favorite.hitTargetRounds || 3);
    setHitCurrentRound(1);
    if (selectedCategory === "Bodybuilding") {
      setSelectedBodybuildingPlanExercises(favorite.entries.map((entry) => entry.exercise));
    }
    setSelectedFavoriteName(favorite.name);
    rememberQuickLoad("favorite", favorite.name);
    setBodybuildingFlowActive(false);
    setBodybuildingFocusExercise(null);
    setStatusText(`Favorit "${favorite.name}" geladen.`);
    setErrorText("");
  };

  const exportOfflineData = () => {
    if (typeof window === "undefined") {
      return;
    }
    const key = localStorageKey(selectedDate, selectedCategory);
    const payload: LiteDayPayload = {
      entries: visibleEntries,
      reflection,
      overallSeconds: overallLiveSeconds,
    };
    const liteRecords: Record<string, string> = {};
    for (const storageKey of Object.keys(localStorage)) {
      if (storageKey.startsWith("momentum-lite:")) {
        const value = localStorage.getItem(storageKey);
        if (value) {
          liteRecords[storageKey] = value;
        }
      }
    }

    const bundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      selectedDate,
      selectedCategory,
      currentKey: key,
      currentPayload: payload,
      liteRecords,
      hitWorkoutSets,
      favoritesByCategory,
      bodybuildingPlans,
      workoutBuilderTemplates,
      routineComposerByCategory,
      lastQuickLoadByCategory,
      profile,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `momentum-offline-${selectedDate}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusText("Offline-Daten exportiert.");
    setErrorText("");
  };

  const triggerOfflineImport = () => {
    offlineImportRef.current?.click();
  };

  const handleOfflineImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        selectedDate?: string;
        selectedCategory?: string;
        currentPayload?: LiteDayPayload;
        liteRecords?: Record<string, string>;
        hitWorkoutSets?: HitWorkoutSet[];
        favoritesByCategory?: Record<string, CategoryFavorite[]>;
        bodybuildingPlans?: BodybuildingPlan[];
        workoutBuilderTemplates?: Record<string, WorkoutBuilderTemplate[]>;
        routineComposerByCategory?: Record<string, string[]>;
        lastQuickLoadByCategory?: Record<string, LastQuickLoad>;
        profile?: UserProfile;
      };

      if (parsed.liteRecords) {
        for (const [storageKey, value] of Object.entries(parsed.liteRecords)) {
          localStorage.setItem(storageKey, value);
        }
      }

      if (parsed.hitWorkoutSets) {
        setHitWorkoutSets(parsed.hitWorkoutSets);
        localStorage.setItem(hitWorkoutSetsStorageKey, JSON.stringify(parsed.hitWorkoutSets));
      }

      if (parsed.favoritesByCategory) {
        setFavoritesByCategory(parsed.favoritesByCategory);
        localStorage.setItem(
          favoritesByCategoryStorageKey,
          JSON.stringify(parsed.favoritesByCategory),
        );
      }

      if (parsed.bodybuildingPlans) {
        setBodybuildingPlans(parsed.bodybuildingPlans);
        localStorage.setItem(bodybuildingPlansStorageKey, JSON.stringify(parsed.bodybuildingPlans));
      }

      if (parsed.workoutBuilderTemplates) {
        setWorkoutBuilderTemplates(parsed.workoutBuilderTemplates);
        localStorage.setItem(
          workoutBuilderTemplatesStorageKey,
          JSON.stringify(parsed.workoutBuilderTemplates),
        );
      }

      if (parsed.routineComposerByCategory) {
        setRoutineComposerByCategory(parsed.routineComposerByCategory);
        localStorage.setItem(
          routineComposerStorageKey,
          JSON.stringify(parsed.routineComposerByCategory),
        );
      }

      if (parsed.lastQuickLoadByCategory) {
        setLastQuickLoadByCategory(parsed.lastQuickLoadByCategory);
        localStorage.setItem(
          lastQuickLoadStorageKey,
          JSON.stringify(parsed.lastQuickLoadByCategory),
        );
      }

      if (parsed.profile) {
        const nextProfile: UserProfile = {
          ...buildDefaultProfile(),
          ...parsed.profile,
          preferredCategories: Array.isArray(parsed.profile.preferredCategories)
            ? parsed.profile.preferredCategories
            : [],
          weightUnit: parsed.profile.weightUnit === "lbs" ? "lbs" : "kg",
        };
        setProfile(nextProfile);
        localStorage.setItem(profileStorageKey, JSON.stringify(nextProfile));
      }

      if (parsed.selectedDate) {
        setSelectedDate(parsed.selectedDate);
      }
      if (parsed.selectedCategory) {
        setSelectedCategory(parsed.selectedCategory);
      }

      if (parsed.currentPayload) {
        setEntries(normalizeEntries(parsed.currentPayload.entries ?? [], activeExercises));
        setReflection(parsed.currentPayload.reflection ?? buildDefaultReflection());
        setOverallBaseSeconds(parsed.currentPayload.overallSeconds ?? 0);
      }

      setStatusText("Offline-Daten geladen.");
      setErrorText("");
    } catch (error) {
      setErrorText(`Import fehlgeschlagen: ${String(error)}`);
    } finally {
      event.target.value = "";
    }
  };

  const loadProfileFromCloud = async (showStatus: boolean) => {
    if (!supabase || !session?.user.id) {
      setProfileCloudStatus("unavailable");
      return;
    }

    const profileResult = await supabase
      .from("user_profiles")
      .select("display_name,goal,preferred_categories,weight_unit,reminder_time")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (profileResult.error?.message.includes("relation \"user_profiles\" does not exist")) {
      setProfileCloudStatus("unavailable");
      if (showStatus) {
        setStatusText("Cloud-Profil Tabelle fehlt. Bitte schema.sql in Supabase ausführen.");
      }
      return;
    }

    if (
      profileResult.error &&
      !profileResult.error.message.includes("relation \"user_profiles\" does not exist")
    ) {
      setProfileCloudStatus("unavailable");
      setErrorText(profileResult.error.message);
      return;
    }

    if (!profileResult.data) {
      const created = await saveProfileToCloud(false);
      if (created) {
        setProfileCloudStatus("synced");
        setProfileLastSyncAt(new Date().toISOString());
      } else {
        setProfileCloudStatus("missing");
      }
      if (showStatus) {
        setStatusText("Cloud-Profil wurde neu angelegt.");
      }
      return;
    }
    const cloudProfile = profileResult.data;

    setProfile((current) => ({
      ...current,
      displayName: cloudProfile.display_name ?? "",
      goal: cloudProfile.goal ?? "",
      preferredCategories: Array.isArray(cloudProfile.preferred_categories)
        ? cloudProfile.preferred_categories
        : [],
      weightUnit: cloudProfile.weight_unit === "lbs" ? "lbs" : "kg",
      reminderTime: cloudProfile.reminder_time || "07:00",
    }));
    setProfileCloudStatus("synced");
    setProfileLastSyncAt(new Date().toISOString());
    if (showStatus) {
      setStatusText("Profil aus Cloud geladen.");
    }
    setErrorText("");
  };

  const saveProfileToCloud = async (showStatus: boolean) => {
    if (!supabase || !session?.user.id) {
      setProfileCloudStatus("unavailable");
      setErrorText("Nicht angemeldet oder Supabase nicht konfiguriert.");
      return false;
    }

    let upsertResult = await supabase.from("user_profiles").upsert(
      {
        user_id: session.user.id,
        display_name: profile.displayName.trim(),
        goal: profile.goal.trim(),
        preferred_categories: profile.preferredCategories,
        weight_unit: profile.weightUnit,
        reminder_time: profile.reminderTime || "07:00",
      },
      { onConflict: "user_id" },
    );

    if (
      upsertResult.error?.message.includes("preferred_categories") ||
      upsertResult.error?.message.includes("weight_unit") ||
      upsertResult.error?.message.includes("reminder_time")
    ) {
      upsertResult = await supabase.from("user_profiles").upsert(
        {
          user_id: session.user.id,
          display_name: profile.displayName.trim(),
          goal: profile.goal.trim(),
        },
        { onConflict: "user_id" },
      );
    }

    if (upsertResult.error?.message.includes("goal")) {
      upsertResult = await supabase.from("user_profiles").upsert(
        {
          user_id: session.user.id,
          display_name: profile.displayName.trim(),
        },
        { onConflict: "user_id" },
      );
    }

    if (
      upsertResult.error &&
      !upsertResult.error.message.includes("relation \"user_profiles\" does not exist")
    ) {
      setProfileCloudStatus("unavailable");
      setErrorText(upsertResult.error.message);
      return false;
    }

    if (upsertResult.error?.message.includes("relation \"user_profiles\" does not exist")) {
      setProfileCloudStatus("unavailable");
      if (showStatus) {
        setStatusText("Cloud-Profil Tabelle fehlt. Bitte schema.sql in Supabase ausführen.");
      }
      return false;
    }

    setProfileCloudStatus("synced");
    setProfileLastSyncAt(new Date().toISOString());
    if (showStatus) {
      setStatusText("Profil in Cloud gespeichert.");
    }
    return true;
  };

  const sendMagicLink = async () => {
    if (!supabase) {
      setErrorText("Supabase-Konfiguration fehlt. Bitte .env.local setzen.");
      return;
    }

    setAuthBusy(true);
    setErrorText("");
    setStatusText("");

    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setAuthBusy(false);
    if (error) {
      setErrorText(error.message);
      return;
    }

    setStatusText("Magic Link gesendet. Bitte Mail auf dem Handy öffnen.");
  };

  const appendJournalArchive = (entry: JournalArchiveEntry) => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(journalArchiveStorageKey);
      const existing: JournalArchiveEntry[] = raw
        ? (JSON.parse(raw) as JournalArchiveEntry[])
        : [];
      const filtered = existing.filter(
        (e) => !(e.dateKey === entry.dateKey && e.category === entry.category),
      );
      const next = [...filtered, entry];
      localStorage.setItem(journalArchiveStorageKey, JSON.stringify(next));
      setJournalArchive(next);
    } catch {
      // ignore
    }
  };

  const saveLite = () => {
    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }

    const key = localStorageKey(selectedDate, selectedCategory);
    const payload: LiteDayPayload = {
      entries: visibleEntries,
      reflection,
      overallSeconds: overallLiveSeconds,
    };
    localStorage.setItem(key, JSON.stringify(payload));
    setOverallBaseSeconds(overallLiveSeconds);
    setOverallStartedAtMs(null);
    setStatusText("Offline-Lite gespeichert.");
    setErrorText("");

    if (reflection.text.trim()) {
      appendJournalArchive({
        dateKey: selectedDate,
        category: selectedCategory,
        mood: reflection.mood,
        text: reflection.text.trim(),
      });
    }
  };

  const saveCloud = async () => {
    if (!supabase || !session?.user.id) {
      setErrorText("Nicht angemeldet oder Supabase nicht konfiguriert.");
      return;
    }

    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }

    setStatusText("");
    setErrorText("");

    const payloadWithTimers = visibleEntries.map((entry) => ({
      user_id: session.user.id,
      entry_date: selectedDate,
      category: selectedCategory,
      exercise: entry.exercise,
      completed: entry.completed,
      sets: parsePositiveInt(entry.sets),
      completed_sets: entry.completedSets,
      reps: parsePositiveInt(entry.reps),
      weight_kg: parsePositiveInt(entry.weightKg),
      duration_minutes: parsePositiveInt(entry.durationMinutes),
      target_minutes: parsePositiveInt(entry.targetMinutes),
      tracked_seconds: entry.trackedSeconds,
      notes: entry.notes.trim() || null,
    }));

    let upsertResult = await supabase
      .from("daily_entries")
      .upsert(payloadWithTimers, { onConflict: "user_id,entry_date,category,exercise" });

    if (
      upsertResult.error?.message.includes("sets") ||
      upsertResult.error?.message.includes("completed_sets") ||
      upsertResult.error?.message.includes("weight_kg") ||
      upsertResult.error?.message.includes("target_minutes") ||
      upsertResult.error?.message.includes("tracked_seconds")
    ) {
      const payloadFallback = visibleEntries.map((entry) => ({
        user_id: session.user.id,
        entry_date: selectedDate,
        category: selectedCategory,
        exercise: entry.exercise,
        completed: entry.completed,
        reps: parsePositiveInt(entry.reps),
        duration_minutes: parsePositiveInt(entry.durationMinutes),
        notes: entry.notes.trim() || null,
      }));
      upsertResult = await supabase
        .from("daily_entries")
        .upsert(payloadFallback, { onConflict: "user_id,entry_date,category,exercise" });
    }

    if (upsertResult.error) {
      setErrorText(upsertResult.error.message);
      return;
    }

    const reflectionResult = await supabase.from("daily_reflections").upsert(
      {
        user_id: session.user.id,
        entry_date: selectedDate,
        category: selectedCategory,
        mood: reflection.mood,
        reflection: reflection.text.trim(),
        overall_seconds: overallLiveSeconds,
      },
      { onConflict: "user_id,entry_date,category" },
    );

    if (
      reflectionResult.error &&
      !reflectionResult.error.message.includes("relation \"daily_reflections\" does not exist")
    ) {
      setErrorText(reflectionResult.error.message);
      return;
    }

    const profileSyncOk = await saveProfileToCloud(false);
    if (!profileSyncOk) {
      return;
    }

    if (reflection.text.trim()) {
      appendJournalArchive({
        dateKey: selectedDate,
        category: selectedCategory,
        mood: reflection.mood,
        text: reflection.text.trim(),
      });
    }

    setOverallBaseSeconds(overallLiveSeconds);
    setOverallStartedAtMs(null);
    setStatusText("Cloud-Sync gespeichert.");
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      setErrorText(error.message);
      return;
    }
    setStatusText("Abgemeldet.");
  };

  // Flow auto-advance with halfway alert for Morning, Yoga and Tabata
  useEffect(() => {
    if (!morningFlowActive || !isFlowCategory || !activeExerciseTimer) {
      return;
    }

    const elapsed = Math.floor((nowMs - activeExerciseTimer.startedAtMs) / 1000);
    const targetSeconds = getExerciseTargetSeconds(
      exerciseCustomSeconds,
      activeExerciseTimer.exercise,
      defaultFlowSeconds,
    );
    const halfwaySeconds = Math.floor(targetSeconds / 2);

    if (
      halfwayAlertEnabled &&
      elapsed >= halfwaySeconds &&
      elapsed < targetSeconds &&
      minuteAlertedExercise !== `halfway:${activeExerciseTimer.exercise}`
    ) {
      emitSwitchSignal();
      setMinuteAlertedExercise(`halfway:${activeExerciseTimer.exercise}`);
      setStatusText(`Halbzeit bei ${activeExerciseTimer.exercise} (${halfwaySeconds}s).`);
      return;
    }

    if (elapsed >= targetSeconds && minuteAlertedExercise !== activeExerciseTimer.exercise) {
      emitSwitchSignal();
      setMinuteAlertedExercise(activeExerciseTimer.exercise);
      setStatusText(`Zeit abgelaufen bei ${activeExerciseTimer.exercise} – weiter!`);
      handleEntryChange(activeExerciseTimer.exercise, { completed: true });
      advanceMorningFlow(activeExerciseTimer.exercise);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeExerciseTimer,
    exerciseCustomSeconds,
    halfwayAlertEnabled,
    isFlowCategory,
    defaultFlowSeconds,
    minuteAlertedExercise,
    morningFlowActive,
    nowMs,
  ]);

  const activeHeroExercise =
    isFlowCategory && morningFlowActive && activeExerciseTimer
      ? activeExerciseTimer.exercise
      : isFlowCategory
        ? (visibleEntries.find((e) => !e.completed)?.exercise ?? activeExercises[0])
        : null;

  const heroEntry = activeHeroExercise
    ? visibleEntries.find((e) => e.exercise === activeHeroExercise)
    : null;

  const heroTimerRunning =
    activeExerciseTimer?.exercise === activeHeroExercise ? activeExerciseTimer : null;

  const heroLiveSeconds =
    (heroEntry?.trackedSeconds ?? 0) +
    (heroTimerRunning ? Math.floor((nowMs - heroTimerRunning.startedAtMs) / 1000) : 0);

  const heroTargetSeconds = activeHeroExercise
    ? getExerciseTargetSeconds(exerciseCustomSeconds, activeHeroExercise, defaultFlowSeconds)
    : 60;

  const heroElapsed = heroTimerRunning
    ? Math.floor((nowMs - heroTimerRunning.startedAtMs) / 1000)
    : 0;

  const heroRemaining = Math.max(0, heroTargetSeconds - heroElapsed);

  const nextExerciseAfterHero = activeHeroExercise
    ? (() => {
        const idx = activeExercises.indexOf(activeHeroExercise);
        return activeExercises[idx + 1] ?? null;
      })()
    : null;

  const completedExercises = visibleEntries.filter((e) => e.completed).map((e) => e.exercise);

  const encouragementLine = encouragement[Math.floor(nowMs / 8000) % encouragement.length];

  const ringR = 48;
  const ringCircumference = 2 * Math.PI * ringR;
  const ringProgress =
    heroTargetSeconds > 0 ? Math.max(0, Math.min(1, heroRemaining / heroTargetSeconds)) : 0;
  const ringDashOffset = ringCircumference * (1 - ringProgress);

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

  const quickLoadFavorites = (favoritesByCategory[selectedCategory] ?? []).slice().reverse();
  const quickLoadBuilders = (workoutBuilderTemplates[selectedCategory] ?? []).slice().reverse();
  const routineComposerSelection = routineComposerByCategory[selectedCategory] ?? [];
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

  const loadLastQuickLoad = () => {
    if (!categoryLastQuickLoad) {
      setErrorText("Kein Quick-Load für diese Kategorie gespeichert.");
      return;
    }
    switch (categoryLastQuickLoad.type) {
      case "favorite":
        loadCategoryFavorite(categoryLastQuickLoad.name);
        break;
      case "builder":
        loadWorkoutBuilderTemplate(categoryLastQuickLoad.name);
        break;
      case "hit-set":
        loadHitWorkoutSet(categoryLastQuickLoad.name);
        break;
      case "bb-plan":
        if (bodybuildingPlanMap[categoryLastQuickLoad.name]) {
          applyPresetBodybuildingPlan(categoryLastQuickLoad.name);
        } else {
          loadBodybuildingPlan(categoryLastQuickLoad.name);
        }
        break;
      default:
        setErrorText("Unbekannter Quick-Load-Typ.");
    }
  };

  const runStickyDoneNext = () => {
    if (!currentWorkoutEntry) {
      return;
    }
    if (isBodybuilding) {
      completeBodybuildingAndNext(currentWorkoutEntry.exercise);
      const nextFocus =
        displayEntries.find((entry) => entry.exercise !== currentWorkoutEntry.exercise && !entry.completed)
          ?.exercise ?? null;
      if (nextFocus) {
        setWorkoutCardOpenExercise(nextFocus);
      }
      return;
    }
    handleCompletedToggle(currentWorkoutEntry.exercise, true);
    if (activeExerciseTimer?.exercise === currentWorkoutEntry.exercise) {
      pauseExerciseTimer(currentWorkoutEntry.exercise);
    }
    if (nextWorkoutExercise) {
      setWorkoutCardOpenExercise(nextWorkoutExercise);
      setStatusText(`Erledigt. Weiter mit: ${nextWorkoutExercise}`);
    } else {
      setStatusText("Workout abgeschlossen - starke Session!");
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
  const maxExerciseCount = Math.max(
    1,
    ...overviewStats.topExercises.map((exerciseItem) => exerciseItem.count),
  );
  const latestWeight = overviewStats.weightDailySeries[overviewStats.weightDailySeries.length - 1]?.value ?? null;
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
  const avgLast30Weight =
    overviewStats.weightDailySeries.length === 0
      ? null
      : (() => {
          const last30 = overviewStats.weightDailySeries.slice(-30).map((item) => item.value);
          return Math.round((last30.reduce((sum, value) => sum + value, 0) / last30.length) * 10) / 10;
        })();
  const avgPrev30Weight =
    overviewStats.weightDailySeries.length < 31
      ? null
      : (() => {
          const prev30 = overviewStats.weightDailySeries.slice(-60, -30).map((item) => item.value);
          if (prev30.length === 0) {
            return null;
          }
          return Math.round((prev30.reduce((sum, value) => sum + value, 0) / prev30.length) * 10) / 10;
        })();
  const weekReduction = avgLast7Weight !== null && avgPrev7Weight !== null ? avgPrev7Weight - avgLast7Weight : null;
  const monthReduction = avgLast30Weight !== null && avgPrev30Weight !== null ? avgPrev30Weight - avgLast30Weight : null;

  return (
    <section className="flex flex-1 flex-col gap-4 pb-32 sm:pb-28">
      {activeTab === "lite" && hiddenLiteHero ? (
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
            <h1 className="mt-2 text-2xl font-black text-rose-700 sm:text-3xl">
              Einfach machen Bljad. 💪 Für eine bessere Zukunft. Für LUIS. ❤️ 👨‍👩‍👦
            </h1>
          </div>
        </div>
      ) : (
        <header className="rounded-2xl bg-gradient-to-r from-teal-700 via-emerald-700 to-cyan-700 p-5 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100">
            Momentum Journal
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            Sportlich motivierend. Ruhig wie ein Tagebuch.
          </h1>
          <p className="mt-2 text-sm font-medium text-cyan-50">
            {encouragement[new Date().getDate() % encouragement.length]}
          </p>
        </header>
      )}

      {showOfflineCopyButton || activeTab === "lite" ? (
        <div className="flex gap-2 rounded-xl bg-slate-200 p-1.5 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setOverallStartedAtMs(null);
              setActiveExerciseTimer(null);
              setMorningFlowActive(false);
              setMinuteAlertedExercise(null);
              setActiveTab("cloud");
            }}
            className={`touch-manipulation flex-1 rounded-lg px-3 py-2.5 text-[15px] font-semibold ${
              activeTab === "cloud"
                ? "bg-white text-teal-800 shadow dark:bg-slate-900 dark:text-teal-300"
                : "text-slate-800 dark:text-slate-200"
            }`}
          >
            Cloud Journal
          </button>
          <button
            type="button"
            onClick={() => {
              setOverallStartedAtMs(null);
              setActiveExerciseTimer(null);
              setMorningFlowActive(false);
              setMinuteAlertedExercise(null);
              setActiveTab("lite");
            }}
            className={`touch-manipulation flex-1 rounded-lg px-3 py-2.5 text-[15px] font-semibold ${
              activeTab === "lite"
                ? "bg-white text-teal-800 shadow dark:bg-slate-900 dark:text-teal-300"
                : "text-slate-800 dark:text-slate-200"
            }`}
          >
            Offline Kopie
          </button>
        </div>
      ) : null}

      {showLiteLink ? (
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Direkt zur Lite-Ansicht:{" "}
          <Link className="text-teal-800 underline dark:text-teal-300" href="/lite">
            /lite
          </Link>
        </p>
      ) : null}

      <div className="relative rounded-xl border border-slate-300 bg-slate-100/90 p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
              Account
            </p>
            {activeTab === "cloud" ? (
              !supabaseReady ? (
                <p className="mt-1 text-sm font-medium text-rose-700 dark:text-rose-300">
                  Supabase noch nicht konfiguriert (.env.local).
                </p>
              ) : session ? (
                <div className="mt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      Eingeloggt: {session.user.email}
                    </span>
                    <button
                      type="button"
                      onClick={signOut}
                      className="touch-manipulation rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
                    >
                      Abmelden
                    </button>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                    Profilstatus:{" "}
                    {profileCloudStatus === "synced"
                      ? `Cloud-Sync aktiv${profileLastSyncAt ? ` (${new Date(profileLastSyncAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })})` : ""}`
                      : profileCloudStatus === "missing"
                        ? "Wird angelegt"
                        : profileCloudStatus === "unavailable"
                          ? "Cloud aktuell nicht erreichbar"
                          : "Warte auf ersten Sync"}
                  </p>
                </div>
              ) : (
                <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="deine@email.de"
                    className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    disabled={authBusy || !authEmail}
                    onClick={sendMagicLink}
                    className="touch-manipulation rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Magic Link senden
                  </button>
                </div>
              )
            ) : (
              <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                Offline Modus aktiv (lokale Speicherung).
              </p>
            )}
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
              {activeTab === "cloud" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void loadProfileFromCloud(true);
                    }}
                    className="touch-manipulation rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300"
                  >
                    Cloud laden
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveProfileToCloud(true);
                    }}
                    className="touch-manipulation rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Cloud speichern
                  </button>
                </div>
              ) : null}
            </div>
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

      <div className="flex gap-2 rounded-xl bg-slate-200 p-1.5 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setPageViewTab("training")}
          className={`touch-manipulation flex-1 rounded-lg px-3 py-2.5 text-[15px] font-semibold ${
            pageViewTab === "training"
              ? "bg-white text-teal-800 shadow dark:bg-slate-900 dark:text-teal-300"
              : "text-slate-800 dark:text-slate-200"
          }`}
        >
          Übungen
        </button>
        <button
          type="button"
          onClick={() => setPageViewTab("dashboard")}
          className={`touch-manipulation flex-1 rounded-lg px-3 py-2.5 text-[15px] font-semibold ${
            pageViewTab === "dashboard"
              ? "bg-white text-teal-800 shadow dark:bg-slate-900 dark:text-teal-300"
              : "text-slate-800 dark:text-slate-200"
          }`}
        >
          Activity Tracker
        </button>
      </div>

      <div className="w-full max-w-full overflow-x-hidden rounded-xl border border-slate-300 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4">
        {pageViewTab === "dashboard" ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
              Überblick
            </p>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
              {overviewStats.totalSessions} Sessions
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-emerald-700">Absolviert</p>
              <p className="mt-2 text-2xl font-black text-emerald-900">{overviewStats.totalSessions}</p>
            </div>
            <div className="rounded-lg bg-cyan-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-cyan-700">Übungen</p>
              <p className="mt-2 text-2xl font-black text-cyan-900">{overviewStats.totalCompleted}</p>
            </div>
            <div className="rounded-lg bg-violet-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-violet-700">Top Übung</p>
              <p className="mt-2 text-sm font-black text-violet-900">
                {overviewStats.topExercises[0]?.name ?? "Noch keine"}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-amber-700">Streak</p>
              <p className="mt-2 text-2xl font-black text-amber-900">
                {overviewStats.recent7Days.filter((day) => day.count > 0).length}
              </p>
            </div>
            <div className="rounded-lg bg-sky-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-sky-700">Aktuelles Gewicht</p>
              <p className="mt-2 text-2xl font-black text-sky-900">
                {latestWeight !== null ? `${latestWeight} ${weightUnitLabel}` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-indigo-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-indigo-700">Ø Woche / Monat</p>
              <p className="mt-2 text-sm font-black text-indigo-900">
                {avgLast7Weight !== null ? `${avgLast7Weight} ${weightUnitLabel}` : "—"} /{" "}
                {avgLast30Weight !== null ? `${avgLast30Weight} ${weightUnitLabel}` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-rose-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-rose-700">Reduktion Vorwoche</p>
              <p className="mt-2 text-sm font-black text-rose-900">
                {weekReduction !== null ? `${weekReduction > 0 ? "-" : "+"}${Math.abs(weekReduction).toFixed(1)} ${weightUnitLabel}` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-fuchsia-50 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-700">Reduktion Vormonat</p>
              <p className="mt-2 text-sm font-black text-fuchsia-900">
                {monthReduction !== null ? `${monthReduction > 0 ? "-" : "+"}${Math.abs(monthReduction).toFixed(1)} ${weightUnitLabel}` : "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
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
                      setMorningFlowActive(false);
                      setMinuteAlertedExercise(null);
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
                    <div className="mt-1 text-[10px] font-semibold text-slate-500">{day.count}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                Häufigste Übungen
              </p>
              <ul className="mt-2 space-y-2">
                {overviewStats.topExercises.length === 0 ? (
                  <li className="text-sm text-slate-500">Noch keine erledigten Übungen gespeichert.</li>
                ) : (
                  overviewStats.topExercises.map((item, index) => (
                    <li key={item.name} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm">
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

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                Gewichtstrend (14 Tage)
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

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                Übungsverteilung (Top 5)
              </p>
              {overviewStats.topExercises.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Noch keine erledigten Übungen vorhanden.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {overviewStats.topExercises.map((exerciseItem) => (
                    <div key={`exercise-bar-${exerciseItem.name}`}>
                      <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200">
                        <span className="truncate pr-2">{exerciseItem.name}</span>
                        <span>{exerciseItem.count}x</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-2 rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(8, (exerciseItem.count / maxExerciseCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
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
                    setMorningFlowActive(false);
                    setMinuteAlertedExercise(null);
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

        ) : null}

        {pageViewTab === "training" ? (
        <>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            Datum
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
                setMorningFlowActive(false);
                setMinuteAlertedExercise(null);
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
                setMorningFlowActive(false);
                setMinuteAlertedExercise(null);
                setHitCurrentRound(1);
                setBodybuildingFlowActive(false);
                setBodybuildingFocusExercise(null);
                setSelectedDate(getTodayDateKey());
              }}
              className="touch-manipulation rounded-lg border border-teal-500 bg-teal-50 px-3 py-2.5 font-semibold text-teal-800"
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
                setMorningFlowActive(false);
                setMinuteAlertedExercise(null);
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
        </div>

        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/80 p-3 dark:border-teal-900 dark:bg-teal-950/30">
        <p className="text-sm font-semibold text-teal-900 dark:text-teal-200">
          Routine Builder ({selectedCategory})
          </p>
        <p className="mt-1 text-xs text-teal-800 dark:text-teal-300">
          Stelle hier deine Routine zusammen. Das aktive Workout läuft separat im Bereich darunter.
          </p>
          <button
            type="button"
            onClick={() => setShowBuilderPanel((current) => !current)}
            className="mt-2 touch-manipulation rounded-lg border border-teal-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-teal-800 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-300"
          >
            {showBuilderPanel ? "Builder ausblenden" : "Builder anzeigen"}
          </button>
          {showBuilderPanel ? (
            <>
        <div className="mt-2 rounded-lg border border-teal-200 bg-slate-100 p-2 dark:border-teal-900 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
              Quick Start
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadLastQuickLoad}
                disabled={!categoryLastQuickLoad}
                className="touch-manipulation rounded-full bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                ⚡ Zuletzt genutzt laden
                {categoryLastQuickLoad ? ` (${categoryLastQuickLoad.name})` : ""}
              </button>
              {quickLoadFavorites.slice(0, 3).map((favorite) => (
                <button
                  key={`quick-favorite-${favorite.name}`}
                  type="button"
                  onClick={() => loadCategoryFavorite(favorite.name)}
                  className="touch-manipulation rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900"
                >
                  ☆ {favorite.name}
                </button>
              ))}
              {quickLoadBuilders.slice(0, 2).map((builder) => (
                <button
                  key={`quick-builder-${builder.name}`}
                  type="button"
                  onClick={() => loadWorkoutBuilderTemplate(builder.name)}
                  className="touch-manipulation rounded-full border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-900"
                >
                  ⚙ {builder.name}
                </button>
              ))}
              {isBodybuilding
                ? Object.keys(bodybuildingPlanMap)
                    .slice(0, 2)
                    .map((planName) => (
                      <button
                        key={`quick-bb-plan-${planName}`}
                        type="button"
                        onClick={() => applyPresetBodybuildingPlan(planName)}
                        className="touch-manipulation rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-900"
                      >
                        🏋 {planName}
                      </button>
                    ))
                : null}
            </div>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={workoutBuilderName}
              onChange={(event) => setWorkoutBuilderName(event.target.value)}
              placeholder="Name für Builder-Template"
              className="rounded-md border border-teal-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
            />
            <button
              type="button"
              onClick={saveWorkoutBuilderTemplate}
              className="touch-manipulation rounded-lg bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white"
            >
              Builder speichern
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              value={selectedWorkoutBuilderName}
              onChange={(event) => setSelectedWorkoutBuilderName(event.target.value)}
              className="rounded-md border border-teal-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
            >
              <option value="">Builder-Template wählen</option>
              {(workoutBuilderTemplates[selectedCategory] ?? []).map((template) => (
                <option key={`${template.category}-${template.name}`} value={template.name}>
                  {template.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => loadWorkoutBuilderTemplate()}
              className="touch-manipulation rounded-lg border border-teal-700 px-3 py-2.5 text-sm font-semibold text-teal-800"
            >
              Builder/Preset laden
            </button>
          </div>
          <div className="mt-2 rounded-lg border border-teal-200 bg-slate-100 p-2 dark:border-teal-900 dark:bg-slate-900/80">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
              Routine Composer
            </p>
            <p className="mt-1 text-[11px] text-teal-800/90 dark:text-teal-300">
              Markiere mehrere gespeicherte Builds (z. B. Brust + Arme) und kombiniere sie zu einer Routine.
            </p>
            {(workoutBuilderTemplates[selectedCategory] ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Noch keine Builder in dieser Kategorie gespeichert.
              </p>
            ) : (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {(workoutBuilderTemplates[selectedCategory] ?? []).map((template) => (
                  <label
                    key={`composer-${template.category}-${template.name}`}
                    className="flex items-center gap-2 rounded-md border border-teal-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 dark:border-teal-800 dark:bg-slate-950/60 dark:text-slate-100"
                  >
                    <input
                      type="checkbox"
                      checked={routineComposerSelection.includes(template.name)}
                      onChange={(event) =>
                        toggleRoutineComposerTemplate(template.name, event.target.checked)
                      }
                    />
                    {template.name}
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={combineRoutineComposerTemplates}
              className="mt-2 rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-semibold text-teal-900 dark:text-teal-300"
            >
              Ausgewählte Builds zur Routine kombinieren
            </button>
          </div>
          {isBodybuilding ? (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={newBodybuildingPlanName}
                  onChange={(event) => setNewBodybuildingPlanName(event.target.value)}
                  placeholder="Bodybuilding Planname"
                  className="rounded-md border border-teal-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                />
                <button
                  type="button"
                  onClick={saveBodybuildingPlan}
                  className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  Plan speichern
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <select
                  value={selectedBodybuildingPlanName}
                  onChange={(event) => setSelectedBodybuildingPlanName(event.target.value)}
                  className="rounded-md border border-teal-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Bodybuilding Plan wählen</option>
                  {Object.keys(bodybuildingPlanMap).map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                  {bodybuildingPlans.map((plan) => (
                    <option key={plan.name} value={plan.name}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (bodybuildingPlanMap[selectedBodybuildingPlanName]) {
                      applyPresetBodybuildingPlan(selectedBodybuildingPlanName);
                      return;
                    }
                    loadBodybuildingPlan();
                  }}
                  className="rounded-lg border border-indigo-700 px-3 py-2 text-sm font-semibold text-indigo-800"
                >
                  Plan laden
                </button>
              </div>
              <button
                type="button"
                onClick={applyBodybuildingSelection}
                className="mt-2 rounded-lg border border-indigo-700 px-3 py-2 text-xs font-semibold text-indigo-800"
              >
                Bodybuilding-Auswahl anwenden
              </button>
            </>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {builderMuscleGroups.map((group) => (
              <button
                key={`builder-group-${group}`}
                type="button"
                onClick={() => setSelectedBuilderMuscleGroup(group)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  selectedBuilderMuscleGroup === group
                    ? "bg-teal-700 text-white"
                    : "border border-teal-300 bg-slate-100 text-teal-800"
                }`}
              >
                {group}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedBuilderFields((current) => !current)}
            className="mt-2 rounded-lg border border-teal-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-teal-800"
          >
            {showAdvancedBuilderFields ? "Advanced Optionen ausblenden" : "Advanced Optionen anzeigen"}
          </button>
          <div className="mt-3 grid gap-2">
            {filteredBuilderEntries.length === 0 ? (
              <p className="rounded-md border border-teal-200 bg-slate-100 px-3 py-2 text-xs text-slate-600">
                Keine Übungen für diese Muskelgruppe in der aktuellen Kategorie.
              </p>
            ) : null}
            {filteredBuilderEntries.map((entry) => {
              const enabled = !hiddenExercises.includes(entry.exercise);
              const mappedGroup = resolveExerciseMuscleGroup(entry.exercise);
              return (
                <div
                  key={`builder-${entry.exercise}`}
                  className="rounded-md border border-teal-200 bg-slate-100 p-2"
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
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) =>
                          toggleBuilderExercise(entry.exercise, event.target.checked)
                        }
                      />
                      {entry.exercise}
                    </label>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                      {mappedGroup}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                      drag
                    </span>
                    {isFlowCategory ? (
                      <span className="text-xs text-slate-600">
                        {getExerciseTargetSeconds(
                          exerciseCustomSeconds,
                          entry.exercise,
                          defaultFlowSeconds,
                        )}
                        s
                      </span>
                    ) : null}
                  </div>
                  {enabled ? (
                    <>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                          Sätze
                          <input
                            type="number"
                            min={0}
                            value={entry.sets}
                            onChange={(event) =>
                              handleEntryChange(entry.exercise, { sets: event.target.value })
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                          Reps
                          <input
                            type="number"
                            min={0}
                            value={entry.reps}
                            onChange={(event) =>
                              handleEntryChange(entry.exercise, { reps: event.target.value })
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                          />
                        </label>
                        {isBodybuilding ? (
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Gewicht {weightUnitLabel}
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              value={entry.weightKg}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { weightKg: event.target.value })
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                            />
                          </label>
                        ) : null}
                        {isFlowCategory ? (
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Flow Sekunden
                            <input
                              type="number"
                              min={5}
                              max={600}
                              value={getExerciseTargetSeconds(
                                exerciseCustomSeconds,
                                entry.exercise,
                                defaultFlowSeconds,
                              )}
                              onChange={(event) =>
                                setExerciseCustomSeconds((current) => ({
                                  ...current,
                                  [entry.exercise]: Math.max(
                                    5,
                                    Number.parseInt(event.target.value || "5", 10),
                                  ),
                                }))
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                            />
                          </label>
                        ) : null}
                      </div>
                      {showAdvancedBuilderFields ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
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
                              className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Ziel min
                            <input
                              type="number"
                              min={0}
                              value={entry.targetMinutes}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, {
                                  targetMinutes: event.target.value,
                                })
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-slate-900"
                            />
                          </label>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
        ) : null}
        </div>

        {!isFlowCategory ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Aktives Workout</p>
              <div className="flex items-center gap-2">
                {isBodybuilding ? (
                  <button
                    type="button"
                    onClick={startBodybuildingFlow}
                    className="touch-manipulation rounded-md bg-indigo-700 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                  >
                    Fokus starten
                  </button>
                ) : null}
                {currentWorkoutEntry ? (
                  <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-900">
                    Fokus: {currentWorkoutEntry.exercise}
                  </span>
                ) : null}
              </div>
            </div>
            {!loadingEntries && displayEntries.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {displayEntries.map((entry, index) => (
                  <button
                    key={`queue-${entry.exercise}`}
                    type="button"
                    onClick={() => setWorkoutCardOpenExercise(entry.exercise)}
                    className={`touch-manipulation rounded-full border px-2.5 py-1.5 text-xs font-semibold ${
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
            {loadingEntries ? (
              <p className="mt-2 text-sm font-medium text-slate-700">Lade Cloud-Daten ...</p>
            ) : (
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
                      className={`rounded-xl border p-3 ${
                        isFocusedCard
                          ? "border-indigo-500 bg-indigo-50 shadow-sm dark:bg-indigo-950/40"
                          : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={entry.completed}
                            onChange={(event) =>
                              handleCompletedToggle(entry.exercise, event.target.checked)
                            }
                            className="mt-0.5 h-5 w-5 accent-indigo-700"
                          />
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.exercise}</span>
                        </label>
                        {isBodybuilding ? (
                          <button
                            type="button"
                            onClick={() => completeBodybuildingAndNext(entry.exercise)}
                            className="touch-manipulation rounded-md bg-indigo-700 px-2.5 py-1.5 text-xs font-semibold text-white"
                          >
                            Done & Next
                          </button>
                        ) : null}
                      </div>

                      {isFocusedCard ? (
                        <>
                          <div className="mt-3 rounded-md bg-cyan-50 px-2 py-2 dark:bg-cyan-950/30">
                            <p className="text-xs font-semibold text-cyan-900 dark:text-cyan-200">
                              Getrackte Zeit: {formatSeconds(liveTrackedSeconds)}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startExerciseTimer(entry.exercise)}
                                className="touch-manipulation rounded-md bg-cyan-700 px-2.5 py-1.5 text-xs font-semibold text-white"
                              >
                                Start
                              </button>
                              <button
                                type="button"
                                onClick={() => pauseExerciseTimer(entry.exercise)}
                                className="touch-manipulation rounded-md border border-cyan-700 px-2.5 py-1.5 text-xs font-semibold text-cyan-900"
                              >
                                Stop
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-4">
                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                              Sätze
                              <input
                                type="number"
                                min={0}
                                value={entry.sets}
                                onChange={(event) =>
                                  handleEntryChange(entry.exercise, { sets: event.target.value })
                                }
                                className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                              Reps
                              <input
                                type="number"
                                min={0}
                                value={entry.reps}
                                onChange={(event) =>
                                  handleEntryChange(entry.exercise, { reps: event.target.value })
                                }
                                className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                              Gewicht {weightUnitLabel}
                              <input
                                type="number"
                                min={0}
                                step="0.5"
                                value={entry.weightKg}
                                onChange={(event) =>
                                  handleEntryChange(entry.exercise, { weightKg: event.target.value })
                                }
                                className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
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
                                className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                              />
                            </label>
                          </div>

                          {Number.parseInt(entry.sets || "0", 10) > 0 ? (
                            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2">
                              <p className="text-xs font-semibold text-emerald-900">
                                Satz-Tracker: {entry.completedSets} / {entry.sets}
                              </p>
                              <div className="mt-1 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateCompletedSets(entry.exercise, -1)}
                                  className="touch-manipulation rounded border border-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-emerald-900"
                                >
                                  -1 Satz
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateCompletedSets(entry.exercise, 1)}
                                  className="touch-manipulation rounded bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white"
                                >
                                  +1 Satz done
                                </button>
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

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Favoriten (Quick Load)</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={newFavoriteName}
              onChange={(event) => setNewFavoriteName(event.target.value)}
              placeholder="Favoritenname"
              className="rounded-md border border-amber-300 bg-white px-2 py-2 text-sm text-slate-900"
            />
            <button
              type="button"
              onClick={saveCategoryFavorite}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Als Favorit speichern
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              value={selectedFavoriteName}
              onChange={(event) => setSelectedFavoriteName(event.target.value)}
              className="rounded-md border border-amber-300 bg-white px-2 py-2 text-sm text-slate-900"
            >
              <option value="">Favorit wählen</option>
              {(favoritesByCategory[selectedCategory] ?? []).map((favorite) => (
                <option key={`${favorite.category}-${favorite.name}`} value={favorite.name}>
                  {favorite.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => loadCategoryFavorite()}
              className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold text-amber-800"
            >
              Laden
            </button>
          </div>
          {quickLoadFavorites.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {quickLoadFavorites.slice(0, 6).map((favorite) => (
                <button
                  key={`favorite-chip-${favorite.name}`}
                  type="button"
                  onClick={() => loadCategoryFavorite(favorite.name)}
                  className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900"
                >
                  ⚡ {favorite.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isHitWorkout ? (
          <div className="mt-4 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3">
            <p className="text-sm font-semibold text-fuchsia-900">HIT Runden & Workout-Set</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-fuchsia-900">
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
                  className="rounded-md border border-fuchsia-300 bg-white px-2 py-1.5 text-slate-900"
                />
              </label>
              <div className="rounded-md border border-fuchsia-200 bg-white px-2 py-1.5 text-xs font-semibold text-fuchsia-900">
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
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={newHitSetName}
                onChange={(event) => setNewHitSetName(event.target.value)}
                placeholder="Name für HIT-Workout-Set"
                className="rounded-md border border-fuchsia-300 bg-white px-2 py-2 text-sm text-slate-900"
              />
              <button
                type="button"
                onClick={saveHitWorkoutSet}
                className="rounded-lg border border-fuchsia-600 px-3 py-2 text-sm font-semibold text-fuchsia-800"
              >
                Set speichern
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <select
                value={selectedHitSetName}
                onChange={(event) => setSelectedHitSetName(event.target.value)}
                className="rounded-md border border-fuchsia-300 bg-white px-2 py-2 text-sm text-slate-900"
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
                    className="rounded-full border border-fuchsia-300 bg-white px-2.5 py-1 text-xs font-semibold text-fuchsia-900"
                  >
                    ⚡ {setItem.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-950">
          Tagesfortschritt: <strong>{completedCount}</strong> / {visibleEntries.length} erledigt (
          {completionPercent}%)
        </div>

        <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
          <p className="text-sm font-semibold text-cyan-950">Overall Timer</p>
          <p className="mt-1 text-2xl font-bold text-cyan-900">{formatSeconds(overallLiveSeconds)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (!overallStartedAtMs) {
                  setOverallStartedAtMs(Date.now());
                }
              }}
              className="rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => {
                if (!overallStartedAtMs) {
                  return;
                }
                const delta = Math.max(0, Math.floor((Date.now() - overallStartedAtMs) / 1000));
                setOverallBaseSeconds((current) => current + delta);
                setOverallStartedAtMs(null);
              }}
              className="rounded-lg border border-cyan-700 px-3 py-1.5 text-sm font-semibold text-cyan-800"
            >
              Stop
            </button>
            <button
              type="button"
              onClick={() => {
                setOverallBaseSeconds(0);
                setOverallStartedAtMs(null);
              }}
              className="rounded-lg border border-rose-600 px-3 py-1.5 text-sm font-semibold text-rose-700"
            >
              Reset
            </button>
          </div>
        </div>

        {isFlowCategory ? (
          <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-950">
                {flowLabel} Flow
              </p>
              <div className="flex gap-2">
                {!morningFlowActive ? (
                  <button
                    type="button"
                    onClick={startMorningFlow}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    ▶ Flow starten
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeExerciseTimer) {
                        pauseExerciseTimer(activeExerciseTimer.exercise);
                      }
                      setMorningFlowActive(false);
                      setMinuteAlertedExercise(null);
                      setStatusText(`${flowLabel} Flow pausiert.`);
                    }}
                    className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-semibold text-emerald-900"
                  >
                    ⏸ Flow stoppen
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
                <input
                  type="checkbox"
                  checked={halfwayAlertEnabled}
                  onChange={(e) => setHalfwayAlertEnabled(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Halbzeit-Signal
              </label>
            </div>

            {completedExercises.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {completedExercises.map((ex) => (
                  <span
                    key={ex}
                    className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-900"
                  >
                    ✓ {ex}
                  </span>
                ))}
              </div>
            )}

            {activeHeroExercise ? (
              <div className="mt-3">
                <div className="rounded-2xl border-2 border-emerald-400 bg-slate-50 p-4 shadow-md dark:bg-slate-900">
                  <p className="text-center text-xl font-black text-emerald-900">
                    {activeHeroExercise}
                  </p>

                  <div className="mt-3 flex justify-center">
                    <div className="relative flex h-28 w-28 items-center justify-center">
                      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 112 112">
                        <circle
                          cx="56"
                          cy="56"
                          r={ringR}
                          fill="none"
                          stroke="#d1fae5"
                          strokeWidth="8"
                        />
                        <circle
                          cx="56"
                          cy="56"
                          r={ringR}
                          fill="none"
                          stroke="#059669"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          strokeDashoffset={ringDashOffset}
                          style={{ transition: "stroke-dashoffset 0.8s linear" }}
                        />
                      </svg>
                      <div className="z-10 text-center">
                        <p className="text-2xl font-black text-emerald-900">
                          {formatSeconds(heroRemaining)}
                        </p>
                        <p className="text-[10px] font-semibold text-emerald-700">verbleibend</p>
                      </div>
                    </div>
                  </div>

                  <p className="mt-2 text-center text-sm font-semibold text-cyan-800">
                    Getrackt: {formatSeconds(heroLiveSeconds)}
                  </p>

                  <div className="mt-3 flex h-24 items-center justify-center rounded-xl bg-slate-100 text-xs font-medium text-slate-400">
                    Bild / GIF kommt noch
                  </div>

                  <p className="mt-3 text-center text-xs italic text-emerald-700">
                    {encouragementLine}
                  </p>

                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {morningFlowActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          handleEntryChange(activeHeroExercise, { completed: true });
                          advanceMorningFlow(activeHeroExercise);
                        }}
                        className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow"
                      >
                        ✓ Done
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleEntryChange(activeHeroExercise, {
                            completed: !heroEntry?.completed,
                          })
                        }
                        className={`rounded-lg px-4 py-2 text-sm font-bold shadow ${
                          heroEntry?.completed
                            ? "bg-slate-300 text-slate-700"
                            : "bg-emerald-600 text-white"
                        }`}
                      >
                        {heroEntry?.completed ? "✓ Erledigt" : "Als erledigt markieren"}
                      </button>
                    )}
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500">
                      ⚙ Zielzeit anpassen
                    </summary>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={5}
                        max={600}
                        value={exerciseCustomSeconds[activeHeroExercise] ?? defaultFlowSeconds}
                        onChange={(e) => {
                          const val = Math.max(5, Number(e.target.value));
                          setExerciseCustomSeconds((prev) => ({
                            ...prev,
                            [activeHeroExercise]: val,
                          }));
                        }}
                        className="w-20 rounded-md border border-slate-400 px-2 py-1 text-sm text-slate-900"
                      />
                      <span className="text-xs text-slate-600">Sekunden</span>
                    </div>
                  </details>
                </div>

                {nextExerciseAfterHero && (
                  <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 opacity-70">
                    <p className="text-xs font-semibold text-emerald-700">Nächste Übung:</p>
                    <p className="text-sm font-bold text-emerald-900">{nextExerciseAfterHero}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-emerald-700">
                Alle Übungen erledigt – super gemacht! 🎉
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Stimmung & Tagesjournal</p>
            <button
              type="button"
              onClick={() => setShowJournalArchive((v) => !v)}
              className="rounded-lg border border-slate-400 px-2 py-1 text-xs font-semibold text-slate-700"
            >
              📖 Archiv {showJournalArchive ? "ausblenden" : "anzeigen"}
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[220px_1fr]">
            <select
              value={reflection.mood}
              onChange={(event) => {
                const mood = event.target.value;
                setReflection({ mood, text: moodTemplates[mood] ?? reflection.text });
              }}
              className="rounded-md border border-slate-400 px-2 py-2 text-sm text-slate-900"
            >
              {moodOptions.map((mood) => (
                <option key={mood} value={mood}>
                  {mood}
                </option>
              ))}
            </select>
            <div className="relative">
              <textarea
                value={reflection.text}
                onChange={(event) =>
                  setReflection((current) => ({ ...current, text: event.target.value }))
                }
                rows={3}
                className="w-full rounded-md border border-slate-400 px-2 py-2 pr-8 text-sm text-slate-900"
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
          </div>

          {showJournalArchive && (
            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                Archiv ({journalArchive.length} Einträge)
              </p>
              {journalArchive.length === 0 ? (
                <p className="text-xs text-slate-500">Noch keine archivierten Einträge.</p>
              ) : (
                [...journalArchive]
                  .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
                  .map((entry) => {
                    const archiveKey = `${entry.dateKey}:${entry.category}`;
                    const expanded = expandedArchiveKeys.has(archiveKey);
                    return (
                      <div
                        key={archiveKey}
                        className="mb-2 rounded-md border border-slate-200 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">{entry.dateKey}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {entry.category}
                          </span>
                          <span className="text-slate-600">{entry.mood}</span>
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

        <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">Übungen verwalten</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={newExerciseName}
              onChange={(event) => setNewExerciseName(event.target.value)}
              placeholder="Neue Übung hinzufügen"
              className="rounded-md border border-slate-400 px-2 py-2 text-sm text-slate-900"
            />
            <button
              type="button"
              onClick={addCustomExercise}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
            >
              Hinzufügen
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {allExercisesForCategory.map((exercise) => {
              const isCustom = customExercises.includes(exercise);
              const hidden = hiddenExercises.includes(exercise);
              return (
                <div
                  key={exercise}
                  className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-2 py-2"
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() => toggleExerciseVisibility(exercise)}
                    />
                    {exercise}
                  </label>
                  {isCustom ? (
                    <button
                      type="button"
                      onClick={() => removeCustomExercise(exercise)}
                      className="text-xs font-semibold text-rose-700"
                    >
                      Entfernen
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowExerciseLibrary((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            📋 Übungsübersicht {showExerciseLibrary ? "▲" : "▼"}
          </button>
          {showExerciseLibrary && (
            <div className="mt-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Übungsübersicht (alle Kategorien)</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {categories.map((category) => {
                  const customForCategory = customExercisesByCategory[category.name] ?? [];
                  const all = Array.from(new Set([...category.exercises, ...customForCategory]));
                  return (
                    <article key={category.name} className="rounded-md border border-slate-300 bg-white p-2">
                      <h3 className="text-sm font-bold text-slate-900">{category.name}</h3>
                      <p className="mt-1 text-xs text-slate-700">{all.length} Übungen</p>
                      <ul className="mt-2 list-disc pl-4 text-xs text-slate-800">
                        {all.map((exercise) => (
                          <li key={`${category.name}-${exercise}`}>{exercise}</li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 hidden grid gap-3">
          {loadingEntries ? (
            <p className="text-sm font-medium text-slate-700">Lade Cloud-Daten ...</p>
          ) : isFlowCategory ? null : (
            <>
              {isBodybuilding ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startBodybuildingFlow}
                    className="rounded-lg bg-indigo-700 px-2.5 py-1 text-xs font-semibold text-white"
                  >
                    Fokus starten
                  </button>
                  {bodybuildingFocusExercise ? (
                    <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-900">
                      Fokus: {bodybuildingFocusExercise}
                    </span>
                  ) : null}
                  {bodybuildingMuscleGroups.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => setBodybuildingMuscleFilter(group)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        bodybuildingMuscleFilter === group
                          ? "bg-indigo-700 text-white"
                          : "border border-indigo-300 bg-white text-indigo-700"
                      }`}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              ) : null}
              {displayEntries.map((entry) => {
                const timerRunning =
                  activeExerciseTimer?.exercise === entry.exercise ? activeExerciseTimer : null;
                const liveTrackedSeconds =
                  entry.trackedSeconds +
                  (timerRunning ? Math.floor((nowMs - timerRunning.startedAtMs) / 1000) : 0);

                return (
                  <article
                    key={entry.exercise}
                    className={`rounded-xl border p-3 ${
                      (isBodybuilding
                        ? bodybuildingFocusExercise === entry.exercise
                        : activeExerciseTimer?.exercise === entry.exercise)
                        ? "border-indigo-500 bg-indigo-50 shadow-sm"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={entry.completed}
                          onChange={(event) =>
                            handleCompletedToggle(entry.exercise, event.target.checked)
                          }
                          className="mt-1 h-5 w-5 accent-indigo-700"
                        />
                        <span className="text-sm font-semibold text-slate-900">{entry.exercise}</span>
                      </label>
                      {isBodybuilding ? (
                        <button
                          type="button"
                          onClick={() => completeBodybuildingAndNext(entry.exercise)}
                          className="rounded-md bg-indigo-700 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Done & Next
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 rounded-md bg-cyan-50 px-2 py-2">
                      <p className="text-xs font-semibold text-cyan-900">
                        Getrackte Zeit: {formatSeconds(liveTrackedSeconds)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startExerciseTimer(entry.exercise)}
                          className="rounded-md bg-cyan-700 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Start
                        </button>
                        <button
                          type="button"
                          onClick={() => pauseExerciseTimer(entry.exercise)}
                          className="rounded-md border border-cyan-700 px-2 py-1 text-xs font-semibold text-cyan-900"
                        >
                          Stop
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {isBodybuilding ? (
                        <>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Wiederholungen pro Satz
                            <input
                              type="number"
                              min={0}
                              value={entry.reps}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { reps: event.target.value })
                              }
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Gewicht ({weightUnitLabel})
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              value={entry.weightKg}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { weightKg: event.target.value })
                              }
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Sätze pro Übung
                            <input
                              type="number"
                              min={0}
                              value={entry.sets}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { sets: event.target.value })
                              }
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 sm:col-span-3">
                            Notiz
                            <textarea
                              value={entry.notes}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { notes: event.target.value })
                              }
                              rows={2}
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Zielzeit in Minuten (optional)
                            <input
                              type="number"
                              min={0}
                              value={entry.targetMinutes}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { targetMinutes: event.target.value })
                              }
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Wiederholungen (optional)
                            <input
                              type="number"
                              min={0}
                              value={entry.reps}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { reps: event.target.value })
                              }
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Sätze (optional)
                            <input
                              type="number"
                              min={0}
                              value={entry.sets}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { sets: event.target.value })
                              }
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900">
                            Dauer in Minuten (optional)
                            <input
                              type="number"
                              min={0}
                              value={entry.durationMinutes}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, {
                                  durationMinutes: event.target.value,
                                })
                              }
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-900 sm:col-span-3">
                            Notiz (optional)
                            <textarea
                              value={entry.notes}
                              onChange={(event) =>
                                handleEntryChange(entry.exercise, { notes: event.target.value })
                              }
                              rows={2}
                              className="rounded-md border border-slate-400 px-2 py-1.5 text-slate-900"
                            />
                          </label>
                        </>
                      )}
                    </div>
                    {Number.parseInt(entry.sets || "0", 10) > 0 ? (
                      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2">
                        <p className="text-xs font-semibold text-emerald-900">
                          Satz-Tracker: {entry.completedSets} / {entry.sets}
                        </p>
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateCompletedSets(entry.exercise, -1)}
                            className="rounded border border-emerald-600 px-2 py-1 text-xs font-semibold text-emerald-900"
                          >
                            -1 Satz
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCompletedSets(entry.exercise, 1)}
                            className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white"
                          >
                            +1 Satz done
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {activeTab === "cloud" ? (
            <button
              type="button"
              onClick={saveCloud}
              disabled={!session}
              className="touch-manipulation rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cloud-Sync speichern
            </button>
          ) : (
            <button
              type="button"
              onClick={saveLite}
              className="touch-manipulation rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Offline speichern
            </button>
          )}
          {activeTab === "lite" ? (
            <>
              <button
                type="button"
                onClick={triggerOfflineImport}
                className="touch-manipulation rounded-lg border border-indigo-600 px-4 py-2.5 text-sm font-semibold text-indigo-800"
              >
                Offline laden
              </button>
              <button
                type="button"
                onClick={exportOfflineData}
                className="touch-manipulation rounded-lg border border-slate-400 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Datei exportieren
              </button>
              <input
                ref={offlineImportRef}
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  void handleOfflineImport(event);
                }}
                className="hidden"
              />
            </>
          ) : null}
        </div>
        </>
        ) : null}

        {statusText ? <p className="mt-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300">{statusText}</p> : null}
        {errorText ? <p className="mt-2 text-sm font-semibold text-rose-800 dark:text-rose-300">{errorText}</p> : null}
      </div>

      {pageViewTab === "training" && !isFlowCategory && currentWorkoutEntry ? (
        <div className="fixed inset-x-3 bottom-2 z-30 rounded-2xl border border-slate-300 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:inset-x-auto sm:right-4 sm:w-[360px] sm:pb-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Quick Logging
          </p>
          <p className="px-1 text-xs font-semibold text-slate-900 dark:text-slate-100">{currentWorkoutEntry.exercise}</p>
          <div className="mt-2 grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={runStickyDoneNext}
              className="touch-manipulation col-span-2 min-h-11 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white"
            >
              ✓ Done & Next
            </button>
            <button
              type="button"
              onClick={() =>
                handleCompletedToggle(currentWorkoutEntry.exercise, !currentWorkoutEntry.completed)
              }
              className="touch-manipulation min-h-11 rounded-lg border border-slate-400 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              {currentWorkoutEntry.completed ? "Undo" : "Done"}
            </button>
            <button
              type="button"
              onClick={() => startExerciseTimer(currentWorkoutEntry.exercise)}
              className="touch-manipulation min-h-11 rounded-lg bg-cyan-700 px-3 py-2.5 text-xs font-semibold text-white"
            >
              Timer Start
            </button>
            <button
              type="button"
              onClick={() => pauseExerciseTimer(currentWorkoutEntry.exercise)}
              className="touch-manipulation min-h-11 rounded-lg border border-cyan-700 px-3 py-2.5 text-xs font-semibold text-cyan-900 dark:text-cyan-300"
            >
              Timer Stop
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeTab === "cloud") {
                  void saveCloud();
                } else {
                  saveLite();
                }
              }}
              className="touch-manipulation min-h-11 rounded-lg border border-indigo-500 px-3 py-2.5 text-xs font-semibold text-indigo-800 dark:text-indigo-300"
            >
              {activeTab === "cloud" ? "Cloud Save" : "Offline Save"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
