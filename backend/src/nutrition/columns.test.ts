import { expect, test } from "bun:test";
import { NUTRIENT_KEYS } from "@pulsia/shared";
import { food, mealItem } from "../db/schema";
import { nutrientColumn, nutrientsFromRow, nutrientsToColumns } from "./columns";

// Este test es el guardarraíl de la regla "el registro es la fuente única": si alguien agrega un
// nutriente a nutrients.ts y se olvida la columna, el dato se perdería en silencio al persistir.
test("cada nutriente del registro tiene columna en food, nombrada como la clave", () => {
  for (const key of NUTRIENT_KEYS) {
    const col = (food as unknown as Record<string, { name: string } | undefined>)[nutrientColumn(key)];
    expect(col, `falta la columna de ${key} en food`).toBeDefined();
    expect(col!.name).toBe(key);
  }
});

test("cada nutriente del registro tiene columna en meal_item, nombrada como la clave", () => {
  for (const key of NUTRIENT_KEYS) {
    const col = (mealItem as unknown as Record<string, { name: string } | undefined>)[nutrientColumn(key)];
    expect(col, `falta la columna de ${key} en meal_item`).toBeDefined();
    expect(col!.name).toBe(key);
  }
});

// La migración 0022 borra estas columnas. Si el schema las dejara, drizzle-kit las volvería a crear.
test("food ya no tiene salt_g ni source", () => {
  const t = food as unknown as Record<string, unknown>;
  expect(t.saltG).toBeUndefined();
  expect(t.source).toBeUndefined();
});

test("meal_item ya no tiene salt_g, y no lleva procedencia (es snapshot de valores)", () => {
  const t = mealItem as unknown as Record<string, unknown>;
  expect(t.saltG).toBeUndefined();
  expect(t.sourceMacros).toBeUndefined();
  expect(t.sourceMicros).toBeUndefined();
  expect(t.usdaFdcId).toBeUndefined();
});

test("food sí lleva la procedencia partida y el fdcId", () => {
  const t = food as unknown as Record<string, { name: string } | undefined>;
  expect(t.sourceMacros?.name).toBe("source_macros");
  expect(t.sourceMicros?.name).toBe("source_micros");
  expect(t.usdaFdcId?.name).toBe("usda_fdc_id");
});

test("nutrientColumn pasa de snake_case a camelCase, incluso con dígitos", () => {
  expect(nutrientColumn("saturated_fat_g")).toBe("saturatedFatG");
  expect(nutrientColumn("omega3_g")).toBe("omega3G");
  expect(nutrientColumn("vitamin_b12_mcg")).toBe("vitaminB12Mcg");
  expect(nutrientColumn("sodium_mg")).toBe("sodiumMg");
});

test("nutrientsToColumns traduce las claves y conserva null como null", () => {
  const out = nutrientsToColumns({ sodium_mg: 400, vitamin_b12_mcg: null });
  expect(out.sodiumMg).toBe(400);
  expect(out.vitaminB12Mcg).toBe(null);
  // Lo ausente se escribe null explícito: en un UPDATE, omitir la clave dejaría el valor viejo.
  expect(out.zincMg).toBe(null);
  expect(Object.keys(out)).toHaveLength(NUTRIENT_KEYS.length);
});

test("nutrientsFromRow devuelve null para lo ausente, NUNCA 0", () => {
  const out = nutrientsFromRow({ sodiumMg: 400, zincMg: null });
  expect(out.sodium_mg).toBe(400);
  expect(out.zinc_mg).toBe(null);
  expect(out.vitamin_b12_mcg).toBe(null);
  expect(Object.keys(out)).toHaveLength(NUTRIENT_KEYS.length);
});
