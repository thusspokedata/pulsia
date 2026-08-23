import { test, expect } from "bun:test";
import {
  NUTRIENT_REFERENCES,
  NUTRIENT_REFERENCE_KIND,
  saturatedFatRefG,
  FAT_TYPE_PERCENT_KCAL,
  fatTypeRefG,
} from "./references";

test("las referencias fijas son las de la OMS", () => {
  expect(NUTRIENT_REFERENCES.fiber_g).toBe(30);
  expect(NUTRIENT_REFERENCES.salt_g).toBe(5);
  expect(NUTRIENT_REFERENCES.sugars_g).toBe(50);
  expect(NUTRIENT_REFERENCES.cholesterol_mg).toBe(300);
});

test("la fibra es un PISO y el resto son LÍMITES (define el color de la barra)", () => {
  expect(NUTRIENT_REFERENCE_KIND.fiber_g).toBe("min");
  expect(NUTRIENT_REFERENCE_KIND.salt_g).toBe("max");
  expect(NUTRIENT_REFERENCE_KIND.sugars_g).toBe("max");
  expect(NUTRIENT_REFERENCE_KIND.saturated_fat_g).toBe("max");
  expect(NUTRIENT_REFERENCE_KIND.cholesterol_mg).toBe("max");
});

test("saturadas: 10% de la energía / 9 kcal por gramo, a 1 decimal", () => {
  expect(saturatedFatRefG(2000)).toBe(22.2); // 200 kcal / 9
  expect(saturatedFatRefG(2500)).toBe(27.8); // 250 kcal / 9
});

test("saturadas: meta no positiva → 0 (no se muestra referencia negativa ni NaN)", () => {
  expect(saturatedFatRefG(0)).toBe(0);
  expect(saturatedFatRefG(-100)).toBe(0);
  expect(saturatedFatRefG(NaN)).toBe(0);
  expect(saturatedFatRefG(Infinity)).toBe(0);
});

test("fatTypeRefG deriva gramos desde % de kcal (9 kcal/g)", () => {
  expect(fatTypeRefG(0.1, 2000)).toBe(22.2);
  expect(fatTypeRefG(0.1, 0)).toBe(0);
  expect(fatTypeRefG(0.1, NaN)).toBe(0);
});

test("saturatedFatRefG sigue dando 10% (back-compat)", () => {
  expect(saturatedFatRefG(2000)).toBe(fatTypeRefG(0.1, 2000));
});

test("FAT_TYPE_PERCENT_KCAL: mono/omega3 recommended, resto max", () => {
  expect(FAT_TYPE_PERCENT_KCAL.saturated_fat_g).toEqual({ pct: 0.1, kind: "max" });
  expect(FAT_TYPE_PERCENT_KCAL.trans_fat_g).toEqual({ pct: 0.02, kind: "max" });
  expect(FAT_TYPE_PERCENT_KCAL.omega6_g).toEqual({ pct: 0.1, kind: "max" });
  expect(FAT_TYPE_PERCENT_KCAL.monounsaturated_fat_g).toEqual({ pct: 0.15, kind: "recommended" });
  expect(FAT_TYPE_PERCENT_KCAL.omega3_g).toEqual({ pct: null, kind: "recommended" });
});
