import { z } from "zod";
import { BodyMetricEntrySchema } from "./metrics";

// Una noche del CSV: fecha ISO + timestamp derivado (mediodía UTC) + sus métricas válidas.
export const SleepCsvRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  measuredAt: z.number().int(),
  entries: z.array(BodyMetricEntrySchema).min(1),
});
export type SleepCsvRow = z.infer<typeof SleepCsvRowSchema>;

export const SleepCsvSkippedSchema = z.object({ line: z.number().int(), reason: z.string() });
export type SleepCsvSkipped = z.infer<typeof SleepCsvSkippedSchema>;

// Preview del parseo (lo que devuelve /import/sleep/parse): filas válidas + filas saltadas.
export const SleepCsvPreviewSchema = z.object({
  rows: z.array(SleepCsvRowSchema),
  skipped: z.array(SleepCsvSkippedSchema),
});
export type SleepCsvPreview = z.infer<typeof SleepCsvPreviewSchema>;

// Resultado del import (lo que devuelve /import/sleep): conteos + el preview usado.
export const SleepImportResultSchema = z.object({
  imported: z.number().int(),
  duplicates: z.number().int(),
  rows: z.array(SleepCsvRowSchema),
  skipped: z.array(SleepCsvSkippedSchema),
});
export type SleepImportResult = z.infer<typeof SleepImportResultSchema>;
