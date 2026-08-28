import type { SetKind } from "@/lib/set-types";

/**
 * Evidence-based preset routines.
 *
 * Volume/rep/rest prescriptions follow the current consensus literature:
 * - 10-20 hard sets per muscle per week (Schoenfeld/Grgic 2019; Krieger 2010)
 * - 5-30 reps all build muscle when taken close to failure (Schoenfeld 2017)
 * - >=2 min rest for hypertrophy, 3-5 min for maximal strength
 *   (Schoenfeld 2016; Willardson 2006)
 * - each muscle trained ~2x per week (Schoenfeld 2016 meta-analysis)
 */

export type PresetExercise = {
  exercise: string;
  /** Number of working sets (warmups are added separately). */
  sets: number;
  /** Prescription such as "8-12" or "20s". */
  reps: string;
  kind: SetKind;
  restSeconds: number;
  /** Sub-maximal ramp-up sets placed before the working sets. */
  warmupSets?: number;
  /** Seconds per exercise for timed/interval categories. */
  workSeconds?: number;
};

export type PresetRoutine = {
  name: string;
  category: string;
  /** One-line rationale shown in the builder. */
  note: string;
  exercises: PresetExercise[];
};

const hypertrophy = (
  exercise: string,
  sets: number,
  reps: string,
  restSeconds: number,
  warmupSets = 0,
): PresetExercise => ({ exercise, sets, reps, kind: "working", restSeconds, warmupSets });

const timed = (exercise: string, workSeconds: number, reps = ""): PresetExercise => ({
  exercise,
  sets: 1,
  reps,
  kind: "working",
  restSeconds: 0,
  workSeconds,
});

