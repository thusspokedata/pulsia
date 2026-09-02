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

// NUT-10b: la clase de azúcar de la receta se compone desde la de sus ingredientes. Sin reenviar
// `sugarClass`, una ensalada 100% fruta entera caería en "mixed" y volvería a marcar "azúcar alto".
const manzana = { id: "f3", name: "Manzana", basis: "per_100g" as const, kcal: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, unitWeightG: null, sourceMacros: "usda" as const, sourceMicros: "usda" as const, createdAt: 0, sugars_g: 10, sugarClass: "intrinsic" as const } as any;
const miel = { id: "f4", name: "Miel", basis: "per_100g" as const, kcal: 304, protein_g: 0.3, carbs_g: 82, fat_g: 0, unitWeightG: null, sourceMacros: "usda" as const, sourceMicros: "usda" as const, createdAt: 0, sugars_g: 82, sugarClass: "free" as const } as any;

test("recipeTotals: receta 100% fruta entera → sugarClass intrinsic (reenvía la clase del ingrediente)", () => {
  const t = recipeTotals([
    { food: manzana, quantity: 100, unit: "g" },
    { food: manzana, quantity: 150, unit: "g" },
  ], null);
  expect(t.sugarClass).toBe("intrinsic");
});

test("recipeTotals: fruta + miel → mixed; ingrediente sin azúcar (agua) no contamina", () => {
  expect(recipeTotals([
    { food: manzana, quantity: 100, unit: "g" },
    { food: miel, quantity: 20, unit: "g" },
    { food: agua, quantity: 100, unit: "ml" },
  ], null).sugarClass).toBe("mixed");
});

test("buildRecipeFoodInput incluye el sugarClass compuesto de la receta", () => {
  const input = buildRecipeFoodInput({
    name: "Ensalada de frutas",
    rows: [{ food: manzana, quantity: 200, unit: "g" }],
    cookedWeightG: null,
  });
  expect(input.sugarClass).toBe("intrinsic");
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

test("filterIngredientMatches: insensible a acentos en ambas direcciones", () => {
  const foods = [
    { id: "f1", name: "Plátano" },
    { id: "f2", name: "Platano maduro" },
  ] as any;
  // sin acento en el query encuentra el nombre acentuado
  expect(filterIngredientMatches(foods, "platano").map((f: any) => f.id)).toEqual(["f1", "f2"]);
  // con acento en el query encuentra el nombre sin acento
  expect(filterIngredientMatches(foods, "plátano").map((f: any) => f.id)).toEqual(["f1", "f2"]);
});
