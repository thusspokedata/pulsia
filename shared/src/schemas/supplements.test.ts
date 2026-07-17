import { test, expect } from "bun:test";
import {
  SupplementExtractionSchema, SupplementInputSchema, SupplementSchema,
  TakeSlotSchema, AdjustmentItemSchema, FrequencySchema, TAKE_SLOTS,
  GeneratePlanInputSchema, PlanItemPatchSchema, AiPlanFrequencySchema,
} from "./supplements";

const extraction = {
  name: "ZMA Pro",
  brand: "BrandX",
  servingLabel: "2 cápsulas",
  components: [
    { name: "Magnesio (citrato)", amount: 375, unit: "mg" },
    { name: "Zinc", amount: 10, unit: "mg" },
  ],
  labelMaxPerDay: "2 cápsulas al día",
  source: "label",
  info: "El magnesio contribuye a la función muscular normal. El zinc participa en el sistema inmune.",
};

test("SupplementExtractionSchema acepta una extracción completa", () => {
  const p = SupplementExtractionSchema.parse(extraction);
  expect(p.components).toHaveLength(2);
  expect(p.info).toBe(extraction.info); // el info del caller, no un literal cualquiera con "magnesio"
  // `info` es obligatorio acá: es lo único que separa Extraction de Input (ver comentario en el schema).
  expect(SupplementExtractionSchema.safeParse({ ...extraction, info: undefined }).success).toBe(false);
});

test("SupplementExtractionSchema exige al menos un componente y rechaza amount <= 0", () => {
  expect(SupplementExtractionSchema.safeParse({ ...extraction, components: [] }).success).toBe(false);
  expect(SupplementExtractionSchema.safeParse({
    ...extraction, components: [{ name: "Zinc", amount: 0, unit: "mg" }],
  }).success).toBe(false);
});

test("SupplementInputSchema permite alta manual sin info ni brand ni labelMaxPerDay", () => {
  const p = SupplementInputSchema.parse({
    name: "Creatina", servingLabel: "5 g",
    components: [{ name: "Creatina monohidrato", amount: 5, unit: "g" }],
    source: "estimate",
  });
  expect(p.info ?? null).toBeNull();
});

test("SupplementSchema es el input + id/createdAt", () => {
  const p = SupplementSchema.parse({
    ...extraction, id: "11111111-1111-4111-8111-111111111111", createdAt: 0,
  });
  expect(p.id).toBeDefined();
});

test("SupplementSchema exige que id sea un UUID, no cualquier string", () => {
  expect(SupplementSchema.safeParse({
    ...extraction, id: "no-es-un-uuid", createdAt: 0,
  }).success).toBe(false);
  expect(SupplementSchema.safeParse({
    ...extraction, id: "11111111-1111-4111-8111-111111111111", createdAt: 0,
  }).success).toBe(true);
});

test("TAKE_SLOTS conserva el orden canónico del día", () => {
  expect(TAKE_SLOTS).toEqual(["desayuno", "almuerzo", "cena", "post_entreno", "antes_de_dormir"]);
  expect(TakeSlotSchema.safeParse("merienda").success).toBe(false);
});

test("FrequencySchema: daily / every_other_day con anchorDate / weekdays no vacío", () => {
  expect(FrequencySchema.safeParse({ type: "daily" }).success).toBe(true);
  expect(FrequencySchema.safeParse({ type: "every_other_day", anchorDate: "2026-07-15" }).success).toBe(true);
  expect(FrequencySchema.safeParse({ type: "every_other_day" }).success).toBe(false);
  expect(FrequencySchema.safeParse({ type: "weekdays", days: [1, 3, 5] }).success).toBe(true);
  expect(FrequencySchema.safeParse({ type: "weekdays", days: [] }).success).toBe(false);
  expect(FrequencySchema.safeParse({ type: "weekdays", days: [7] }).success).toBe(false);
});

test("FrequencySchema: anchorDate debe ser una fecha real, no solo el formato", () => {
  expect(FrequencySchema.safeParse({ type: "every_other_day", anchorDate: "2026-07-15" }).success).toBe(true);
  expect(FrequencySchema.safeParse({ type: "every_other_day", anchorDate: "2026-99-99" }).success).toBe(false);
});

test("FrequencySchema: weekdays rechaza días duplicados", () => {
  expect(FrequencySchema.safeParse({ type: "weekdays", days: [1, 1] }).success).toBe(false);
});

test("AdjustmentItemSchema NUNCA acepta increase", () => {
  const base = { supplementId: "11111111-1111-4111-8111-111111111111", reason: "ayer comiste rico en magnesio" };
  expect(AdjustmentItemSchema.safeParse({ ...base, action: "skip" }).success).toBe(true);
  expect(AdjustmentItemSchema.safeParse({ ...base, action: "reduce", dose: "2.5 g" }).success).toBe(true);
  expect(AdjustmentItemSchema.safeParse({ ...base, action: "increase" }).success).toBe(false);
});

test("AdjustmentItemSchema: reduce exige dose", () => {
  expect(AdjustmentItemSchema.safeParse({
    supplementId: "11111111-1111-4111-8111-111111111111", action: "reduce", reason: "x",
  }).success).toBe(false);
});

test("GeneratePlanInputSchema exige date en formato ISO", () => {
  const base = { athleteContext: { goal: { status: "incomplete" } } };
  expect(GeneratePlanInputSchema.safeParse({ ...base, date: "2026-07-16" }).success).toBe(true);
  expect(GeneratePlanInputSchema.safeParse({ ...base, date: "16-07-2026" }).success).toBe(false);
});

test("PlanItemPatchSchema rechaza el objeto vacío", () => {
  expect(PlanItemPatchSchema.safeParse({}).success).toBe(false);
  expect(PlanItemPatchSchema.safeParse({ dose: "5 g" }).success).toBe(true);
});

test("AiPlanFrequencySchema acepta every_other_day SIN anchorDate (lo ancla el server)", () => {
  expect(AiPlanFrequencySchema.safeParse({ type: "every_other_day" }).success).toBe(true);
});
