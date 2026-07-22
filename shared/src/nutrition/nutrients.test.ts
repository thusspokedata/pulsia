import { expect, test } from "bun:test";
import { NUTRIENTS, NUTRIENT_KEYS, nutrientsByGroup } from "./nutrients";

test("hay 30 micronutrientes", () => {
  expect(NUTRIENTS.length).toBe(30);
});

test("las claves son únicas", () => {
  expect(new Set(NUTRIENT_KEYS).size).toBe(NUTRIENT_KEYS.length);
});

test("los 4 macros NO están en el registro", () => {
  for (const k of ["kcal", "protein_g", "carbs_g", "fat_g"]) {
    expect(NUTRIENT_KEYS).not.toContain(k);
  }
});

test("salt_g no está: la fuente única es sodium_mg", () => {
  expect(NUTRIENT_KEYS).not.toContain("salt_g");
  expect(NUTRIENT_KEYS).toContain("sodium_mg");
});

test("cada grupo tiene la cantidad esperada", () => {
  const g = nutrientsByGroup();
  expect(g.grasas.map((n) => n.key)).toEqual([
    "saturated_fat_g",
    "omega3_g",
    "omega6_g",
    "cholesterol_mg",
  ]);
  expect(g.vitaminas.length).toBe(14);
  expect(g.minerales.length).toBe(9);
});

test("toda unidad es una de las conocidas", () => {
  for (const n of NUTRIENTS) expect(["g", "mg", "mcg", "ml"]).toContain(n.unit);
});
