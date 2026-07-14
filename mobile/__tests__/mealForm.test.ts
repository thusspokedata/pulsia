import { buildMealInput, itemPreview, mealTotals, allowedUnits } from "../src/nutrition/mealForm";

const banana = { id: "f1", name: "Banana", basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, source: "estimate" as const, createdAt: 0, saturated_fat_g: 0.1, sugars_g: 12, fiber_g: 2.6, salt_g: 0, cholesterol_mg: 0, water_ml: 75 };
const leche = { id: "f2", name: "Leche", basis: "per_100ml" as const, kcal: 42, protein_g: 3.4, carbs_g: 5, fat_g: 1, unitWeightG: null, source: "label" as const, createdAt: 0, saturated_fat_g: 0.6, sugars_g: 5, fiber_g: null, salt_g: 0.1, cholesterol_mg: 10, water_ml: 88 };

test("allowedUnits: sólido con unitWeightG → g + unit", () => {
  expect(allowedUnits(banana)).toEqual(["g", "unit"]);
});

test("allowedUnits: líquido sin unitWeightG → ml", () => {
  expect(allowedUnits(leche)).toEqual(["ml"]);
});

test("itemPreview escala los macros del ítem", () => {
  expect(itemPreview(banana, 1, "unit")).toMatchObject({ grams: 120, kcal: 107 });
});

test("buildMealInput arma el payload con eatenAt y tipo", () => {
  const input = buildMealInput({
    eatenAt: 123, mealType: "desayuno", note: "",
    rows: [{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }],
  });
  expect(input.eatenAt).toBe(123);
  expect(input.mealType).toBe("desayuno");
  expect(input.note).toBeNull(); // "" → null
  expect(input.items).toEqual([
    { foodId: "f1", quantity: 1, quantityUnit: "unit" },
    { foodId: "f2", quantity: 200, quantityUnit: "ml" },
  ]);
});

test("mealTotals suma kcal y macros de todos los ítems", () => {
  const t = mealTotals([{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }]);
  expect(t.kcal).toBe(107 + 84);
  expect(t.protein_g).toBeCloseTo(1.3 + 6.8, 1);
});

test("mealTotals suma los micros (null-safe)", () => {
  const t = mealTotals([{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }]);
  // banana 1u=120g: sugars 14.4, sat 0.1, fiber 3.1, salt 0 ; leche 200ml: sugars 10, sat 1.2, fiber null, salt 0.2
  expect(t.sugars_g).toBeCloseTo(24.4, 1);
  expect(t.saturated_fat_g).toBeCloseTo(1.3, 1);
  expect(t.fiber_g).toBeCloseTo(3.1, 1); // leche fiber null → cuenta como 0, pero banana lo tiene → total presente
  expect(t.salt_g).toBeCloseTo(0.2, 1);
});

test("mealTotals: un micro null en TODOS los ítems → total null", () => {
  const noFiber = { ...banana, fiber_g: null };
  const t = mealTotals([{ food: noFiber, quantity: 100, unit: "g" }]);
  expect(t.fiber_g).toBeNull();
});

test("mealTotals suma colesterol y agua", () => {
  const t = mealTotals([{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }]);
  // banana 1u=120g: chol 0, agua 90 ; leche 200ml: chol 20, agua 176
  expect(t.cholesterol_mg).toBeCloseTo(20, 1);
  expect(t.water_ml).toBeCloseTo(266, 0);
});
