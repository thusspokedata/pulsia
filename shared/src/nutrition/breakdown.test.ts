import { test, expect } from "bun:test";
import { caloriesByMeal, macroSplit, foodsHighestIn } from "./breakdown";
import type { Meal } from "../schemas/nutrition";

const meal = (mealType: Meal["mealType"], kcals: number[]): Meal =>
  ({
    id: "m",
    eatenAt: 1,
    mealType,
    note: null,
    items: kcals.map((kcal) => ({ kcal, protein_g: 0, carbs_g: 0, fat_g: 0 })),
  }) as any;

test("agrupa por tipo de comida y calcula el % sobre el total del día", () => {
  const slices = caloriesByMeal([meal("desayuno", [300]), meal("cena", [700])]);
  expect(slices).toEqual([
    { key: "desayuno", label: "Desayuno", kcal: 300, pct: 30 },
    { key: "cena", label: "Cena", kcal: 700, pct: 70 },
  ]);
});

test("suma varias comidas del mismo tipo en una sola porción", () => {
  const slices = caloriesByMeal([meal("snack", [100]), meal("snack", [300])]);
  expect(slices).toEqual([{ key: "snack", label: "Snack", kcal: 400, pct: 100 }]);
});

test("mealType null cae en el bucket 'Sin tipo', al final del orden canónico", () => {
  const slices = caloriesByMeal([meal(null, [500]), meal("desayuno", [500])]);
  expect(slices.map((s) => s.key)).toEqual(["desayuno", "sin_tipo"]);
  expect(slices[1]).toEqual({ key: "sin_tipo", label: "Sin tipo", kcal: 500, pct: 50 });
});

test("respeta el orden canónico, no el orden de llegada", () => {
  const slices = caloriesByMeal([meal("cena", [100]), meal("desayuno", [100]), meal("almuerzo", [100])]);
  expect(slices.map((s) => s.key)).toEqual(["desayuno", "almuerzo", "cena"]);
});

test("los pct se redondean por separado y pueden no sumar 100 (la torta usa kcal, no pct)", () => {
  const slices = caloriesByMeal([meal("desayuno", [100]), meal("almuerzo", [100]), meal("cena", [100])]);
  expect(slices.map((s) => s.pct)).toEqual([33, 33, 33]); // suman 99, a propósito
});

test("las comidas de 0 kcal no generan porción", () => {
  const slices = caloriesByMeal([meal("desayuno", [0]), meal("cena", [500])]);
  expect(slices.map((s) => s.key)).toEqual(["cena"]);
});

test("día sin comidas → sin porciones", () => {
  expect(caloriesByMeal([])).toEqual([]);
});

test("reparte las kcal por macro (4/4/9) y calcula el % sobre las kcal DERIVADAS de los macros", () => {
  // 100 g prot = 400 kcal · 100 g carbs = 400 kcal · 22.2 g grasa ≈ 200 kcal → total 1000
  const slices = macroSplit({ protein_g: 100, carbs_g: 100, fat_g: 22.2 }, null);
  expect(slices.map((s) => s.kcal)).toEqual([400, 400, 200]);
  expect(slices.map((s) => s.pctActual)).toEqual([40, 40, 20]);
});

test("sin meta, pctTarget es null en todas las porciones", () => {
  const slices = macroSplit({ protein_g: 100, carbs_g: 100, fat_g: 22.2 }, null);
  expect(slices.map((s) => s.pctTarget)).toEqual([null, null, null]);
});

test("con meta, pctTarget sale de la meta (no de lo comido)", () => {
  const slices = macroSplit(
    { protein_g: 10, carbs_g: 10, fat_g: 10 },
    { protein_g: 150, carbs_g: 200, fat_g: 66.7 }, // 600 + 800 + 600 = 2000 kcal → 30/40/30
  );
  expect(slices.map((s) => s.pctTarget)).toEqual([30, 40, 30]);
});

test("día vacío: 0 g, 0 kcal y 0% (sin NaN por dividir por cero)", () => {
  const slices = macroSplit({ protein_g: 0, carbs_g: 0, fat_g: 0 }, null);
  expect(slices.map((s) => s.pctActual)).toEqual([0, 0, 0]);
  expect(slices.map((s) => s.kcal)).toEqual([0, 0, 0]);
});

test("las keys y el orden son proteína, carbos, grasa (mismo orden que las barras del Resumen)", () => {
  const slices = macroSplit({ protein_g: 1, carbs_g: 1, fat_g: 1 }, null);
  expect(slices.map((s) => s.key)).toEqual(["protein", "carbs", "fat"]);
});

