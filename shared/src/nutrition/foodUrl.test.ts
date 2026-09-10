import { expect, test } from "bun:test";
import { looksLikeUrl } from "./foodUrl";

test("acepta una URL http simple", () => {
  expect(looksLikeUrl("http://ejemplo.com")).toBe(true);
});

test("acepta una URL https simple", () => {
  expect(looksLikeUrl("https://ejemplo.com")).toBe(true);
});

test("acepta una URL con path y query", () => {
  expect(looksLikeUrl("https://ejemplo.com/producto?id=42&x=1")).toBe(true);
});

test("acepta el esquema en mayúsculas (case-insensitive)", () => {
  expect(looksLikeUrl("HTTPS://Ejemplo.com/Producto")).toBe(true);
  expect(looksLikeUrl("Http://ejemplo.com")).toBe(true);
});

test("trimmea espacios de los bordes antes de evaluar", () => {
  expect(looksLikeUrl("  https://ejemplo.com/x  ")).toBe(true);
});

test("rechaza texto plano", () => {
  expect(looksLikeUrl("almendra")).toBe(false);
});

test("rechaza una frase con una URL adentro (tiene espacio interno)", () => {
  expect(looksLikeUrl("mira https://x.com")).toBe(false);
});

test("rechaza un string vacío", () => {
  expect(looksLikeUrl("")).toBe(false);
  expect(looksLikeUrl("   ")).toBe(false);
});

test("rechaza una 'URL' con un espacio interno aunque new URL la toleraría", () => {
  // new URL("https://x.com/a b") no tira (percent-encodea el espacio); igual debe ser false
  // porque no es UN solo token: es la guarda de whitespace la que manda.
  expect(looksLikeUrl("https://x.com/a b")).toBe(false);
});

test("rechaza un esquema no http (ftp)", () => {
  expect(looksLikeUrl("ftp://x.com")).toBe(false);
});

test("rechaza un dominio sin esquema", () => {
  expect(looksLikeUrl("www.x.com")).toBe(false);
});
