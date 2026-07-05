import { z } from "zod";
import { TrainingProfileSchema, EquipmentSchema } from "./profile";
import { MuscleGroupSchema } from "./catalog";

export const LocationSchema = z.enum(["gym", "home"]);

// Contrato tolerante a version-skew: `focus` acepta string legacy o array;
// `sessionMinutes`/`equipment`/`notes` son opcionales (el backend aplica fallbacks).
export const OneOffRequestSchema = z.object({
  profile: TrainingProfileSchema,
  location: LocationSchema,
  focus: z.preprocess(
    (v) => (typeof v === "string" ? [v] : v),
    z.array(MuscleGroupSchema).min(1),
  ),
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  equipment: z.array(EquipmentSchema).default([]),
  notes: z.string().max(500).optional(),
});

export type OneOffRequest = z.infer<typeof OneOffRequestSchema>;
export type Location = z.infer<typeof LocationSchema>;
