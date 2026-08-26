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
];
