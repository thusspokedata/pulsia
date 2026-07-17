import { dailyNutrientSeries } from "../src/nutrition/nutrientSeries";
import type { Meal } from "@pulsia/shared";

// Julio 2026, hora local. El mes es 0-indexado en Date.
const at = (day: number, hour: number) => new Date(2026, 6, day, hour).getTime();
const noon = (day: number) => new Date(2026, 6, day, 12).getTime();

const meal = (eatenAt: number, cholesterols: (number | null)[]): Meal =>
  ({
    id: "m",
    eatenAt,
    mealType: null,
    note: null,
    items: cholesterols.map((cholesterol_mg) => ({
      foodName: "x", grams: 100, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
      cholesterol_mg, sugars_g: null, fiber_g: null, saturated_fat_g: null, salt_g: null, water_ml: null,
    })),
  }) as any;

test("un punto por día, anclado al MEDIODÍA local (no a la hora de la comida)", () => {
  const { points } = dailyNutrientSeries([meal(at(10, 8), [100])], "cholesterol_mg");
  expect(points).toEqual([{ x: noon(10), y: 100 }]);
});

test("varias comidas del mismo día se suman en un solo punto", () => {
  // Desayuno 8am y cena 22pm del día 10: un punto, no dos.
  const meals = [meal(at(10, 8), [100]), meal(at(10, 22), [50])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points).toEqual([{ x: noon(10), y: 150 }]);
});

test("los puntos salen ordenados por fecha, no por orden de llegada", () => {
  const meals = [meal(at(12, 8), [30]), meal(at(10, 8), [10]), meal(at(11, 8), [20])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points.map((p) => p.y)).toEqual([10, 20, 30]);
});

test("un día SIN el dato no genera punto (no es lo mismo 'comí 0' que 'no sé')", () => {
  const meals = [meal(at(10, 8), [100]), meal(at(11, 8), [null])];
  const { points } = dailyNutrientSeries(meals, "cholesterol_mg");
  expect(points).toEqual([{ x: noon(10), y: 100 }]);
});

test("un día con el dato en 0 SÍ genera punto (es información real)", () => {
  const meals = [meal(at(10, 8), [100]), meal(at(11, 8), [0])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points.map((p) => p.y)).toEqual([100, 0]);
});

test("un día mixto (un ítem con dato, otro sin) suma tratando el null como 0", () => {
  // Mismo criterio que sumNullableMicro y que el total del día en la pestaña Nutrientes.
  expect(dailyNutrientSeries([meal(at(10, 8), [100, null])], "cholesterol_mg").points).toEqual([
    { x: noon(10), y: 100 },
  ]);
});

test("el promedio es sobre los días CON registro, no sobre el rango", () => {
  // 3 días registrados de un rango que podría ser de 30: 300/3 = 100, no 300/30.
  const meals = [meal(at(10, 8), [50]), meal(at(11, 8), [100]), meal(at(12, 8), [150])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").average).toBe(100);
});

test("sin comidas, o sin ningún dato del nutriente: sin puntos y promedio null", () => {
  expect(dailyNutrientSeries([], "cholesterol_mg")).toEqual({ points: [], average: null });
  expect(dailyNutrientSeries([meal(at(10, 8), [null])], "cholesterol_mg")).toEqual({ points: [], average: null });
});
