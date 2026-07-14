import { z } from "zod";
import { ActivityLevelSchema, SexSchema } from "./profile";
import { NutritionObjectiveSchema } from "./nutrition";

export const ReportKindSchema = z.enum(["daily", "weekly", "biweekly", "monthly"]);
export type ReportKind = z.infer<typeof ReportKindSchema>;

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

export const ReportGenerateInputSchema = z.object({
  kind: ReportKindSchema,
  periodStart: z.number().int(), // epoch ms; el móvil computa los límites en su timezone
  periodEnd: z.number().int(),
  athleteContext: AthleteContextSchema,
  force: z.boolean().optional(), // regenerar aunque exista
});
export type ReportGenerateInput = z.infer<typeof ReportGenerateInputSchema>;

// Output estructurado que devuelve la IA (tool_use).
export const ReportOutputSchema = z.object({
  content: z.string().trim().min(1),
  memoryNotes: z.array(z.string().trim().min(1).max(400)).max(2).default([]),
});
export type ReportOutput = z.infer<typeof ReportOutputSchema>;

// Persistido / devuelto.
export const ReportSchema = z.object({
  id: z.string().uuid(),
  kind: ReportKindSchema,
  periodStart: z.number().int(),
  periodEnd: z.number().int(),
  content: z.string(),
  createdAt: z.number().int(),
});
export type Report = z.infer<typeof ReportSchema>;

export const ReportListItemSchema = ReportSchema.omit({ id: true, content: true });
export type ReportListItem = z.infer<typeof ReportListItemSchema>;
