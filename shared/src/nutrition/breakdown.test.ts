import { test, expect } from "bun:test";
import { caloriesByMeal, macroSplit } from "./breakdown";
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
