import { z } from "zod";
import { MuscleGroupSchema } from "./catalog";

export const ProgramExerciseSchema = z.object({
  catalogId: z.string().min(1),
  garminName: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1),
  targetLoad: z.string().min(1),
  restSeconds: z.number().int().min(0).max(600),
  notes: z.string().default(""),
});

export const WorkoutSchema = z.object({
  dayLabel: z.string().min(1),
  location: z.enum(["gym", "home"]),
  // Objetivo estructurado del día: los grupos musculares que entrena. Reemplaza al viejo
  // `focus` (grupo único, sin consumidores). La validación de coherencia (programScope) chequea
  // que cada ejercicio del día entrene al menos uno de estos grupos.
  targetMuscles: z.array(MuscleGroupSchema).min(1),
  // Cota de sanidad generosa (no fija el alcance del prompt): evita workouts desmadrados.
  exercises: z.array(ProgramExerciseSchema).max(12),
});

export const WeekSchema = z.object({
  weekNumber: z.number().int().min(1),
  workouts: z.array(WorkoutSchema),
});

export const ProgramSchema = z.object({
  name: z.string().min(1),
  // Cota de sanidad generosa; las semanas quedan configurables a futuro (no se fija en 2).
  weeks: z.array(WeekSchema).min(1).max(12),
});

export type Program = z.infer<typeof ProgramSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;
export type ProgramExercise = z.infer<typeof ProgramExerciseSchema>;
