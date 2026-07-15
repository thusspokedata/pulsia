import { z } from "zod";
import { ActivityLevelSchema, SexSchema } from "./profile";
import { NutritionObjectiveSchema } from "./nutrition";

// La meta ya computada en el móvil (referencia para el agente + bmr para el gasto neto).
export const AthleteGoalContextSchema = z.object({
  status: z.enum(["ok", "incomplete"]),
  kcal: z.number().optional(),
  protein_g: z.number().optional(),
  carbs_g: z.number().optional(),
  fat_g: z.number().optional(),
  bmr: z.number().nullable().optional(),
});

// Contexto que manda el móvil (el perfil vive client-side, como en #2a).
// Vive en su propio módulo (no en report.ts) para que supplements.ts pueda importarlo
// sin crear un ciclo: report.ts necesita AdjustmentItemSchema de supplements.ts, y
// supplements.ts necesita este contexto — si ambos vivieran en report.ts, el ciclo
// report↔supplements rompería el orden de inicialización de los const de Zod.
export const AthleteContextSchema = z.object({
  sex: SexSchema.optional(),
  age: z.number().optional(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  activityLevel: ActivityLevelSchema.optional(),
  objective: NutritionObjectiveSchema.optional(),
  goal: AthleteGoalContextSchema,
});
export type AthleteContext = z.infer<typeof AthleteContextSchema>;
