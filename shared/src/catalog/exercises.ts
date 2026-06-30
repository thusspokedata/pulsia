import type { CatalogExercise, Equipment } from "../index";

export const EXERCISE_CATALOG: CatalogExercise[] = [
  // ----- Pecho -----
  { id: "barbell_bench_press", garminCategory: "BENCH_PRESS", garminName: "Barbell Bench Press",
    displayName: "Press banca con barra", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"],
    equipment: ["barbell", "bench"] },
  { id: "dumbbell_bench_press", garminCategory: "BENCH_PRESS", garminName: "Dumbbell Bench Press",
    displayName: "Press banca con mancuernas", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"],
    equipment: ["dumbbell", "bench"] },
  { id: "push_up", garminCategory: "PUSH_UP", garminName: "Push-Up",
    displayName: "Flexiones", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"],
    equipment: ["bodyweight"] },
  // ----- Espalda -----
  { id: "pull_up", garminCategory: "PULL_UP", garminName: "Pull-Up",
    displayName: "Dominadas", primaryMuscles: ["back"], secondaryMuscles: ["biceps"],
    equipment: ["pull_up_bar"] },
  { id: "barbell_row", garminCategory: "ROW", garminName: "Barbell Row",
    displayName: "Remo con barra", primaryMuscles: ["back"], secondaryMuscles: ["biceps"],
    equipment: ["barbell"] },
  { id: "dumbbell_row", garminCategory: "ROW", garminName: "Dumbbell Row",
    displayName: "Remo con mancuerna", primaryMuscles: ["back"], secondaryMuscles: ["biceps"],
    equipment: ["dumbbell"] },
  { id: "band_pull_apart", garminCategory: "ROW", garminName: "Band Pull-Apart",
    displayName: "Aperturas con banda", primaryMuscles: ["back"], secondaryMuscles: ["shoulders"],
    equipment: ["resistance_band"] },
  // ----- Hombros -----
  { id: "overhead_press", garminCategory: "SHOULDER_PRESS", garminName: "Overhead Press",
    displayName: "Press militar", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"],
    equipment: ["barbell"] },
  { id: "dumbbell_shoulder_press", garminCategory: "SHOULDER_PRESS", garminName: "Dumbbell Shoulder Press",
    displayName: "Press de hombro con mancuernas", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"],
    equipment: ["dumbbell"] },
  { id: "lateral_raise", garminCategory: "LATERAL_RAISE", garminName: "Lateral Raise",
    displayName: "Elevaciones laterales", primaryMuscles: ["shoulders"], secondaryMuscles: [],
    equipment: ["dumbbell"] },
  // ----- Bíceps / Tríceps -----
  { id: "dumbbell_curl", garminCategory: "CURL", garminName: "Dumbbell Curl",
    displayName: "Curl con mancuernas", primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    equipment: ["dumbbell"] },
  { id: "band_curl", garminCategory: "CURL", garminName: "Band Curl",
    displayName: "Curl con banda", primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    equipment: ["resistance_band"] },
  { id: "triceps_dip", garminCategory: "TRICEPS_EXTENSION", garminName: "Triceps Dip",
    displayName: "Fondos de tríceps", primaryMuscles: ["triceps"], secondaryMuscles: ["chest"],
    equipment: ["bodyweight"] },
  // ----- Cuádriceps / Glúteos / Femoral -----
  { id: "barbell_back_squat", garminCategory: "SQUAT", garminName: "Barbell Back Squat",
    displayName: "Sentadilla con barra", primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"],
    equipment: ["barbell"] },
  { id: "goblet_squat", garminCategory: "SQUAT", garminName: "Goblet Squat",
    displayName: "Sentadilla goblet", primaryMuscles: ["quads"], secondaryMuscles: ["glutes"],
    equipment: ["dumbbell"] },
  { id: "bodyweight_squat", garminCategory: "SQUAT", garminName: "Air Squat",
    displayName: "Sentadilla libre", primaryMuscles: ["quads"], secondaryMuscles: ["glutes"],
    equipment: ["bodyweight"] },
  { id: "romanian_deadlift", garminCategory: "DEADLIFT", garminName: "Romanian Deadlift",
    displayName: "Peso muerto rumano", primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "back"],
    equipment: ["barbell"] },
  { id: "dumbbell_rdl", garminCategory: "DEADLIFT", garminName: "Dumbbell Romanian Deadlift",
    displayName: "Peso muerto rumano con mancuernas", primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes"],
    equipment: ["dumbbell"] },
  { id: "glute_bridge", garminCategory: "HIP_RAISE", garminName: "Glute Bridge",
    displayName: "Puente de glúteos", primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"],
    equipment: ["bodyweight"] },
  { id: "walking_lunge", garminCategory: "LUNGE", garminName: "Walking Lunge",
    displayName: "Zancadas", primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"],
    equipment: ["bodyweight"] },
  // ----- Pantorrillas -----
  { id: "standing_calf_raise", garminCategory: "CALF_RAISE", garminName: "Standing Calf Raise",
    displayName: "Elevación de talones", primaryMuscles: ["calves"], secondaryMuscles: [],
    equipment: ["bodyweight"] },
  // ----- Core -----
  { id: "plank", garminCategory: "PLANK", garminName: "Plank",
    displayName: "Plancha", primaryMuscles: ["abs"], secondaryMuscles: ["full_body"],
    equipment: ["bodyweight"] },
  { id: "hanging_leg_raise", garminCategory: "LEG_RAISE", garminName: "Hanging Leg Raise",
    displayName: "Elevación de piernas colgado", primaryMuscles: ["abs"], secondaryMuscles: [],
    equipment: ["pull_up_bar"] },
  { id: "crunch", garminCategory: "CRUNCH", garminName: "Crunch",
    displayName: "Abdominales", primaryMuscles: ["abs"], secondaryMuscles: [],
    equipment: ["bodyweight"] },
];

export function getExerciseById(id: string): CatalogExercise | undefined {
  return EXERCISE_CATALOG.find((e) => e.id === id);
}

export function catalogForEquipment(available: Equipment[]): CatalogExercise[] {
  const set = new Set(available);
  return EXERCISE_CATALOG.filter((e) => e.equipment.every((eq) => set.has(eq)));
}
