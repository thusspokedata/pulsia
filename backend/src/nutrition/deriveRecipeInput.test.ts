import { test, expect } from "bun:test";
import { applyRecipeDerivation, RecipeValidationError } from "./deriveRecipeInput";

const POLLO_ID = "11111111-1111-4111-8111-111111111111";

// Fila de `food` (drizzle camelCase) para 165 kcal/100g de pollo, sin micros.
const polloRow = {
  id: POLLO_ID, userId: "u", name: "Pollo", basis: "per_100g",
  kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, unitWeightG: null, createdAt: new Date(0),
  sourceMacros: "usda", sourceMicros: null, usdaFdcId: 1234,
  saturatedFatG: null, sugarsG: null, fiberG: null, sodiumMg: null, ironMg: 1, calciumMg: null,
};

// Input tal como lo mandaría el cliente: un alimento "receta" con kcal deliberadamente MAL (9999).
function recetaInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Milanesa al horno", basis: "per_100g" as const,
    kcal: 9999, protein_g: 1, carbs_g: 1, fat_g: 1,
    unitWeightG: 200, sourceMacros: "recipe" as const, sourceMicros: "ai" as const, usdaFdcId: 5,
    recipe: { items: [{ foodId: POLLO_ID, quantity: 200, unit: "g" as const }], cookedWeightG: null },
    ...overrides,
  };
}

test("server sobreescribe los macros del cliente con los derivados de los ingredientes", () => {
  const catalog = new Map([[POLLO_ID, polloRow as any]]);
  const out = applyRecipeDerivation(recetaInput() as any, catalog);
  // 200g de pollo (165 kcal/100g), sin cookedWeightG → effectiveWeight = 200g → per100 = 165 kcal/100g.
  expect(out.kcal).toBe(165);
  expect(out.kcal).not.toBe(9999);
  expect(out.protein_g).toBe(31);
  expect(out.sourceMacros).toBe("recipe");
  expect(out.basis).toBe("per_100g");
  expect(out.recipe).toEqual(recetaInput().recipe);
  // Forzados por ser receta: no hay unitWeightG/usdaFdcId/sourceMicros propios.
  expect(out.unitWeightG).toBeNull();
  expect(out.sourceMicros).toBeNull();
  expect(out.usdaFdcId).toBeNull();
});

test("ingrediente inexistente en el catálogo → tira RecipeValidationError", () => {
  const catalog = new Map<string, any>(); // vacío
  expect(() => applyRecipeDerivation(recetaInput() as any, catalog)).toThrow(RecipeValidationError);
});

test("alimento común (sin recipe) se devuelve intacto", () => {
  const input = {
    name: "Banana", basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3,
    unitWeightG: 120, sourceMacros: "ai" as const, sourceMicros: null,
  };
  const out = applyRecipeDerivation(input as any, new Map());
  expect(out).toEqual(input as any);
});
