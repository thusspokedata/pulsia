import { z } from "zod";

export const ExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const GoalSchema = z.enum(["hypertrophy", "strength", "endurance", "fat_loss", "general_fitness"]);

export const EquipmentSchema = z.enum([
  "bodyweight",
  "dumbbell",
  "barbell",
  "kettlebell",
  "resistance_band",
  "pull_up_bar",
  "bench",
  "cable_machine",
  "machine",
  "trx",
]);

export const TrainingProfileSchema = z.object({
  experience: ExperienceSchema,
  goal: GoalSchema,
  // Datos antropométricos opcionales: dan contexto a la IA (cargas relativas al peso, volumen/recuperación por edad).
  age: z.number().int().min(12).max(100).optional(),
  weightKg: z.number().min(30).max(300).optional(),
  heightCm: z.number().int().min(120).max(250).optional(),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180),
  gymEquipment: z.array(EquipmentSchema),
  homeEquipment: z.array(EquipmentSchema),
  limitations: z.array(z.string()).default([]),
});

export type TrainingProfile = z.infer<typeof TrainingProfileSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
