import { z } from "zod";

// Tiempos en epoch ms (números): la sesión se captura offline en el teléfono.
export const SetLogSchema = z.object({
  setNumber: z.number().int().min(1),
  reps: z.number().int().min(0),
  weightKg: z.number().min(0).nullable(),
  rpe: z.number().int().min(1).max(10).nullable(),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  durationMs: z.number().int().min(0).nullable(),
  repTimestamps: z.array(z.number().int().min(0)).default([]),
  hrAvg: z.number().int().min(0).nullable().default(null),
  hrMax: z.number().int().min(0).nullable().default(null),
  skipped: z.boolean().default(false),
});

export const PlannedExerciseSchema = z.object({
  sets: z.number().int().min(0),
  reps: z.string(),
  targetLoad: z.string(),
  restSeconds: z.number().int().min(0),
});

export const SessionExerciseSchema = z.object({
  catalogId: z.string().min(1),
  garminName: z.string().min(1),
  order: z.number().int().min(0),
  planned: PlannedExerciseSchema,
  skipped: z.boolean().default(false),
  sets: z.array(SetLogSchema),
});

export const WorkoutSessionSchema = z.object({
  id: z.string().uuid(),
  programId: z.string().uuid(),
  weekNumber: z.number().int().min(1),
  dayLabel: z.string().min(1),
  location: z.enum(["gym", "home"]),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  totalDurationMs: z.number().int().min(0).nullable(),
  notes: z.string().default(""),
  exercises: z.array(SessionExerciseSchema),
});

export type SetLog = z.infer<typeof SetLogSchema>;
export type PlannedExercise = z.infer<typeof PlannedExerciseSchema>;
export type SessionExercise = z.infer<typeof SessionExerciseSchema>;
export type WorkoutSession = z.infer<typeof WorkoutSessionSchema>;
