import { recipeTotals, buildRecipeFoodInput, parseQuantityInput, filterIngredientMatches } from "../src/nutrition/recipeForm";

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

test("parseQuantityInput: número normal, coma decimal, y rechazo de no-finitos", () => {
  expect(parseQuantityInput("100")).toBe(100);
  expect(parseQuantityInput("1,5")).toBe(1.5);
  expect(parseQuantityInput("")).toBe(0);
  expect(parseQuantityInput("abc")).toBe(0);
  expect(parseQuantityInput("1e309")).toBe(0); // Infinity → 0 (no finito)
});

test("filterIngredientMatches: filtra por nombre y excluye el alimento en edición", () => {
  const foods = [
    { id: "f1", name: "Pollo" },
    { id: "f9", name: "Cazuela de pollo" },
  ] as any;
  // busca "pollo" → matchean ambos por substring
  expect(filterIngredientMatches(foods, "pollo").map((f: any) => f.id)).toEqual(["f1", "f9"]);
  // editando la cazuela (f9): no puede agregarse a sí misma
  expect(filterIngredientMatches(foods, "pollo", "f9").map((f: any) => f.id)).toEqual(["f1"]);
  // query vacía → sin resultados
  expect(filterIngredientMatches(foods, "   ")).toEqual([]);
});
