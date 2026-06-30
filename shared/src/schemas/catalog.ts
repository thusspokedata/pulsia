import { z } from "zod";
import { EquipmentSchema } from "./profile";

export const MuscleGroupSchema = z.enum([
  "chest", "back", "shoulders", "biceps", "triceps", "forearms",
  "quads", "hamstrings", "glutes", "calves", "abs", "full_body",
]);

export const CatalogExerciseSchema = z.object({
  id: z.string().min(1),
  garminCategory: z.string().min(1),
  garminName: z.string().min(1),
  displayName: z.string().min(1),
  primaryMuscles: z.array(MuscleGroupSchema).min(1),
  secondaryMuscles: z.array(MuscleGroupSchema).default([]),
  equipment: z.array(EquipmentSchema).min(1),
});

export type CatalogExercise = z.infer<typeof CatalogExerciseSchema>;
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;
