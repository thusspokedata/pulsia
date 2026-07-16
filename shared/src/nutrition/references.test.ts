import { test, expect } from "bun:test";
import { NUTRIENT_REFERENCES, NUTRIENT_REFERENCE_KIND, saturatedFatRefG } from "./references";

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
