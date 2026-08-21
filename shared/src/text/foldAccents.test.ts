import { expect, test } from "bun:test";
import { foldAccents } from "./foldAccents";

test("quita diacríticos y baja a minúsculas", () => {
  expect(foldAccents("Plátano")).toBe("platano");
});

test("matchea con y sin acento en ambas direcciones", () => {
  // sin acento en el query encuentra el nombre acentuado
  expect(foldAccents("plátano").includes(foldAccents("platano"))).toBe(true);
  // con acento en el query encuentra el nombre sin acento
  expect(foldAccents("platano").includes(foldAccents("plátano"))).toBe(true);
});

test("la ñ se foldea a n (conveniencia de búsqueda)", () => {
  expect(foldAccents("niño")).toBe("nino");
});

test("es idempotente y ya normalizado no cambia", () => {
  expect(foldAccents("arroz")).toBe("arroz");
  expect(foldAccents(foldAccents("Açaí"))).toBe(foldAccents("Açaí"));
});
