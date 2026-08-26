"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { JournalCategory } from "@/lib/exercises";
import { getSupabaseClient } from "@/lib/supabase";

type RoutineJournalProps = {
  initialTab: "cloud" | "lite";
  categories: JournalCategory[];
  showLiteLink?: boolean;
};

type JournalTab = "cloud" | "lite";

type EntryState = {
  exercise: string;
  completed: boolean;
  reps: string;
  durationMinutes: string;
  targetMinutes: string;
  trackedSeconds: number;
  notes: string;
};

type CloudRow = {
  exercise: string;
  completed: boolean;
  reps: number | null;
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

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
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
      durationMinutes: row?.durationMinutes ?? "",
      targetMinutes: row?.targetMinutes ?? "",
      trackedSeconds: row?.trackedSeconds ?? 0,
      notes: row?.notes ?? "",
    };
  });
}

export function RoutineJournal({
  initialTab,
  categories,
  showLiteLink = false,
}: RoutineJournalProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const supabaseReady = Boolean(supabase);

  const [activeTab, setActiveTab] = useState<JournalTab>(initialTab);
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.name ?? "");
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
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

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);

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

  const visibleEntries = useMemo(() => {
    const map = new Map(entries.map((entry) => [entry.exercise, entry]));
    return activeExercises.map(
      (exercise) =>
        map.get(exercise) ?? {
          exercise,
          completed: false,
          reps: "",
          durationMinutes: "",
          targetMinutes: "",
          trackedSeconds: 0,
          notes: "",
        },
    );
  }, [activeExercises, entries]);

  const completedCount = visibleEntries.filter((entry) => entry.completed).length;
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

  const startExerciseTimer = (exercise: string) => {
    if (activeExerciseTimer) {
      pauseExerciseTimer(activeExerciseTimer.exercise);
    }
    setActiveExerciseTimer({ exercise, startedAtMs: Date.now() });
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

  return (
    <section className="flex flex-1 flex-col gap-4">
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

      <div className="flex gap-2 rounded-xl bg-slate-200 p-1">
        <button
          type="button"
          onClick={() => {
            setOverallStartedAtMs(null);
            setActiveExerciseTimer(null);
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
            setActiveTab("lite");
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
            activeTab === "lite" ? "bg-white text-teal-800 shadow" : "text-slate-800"
          }`}
        >
          Offline Lite
        </button>
      </div>

      {showLiteLink ? (
        <p className="text-sm font-medium text-slate-700">
          Direkt zur Lite-Ansicht:{" "}
          <Link className="text-teal-800 underline" href="/lite">
            /lite
          </Link>
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-900">
            Datum
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
                setSelectedDate(event.target.value);
              }}
              className="rounded-lg border border-slate-400 px-3 py-2 text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-900 sm:col-span-2">
            Kategorie
            <select
              value={selectedCategory}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setOverallStartedAtMs(null);
                setActiveExerciseTimer(null);
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
          <p className="text-sm font-semibold text-slate-900">Stimmung & Tagesjournal</p>
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
            <textarea
              value={reflection.text}
              onChange={(event) =>
                setReflection((current) => ({ ...current, text: event.target.value }))
              }
              rows={3}
              className="rounded-md border border-slate-400 px-2 py-2 text-sm text-slate-900"
            />
          </div>
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

        <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3">
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

        <div className="mt-4 grid gap-3">
          {loadingEntries ? (
            <p className="text-sm font-medium text-slate-700">Lade Cloud-Daten ...</p>
          ) : (
            visibleEntries.map((entry) => {
              const timerRunning =
                activeExerciseTimer?.exercise === entry.exercise ? activeExerciseTimer : null;
              const liveTrackedSeconds =
                entry.trackedSeconds +
                (timerRunning ? Math.floor((nowMs - timerRunning.startedAtMs) / 1000) : 0);

              return (
                <article key={entry.exercise} className="rounded-xl border border-slate-300 p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={entry.completed}
                      onChange={(event) =>
                        handleEntryChange(entry.exercise, { completed: event.target.checked })
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
                  </div>
                </article>
              );
            })
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
