import { buildMealInput, itemPreview, mealTotals, allowedUnits } from "../src/nutrition/mealForm";

const banana = { id: "f1", name: "Banana", basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, source: "estimate" as const, createdAt: 0 };
const leche = { id: "f2", name: "Leche", basis: "per_100ml" as const, kcal: 42, protein_g: 3.4, carbs_g: 5, fat_g: 1, unitWeightG: null, source: "label" as const, createdAt: 0 };

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
