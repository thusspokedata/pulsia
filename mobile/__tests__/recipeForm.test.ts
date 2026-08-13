import { recipeTotals, buildRecipeFoodInput } from "../src/nutrition/recipeForm";

const pollo = { id: "f1", name: "Pollo", basis: "per_100g" as const, kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, unitWeightG: null, sourceMacros: "usda" as const, sourceMicros: "usda" as const, createdAt: 0, iron_mg: 1 } as any;
const agua = { id: "f2", name: "Agua", basis: "per_100ml" as const, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, sourceMacros: "manual" as const, sourceMicros: null, createdAt: 0 } as any;

test("recipeTotals expone total y per100 y peso efectivo", () => {
  const t = recipeTotals([
    { food: pollo, quantity: 200, unit: "g" },
    { food: agua, quantity: 300, unit: "ml" },
  ], null);
  expect(t.effectiveWeightG).toBe(500);
  expect(t.total.kcal).toBe(330);
  expect(t.per100.kcal).toBe(66);
});

test("buildRecipeFoodInput arma un FoodInput per-100g con recipe y sourceMacros 'recipe'", () => {
  const input = buildRecipeFoodInput({
    name: "  Cazuela  ",
    rows: [{ food: pollo, quantity: 200, unit: "g" }, { food: agua, quantity: 300, unit: "ml" }],
    cookedWeightG: 500,
  });
  expect(input.name).toBe("Cazuela");
  expect(input.basis).toBe("per_100g");
  expect(input.sourceMacros).toBe("recipe");
  expect(input.sourceMicros).toBeNull();
  expect(input.unitWeightG).toBeNull();
  expect(input.kcal).toBe(66);
  expect(input.recipe?.items).toEqual([
    { foodId: "f1", quantity: 200, unit: "g" },
    { foodId: "f2", quantity: 300, unit: "ml" },
  ]);
  expect(input.recipe?.cookedWeightG).toBe(500);
});
