import { flagText, unknownLabel, NUTRIENT_LABELS } from "../src/nutrition/nutrientText";
import { FLAGGED_NUTRIENTS, foodFlags } from "@pulsia/shared";

test("cada flag destacable tiene una frase, ninguna queda vacía", () => {
  // Un alimento que dispara bad en los cinco techos y good en la fibra
  const todoAlto = {
    basis: "per_100g" as const,
    fat_g: 99, saturated_fat_g: 99, sugars_g: 99,
    salt_g: 99, cholesterol_mg: 999, fiber_g: 99,
  };
  for (const f of foodFlags(todoAlto).notable) {
    expect(flagText(f.nutrient, f.sentiment)).toBeTruthy();
  }
  // Y lo mismo para el escalón intermedio
  const todoMedio = {
    basis: "per_100g" as const,
    fat_g: 10, saturated_fat_g: 3, sugars_g: 10,
    salt_g: 1, cholesterol_mg: 40, fiber_g: 0,
  };
  for (const f of foodFlags(todoMedio).notable) {
    expect(flagText(f.nutrient, f.sentiment)).toBeTruthy();
  }
});

test("las frases concuerdan en género y número", () => {
  expect(flagText("fat_g", "bad")).toBe("grasa alta");
  expect(flagText("saturated_fat_g", "bad")).toBe("saturadas altas");
  expect(flagText("sugars_g", "bad")).toBe("azúcar alto");
  expect(flagText("salt_g", "bad")).toBe("sal alta");
  expect(flagText("cholesterol_mg", "bad")).toBe("colesterol alto");
  expect(flagText("fiber_g", "good")).toBe("buena fibra");
});

test("el nivel va ESCRITO, no solo en el color", () => {
  // Un daltónico tiene que poder distinguir alto de medio sin ver el color
  for (const n of ["fat_g", "sugars_g", "salt_g", "cholesterol_mg"] as const) {
    expect(flagText(n, "bad")).not.toBe(flagText(n, "warn"));
  }
});

test("el aviso de faltantes nombra hasta dos y después resume", () => {
  expect(unknownLabel([])).toBeNull();
  expect(unknownLabel(["sugars_g"])).toBe("sin datos de azúcar");
  expect(unknownLabel(["sugars_g", "salt_g"])).toBe("sin datos de azúcar y sal");
  expect(unknownLabel(["sugars_g", "salt_g", "fiber_g"])).toBe("sin datos de 3 nutrientes");
});

test("hay etiqueta para los seis nutrientes", () => {
  for (const n of FLAGGED_NUTRIENTS) expect(NUTRIENT_LABELS[n]).toBeTruthy();
});
