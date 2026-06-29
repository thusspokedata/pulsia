import { z } from "zod";
import { MuscleGroupSchema } from "./catalog";

export const ProgramExerciseSchema = z.object({
  catalogId: z.string(),
  garminName: z.string(),
  sets: z.number().int().min(1).max(10),
  reps: z.string(),
  targetLoad: z.string(),
  restSeconds: z.number().int().min(0).max(600),
  notes: z.string().default(""),
});

export const WorkoutSchema = z.object({
  dayLabel: z.string(),
  location: z.enum(["gym", "home"]),
  focus: MuscleGroupSchema,
  exercises: z.array(ProgramExerciseSchema),
});

export const WeekSchema = z.object({
  weekNumber: z.number().int().min(1),
  workouts: z.array(WorkoutSchema),
});

export const ProgramSchema = z.object({
  name: z.string(),
  weeks: z.array(WeekSchema).min(1),
});

export type Program = z.infer<typeof ProgramSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;
export type ProgramExercise = z.infer<typeof ProgramExerciseSchema>;
