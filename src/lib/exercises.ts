export type JournalCategory = {
  name: string;
  exercises: string[];
};

export const journalCategories: JournalCategory[] = [
  {
    name: "Morning Routine",
    exercises: [
      "Lymphatic hops",
      "Body waves",
      "Trunk twist",
      "Dead arms",
      "Golf swing",
      "Arm swings",
      "March slaps",
      "Cossack squat",
      "Deep squat opener",
      "World best stretch opener",
      "Lunge front reach",
      "Table top toe touch",
      "Hands behind back and head touch elbow plank",
      "Kneeling diagonal stretch",
      "Journal Check-in",
      "Kaffee & Wasser vorbereiten",
      "Tagesfokus setzen",
    ],
  },
  {
    name: "Tabata",
    exercises: [
      "Burpee",
      "Mountain climber",
      "Jump squat",
      "High knees",
      "Skater hop",
      "Push-up",
      "Plank jack",
      "Rest",
    ],
  },
  {
    name: "HIT Workouts",
    exercises: ["Burpees", "Mountain climbers", "Jump squats"],
  },
  {
    name: "Running/Cardio",
    exercises: [
      "Easy run 20 min",
      "Intervals 6x1 min fast",
      "Zone 2 walk/jog 30 min",
    ],
  },
  {
    name: "Bodybuilding",
    exercises: [
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
      "Dumbbell Curl",
      "Barbell Curl",
      "Triceps Dip",
      "Skull Crusher",
      "Cable Fly",
      "Lateral Raise",
    ],
  },
];