export const presetRoutines: PresetRoutine[] = [
  // ---------------------------------------------------------------- Bodybuilding
  {
    name: "PPL · Push",
    category: "Bodybuilding",
    note: "Push/Pull/Legs – ~20 Sätze Brust/Schulter/Trizeps pro Woche (Schoenfeld 2019).",
    exercises: [
      hypertrophy("Bench Press", 4, "4-6", 180, 3),
      hypertrophy("Incline Dumbbell Press", 3, "8-12", 120, 1),
      hypertrophy("Cable Fly", 3, "12-15", 90),
      hypertrophy("Overhead Press", 3, "6-10", 120, 1),
      hypertrophy("Lateral Raise", 4, "12-20", 60),
      hypertrophy("Cable Triceps Pushdown", 3, "10-15", 90),
      { exercise: "Skull Crusher", sets: 3, reps: "10-15", kind: "failure", restSeconds: 90 },
    ],
  },
  {
    name: "PPL · Pull",
    category: "Bodybuilding",
    note: "Rücken 2x/Woche, Zug schwer bis leicht kombiniert.",
    exercises: [
      hypertrophy("Deadlift", 3, "3-5", 210, 3),
      hypertrophy("Pull-Up", 4, "6-10", 120, 1),
      hypertrophy("Seated Cable Row", 3, "8-12", 120),
      hypertrophy("Face Pull", 3, "15-20", 90),
      hypertrophy("Rear Delt Fly", 3, "12-20", 60),
      hypertrophy("Barbell Curl", 3, "8-12", 90),
      { exercise: "Hammer Curl", sets: 3, reps: "10-15", kind: "failure", restSeconds: 90 },
    ],
  },
  {
    name: "PPL · Legs",
    category: "Bodybuilding",
    note: "~20 Sätze Quads, ~12 Hamstrings – im optimalen Volumenfenster.",
    exercises: [
      hypertrophy("Barbell Squat", 4, "4-6", 180, 3),
      hypertrophy("Romanian Deadlift", 3, "8-12", 120, 1),
      hypertrophy("Leg Press", 3, "10-15", 120),
      hypertrophy("Seated Leg Curl", 3, "10-15", 90),
      hypertrophy("Leg Extension", 3, "12-15", 90),
      hypertrophy("Barbell Hip Thrust", 3, "10-15", 90),
      hypertrophy("Standing Calf Raise", 4, "10-20", 60),
    ],
  },
  {
    name: "Upper/Lower · Upper A (Kraft)",
    category: "Bodybuilding",
    note: "4er-Split nach Helms/McDonald – bestes Verhältnis Frequenz zu Erholung.",
    exercises: [
      hypertrophy("Bench Press", 4, "4-6", 180, 3),
      hypertrophy("Barbell Row", 4, "4-6", 180, 2),
      hypertrophy("Overhead Press", 3, "6-8", 120, 1),
      hypertrophy("Pull-Up", 3, "6-8", 120),
      hypertrophy("Lateral Raise", 3, "12-15", 60),
      hypertrophy("Barbell Curl", 3, "8-10", 90),
      hypertrophy("Cable Triceps Pushdown", 3, "8-10", 90),
    ],
  },
  {
    name: "Upper/Lower · Upper B (Hypertrophie)",
    category: "Bodybuilding",
    note: "Zweiter Reiz derselben Muskeln im höheren Wiederholungsbereich.",
    exercises: [
      hypertrophy("Incline Dumbbell Press", 4, "8-12", 120, 2),
      hypertrophy("Seated Cable Row", 4, "8-12", 120),
      hypertrophy("Dumbbell Shoulder Press", 3, "10-15", 90),
      hypertrophy("Lat Pulldown", 3, "10-15", 90),
      { exercise: "Lateral Raise", sets: 3, reps: "15-20", kind: "superset", restSeconds: 60 },
      { exercise: "Face Pull", sets: 3, reps: "15-20", kind: "superset", restSeconds: 60 },
      { exercise: "Dumbbell Curl", sets: 3, reps: "12-15", kind: "dropset", restSeconds: 90 },
    ],
  },
  {
    name: "Upper/Lower · Lower A (Kraft)",
    category: "Bodybuilding",
    note: "Schwere Grundübungen, 3 Minuten Pause für volle Kraftleistung.",
    exercises: [
      hypertrophy("Barbell Squat", 4, "4-6", 180, 3),
      hypertrophy("Romanian Deadlift", 3, "6-8", 120, 1),
      hypertrophy("Leg Press", 3, "8-12", 120),
      hypertrophy("Seated Leg Curl", 3, "8-12", 90),
      hypertrophy("Standing Calf Raise", 4, "8-12", 90),
    ],
  },
  {
    name: "Upper/Lower · Lower B (Hypertrophie)",
    category: "Bodybuilding",
    note: "Höhere Wiederholungen, kürzere Pausen, mehr Isolation.",
    exercises: [
      hypertrophy("Leg Press", 4, "10-15", 120, 1),
      hypertrophy("Barbell Hip Thrust", 4, "10-15", 90),
      hypertrophy("Bulgarian Split Squat", 3, "10-15", 90),
      { exercise: "Leg Extension", sets: 3, reps: "12-20", kind: "dropset", restSeconds: 60 },
      { exercise: "Seated Leg Curl", sets: 3, reps: "12-20", kind: "dropset", restSeconds: 60 },
      hypertrophy("Standing Calf Raise", 4, "12-20", 60),
    ],
  },
  {
    name: "Ganzkörper 3x/Woche",
    category: "Bodybuilding",
    note: "Einsteiger-Standard: ~18 Sätze pro Muskel und Woche über 3 Einheiten.",
    exercises: [
      hypertrophy("Barbell Squat", 3, "5-8", 150, 2),
      hypertrophy("Bench Press", 3, "5-8", 150, 2),
      hypertrophy("Barbell Row", 3, "5-8", 150, 1),
      hypertrophy("Overhead Press", 2, "8-10", 120),
      hypertrophy("Romanian Deadlift", 2, "8-10", 120),
      hypertrophy("Lat Pulldown", 2, "8-12", 90),
      hypertrophy("Lateral Raise", 2, "12-15", 60),
      hypertrophy("Dumbbell Curl", 2, "10-15", 60),
      hypertrophy("Cable Triceps Pushdown", 2, "10-15", 60),
    ],
  },
  {
    name: "5/3/1 · Hauptlift + BBB",
    category: "Bodybuilding",
    note: "Wendler 5/3/1: 3 Steigerungssätze, danach 5x10 Zusatzvolumen.",
    exercises: [
      { exercise: "Barbell Squat", sets: 3, reps: "5/3/1+", kind: "working", restSeconds: 240, warmupSets: 3 },
      hypertrophy("Leg Press", 5, "10", 90),
      hypertrophy("Pull-Up", 5, "10", 90),
      hypertrophy("Hanging Leg Raise", 5, "10-15", 60),
    ],
  },
  {
    name: "StrongLifts 5x5 · A",
    category: "Bodybuilding",
    note: "Lineare Progression für Einsteiger: jede Einheit etwas mehr Gewicht.",
    exercises: [
      { exercise: "Barbell Squat", sets: 5, reps: "5", kind: "working", restSeconds: 240, warmupSets: 3 },
      { exercise: "Bench Press", sets: 5, reps: "5", kind: "working", restSeconds: 240, warmupSets: 2 },
      { exercise: "Barbell Row", sets: 5, reps: "5", kind: "working", restSeconds: 180, warmupSets: 2 },
    ],
  },
  {
    name: "StrongLifts 5x5 · B",
    category: "Bodybuilding",
    note: "Wechselt mit Tag A, jeweils 3x pro Woche.",
    exercises: [
      { exercise: "Barbell Squat", sets: 5, reps: "5", kind: "working", restSeconds: 240, warmupSets: 3 },
      { exercise: "Overhead Press", sets: 5, reps: "5", kind: "working", restSeconds: 240, warmupSets: 2 },
      { exercise: "Deadlift", sets: 1, reps: "5", kind: "working", restSeconds: 300, warmupSets: 3 },
    ],
  },

  // ------------------------------------------------------------------------ HIT
  {
    name: "Cindy (AMRAP 20)",
    category: "HIT Workouts",
    note: "CrossFit Benchmark: 5 Pull-Ups, 10 Push-Ups, 15 Air Squats im Kreis.",
    exercises: [
      { exercise: "Pull-Up", sets: 1, reps: "5", kind: "working", restSeconds: 0, workSeconds: 40 },
      { exercise: "Push-Up", sets: 1, reps: "10", kind: "working", restSeconds: 0, workSeconds: 40 },
      { exercise: "Air Squat", sets: 1, reps: "15", kind: "working", restSeconds: 0, workSeconds: 40 },
    ],
  },
  {
    name: "Fran (21-15-9)",
    category: "HIT Workouts",
    note: "Klassisches Couplet auf Zeit: Thruster und Pull-Ups.",
    exercises: [
      { exercise: "Thruster", sets: 1, reps: "21-15-9", kind: "failure", restSeconds: 0, workSeconds: 60 },
      { exercise: "Pull-Up", sets: 1, reps: "21-15-9", kind: "failure", restSeconds: 0, workSeconds: 60 },
    ],
  },
  {
    name: "Helen (3 Runden)",
    category: "HIT Workouts",
    note: "400m Lauf, 21 Kettlebell Swings, 12 Pull-Ups – 3 Runden auf Zeit.",
    exercises: [
      { exercise: "Run 400m", sets: 1, reps: "400m", kind: "working", restSeconds: 0, workSeconds: 120 },
      { exercise: "Kettlebell Swing", sets: 1, reps: "21", kind: "working", restSeconds: 0, workSeconds: 60 },
      { exercise: "Pull-Up", sets: 1, reps: "12", kind: "working", restSeconds: 0, workSeconds: 60 },
    ],
  },
  {
    name: "Murph (partitioniert)",
    category: "HIT Workouts",
    note: "Hero-WOD, aufgeteilt in 20 Runden 5/10/15 zwischen den Läufen.",
    exercises: [
      { exercise: "Run 1 mile", sets: 1, reps: "1 Meile", kind: "working", restSeconds: 0, workSeconds: 480 },
      { exercise: "Pull-Up", sets: 1, reps: "5", kind: "working", restSeconds: 0, workSeconds: 30 },
      { exercise: "Push-Up", sets: 1, reps: "10", kind: "working", restSeconds: 0, workSeconds: 30 },
      { exercise: "Air Squat", sets: 1, reps: "15", kind: "working", restSeconds: 0, workSeconds: 30 },
      { exercise: "Run 1 mile", sets: 1, reps: "1 Meile", kind: "working", restSeconds: 0, workSeconds: 480 },
    ],
  },
  {
    name: "EMOM 12 (Kraft-Ausdauer)",
    category: "HIT Workouts",
    note: "Jede Minute ein Satz – Rest der Minute ist Pause.",
    exercises: [
      { exercise: "Kettlebell Swing", sets: 1, reps: "12", kind: "working", restSeconds: 0, workSeconds: 60 },
      { exercise: "Box Jump", sets: 1, reps: "8", kind: "working", restSeconds: 0, workSeconds: 60 },
      { exercise: "Burpees", sets: 1, reps: "8", kind: "working", restSeconds: 0, workSeconds: 60 },
    ],
  },

  // --------------------------------------------------------------------- Tabata
  {
    name: "Tabata Original (Ganzkörper)",
    category: "Tabata",
    note: "Tabata 1996: 20s maximal / 10s Pause, 8 Runden – +28% anaerobe Kapazität.",
    exercises: [
      timed("Burpee", 20, "max"),
      timed("Mountain climber", 20, "max"),
      timed("Jump squat", 20, "max"),
      timed("High knees", 20, "max"),
    ],
  },
  {
    name: "Tabata Unterkörper",
    category: "Tabata",
    note: "Beinfokus im Original-Timing.",
    exercises: [
      timed("Jump squat", 20, "max"),
      timed("Skater hop", 20, "max"),
      timed("High knees", 20, "max"),
      timed("Mountain climber", 20, "max"),
    ],
  },

  // ------------------------------------------------------------------- Cardio
  {
    name: "Norwegian 4x4",
    category: "Running/Cardio",
    note: "Helgerud 2007: 4x4 min bei 90-95% HFmax – stärkster VO2max-Effekt.",
    exercises: [
      { exercise: "Warm-up locker", sets: 1, reps: "10 min", kind: "warmup", restSeconds: 0, workSeconds: 600 },
      { exercise: "Norwegian 4x4 interval", sets: 4, reps: "4 min @ 90-95%", kind: "working", restSeconds: 180, workSeconds: 240 },
      { exercise: "Cool-down locker", sets: 1, reps: "5 min", kind: "working", restSeconds: 0, workSeconds: 300 },
    ],
  },
  {
    name: "30-20-10 Intervall",
    category: "Running/Cardio",
    note: "Gunnarsson/Bangsbo 2012: 5K-Zeit -48s in 7 Wochen bei 12 min Laufzeit.",
    exercises: [
      { exercise: "Warm-up locker", sets: 1, reps: "5 min", kind: "warmup", restSeconds: 0, workSeconds: 300 },
      { exercise: "Zone 2 walk/jog 30 min", sets: 5, reps: "30s locker", kind: "working", restSeconds: 0, workSeconds: 30 },
      { exercise: "Tempo run 15 min", sets: 5, reps: "20s zügig", kind: "working", restSeconds: 0, workSeconds: 20 },
      { exercise: "Sprint 10s", sets: 5, reps: "10s Sprint", kind: "failure", restSeconds: 120, workSeconds: 10 },
    ],
  },

  // ---------------------------------------------------------------------- Yoga
  {
    name: "Sun Salutation A",
    category: "Yoga",
    note: "Klassische Ashtanga-Sequenz (Jois) – 3-5 Runden als Morgenpraxis.",
    exercises: [
      timed("Mountain Pose", 15),
      timed("Standing Forward Fold", 20),
      timed("Half Lift", 15),
      timed("Plank Pose", 20),
      timed("Chaturanga", 15),
      timed("Upward Dog", 20),
      timed("Downward Dog", 40),
    ],
  },
  {
    name: "Yoga Cooldown (statisch)",
    category: "Yoga",
    note: "Statisches Dehnen 30-60s nach dem Training (Behm 2016).",
    exercises: [
      timed("Child's Pose", 45),
      timed("Pigeon Pose", 45),
      timed("Seated Forward Fold", 45),
      timed("Supine Twist", 45),
      timed("Legs Up The Wall", 60),
      timed("Box Breathing", 60),
    ],
  },

  // ------------------------------------------------------------ Morning Routine
  {
    name: "Mobility Morgen (evidenzbasiert)",
    category: "Morning Routine",
    note: "Dynamisch statt statisch am Morgen – erhöht ROM ohne Kraftverlust (Behm 2011).",
    exercises: [
      timed("Cat-Cow", 40),
      timed("Arm swings", 30),
      timed("Leg Swing", 40),
      timed("World best stretch opener", 60),
      timed("Deep squat opener", 45),
      timed("Body waves", 30),
      timed("Trunk twist", 30),
    ],
  },
];

export function getPresetsForCategory(category: string): PresetRoutine[] {
  return presetRoutines.filter((preset) => preset.category === category);
}
