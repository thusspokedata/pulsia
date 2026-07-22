import { expect, test } from "bun:test";
import { NUTRIENT_KEYS } from "@pulsia/shared";
import { usdaFood, usdaDataset } from "./schema";
import { nutrientColumn } from "../nutrition/columns";

// Guardarraíl análogo al de columns.test.ts para `food`/`meal_item`: si alguien agrega un
// nutriente al registro y se olvida la columna acá, el dataset de USDA se cargaría para
// siempre con ese nutriente en blanco y nadie lo notaría hasta mucho después.
test("cada nutriente del registro tiene columna en usda_food, nombrada como la clave", () => {
  for (const key of NUTRIENT_KEYS) {
    const col = (usdaFood as unknown as Record<string, { name: string } | undefined>)[nutrientColumn(key)];
    expect(col, `falta la columna de ${key} en usda_food`).toBeDefined();
    expect(col!.name).toBe(key);
  }
});

// Todos los nutrientes de usda_food son nullable: una fila de USDA puede no traer un valor.
test("las columnas de nutrientes de usda_food son nullable", () => {
  for (const key of NUTRIENT_KEYS) {
    const col = (usdaFood as unknown as Record<string, { notNull: boolean } | undefined>)[nutrientColumn(key)];
    expect(col!.notNull, `${key} debería ser nullable en usda_food`).toBe(false);
  }
});

// Además de los 30 micronutrientes, usda_food necesita los 4 macros, porque de esta tabla
// también salen los macros cuando hay match. Nullable acá (a diferencia de `food`), porque
// una fila de USDA puede no traerlos.
test("usda_food tiene los 4 macros, nullables y con el mismo nombre que food", () => {
  const t = usdaFood as unknown as Record<string, { name: string; notNull: boolean } | undefined>;
  for (const [key, column] of [
    ["kcal", "kcal"],
    ["proteinG", "protein_g"],
    ["carbsG", "carbs_g"],
    ["fatG", "fat_g"],
  ] as const) {
    expect(t[key], `falta ${key} en usda_food`).toBeDefined();
    expect(t[key]!.name).toBe(column);
    expect(t[key]!.notNull, `${key} debería ser nullable en usda_food`).toBe(false);
  }
});

test("usda_food tiene fdc_id (PK), description y data_type, todos not null", () => {
  const t = usdaFood as unknown as Record<string, { name: string; notNull: boolean; primary: boolean } | undefined>;
  expect(t.fdcId?.name).toBe("fdc_id");
  expect(t.fdcId?.primary).toBe(true);
  expect(t.description?.name).toBe("description");
  expect(t.description?.notNull).toBe(true);
  expect(t.dataType?.name).toBe("data_type");
  expect(t.dataType?.notNull).toBe(true);
});

test("usda_dataset tiene id (PK), version y row_count, todos not null", () => {
  const t = usdaDataset as unknown as Record<string, { name: string; notNull: boolean; primary: boolean } | undefined>;
  expect(t.id?.primary).toBe(true);
  expect(t.version?.name).toBe("version");
  expect(t.version?.notNull).toBe(true);
  expect(t.rowCount?.name).toBe("row_count");
  expect(t.rowCount?.notNull).toBe(true);
});
