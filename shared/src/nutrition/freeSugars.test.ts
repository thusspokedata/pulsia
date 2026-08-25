import { test, expect } from "bun:test";
import { freeSugarsG, intrinsicSugarsG } from "./freeSugars";

test("fruta ENTERA (intrinsic): su azúcar NO es libre", () => {
  const manzana = { sugars_g: 10, added_sugars_g: null, sugarClass: "intrinsic" as const };
  expect(freeSugarsG(manzana)).toBe(0);
  expect(intrinsicSugarsG(manzana)).toBe(10);
});

test("jugo (free): TODO su azúcar es libre", () => {
  const jugo = { sugars_g: 8, added_sugars_g: null, sugarClass: "free" as const };
  expect(freeSugarsG(jugo)).toBe(8);
  expect(intrinsicSugarsG(jugo)).toBe(0);
});

test("yogur (mixed) con added conocido: solo lo agregado es libre", () => {
  const yogur = { sugars_g: 12, added_sugars_g: 5, sugarClass: "mixed" as const };
  expect(freeSugarsG(yogur)).toBe(5);
  expect(intrinsicSugarsG(yogur)).toBe(7);
});

test("mixed SIN dato de added: conservador, cuenta todo el total", () => {
  const proc = { sugars_g: 12, added_sugars_g: null, sugarClass: "mixed" as const };
  expect(freeSugarsG(proc)).toBe(12);
  expect(intrinsicSugarsG(proc)).toBe(0);
});

test("total desconocido (sugars null): no sabemos ni libres ni intrínsecos", () => {
  const sinTotal = { sugars_g: null, added_sugars_g: 3, sugarClass: "mixed" as const };
  expect(freeSugarsG(sinTotal)).toBeNull();
  expect(intrinsicSugarsG(sinTotal)).toBeNull();
});

test("added > total se clampea a total (no hay libres negativos ni intrínseco negativo)", () => {
  const raro = { sugars_g: 10, added_sugars_g: 15, sugarClass: "mixed" as const };
  expect(freeSugarsG(raro)).toBe(10);
  expect(intrinsicSugarsG(raro)).toBe(0);
});

test("sin sugarClass (undefined) con added conocido: usa added (rama de null/undefined)", () => {
  const sinClase = { sugars_g: 10, added_sugars_g: 3 };
  expect(freeSugarsG(sinClase)).toBe(3);
  expect(intrinsicSugarsG(sinClase)).toBe(7);
});

test("sin sugarClass y sin added: conservador, todo el total es libre", () => {
  const nada = { sugars_g: 9 };
  expect(freeSugarsG(nada)).toBe(9);
  expect(intrinsicSugarsG(nada)).toBe(0);
});

test("NaN en sugars_g = total desconocido → null", () => {
  expect(freeSugarsG({ sugars_g: NaN, sugarClass: "free" })).toBeNull();
  expect(intrinsicSugarsG({ sugars_g: NaN, sugarClass: "free" })).toBeNull();
});

test("added no finito (NaN) en mixed cae al conservador (total)", () => {
  const x = { sugars_g: 6, added_sugars_g: NaN, sugarClass: "mixed" as const };
  expect(freeSugarsG(x)).toBe(6);
});

test("intrinsic con sugars 0 → free 0 / intrinsic 0", () => {
  const x = { sugars_g: 0, sugarClass: "intrinsic" as const };
  expect(freeSugarsG(x)).toBe(0);
  expect(intrinsicSugarsG(x)).toBe(0);
});
