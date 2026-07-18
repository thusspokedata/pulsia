import { z } from "zod";
import { BodyMetricEntrySchema } from "./metrics";

// Una fila del CSV: fecha ISO + timestamp derivado (mediodía UTC) + sus métricas válidas.
export const MetricCsvRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  measuredAt: z.number().int(),
  entries: z.array(BodyMetricEntrySchema).min(1),
  label: z.string().optional(),
});
export type MetricCsvRow = z.infer<typeof MetricCsvRowSchema>;

export const MetricCsvSkippedSchema = z.object({ line: z.number().int(), reason: z.string() });
export type MetricCsvSkipped = z.infer<typeof MetricCsvSkippedSchema>;

// Preview del parseo (lo que devuelve /import/<metric>/parse): filas válidas + filas saltadas.
export const MetricCsvPreviewSchema = z.object({
  rows: z.array(MetricCsvRowSchema),
  skipped: z.array(MetricCsvSkippedSchema),
});
export type MetricCsvPreview = z.infer<typeof MetricCsvPreviewSchema>;

// Resultado del import (lo que devuelve /import/<metric>): conteos + el preview usado.
export const MetricImportResultSchema = z.object({
  imported: z.number().int(),
  duplicates: z.number().int(),
  rows: z.array(MetricCsvRowSchema),
  skipped: z.array(MetricCsvSkippedSchema),
});
export type MetricImportResult = z.infer<typeof MetricImportResultSchema>;
