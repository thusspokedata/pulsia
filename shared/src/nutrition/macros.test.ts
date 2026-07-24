import { test, expect } from "bun:test";
import { foodMacrosForQuantity, sumNullableMicro, sumNutrient, sumNutrientByKey } from "./macros";
import { NUTRIENT_KEYS } from "./nutrients";

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
  saturated_fat_g: 4.2, sugars_g: 14, fiber_g: 8.4, sodium_mg: 0.2,
};

test("escala los micros cuando el alimento los tiene", () => {
  const r = foodMacrosForQuantity(muesli, 50, "g");
  expect(r.sugars_g).toBe(7);       // 14 * 0.5
  expect(r.fiber_g).toBe(4.2);      // 8.4 * 0.5
  expect(r.saturated_fat_g).toBe(2.1);
  expect(r.sodium_mg).toBe(0.1);
});

test("micros ausentes → null (alimento legacy sin micros)", () => {
  const legacy = { basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: null };
  const r = foodMacrosForQuantity(legacy, 100, "g");
  expect(r.sugars_g).toBeNull();
  expect(r.fiber_g).toBeNull();
  expect(r.saturated_fat_g).toBeNull();
  expect(r.sodium_mg).toBeNull();
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

const yema = {
  basis: "per_100g" as const, kcal: 322, protein_g: 16, carbs_g: 3.6, fat_g: 27, unitWeightG: 17,
  cholesterol_mg: 1085, water_ml: 50,
};

test("escala colesterol y agua cuando el alimento los tiene", () => {
  const r = foodMacrosForQuantity(yema, 100, "g");
  expect(r.cholesterol_mg).toBe(1085);
  expect(r.water_ml).toBe(50);
  const half = foodMacrosForQuantity(yema, 50, "g");
  expect(half.cholesterol_mg).toBe(542.5); // 1085 * 0.5
  expect(half.water_ml).toBe(25);
});

test("colesterol y agua ausentes → null (alimento legacy)", () => {
  const legacy = { basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: null };
  const r = foodMacrosForQuantity(legacy, 100, "g");
  expect(r.cholesterol_mg).toBeNull();
  expect(r.water_ml).toBeNull();
});

test("escala TODOS los nutrientes del registro, no una lista a mano", () => {
  const food = {
    basis: "per_100g" as const,
    kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10,
    unitWeightG: null,
    // 1 en cada nutriente del registro
    ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 1])),
  };
  const out = foodMacrosForQuantity(food as never, 200, "g");
  for (const k of NUTRIENT_KEYS) {
    expect((out as Record<string, unknown>)[k]).toBe(2); // 200 g = factor 2
  }
});

test("un nutriente ausente queda null, no 0", () => {
  const food = {
    basis: "per_100g" as const,
    kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10, unitWeightG: null,
  };
  const out = foodMacrosForQuantity(food as never, 200, "g");
  expect(out.zinc_mg).toBe(null);
  expect(out.zinc_mg).not.toBe(0);
});

test("todos con dato: total completo", () => {
  expect(sumNutrient([1, 2, 3])).toEqual({ value: 6, partial: false, withData: 3, total: 3 });
});

test("algunos sin dato: total PARCIAL", () => {
  expect(sumNutrient([1, null, 3])).toEqual({ value: 4, partial: true, withData: 2, total: 3 });
});

test("ninguno con dato: value null y no es parcial (no hay nada que completar)", () => {
  expect(sumNutrient([null, null])).toEqual({ value: null, partial: false, withData: 0, total: 2 });
});

test("undefined cuenta como sin dato, igual que null", () => {
  expect(sumNutrient([1, undefined])).toEqual({ value: 1, partial: true, withData: 1, total: 2 });
});

test("lista vacía", () => {
  expect(sumNutrient([])).toEqual({ value: null, partial: false, withData: 0, total: 0 });
});

test("sumNullableMicro sigue devolviendo lo mismo que antes", () => {
  expect(sumNullableMicro([1, null, 3])).toBe(4);
  expect(sumNullableMicro([null, null])).toBe(null);
});

test("sumNutrient sin decimals: default 1 (compatibilidad)", () => {
  expect(sumNutrient([0.04, 0.04, 0.04]).value).toBe(0.1);
});

test("sumNutrient con decimals explícito: no pierde precisión", () => {
  expect(sumNutrient([0.04, 0.04, 0.04], 2).value).toBe(0.12);
});

test("sumNutrientByKey: zinc_mg usa los 2 decimales que declara el registro", () => {
  expect(sumNutrientByKey([0.04, 0.04, 0.04], "zinc_mg").value).toBe(0.12);
});

test("sumNutrientByKey: calcium_mg usa 1 decimal, distinto de zinc_mg", () => {
  expect(sumNutrientByKey([0.04, 0.04, 0.04], "calcium_mg").value).toBe(0.1);
});

test("sumNutrient: partial/withData/total no cambian con distintos decimals", () => {
  const a = sumNutrient([1, null, 3], 0);
  const b = sumNutrient([1, null, 3], 3);
  expect(a.partial).toBe(true);
  expect(b.partial).toBe(true);
  expect(a.withData).toBe(2);
  expect(b.withData).toBe(2);
  expect(a.total).toBe(3);
  expect(b.total).toBe(3);
});

test("respeta los decimales declarados en el registro", () => {
  const food = {
    basis: "per_100g" as const,
    kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10, unitWeightG: null,
    iron_mg: 1.239,     // decimals: 2
    calcium_mg: 1.239,  // decimals: 1
  };
  const out = foodMacrosForQuantity(food as never, 100, "g");
  expect(out.iron_mg).toBe(1.24);
  expect(out.calcium_mg).toBe(1.2);
});
