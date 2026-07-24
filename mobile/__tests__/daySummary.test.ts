import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import type { Meal, WaterLog } from "@pulsia/shared";

const meal = (items: any[]): Meal => ({ id: "m", eatenAt: 1, mealType: null, note: null, items } as any);
const item = (o: any) => ({ id: "i", foodId: null, foodName: "x", quantity: 1, quantityUnit: "g", grams: 100,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, saturated_fat_g: null, sugars_g: null, fiber_g: null, sodium_mg: null, cholesterol_mg: null, water_ml: null, ...o });

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

test("la sal del día se deriva del sodio de los ítems, no de un campo salt_g", () => {
  // Los ítems ya NO guardan sal: guardan sodio. La app sigue hablando en sal (la referencia OMS
  // de 5 g/día es la que el usuario reconoce), así que el total se deriva acá.
  //
  // Los 50 mg no son un valor cualquiera: el total tiene que salir de SUMAR el sodio y convertir
  // UNA vez al final, no de convertir cada ítem y sumar los redondeos. Con 400 + 400 los dos
  // caminos dan 2 g y el test no distinguiría nada; con 50 + 50 divergen:
  //   sumar y convertir → 100 mg → 0,25 g → 0,3 g   (lo correcto)
  //   convertir y sumar → 0,1 + 0,1 = 0,2 g          (deriva por redondear por ítem)
  const meals = [meal([item({ sodium_mg: 50 }), item({ sodium_mg: 50 })])];
  const s = buildNutritionDaySummary(meals, []);
  expect(s.dayTotals.salt_g).toBe(0.3);
});

test("sin sodio en ningún ítem, la sal es null y no 0", () => {
  // "no sé cuánta sal comiste" no es "comiste 0 g de sal".
  const s = buildNutritionDaySummary([meal([item({})])], []);
  expect(s.dayTotals.salt_g).toBeNull();
});

test("un ítem con sodio y otro sin: el que falta cuenta como 0, no anula el total", () => {
  const s = buildNutritionDaySummary([meal([item({ sodium_mg: 400 }), item({})])], []);
  expect(s.dayTotals.salt_g).toBe(1);
});

test("un ítem con zinc y otro SIN zinc: el total del día queda marcado como parcial", () => {
  // La diferencia entre "comiste 0,8 mg de zinc" y "0,8 de los alimentos que sabemos". Sumar el
  // ausente como 0 en silencio afirma un dato que no tenemos.
  const s = buildNutritionDaySummary([meal([item({ zinc_mg: 0.8 }), item({})])], []);
  expect(s.nutrients.zinc_mg.value).toBe(0.8);
  expect(s.nutrients.zinc_mg.partial).toBe(true);
});

test("si TODOS los ítems declaran el zinc, el total NO es parcial", () => {
  const s = buildNutritionDaySummary([meal([item({ zinc_mg: 0.8 }), item({ zinc_mg: 0.2 })])], []);
  expect(s.nutrients.zinc_mg.value).toBe(1);
  expect(s.nutrients.zinc_mg.partial).toBe(false);
});

test("ningún ítem con el dato: no hay valor y tampoco es parcial (no falta una parte de nada)", () => {
  const s = buildNutritionDaySummary([meal([item({}), item({})])], []);
  expect(s.nutrients.zinc_mg.value).toBeNull();
  expect(s.nutrients.zinc_mg.partial).toBe(false);
});

test("cada nutriente se suma con los decimales que declara el registro, no todos a 1", () => {
  // El zinc declara 2 decimales: 0,12 + 0,13 = 0,25 mg. Sumado a 1 decimal daría 0,3 — un 20% de
  // más, en silencio, en un nutriente cuyos valores reales viven cerca del décimo de miligramo.
  const s = buildNutritionDaySummary([meal([item({ zinc_mg: 0.12 }), item({ zinc_mg: 0.13 })])], []);
  expect(s.nutrients.zinc_mg.value).toBe(0.25);
});

test("la sal hereda el parcial del sodio: es el mismo dato en otra unidad", () => {
  const s = buildNutritionDaySummary([meal([item({ sodium_mg: 400 }), item({})])], []);
  expect(s.dayTotals.salt_g).toBe(1);
  expect(s.nutrients.sodium_mg.partial).toBe(true);
});

test("sin comidas: totales en 0 y micros null", () => {
  const s = buildNutritionDaySummary([], []);
  expect(s.dayTotals.kcal).toBe(0);
  expect(s.dayTotals.sugars_g).toBeNull();
  expect(s.liquid).toEqual({ total: 0, drank: 0, fromFood: 0 });
});
