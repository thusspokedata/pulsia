import { test, expect } from "bun:test";
import { EcgStatusSchema, EcgAnalysisSchema, EcgRecordingSchema } from "./ecg";

test("EcgAnalysisSchema parsea una interpretación válida", () => {
  const a = { kardiaVerdict: "Normal", avgHeartRate: 62, recordedAt: "2026-07-01", interpretation: "Lectura normal. No reemplaza a un médico." };
  expect(EcgAnalysisSchema.safeParse(a).success).toBe(true);
});
test("EcgAnalysisSchema tolera nullables", () => {
  const a = { kardiaVerdict: "Posible FA", avgHeartRate: null, recordedAt: null, interpretation: "..." };
  expect(EcgAnalysisSchema.safeParse(a).success).toBe(true);
});
test("EcgStatus enum", () => {
  expect(EcgStatusSchema.safeParse("pending").success).toBe(true);
  expect(EcgStatusSchema.safeParse("nope").success).toBe(false);
});
test("EcgRecordingSchema con analysis null (pending)", () => {
  const r = { id: "11111111-1111-4111-8111-111111111111", status: "pending", createdAt: 1, analysis: null, error: null };
  expect(EcgRecordingSchema.safeParse(r).success).toBe(true);
});
