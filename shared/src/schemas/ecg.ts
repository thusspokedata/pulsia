import { z } from "zod";

export const EcgStatusSchema = z.enum(["pending", "done", "failed"]);
export type EcgStatus = z.infer<typeof EcgStatusSchema>;

export const EcgAnalysisSchema = z.object({
  kardiaVerdict: z.string(),
  avgHeartRate: z.number().nullable(),
  recordedAt: z.string().nullable(),
  interpretation: z.string(),
});
export type EcgAnalysis = z.infer<typeof EcgAnalysisSchema>;

export const EcgRecordingSchema = z.object({
  id: z.string().uuid(),
  status: EcgStatusSchema,
  createdAt: z.number().int(),
  analysis: EcgAnalysisSchema.nullable(),
  error: z.string().nullable(),
});
export type EcgRecording = z.infer<typeof EcgRecordingSchema>;
