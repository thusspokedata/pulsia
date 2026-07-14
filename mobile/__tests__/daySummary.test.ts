import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import type { Meal, WaterLog } from "@pulsia/shared";

const meal = (items: any[]): Meal => ({ id: "m", eatenAt: 1, mealType: null, note: null, items } as any);
const item = (o: any) => ({ id: "i", foodId: null, foodName: "x", quantity: 1, quantityUnit: "g", grams: 100,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, saturated_fat_g: null, sugars_g: null, fiber_g: null, salt_g: null, cholesterol_mg: null, water_ml: null, ...o });

test("suma kcal/macros y micros null-safe", () => {
  const meals = [meal([item({ kcal: 200, protein_g: 10, carbs_g: 20, fat_g: 5, sugars_g: 8, cholesterol_mg: 50, water_ml: 40 }), item({ kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 2 })])];
  const s = buildNutritionDaySummary(meals, []);
  expect(s.dayTotals.kcal).toBe(300);
  expect(s.dayTotals.protein_g).toBe(15);
  expect(s.dayTotals.sugars_g).toBe(8);   // uno con dato, el otro null → 8
  expect(s.dayTotals.fiber_g).toBeNull();  // ninguno tiene → null
  expect(s.cholesterolMg).toBe(50);
});

test("líquido = agua tomada + aporte de alimentos", () => {
  const meals = [meal([item({ water_ml: 40 }), item({ water_ml: 60 })])];
  const water: WaterLog[] = [{ id: "w1", ml: 250, loggedAt: 1 }, { id: "w2", ml: 250, loggedAt: 2 }];
  const s = buildNutritionDaySummary(meals, water);
  expect(s.liquid).toEqual({ total: 600, drank: 500, fromFood: 100 });
});

test("sin comidas: totales en 0 y micros null", () => {
  const s = buildNutritionDaySummary([], []);
  expect(s.dayTotals.kcal).toBe(0);
  expect(s.dayTotals.sugars_g).toBeNull();
  expect(s.liquid).toEqual({ total: 0, drank: 0, fromFood: 0 });
});
