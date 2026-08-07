import { expect, test } from "bun:test";
import type { UsdaFoodRow } from "../usda/matcher";
import { foodInputFromUsdaRow } from "./fromUsda";

// Una fila de USDA mínima pero representativa: macros + un micro de etiqueta + una vitamina + un
// mineral, y un nutriente ausente (null) para verificar que no se convierte en 0.
function row(overrides: Partial<UsdaFoodRow> = {}): UsdaFoodRow {
  return {
    fdcId: 321900,
    description: "Broccoli, raw",
    dataType: "foundation",
    kcal: 34,
    proteinG: 2.82,
    carbsG: 6.64,
    fatG: 0.37,
    saturatedFatG: 0.11,
    omega3G: null,
    omega6G: null,
    cholesterolMg: 0,
    sugarsG: 1.7,
    fiberG: 2.6,
    waterMl: 89.3,
    vitaminAMcg: 31,
    vitaminB1Mg: null,
    vitaminB2Mg: null,
    vitaminB3Mg: null,
    vitaminB5Mg: null,
    vitaminB6Mg: null,
    vitaminB7Mcg: null,
    vitaminB9Mcg: 63,
    vitaminB12Mcg: null,
    vitaminCMg: 89.2,
    vitaminDMcg: null,
    vitaminEMg: null,
    vitaminKMcg: 102,
    cholineMg: null,
    calciumMg: 47,
    ironMg: 0.73,
    magnesiumMg: 21,
    iodineMcg: null,
    phosphorusMg: 66,
    potassiumMg: 316,
    seleniumMcg: 2.5,
    sodiumMg: 33,
    zincMg: 0.41,
    ...overrides,
  } as UsdaFoodRow;
}

test("mapea macros y micros de la fila, con procedencia usda", () => {
  const f = foodInputFromUsdaRow(row(), { name: "Brócoli", basis: "per_100g", unitWeightG: null });
  expect(f.name).toBe("Brócoli");
  expect(f.basis).toBe("per_100g");
  expect(f.unitWeightG).toBeNull();
  // Macros desde la fila
  expect(f.kcal).toBe(34);
  expect(f.protein_g).toBe(2.82);
  expect(f.carbs_g).toBe(6.64);
  expect(f.fat_g).toBe(0.37);
  // Micros desde la fila (etiqueta + vitamina + mineral)
  expect(f.fiber_g).toBe(2.6);
  expect(f.vitamin_c_mg).toBe(89.2);
  expect(f.calcium_mg).toBe(47);
  // Procedencia
  expect(f.sourceMacros).toBe("usda");
  expect(f.sourceMicros).toBe("usda");
  expect(f.usdaFdcId).toBe(321900);
});

test("un nutriente ausente en la fila queda null, no 0", () => {
  const f = foodInputFromUsdaRow(row(), { name: "Brócoli", basis: "per_100g", unitWeightG: null });
  expect(f.omega3_g).toBeNull();
  expect(f.vitamin_b12_mcg).toBeNull();
  expect(f.iodine_mcg).toBeNull();
});

test("macros ausentes en la fila caen a 0 (el schema los exige no-nullable)", () => {
  const f = foodInputFromUsdaRow(
    row({ kcal: null, proteinG: null, carbsG: null, fatG: null }),
    { name: "X", basis: "per_100g", unitWeightG: null },
  );
  expect(f.kcal).toBe(0);
  expect(f.protein_g).toBe(0);
  expect(f.carbs_g).toBe(0);
  expect(f.fat_g).toBe(0);
});

test("recorta a 0 los negativos de USDA (carbs by difference) en macros y micros", () => {
  const f = foodInputFromUsdaRow(
    row({ carbsG: -0.251, sodiumMg: -1 }),
    { name: "Cordero", basis: "per_100g", unitWeightG: null },
  );
  expect(f.carbs_g).toBe(0);
  expect(f.sodium_mg).toBe(0);
});

test("conserva unitWeightG y basis cuando se pasan", () => {
  const f = foodInputFromUsdaRow(row(), { name: "Huevo", basis: "per_100g", unitWeightG: 50 });
  expect(f.unitWeightG).toBe(50);
});
