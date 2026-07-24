import { test, expect } from "bun:test";
import { filterFoodsByNutrient } from "./nutrientFilter";

const food = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  basis: "per_100g" as const,
  fat_g: 0, saturated_fat_g: 0, sugars_g: 0,
  sodium_mg: 0, cholesterol_mg: 0, fiber_g: 0,
  ...over,
});

test("filtra a los altos y ordena de mayor a menor", () => {
  const foods = [
    food("manzana", { sugars_g: 10 }),      // medio → fuera
    food("pasas", { sugars_g: 59 }),        // alto
    food("dulce de leche", { sugars_g: 55 }), // alto
    food("lechuga", { sugars_g: 0.8 }),     // bajo → fuera
  ];
  const { matches } = filterFoodsByNutrient(foods, "sugars_g");
  expect(matches.map((f) => f.name)).toEqual(["pasas", "dulce de leche"]);
});

test("los SIN DATO van aparte, nunca se descartan en silencio", () => {
  const foods = [
    food("queso crema", { cholesterol_mg: 101 }),
    food("almendra", { cholesterol_mg: null }),
    food("lechuga", { cholesterol_mg: 0 }),
  ];
  const { matches, unknown } = filterFoodsByNutrient(foods, "cholesterol_mg");
  expect(matches.map((f) => f.name)).toEqual(["queso crema"]);
  expect(unknown.map((f) => f.name)).toEqual(["almendra"]);
  // el que no tiene dato NO se cuela entre los altos, pero tampoco desaparece
  expect(matches.some((f) => f.name === "almendra")).toBe(false);
});

test("la fibra filtra por BUENA fuente, no por alta-mala", () => {
  const foods = [
    food("lentejas", { fiber_g: 7.9 }),
    food("pan blanco", { fiber_g: 2.1 }),
    food("salvado", { fiber_g: 43 }),
  ];
  const { matches } = filterFoodsByNutrient(foods, "fiber_g");
  expect(matches.map((f) => f.name)).toEqual(["salvado", "lentejas"]);
});

test("respeta el basis al decidir qué es alto", () => {
  const foods = [
    { ...food("gaseosa"), basis: "per_100ml" as const, sugars_g: 11.5 }, // alto en bebida
    food("yogur", { sugars_g: 11.5 }), // el MISMO número, medio en sólido
  ];
  const { matches } = filterFoodsByNutrient(foods, "sugars_g");
  expect(matches.map((f) => f.name)).toEqual(["gaseosa"]);
});

test("lista vacía no explota", () => {
  expect(filterFoodsByNutrient([], "sugars_g")).toEqual({ matches: [], unknown: [] });
});
