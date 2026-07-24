import { expect, test } from "bun:test";
import { identificationFromFood } from "./refreshUsda";
import type { Food } from "@pulsia/shared";

const base: Food = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Almendra",
  basis: "per_100g",
  kcal: 579,
  protein_g: 21.2,
  carbs_g: 21.6,
  fat_g: 49.9,
  unitWeightG: 1.2,
  sourceMacros: "ai",
  sourceMicros: null,
  createdAt: 0,
} as Food;

test("la identificación conserva identidad y macros del alimento guardado", () => {
  const id = identificationFromFood(base, "almonds raw");
  expect(id.name).toBe("Almendra");
  expect(id.basis).toBe("per_100g");
  expect(id.unitWeightG).toBe(1.2);
  expect(id.kcal).toBe(579);
  expect(id.searchQuery).toBe("almonds raw");
});

test("un alimento de etiqueta sigue siendo etiqueta: sus macros van a ganar", () => {
  expect(identificationFromFood({ ...base, sourceMacros: "label" }, "x").sourceMacros).toBe("label");
});

// ⚠️ La decisión del plan: nunca pisar en silencio un número que tipeó una persona.
test("un alimento cargado A MANO se trata como etiqueta, para que USDA no le pise los macros", () => {
  expect(identificationFromFood({ ...base, sourceMacros: "manual" }, "x").sourceMacros).toBe("label");
});

test("un alimento estimado por IA deja que USDA gane", () => {
  expect(identificationFromFood({ ...base, sourceMacros: "ai" }, "x").sourceMacros).toBe("ai");
});

test("los micros de etiqueta ausentes viajan como null, no como undefined", () => {
  const id = identificationFromFood(base, "x");
  expect(id.sodium_mg).toBeNull();
  expect(id.fiber_g).toBeNull();
});
