"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { JournalCategory } from "@/lib/exercises";
import { getSupabaseClient } from "@/lib/supabase";

type RoutineJournalProps = {
  initialTab: "cloud" | "lite";
  categories: JournalCategory[];
  showLiteLink?: boolean;
  showOfflineCopyButton?: boolean;
  hiddenLiteHero?: boolean;
};

type JournalTab = "cloud" | "lite";

type EntryState = {
  exercise: string;
  completed: boolean;
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
  Brust: ["Bench Press", "Incline Dumbbell Press", "Chest Dip", "Cable Fly"],
  Rücken: ["Barbell Row", "One-Arm Dumbbell Row", "Pull-Up", "Lat Pulldown"],
  Schultern: ["Overhead Press", "Dumbbell Shoulder Press", "Lateral Raise"],
  Arme: ["Dumbbell Curl", "Barbell Curl", "Triceps Dip", "Skull Crusher"],
  Beine: ["Barbell Squat", "Goblet Squat", "Romanian Deadlift", "Walking Lunge", "Leg Press", "Seated Leg Curl"],
  Core: [],
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
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.name ?? "");
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [bodybuildingPlan, setBodybuildingPlan] = useState("Push / Pull / Legs");
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

  const overviewStats = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        totalSessions: 0,
        totalCompleted: 0,
        topExercises: [] as Array<{ name: string; count: number }>,
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

        const parsed = JSON.parse(raw) as LiteDayPayload | EntryState[];
        const dayEntries = Array.isArray(parsed) ? parsed : parsed.entries ?? [];
        const completedEntries = dayEntries.filter((entry) => entry.completed);

        if (completedEntries.length > 0) {
          totalSessions += 1;
          const dateKey = key.replace("momentum-lite:", "").split(":")[0];
          dayDone.set(dateKey, true);
        }
        totalCompleted += completedEntries.length;

        for (const entry of completedEntries) {
          exerciseCounts.set(entry.exercise, (exerciseCounts.get(entry.exercise) ?? 0) + 1);
        }

        if (!Array.isArray(parsed) && parsed.entries) {
          const dateKey = key.replace("momentum-lite:", "").split(":")[0];
          if (counts.has(dateKey)) {
            counts.set(dateKey, (counts.get(dateKey) ?? 0) + completedEntries.length);
          }
          if (completedEntries.length > 0) {
            dayDone.set(dateKey, true);
          }
        }
      } catch {
        // ignore invalid cached data
      }
    }

    return {
      totalSessions,
      totalCompleted,
      topExercises: Array.from(exerciseCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
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

  const activeExercises = useMemo(() => {
    return allExercisesForCategory.filter((exercise) => !hiddenExercises.includes(exercise));
  }, [allExercisesForCategory, hiddenExercises]);

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
          reps: "",
          weightKg: "",
          durationMinutes: "",
          targetMinutes: "",
          trackedSeconds: 0,
          notes: "",
        },
    );
  }, [activeExercises, entries, filteredBodybuildingExercises, selectedCategory]);

  const completedCount = visibleEntries.filter((entry) => entry.completed).length;
  const isMorningRoutine = selectedCategory === "Morning Routine";
  const isTabata = selectedCategory === "Tabata";
  const isBodybuilding = selectedCategory === "Bodybuilding";
  const isFlowCategory = isMorningRoutine || isTabata;
  const completionPercent =
    visibleEntries.length === 0
      ? 0
      : Math.round((completedCount / visibleEntries.length) * 100);

  const overallLiveSeconds =
    overallBaseSeconds +
    (overallStartedAtMs ? Math.floor((nowMs - overallStartedAtMs) / 1000) : 0);

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
          "exercise,completed,reps,duration_minutes,target_minutes,tracked_seconds,notes",
        )
        .eq("user_id", session.user.id)
        .eq("entry_date", selectedDate)
        .eq("category", selectedCategory);

      let rows: CloudRow[] = [];
      let error = selectWithTimers.error;

      if (
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
        `${isTabata ? "Tabata" : "Morning"} Flow abgeschlossen - stark durchgezogen!`,
      );
      return;
    }

    setMinuteAlertedExercise(null);
    setActiveExerciseTimer({ exercise: nextExercise, startedAtMs: Date.now() });
    setStatusText(`Weiter mit: ${nextExercise}`);
  };

  const handleCompletedToggle = (exercise: string, checked: boolean) => {
    handleEntryChange(exercise, { completed: checked });

    if (!checked || !isFlowCategory || !morningFlowActive) {
      return;
    }

    advanceMorningFlow(exercise);
  };

  const startMorningFlow = () => {
    if (!isFlowCategory || activeExercises.length === 0) {
      setErrorText("Morning Flow / Tabata Flow ist nur in den passenden Kategorien verfügbar.");
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
      `${isTabata ? "Tabata" : "Morning"} Flow gestartet mit: ${firstExercise}`,
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
        weight_kg: parsePositiveInt(entry.weightKg),
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

  // Flow auto-advance with halfway alert for Morning Routine and Tabata
  useEffect(() => {
    if (!morningFlowActive || !isFlowCategory || !activeExerciseTimer) {
      return;
    }

    const elapsed = Math.floor((nowMs - activeExerciseTimer.startedAtMs) / 1000);
    const targetSeconds = getExerciseTargetSeconds(
      exerciseCustomSeconds,
      activeExerciseTimer.exercise,
      isTabata ? 20 : 60,
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
    isTabata,
    minuteAlertedExercise,
    morningFlowActive,
    nowMs,
  ]);

  const activeHeroExercise =
    (isMorningRoutine || isTabata) && morningFlowActive && activeExerciseTimer
      ? activeExerciseTimer.exercise
      : isMorningRoutine || isTabata
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
    ? getExerciseTargetSeconds(exerciseCustomSeconds, activeHeroExercise)
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

  const displayEntries = selectedCategory === "Bodybuilding" ? visibleEntries : visibleEntries;

  return (
    <section className="flex flex-1 flex-col gap-4">
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
        <div className="flex gap-2 rounded-xl bg-slate-200 p-1">
          <button
            type="button"
            onClick={() => {
              setOverallStartedAtMs(null);
              setActiveExerciseTimer(null);
              setMorningFlowActive(false);
              setMinuteAlertedExercise(null);
              setActiveTab("cloud");
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
              activeTab === "cloud" ? "bg-white text-teal-800 shadow" : "text-slate-800"
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
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
              activeTab === "lite" ? "bg-white text-teal-800 shadow" : "text-slate-800"
            }`}
          >
            Offline Kopie
          </button>
        </div>
      ) : null}

      {showLiteLink ? (
        <p className="text-sm font-medium text-slate-700">
          Direkt zur Lite-Ansicht:{" "}
          <Link className="text-teal-800 underline" href="/lite">
            /lite
          </Link>
        </p>
      ) : null}

      <div className="w-full max-w-full overflow-x-hidden rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-700">
              Überblick
            </p>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
              {overviewStats.totalSessions} Sessions
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
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
                      setSelectedDate(day.key);
                    }}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-center transition hover:border-teal-400 hover:bg-teal-50"
                  >
                    <div className="text-[10px] font-semibold uppercase text-slate-500">
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
                      <span className="font-medium text-slate-700">
                        {index + 1}. {item.name}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">
                        {item.count}x
                      </span>
                    </li>
                  ))
                )}
              </ul>
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
                    setSelectedDate(day.key);
                  }}
                  className={`rounded-md border p-1 text-center text-[11px] font-semibold transition ${
                    day.done
                      ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-400"
                  }`}
                >
                  <div>{day.day}</div>
                  <div className="text-[10px]">{day.done ? "✓" : ""}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-900">
            Datum
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
                setMorningFlowActive(false);
                setMinuteAlertedExercise(null);
                setSelectedDate(event.target.value);
              }}
              className="rounded-lg border border-slate-400 px-3 py-2 text-slate-900"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm font-medium text-slate-900">
            <span>Heute</span>
            <button
              type="button"
              onClick={() => {
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
                setMorningFlowActive(false);
                setMinuteAlertedExercise(null);
                setSelectedDate(getTodayDateKey());
              }}
              className="rounded-lg border border-teal-500 bg-teal-50 px-3 py-2 font-semibold text-teal-800"
            >
              Today
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 sm:col-span-2">
            Kategorie
            <select
              value={selectedCategory}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
                setMorningFlowActive(false);
                setMinuteAlertedExercise(null);
                setSelectedCategory(nextCategory);
              }}
              className="rounded-lg border border-slate-400 px-3 py-2 text-slate-900"
            >
              {categories.map((category) => (
                <option key={category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isBodybuilding ? (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-indigo-900">
              Trainingsplan
              <select
                value={bodybuildingPlan}
                onChange={(event) => setBodybuildingPlan(event.target.value)}
                className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-slate-900"
              >
                {Object.keys(bodybuildingPlanMap).map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
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

        {isMorningRoutine || isTabata ? (
          <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-950">
                {isTabata ? "Tabata Flow" : "Morning Flow"}
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
                      setStatusText(`${isTabata ? "Tabata" : "Morning"} Flow pausiert.`);
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
                <div className="rounded-2xl border-2 border-emerald-400 bg-white p-4 shadow-md">
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
                        value={exerciseCustomSeconds[activeHeroExercise] ?? 60}
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

        {activeTab === "cloud" ? (
          <div className="mt-4 rounded-lg border border-teal-300 bg-teal-100 p-3">
            {!supabaseReady ? (
              <p className="text-sm font-medium text-teal-950">
                Supabase ist noch nicht konfiguriert. Trage zuerst die Variablen in
                <code className="mx-1 rounded bg-white px-1 py-0.5">.env.local</code> ein.
              </p>
            ) : session ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-teal-950">
                  Angemeldet als <strong>{session.user.email}</strong>
                </p>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-teal-700 px-3 py-1 text-sm font-semibold text-teal-800"
                >
                  Abmelden
                </button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="deine@email.de"
                  className="rounded-lg border border-teal-400 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <button
                  type="button"
                  disabled={authBusy || !authEmail}
                  onClick={sendMagicLink}
                  className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Magic Link senden
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-indigo-300 bg-indigo-100 p-3 text-sm font-medium text-indigo-950">
            Dieser Tab bleibt komplett lokal im Browser gespeichert und funktioniert ohne
            Login.
          </div>
        )}

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

        <div className="mt-4 grid gap-3">
          {loadingEntries ? (
            <p className="text-sm font-medium text-slate-700">Lade Cloud-Daten ...</p>
          ) : isMorningRoutine || isTabata ? null : (
            <>
              {isBodybuilding ? (
                <div className="flex flex-wrap gap-2">
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
                      activeExerciseTimer?.exercise === entry.exercise
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={entry.completed}
                        onChange={(event) =>
                          handleCompletedToggle(entry.exercise, event.target.checked)
                        }
                        className="mt-1 h-4 w-4"
                      />
                      <span className="text-sm font-semibold text-slate-900">{entry.exercise}</span>
                    </label>

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
                            Wiederholungen
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
                            Gewicht (kg)
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
                            Zielzeit (min)
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
                  </article>
                );
              })}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {activeTab === "cloud" ? (
            <button
              type="button"
              onClick={saveCloud}
              disabled={!session}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cloud-Sync speichern
            </button>
          ) : (
            <button
              type="button"
              onClick={saveLite}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Offline speichern
            </button>
          )}
        </div>

        {statusText ? <p className="mt-3 text-sm font-semibold text-emerald-800">{statusText}</p> : null}
        {errorText ? <p className="mt-2 text-sm font-semibold text-rose-800">{errorText}</p> : null}
      </div>
    </section>
  );
}
