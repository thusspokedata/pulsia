import { test, it, expect } from "bun:test";
import { deriveRecipe } from "./recipe";
import type { MacroSource } from "./macros";

// Pollo (per_100g) con algo de hierro; agua (per_100ml) sin micros.
const pollo = { basis: "per_100g" as const, kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, unitWeightG: null, iron_mg: 1 };
const agua = { basis: "per_100ml" as const, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null };

test("sin cookedWeight: peso efectivo = suma de gramos (ml cuenta como g)", () => {
  const d = deriveRecipe([
    { food: pollo, quantity: 200, unit: "g" },
    { food: agua, quantity: 300, unit: "ml" },
  ], null);
  expect(d.sumGrams).toBe(500);
  expect(d.effectiveWeightG).toBe(500);
  // Total: 2 * 165 = 330 kcal; per 100 g sobre 500 g = 66 kcal.
  expect(d.total.kcal).toBe(330);
  expect(d.per100.kcal).toBe(66);
  // Proteína total 62 g → 12.4 /100g.
  expect(d.per100.protein_g).toBeCloseTo(12.4, 5);
});

test("cookedWeight recalibra la densidad (evaporación concentra)", () => {
  const d = deriveRecipe([{ food: pollo, quantity: 200, unit: "g" }], 100);
  // Mismos nutrientes totales, pero sobre 100 g: 330 kcal /100g.
  expect(d.effectiveWeightG).toBe(100);
  expect(d.per100.kcal).toBe(330);
});

test("micro que NINGÚN ingrediente tiene → null; el que alguno tiene → sumado y escalado", () => {
  const d = deriveRecipe([
    { food: pollo, quantity: 200, unit: "g" },  // iron_mg presente
    { food: agua, quantity: 300, unit: "ml" },  // iron_mg ausente
  ], null);
  // hierro total 2 mg → 0.4 /100g; calcio: nadie lo tiene → null.
  expect(d.per100.iron_mg).toBeCloseTo(0.4, 5);
  expect(d.per100.calcium_mg).toBeNull();
});

test("peso efectivo 0 tira (receta vacía / sin peso)", () => {
  expect(() => deriveRecipe([], null)).toThrow();
});

test("agrega sin redondear: 50 g de un alimento de 89 kcal/100g → 89 kcal/100g (no 90)", () => {
  const alimento89 = { basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3, unitWeightG: null };
  const d = deriveRecipe([{ food: alimento89, quantity: 50, unit: "g" }], null);
  expect(d.effectiveWeightG).toBe(50);
  // per-100g debe recuperar la densidad de origen, no arrastrar el redondeo por-ingrediente.
  expect(d.per100.kcal).toBe(89);
  expect(d.per100.protein_g).toBeCloseTo(1.1, 5);
  expect(d.per100.carbs_g).toBeCloseTo(22.8, 5);
});

it("un ingrediente con cookingYield NO se convierte al derivar la receta", () => {
  // La conversión cocido→seco es una decisión del REGISTRO, no del armado de la receta:
  // las cantidades de los ingredientes ya son crudas y el agua del plato la captura cookedWeightG.
  const pastaSeca: MacroSource = {
    basis: "per_100g", kcal: 350, protein_g: 12, carbs_g: 70, fat_g: 1.5,
    unitWeightG: null, cookingYield: 2.2,
  } as MacroSource;
  const r = deriveRecipe([{ food: pastaSeca, quantity: 100, unit: "g" }], null);
  // 100 g × 350/100 = 350 kcal (sin dividir por 2.2).
  expect(r.total.kcal).toBe(350);
});

// --- sugarClass compuesto desde los ingredientes (NUT-10b) ---
// Frutas enteras (azúcar intrínseco) y un dulce (azúcar libre); todos con sugars_g > 0.
const manzana = { basis: "per_100g" as const, kcal: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, unitWeightG: null, sugars_g: 10 };
const pera = { basis: "per_100g" as const, kcal: 57, protein_g: 0.4, carbs_g: 15, fat_g: 0.1, unitWeightG: null, sugars_g: 10 };
const miel = { basis: "per_100g" as const, kcal: 304, protein_g: 0.3, carbs_g: 82, fat_g: 0, unitWeightG: null, sugars_g: 82 };

test("sugarClass: todos los que aportan azúcar son intrinsic → 'intrinsic'", () => {
  const d = deriveRecipe([
    { food: manzana, quantity: 150, unit: "g", sugarClass: "intrinsic" },
    { food: pera, quantity: 150, unit: "g", sugarClass: "intrinsic" },
  ], null);
  expect(d.sugarClass).toBe("intrinsic");
});

test("sugarClass: todos los que aportan azúcar son free → 'free'", () => {
  const d = deriveRecipe([
    { food: miel, quantity: 50, unit: "g", sugarClass: "free" },
  ], null);
  expect(d.sugarClass).toBe("free");
});

test("sugarClass: mezcla intrinsic + free → 'mixed'", () => {
  const d = deriveRecipe([
    { food: manzana, quantity: 150, unit: "g", sugarClass: "intrinsic" },
    { food: miel, quantity: 30, unit: "g", sugarClass: "free" },
  ], null);
  expect(d.sugarClass).toBe("mixed");
});

test("sugarClass: un ingrediente con azúcar y sugarClass null/undefined → 'mixed' (conservador)", () => {
  const d = deriveRecipe([
    { food: manzana, quantity: 150, unit: "g", sugarClass: "intrinsic" },
    { food: pera, quantity: 150, unit: "g" }, // aporta azúcar pero sugarClass desconocido
  ], null);
  expect(d.sugarClass).toBe("mixed");
});

test("sugarClass: ningún ingrediente aporta azúcar → null", () => {
  const d = deriveRecipe([
    { food: pollo, quantity: 200, unit: "g" }, // sugars_g ausente
    { food: agua, quantity: 300, unit: "ml" }, // sin micros
  ], null);
  expect(d.sugarClass).toBeNull();
});

test("sugarClass: solo cuentan los que aportan azúcar; un ingrediente 'mixed' SIN azúcar no contamina", () => {
  // Pollo con sugars_g 0 marcado 'mixed' — no aporta azúcar, así que se excluye; la fruta manda.
  const polloMixSinAzucar = { basis: "per_100g" as const, kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, unitWeightG: null, sugars_g: 0 };
  const d = deriveRecipe([
    { food: manzana, quantity: 150, unit: "g", sugarClass: "intrinsic" },
    { food: polloMixSinAzucar, quantity: 200, unit: "g", sugarClass: "mixed" },
  ], null);
  expect(d.sugarClass).toBe("intrinsic");
});
