import { expect, test } from "bun:test";
import { netCarbsG, saltGFromSodiumMg } from "./derived";

test("carbos netos = carbos - fibra", () => {
  expect(netCarbsG(20, 5)).toBe(15);
});

// Pasa de verdad en verduras de hoja: la fibra medida supera a los carbos totales declarados.
test("carbos netos nunca es negativo", () => {
  expect(netCarbsG(2, 5)).toBe(0);
});

test("sin dato de fibra, los carbos netos son los carbos", () => {
  expect(netCarbsG(20, null)).toBe(20);
});

test("sin carbos no hay carbos netos", () => {
  expect(netCarbsG(null, 5)).toBe(null);
});

test("sal = sodio x 2.5 / 1000", () => {
  expect(saltGFromSodiumMg(400)).toBe(1);
});

test("sin sodio no hay sal", () => {
  expect(saltGFromSodiumMg(null)).toBe(null);
});
