import { test, expect } from "bun:test";
import { caloriesByMeal } from "./breakdown";
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
