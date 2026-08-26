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
  notes: string;
};

type CloudRow = {
  exercise: string;
  completed: boolean;
  reps: number | null;
  duration_minutes: number | null;
  notes: string | null;
};

const encouragement = [
  "Dranbleiben: 1% besser jeden Tag.",
  "Fokus, Atem, Bewegung - du bist im Flow.",
  "Sanfte Disziplin ist starke Disziplin.",
];

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function buildDefaultEntries(exercises: string[]): EntryState[] {
  return exercises.map((exercise) => ({
    exercise,
    completed: false,
    reps: "",
    durationMinutes: "",
    notes: "",
  }));
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
      notes: row?.notes ?? "",
    };
  });
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
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const activeExercises = useMemo(() => {
    const category = categories.find((item) => item.name === selectedCategory);
    return category?.exercises ?? [];
  }, [categories, selectedCategory]);

  const completedCount = entries.filter((entry) => entry.completed).length;
  const completionPercent =
    entries.length === 0 ? 0 : Math.round((completedCount / entries.length) * 100);

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
    if (activeTab !== "cloud" || !session?.user.id) {
      return;
    }

    if (!supabase) {
      return;
    }

    let disposed = false;
    const loadEntries = async () => {
      setLoadingEntries(true);
      setErrorText("");

      const { data, error } = await supabase
        .from("daily_entries")
        .select("exercise,completed,reps,duration_minutes,notes")
        .eq("user_id", session.user.id)
        .eq("entry_date", selectedDate)
        .eq("category", selectedCategory);

      if (disposed) {
        return;
      }
      if (error) {
        setErrorText(error.message);
        setLoadingEntries(false);
        return;
      }

      const rows = (data ?? []) as CloudRow[];
      setEntries(toEntryMap(rows, activeExercises));
      setLoadingEntries(false);
    };

    void loadEntries();

    return () => {
      disposed = true;
    };
  }, [activeExercises, activeTab, selectedCategory, selectedDate, session?.user.id, supabase]);

  useEffect(() => {
    if (activeTab !== "lite") {
      return;
    }

    const loadLiteEntries = async () => {
      const key = localStorageKey(selectedDate, selectedCategory);
      const raw = localStorage.getItem(key);
      if (!raw) {
        setEntries(buildDefaultEntries(activeExercises));
        return;
      }

      try {
        const parsed = JSON.parse(raw) as EntryState[];
        const normalized = activeExercises.map((exercise) => {
          const found = parsed.find((entry) => entry.exercise === exercise);
          return found ?? {
            exercise,
            completed: false,
            reps: "",
            durationMinutes: "",
            notes: "",
          };
        });
        setEntries(normalized);
        setErrorText("");
      } catch (error) {
        setEntries(buildDefaultEntries(activeExercises));
        setErrorText(`Lokale Daten sind ungültig: ${String(error)}`);
      }
    };

    void loadLiteEntries();
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
    const key = localStorageKey(selectedDate, selectedCategory);
    localStorage.setItem(key, JSON.stringify(entries));
    setStatusText("Offline-Lite gespeichert.");
    setErrorText("");
  };

  const saveCloud = async () => {
    if (!supabase || !session?.user.id) {
      setErrorText("Nicht angemeldet oder Supabase nicht konfiguriert.");
      return;
    }

    setStatusText("");
    setErrorText("");

    const payload = entries.map((entry) => ({
      user_id: session.user.id,
      entry_date: selectedDate,
      category: selectedCategory,
      exercise: entry.exercise,
      completed: entry.completed,
      reps: parsePositiveInt(entry.reps),
      duration_minutes: parsePositiveInt(entry.durationMinutes),
      notes: entry.notes.trim() || null,
    }));

    const { error } = await supabase
      .from("daily_entries")
      .upsert(payload, { onConflict: "user_id,entry_date,category,exercise" });

    if (error) {
      setErrorText(error.message);
      return;
    }

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
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-100">Momentum Journal</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          Sportlich motivierend. Ruhig wie ein Tagebuch.
        </h1>
        <p className="mt-2 text-sm text-cyan-50">
          {encouragement[new Date().getDate() % encouragement.length]}
        </p>
      </header>

      <div className="flex gap-2 rounded-xl bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("cloud")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
            activeTab === "cloud" ? "bg-white text-teal-700 shadow" : "text-zinc-600"
          }`}
        >
          Cloud Journal
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("lite")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
            activeTab === "lite" ? "bg-white text-teal-700 shadow" : "text-zinc-600"
          }`}
        >
          Offline Lite
        </button>
      </div>

      {showLiteLink ? (
        <p className="text-xs text-zinc-500">
          Direkt zur Lite-Ansicht:{" "}
          <Link className="text-teal-700 underline" href="/lite">
            /lite
          </Link>
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Datum
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Kategorie
            <select
              value={selectedCategory}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setSelectedCategory(nextCategory);
                const nextExercises =
                  categories.find((category) => category.name === nextCategory)?.exercises ??
                  [];
                setEntries(buildDefaultEntries(nextExercises));
              }}
              className="rounded-lg border border-zinc-300 px-3 py-2"
            >
              {categories.map((category) => (
                <option key={category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Tagesfortschritt: <strong>{completedCount}</strong> / {entries.length} erledigt (
          {completionPercent}%)
        </div>

        {activeTab === "cloud" ? (
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-3">
            {!supabaseReady ? (
              <p className="text-sm text-teal-900">
                Supabase ist noch nicht konfiguriert. Trage zuerst die Variablen in
                <code className="mx-1 rounded bg-white px-1 py-0.5">.env.local</code> ein.
              </p>
            ) : session ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-teal-900">
                  Angemeldet als <strong>{session.user.email}</strong>
                </p>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-teal-700 px-3 py-1 text-sm font-medium text-teal-700"
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
                  className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm"
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
          <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
            Dieser Tab bleibt komplett lokal im Browser gespeichert und funktioniert ohne
            Login.
          </div>
        )}

        <div className="mt-4 grid gap-3">
          {loadingEntries ? (
            <p className="text-sm text-zinc-500">Lade Cloud-Daten ...</p>
          ) : (
            entries.map((entry) => (
              <article key={entry.exercise} className="rounded-xl border border-zinc-200 p-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={entry.completed}
                    onChange={(event) =>
                      handleEntryChange(entry.exercise, { completed: event.target.checked })
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span className="text-sm font-medium">{entry.exercise}</span>
                </label>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs">
                    Wiederholungen (optional)
                    <input
                      type="number"
                      min={0}
                      value={entry.reps}
                      onChange={(event) =>
                        handleEntryChange(entry.exercise, { reps: event.target.value })
                      }
                      className="rounded-md border border-zinc-300 px-2 py-1.5"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
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
                      className="rounded-md border border-zinc-300 px-2 py-1.5"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs sm:col-span-3">
                    Notiz (optional)
                    <textarea
                      value={entry.notes}
                      onChange={(event) =>
                        handleEntryChange(entry.exercise, { notes: event.target.value })
                      }
                      rows={2}
                      className="rounded-md border border-zinc-300 px-2 py-1.5"
                    />
                  </label>
                </div>
              </article>
            ))
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

        {statusText ? <p className="mt-3 text-sm text-emerald-700">{statusText}</p> : null}
        {errorText ? <p className="mt-2 text-sm text-rose-700">{errorText}</p> : null}
      </div>
    </section>
  );
}
