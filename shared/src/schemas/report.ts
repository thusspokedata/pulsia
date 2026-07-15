import { z } from "zod";
import { AdjustmentItemSchema } from "./supplements";
// AthleteContextSchema vive en ./athlete (no acá) para cortar el ciclo report↔supplements:
// este archivo necesita AdjustmentItemSchema de supplements.ts, y supplements.ts necesita
// AthleteContextSchema — si ambos vivieran acá, se ciclarían. Re-exportado para back-compat
// (todo el resto del monorepo importa AthleteContext(Schema) desde "@pulsia/shared", que
// re-exporta este módulo con `export *`).
export { AthleteGoalContextSchema, AthleteContextSchema } from "./athlete";
export type { AthleteContext } from "./athlete";
import { AthleteContextSchema } from "./athlete";

export const ReportKindSchema = z.enum(["daily", "weekly", "biweekly", "monthly"]);
export type ReportKind = z.infer<typeof ReportKindSchema>;

export const ReportGenerateInputSchema = z.object({
  kind: ReportKindSchema,
  periodStart: z.number().int(), // epoch ms; el móvil computa los límites en su timezone
  periodEnd: z.number().int(),
  athleteContext: AthleteContextSchema,
  force: z.boolean().optional(), // regenerar aunque exista
  // Día calendario (dispositivo) SIGUIENTE al día del informe — solo para kind "daily".
  // El server no adivina timezones: si falta o kind ≠ daily, no se genera/persiste ajuste.
  adjustmentForDate: z.iso.date().nullish(),
});
export type ReportGenerateInput = z.infer<typeof ReportGenerateInputSchema>;

// Output estructurado que devuelve la IA (tool_use).
export const ReportOutputSchema = z.object({
  content: z.string().trim().min(1),
  memoryNotes: z.array(z.string().trim().min(1).max(400)).max(2).default([]),
  // Ajuste de suplementos para MAÑANA (solo kind "daily"; el server ignora esto en los demás).
  supplementAdjustment: z.array(AdjustmentItemSchema).max(10).default([]),
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