test("meta con todo en 0 se trata como si no hubiera meta (pctTarget null, no 0/0)", () => {
  const slices = macroSplit({ protein_g: 100, carbs_g: 100, fat_g: 22.2 }, { protein_g: 0, carbs_g: 0, fat_g: 0 });
  expect(slices.map((s) => s.pctTarget)).toEqual([null, null, null]);
  expect(slices.map((s) => s.pctActual)).toEqual([40, 40, 20]); // lo comido no se ve afectado
});

// El fixture de arriba (`meal`) solo pone kcal. Para el ranking hacen falta ítems con nombre,
// gramos y micros, así que va uno propio.
const itemsMeal = (items: any[]): Meal => ({ id: "m", eatenAt: 1, mealType: null, note: null, items } as any);
const it = (foodName: string, grams: number, o: any = {}) =>
  ({ foodName, grams, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cholesterol_mg: null, sugars_g: null, ...o });

test("ordena los alimentos por aporte del nutriente, de mayor a menor", () => {
  const meals = [itemsMeal([it("Queso", 100, { cholesterol_mg: 90 }), it("Huevo", 60, { cholesterol_mg: 220 })])];
  expect(foodsHighestIn(meals, "cholesterol_mg").map((f) => f.name)).toEqual(["Huevo", "Queso"]);
});

test("suma el mismo alimento comido varias veces (aporte y gramos)", () => {
  const meals = [
    itemsMeal([it("Queso", 100, { cholesterol_mg: 90 })]),
    itemsMeal([it("Queso", 50, { cholesterol_mg: 45 })]),
  ];
  expect(foodsHighestIn(meals, "cholesterol_mg")).toEqual([
    { name: "Queso", amount: 135, grams: 150, pctOfTotal: 100 },
  ]);
});

test("el % es sobre el total del nutriente en el rango", () => {
  const meals = [itemsMeal([it("Queso", 100, { cholesterol_mg: 75 }), it("Huevo", 60, { cholesterol_mg: 225 })])];
  expect(foodsHighestIn(meals, "cholesterol_mg").map((f) => f.pctOfTotal)).toEqual([75, 25]);
});

test("los ítems SIN el dato se saltean y no cuentan en el total", () => {
  // Si el alimento sin dato contara como 0, seguiría apareciendo con 0% y ensuciaría la lista.
  const meals = [itemsMeal([it("Queso", 100, { cholesterol_mg: 100 }), it("Lechuga", 50)])];
  const ranked = foodsHighestIn(meals, "cholesterol_mg");
  expect(ranked.map((f) => f.name)).toEqual(["Queso"]);
  expect(ranked[0].pctOfTotal).toBe(100);
});

test("los ítems con el dato en 0 tampoco aparecen (aportan nada que aprender)", () => {
  const meals = [itemsMeal([it("Queso", 100, { cholesterol_mg: 100 }), it("Manzana", 150, { cholesterol_mg: 0 })])];
  expect(foodsHighestIn(meals, "cholesterol_mg").map((f) => f.name)).toEqual(["Queso"]);
});

test("empate de aporte: ordena por nombre, para que la lista no baile entre renders", () => {
  const meals = [itemsMeal([it("Zapallo", 100, { sugars_g: 5 }), it("Aceituna", 100, { sugars_g: 5 })])];
  expect(foodsHighestIn(meals, "sugars_g").map((f) => f.name)).toEqual(["Aceituna", "Zapallo"]);
});

test("sin comidas, o sin ningún dato del nutriente → lista vacía (sin dividir por cero)", () => {
  expect(foodsHighestIn([], "cholesterol_mg")).toEqual([]);
  expect(foodsHighestIn([itemsMeal([it("Lechuga", 50)])], "cholesterol_mg")).toEqual([]);
});

test("el ranking de SAL sale del sodio del ítem, y en gramos de sal", () => {
  // El snapshot del ítem guarda sodio; el ranking habla en sal, como el resto de la app.
  // 800 mg → 2 g de sal; 200 mg → 0,5 g.
  const meals = [itemsMeal([it("Jamón", 100, { sodium_mg: 800 }), it("Pan", 80, { sodium_mg: 200 })])];
  expect(foodsHighestIn(meals, "salt_g")).toEqual([
    { name: "Jamón", amount: 2, grams: 100, pctOfTotal: 80 },
    { name: "Pan", amount: 0.5, grams: 80, pctOfTotal: 20 },
  ]);
});

test("un ítem sin sodio no entra al ranking de sal (ni como 0)", () => {
  const meals = [itemsMeal([it("Jamón", 100, { sodium_mg: 800 }), it("Lechuga", 50)])];
  expect(foodsHighestIn(meals, "salt_g").map((f) => f.name)).toEqual(["Jamón"]);
});
