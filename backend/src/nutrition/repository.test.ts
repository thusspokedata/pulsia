import { test, expect } from "bun:test";
import { snapshotItems, toFood, toMeal } from "./repository";

const banana = {
  id: "11111111-1111-4111-8111-111111111111", userId: "u", name: "Banana", basis: "per_100g",
  kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, unitWeightG: 120, source: "estimate", createdAt: new Date(0),
};

test("toFood mapea la fila a Food del shared", () => {
  const f = toFood(banana as any);
  expect(f).toMatchObject({ id: banana.id, name: "Banana", basis: "per_100g", protein_g: 1.1, unitWeightG: 120, source: "estimate" });
  expect(f.createdAt).toBe(0);
});

test("snapshotItems calcula macros por ítem desde el catálogo", () => {
  const items = snapshotItems(
    [{ foodId: banana.id, quantity: 1, quantityUnit: "unit" }],
    new Map([[banana.id, banana as any]]),
  );
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ foodId: banana.id, foodName: "Banana", grams: 120, kcal: 107, quantityUnit: "unit" });
});

test("snapshotItems tira si un foodId no está en el catálogo", () => {
  expect(() => snapshotItems([{ foodId: "x", quantity: 1, quantityUnit: "g" }], new Map())).toThrow(/no encontrado|catálogo/i);
});

test("toMeal arma la comida con sus ítems", () => {
  const row = { id: "22222222-2222-4222-8222-222222222222", eatenAt: 5, mealType: "desayuno", note: null };
  const m = toMeal(row as any, [{
    id: "33333333-3333-4333-8333-333333333333", foodId: banana.id, foodName: "Banana",
    quantity: 1, quantityUnit: "unit", grams: 120, kcal: 107, proteinG: 1.3, carbsG: 27.6, fatG: 0.4,
  }] as any);
  expect(m).toMatchObject({ id: row.id, eatenAt: 5, mealType: "desayuno", note: null });
  expect(m.items[0]).toMatchObject({ foodName: "Banana", protein_g: 1.3, carbs_g: 27.6, fat_g: 0.4 });
});
