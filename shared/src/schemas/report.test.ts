import { test, expect } from "bun:test";
import { ReportKindSchema, ReportGenerateInputSchema, ReportOutputSchema, ReportSchema } from "./report";

const athlete = { goal: { status: "ok", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1700 } };

test("ReportGenerateInputSchema válido", () => {
  const ok = ReportGenerateInputSchema.safeParse({ kind: "daily", periodStart: 1, periodEnd: 2, athleteContext: athlete });
  expect(ok.success).toBe(true);
  expect(ReportGenerateInputSchema.safeParse({ kind: "año", periodStart: 1, periodEnd: 2, athleteContext: athlete }).success).toBe(false);
});

test("ReportOutputSchema exige content y limita memoryNotes a 2", () => {
  expect(ReportOutputSchema.safeParse({ content: "hola", memoryNotes: ["a", "b"] }).success).toBe(true);
  expect(ReportOutputSchema.safeParse({ content: "", memoryNotes: [] }).success).toBe(false); // content vacío
  expect(ReportOutputSchema.safeParse({ content: "x", memoryNotes: ["a", "b", "c"] }).success).toBe(false); // >2 notas
});

test("ReportGenerateInputSchema: adjustmentForDate es opcional (back-compat) y valida fecha real", () => {
  const withoutField = ReportGenerateInputSchema.safeParse({ kind: "daily", periodStart: 1, periodEnd: 2, athleteContext: athlete });
  expect(withoutField.success).toBe(true);
  const withValidDate = ReportGenerateInputSchema.safeParse({
    kind: "daily", periodStart: 1, periodEnd: 2, athleteContext: athlete, adjustmentForDate: "2026-07-16",
  });
  expect(withValidDate.success).toBe(true);
  const withInvalidDate = ReportGenerateInputSchema.safeParse({
    kind: "daily", periodStart: 1, periodEnd: 2, athleteContext: athlete, adjustmentForDate: "2026-99-99",
  });
  expect(withInvalidDate.success).toBe(false);
});

test("ReportOutputSchema: supplementAdjustment por default vacío y rechaza action increase", () => {
  const withoutField = ReportOutputSchema.safeParse({ content: "hola" });
  expect(withoutField.success).toBe(true);
  if (withoutField.success) expect(withoutField.data.supplementAdjustment).toEqual([]);

  const withIncrease = ReportOutputSchema.safeParse({
    content: "hola",
    supplementAdjustment: [{ supplementId: "11111111-1111-4111-8111-111111111111", action: "increase", reason: "x" }],
  });
  expect(withIncrease.success).toBe(false);

  const withValidSkip = ReportOutputSchema.safeParse({
    content: "hola",
    supplementAdjustment: [{ supplementId: "11111111-1111-4111-8111-111111111111", action: "skip", reason: "ya cubierto" }],
  });
  expect(withValidSkip.success).toBe(true);
});

test("ReportKindSchema opciones", () => {
  expect(ReportKindSchema.options).toEqual(["daily", "weekly", "biweekly", "monthly"]);
});

test("ReportSchema persistido", () => {
  const r = { id: "11111111-1111-4111-8111-111111111111", kind: "daily", periodStart: 1, periodEnd: 2, content: "x", createdAt: 5 };
  expect(ReportSchema.parse(r).kind).toBe("daily");
});
