import { test, expect } from "bun:test";
import { foodMacrosForQuantity, sumNullableMicro } from "./macros";

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

const muesli = {
  basis: "per_100g" as const, kcal: 442, protein_g: 9.9, carbs_g: 63, fat_g: 14.8, unitWeightG: null,
  saturated_fat_g: 4.2, sugars_g: 14, fiber_g: 8.4, salt_g: 0.2,
};

test("escala los micros cuando el alimento los tiene", () => {
  const r = foodMacrosForQuantity(muesli, 50, "g");
  expect(r.sugars_g).toBe(7);       // 14 * 0.5
  expect(r.fiber_g).toBe(4.2);      // 8.4 * 0.5
  expect(r.saturated_fat_g).toBe(2.1);
  expect(r.salt_g).toBe(0.1);
});

test("micros ausentes → null (alimento legacy sin micros)", () => {
  const legacy = { basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: null };
  const r = foodMacrosForQuantity(legacy, 100, "g");
  expect(r.sugars_g).toBeNull();
  expect(r.fiber_g).toBeNull();
  expect(r.saturated_fat_g).toBeNull();
  expect(r.salt_g).toBeNull();
  expect(r.kcal).toBe(89); // los macros core no se tocan
});

test("un micro null puntual escala a null, el resto sí", () => {
  const partial = { ...muesli, sugars_g: null };
  const r = foodMacrosForQuantity(partial, 100, "g");
  expect(r.sugars_g).toBeNull();
  expect(r.fiber_g).toBe(8.4);
});

test("sumNullableMicro: todos null → null", () => {
  expect(sumNullableMicro([null, null, undefined])).toBeNull();
});

test("sumNullableMicro: array vacío → null", () => {
  expect(sumNullableMicro([])).toBeNull();
});

test("sumNullableMicro: mezcla trata null como 0", () => {
  expect(sumNullableMicro([8.4, null])).toBe(8.4);
});

test("sumNullableMicro: todos presentes suma", () => {
  expect(sumNullableMicro([7, 10])).toBe(17);
});

test("sumNullableMicro: suma redondeada a 1 decimal", () => {
  expect(sumNullableMicro([2.1, 1.2])).toBe(3.3);
});
