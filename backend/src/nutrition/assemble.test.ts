import { expect, test } from "bun:test";
import { FoodExtractionSchema, NUTRIENT_KEYS, type FoodIdentification } from "@pulsia/shared";
import { assembleFoodExtraction, AI_PROVIDED_KEYS, VITAMIN_MINERAL_KEYS } from "./assemble";
import { nutrientColumn } from "./columns";
import type { UsdaFoodRow } from "../usda/matcher";

// FoodIdentification base (camino "ai": la IA estimó todo). Cada test la clona y muta lo suyo.
function baseId(overrides: Partial<FoodIdentification> = {}): FoodIdentification {
  return {
    name: "Huevo frito",
    basis: "per_100g",
    kcal: 200, protein_g: 14, carbs_g: 1, fat_g: 15,
    saturated_fat_g: 4, sugars_g: 0.5, fiber_g: 0, sodium_mg: 200, cholesterol_mg: 370, water_ml: 60,
    unitWeightG: 50,
    sourceMacros: "ai",
    searchQuery: "egg whole cooked fried",
    ...overrides,
  };
}

// Fila de USDA con TODAS las columnas en null salvo las que se pisen. Así un test que espera un
// valor de USDA prueba que salió de ahí y no de un default olvidado.
function usdaRow(overrides: Record<string, number | string | null> = {}): UsdaFoodRow {
  const base: Record<string, number | string | null> = {
    fdcId: 999, description: "Egg, whole, cooked, fried", dataType: "sr_legacy",
  };
  for (const k of ["kcal", "protein_g", "carbs_g", "fat_g", ...NUTRIENT_KEYS]) {
    base[nutrientColumn(k)] = null;
  }
  return { ...base, ...overrides } as unknown as UsdaFoodRow;
}

test("ai con match: las vitaminas salen de USDA, sourceMicros usda, usdaFdcId seteado", () => {
  const out = assembleFoodExtraction(
    baseId(),
    usdaRow({ ironMg: 1.9, vitaminB12Mcg: 1.3, calciumMg: 62 }),
  );
  expect(out.iron_mg).toBe(1.9);
  expect(out.vitamin_b12_mcg).toBe(1.3);
  expect(out.calcium_mg).toBe(62);
  expect(out.sourceMicros).toBe("usda");
  expect(out.usdaFdcId).toBe(999);
});

test("ai con match: un macro que USDA tiene PISA el estimado de la IA", () => {
  const out = assembleFoodExtraction(baseId({ kcal: 200 }), usdaRow({ kcal: 196 }));
  expect(out.kcal).toBe(196); // gana USDA
});

test("ai con match donde USDA tiene ese macro en null: CAE al estimado de la IA", () => {
  const out = assembleFoodExtraction(baseId({ kcal: 200 }), usdaRow({ kcal: null }));
  expect(out.kcal).toBe(200); // sin dato de USDA, queda la estimación de la IA (no null, no 0)
});

test("label con match: el sodium_mg de la etiqueta GANA al de USDA", () => {
  const out = assembleFoodExtraction(
    baseId({ sourceMacros: "label", sodium_mg: 200 }),
    usdaRow({ sodiumMg: 150 }),
  );
  expect(out.sodium_mg).toBe(200); // gana la etiqueta
});

test("label con match donde la etiqueta no trae fibra (null): la fibra CAE a USDA", () => {
  const out = assembleFoodExtraction(
    baseId({ sourceMacros: "label", fiber_g: null }),
    usdaRow({ fiberG: 2.5 }),
  );
  expect(out.fiber_g).toBe(2.5); // la etiqueta no la cubre → rellena USDA
});

test("sin match: vitaminas null, sourceMicros null, usdaFdcId null; macros/micros de etiqueta se conservan de la IA", () => {
  const out = assembleFoodExtraction(baseId(), null);
  for (const k of VITAMIN_MINERAL_KEYS) {
    expect(out[k] ?? null).toBe(null);
  }
  expect(out.sourceMicros).toBe(null);
  expect(out.usdaFdcId).toBe(null);
  // los que aporta la IA sobreviven
  expect(out.kcal).toBe(200);
  expect(out.sodium_mg).toBe(200);
  expect(out.cholesterol_mg).toBe(370);
  expect(out.water_ml).toBe(60);
});

test("name/basis/unitWeightG salen SIEMPRE de id, aunque USDA tenga otra descripción", () => {
  const out = assembleFoodExtraction(
    baseId({ name: "Banana", basis: "per_100g", unitWeightG: 120 }),
    usdaRow({ description: "Bananas, raw" }),
  );
  expect(out.name).toBe("Banana");
  expect(out.basis).toBe("per_100g");
  expect(out.unitWeightG).toBe(120);
});

test("el resultado parsea contra FoodExtractionSchema (con y sin match)", () => {
  expect(FoodExtractionSchema.safeParse(assembleFoodExtraction(baseId(), usdaRow({ ironMg: 2 }))).success).toBe(true);
  expect(FoodExtractionSchema.safeParse(assembleFoodExtraction(baseId(), null)).success).toBe(true);
});

test("AI_PROVIDED_KEYS y vitaminas/minerales particionan el registro sin huecos ni solapes", () => {
  const enRegistro = new Set<string>(NUTRIENT_KEYS);
  // los 6 micros de etiqueta están todos en el registro
  const labelMicros = AI_PROVIDED_KEYS.filter((k) => enRegistro.has(k));
  expect([...labelMicros].sort()).toEqual(
    ["cholesterol_mg", "fiber_g", "saturated_fat_g", "sodium_mg", "sugars_g", "water_ml"],
  );
  // los 4 macros NO están en el registro
  expect(AI_PROVIDED_KEYS.filter((k) => !enRegistro.has(k)).sort()).toEqual(
    ["carbs_g", "fat_g", "kcal", "protein_g"],
  );
  // micros de etiqueta ∪ vitaminas/minerales == registro, sin solape
  const union = new Set([...labelMicros, ...VITAMIN_MINERAL_KEYS]);
  expect(union.size).toBe(NUTRIENT_KEYS.length);
  expect(VITAMIN_MINERAL_KEYS.some((k) => AI_PROVIDED_KEYS.includes(k as (typeof AI_PROVIDED_KEYS)[number]))).toBe(false);
});
