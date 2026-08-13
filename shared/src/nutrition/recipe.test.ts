import { test, expect } from "bun:test";
import { deriveRecipe } from "./recipe";

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
