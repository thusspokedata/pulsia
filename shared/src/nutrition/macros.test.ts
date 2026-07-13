import { test, expect } from "bun:test";
import { foodMacrosForQuantity } from "./macros";

const banana = { basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120 };
const leche = { basis: "per_100ml" as const, kcal: 42, protein_g: 3.4, carbs_g: 5, fat_g: 1, unitWeightG: null };

test("escala por gramos", () => {
  const r = foodMacrosForQuantity({ ...banana, unitWeightG: null }, 200, "g");
  expect(r.grams).toBe(200);
  expect(r.kcal).toBe(178);       // 89 * 2, entero
  expect(r.protein_g).toBe(2.2);  // 1 decimal
});

test("escala por ml (líquido)", () => {
  const r = foodMacrosForQuantity(leche, 200, "ml");
  expect(r.grams).toBe(200);
  expect(r.kcal).toBe(84);
  expect(r.protein_g).toBe(6.8);
});

test("por unidad usa unitWeightG", () => {
  const r = foodMacrosForQuantity(banana, 1, "unit");
  expect(r.grams).toBe(120);
  expect(r.kcal).toBe(107);       // 89 * 1.2 = 106.8 → 107
  expect(r.carbs_g).toBe(27.6);   // 23 * 1.2
});

test("por unidad con varias unidades", () => {
  expect(foodMacrosForQuantity(banana, 2, "unit").grams).toBe(240);
});

test("error si unit y unitWeightG null", () => {
  expect(() => foodMacrosForQuantity(leche, 1, "unit")).toThrow(/unidad/i);
});

test("error si g con basis per_100ml", () => {
  expect(() => foodMacrosForQuantity(leche, 100, "g")).toThrow(/coheren|basis|unidad/i);
});

test("error si ml con basis per_100g", () => {
  expect(() => foodMacrosForQuantity({ ...banana, unitWeightG: null }, 100, "ml")).toThrow(/coheren|basis|unidad/i);
});
