import { z } from "zod";

export const ExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const GoalSchema = z.enum(["hypertrophy", "strength", "endurance", "fat_loss", "general_fitness"]);
export const SexSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);
export type Sex = z.infer<typeof SexSchema>;

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

export const ActivityLevelSchema = z.enum(["sedentary", "light", "moderate", "active"]);
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;

export const TrainingProfileSchema = z.object({
  experience: ExperienceSchema,
  goal: GoalSchema,
  sex: SexSchema.optional(),
  // Datos antropométricos opcionales: dan contexto a la IA (cargas relativas al peso, volumen/recuperación por edad).
  age: z.number().int().min(12).max(100).optional(),
  weightKg: z.number().min(30).max(300).optional(),
  heightCm: z.number().int().min(120).max(250).optional(),
  activityLevel: ActivityLevelSchema.optional(), // actividad base SIN contar entrenamientos (semilla del TDEE)
  // Modo "solo seguimiento": ausente = activado (back-compat con perfiles viejos). Cuando es false,
  // la app no arma plan de entrenamiento y días/min dejan de ser obligatorios (ver refine abajo).
  trainingEnabled: z.boolean().optional(),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  gymEquipment: z.array(EquipmentSchema),
  homeEquipment: z.array(EquipmentSchema),
  limitations: z.array(z.string()).default([]),
}).superRefine((p, ctx) => {
  // Con entrenamiento activado, días/min vuelven a ser obligatorios (el plan los necesita).
  if (p.trainingEnabled !== false) {
    if (p.daysPerWeek == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["daysPerWeek"], message: "requerido con entrenamiento" });
    if (p.sessionMinutes == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sessionMinutes"], message: "requerido con entrenamiento" });
  }
});

export type TrainingProfile = z.infer<typeof TrainingProfileSchema>;

// El entrenamiento está activado salvo que el perfil lo apague explícitamente (undefined = activado).
export function isTrainingEnabled(p: { trainingEnabled?: boolean }): boolean {
  return p.trainingEnabled !== false;
}
export type Equipment = z.infer<typeof EquipmentSchema>;
