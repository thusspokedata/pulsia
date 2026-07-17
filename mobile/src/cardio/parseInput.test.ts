import { parseDecimal } from "./parseInput";

test("parsea enteros y decimales con punto", () => {
  expect(parseDecimal("30")).toBe(30);
  expect(parseDecimal("3.5")).toBe(3.5);
});

test("acepta coma como separador decimal (es-AR)", () => {
  expect(parseDecimal("3,5")).toBe(3.5);
});

test("recorta espacios alrededor", () => {
  expect(parseDecimal("  12  ")).toBe(12);
});

test("texto vacío o solo espacios devuelve null", () => {
  expect(parseDecimal("")).toBeNull();
  expect(parseDecimal("   ")).toBeNull();
});

test("texto no numérico devuelve null", () => {
  expect(parseDecimal("abc")).toBeNull();
  expect(parseDecimal("3.5.5")).toBeNull();
});

test("no filtra negativos (lo valida el schema aguas abajo)", () => {
  expect(parseDecimal("-3")).toBe(-3);
});

test("cero es un valor válido, no null", () => {
  expect(parseDecimal("0")).toBe(0);
});
