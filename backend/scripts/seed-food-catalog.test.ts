import { expect, test } from "bun:test";
import { buildSeedFoodInput, planSeed } from "./seed-food-catalog";
import { SEED_FOODS, type SeedFood } from "./seed-food-catalog.data";
import type { UsdaFoodRow } from "../src/usda/matcher";

function row(fdcId: number): UsdaFoodRow {
  return { fdcId, description: `row ${fdcId}`, dataType: "sr_legacy", kcal: 10 } as UsdaFoodRow;
}
function seed(name: string, fdcId: number): SeedFood {
  return { name, basis: "per_100g", unitWeightG: null, fdcId, usda: `row ${fdcId}` };
}

test("saltea los que ya existen, case-insensitive y con espacios", () => {
  const seeds = [seed("Brócoli", 1), seed("Pollo", 2)];
  const plan = planSeed(seeds, ["  brócoli  "], (id) => row(id));
  expect(plan.skippedExisting.map((f) => f.name)).toEqual(["Brócoli"]);
  expect(plan.toInsert.map((p) => p.food.name)).toEqual(["Pollo"]);
});

test("manda a missingUsda los fdcId sin fila", () => {
  const seeds = [seed("Pollo", 2), seed("Fantasma", 999)];
  const plan = planSeed(seeds, [], (id) => (id === 999 ? null : row(id)));
  expect(plan.missingUsda.map((f) => f.name)).toEqual(["Fantasma"]);
  expect(plan.toInsert.map((p) => p.food.name)).toEqual(["Pollo"]);
});

test("existente tiene prioridad sobre missingUsda (no se consulta USDA si ya existe)", () => {
  let usdaCalls = 0;
  const seeds = [seed("Pollo", 2)];
  const plan = planSeed(seeds, ["pollo"], (id) => {
    usdaCalls++;
    return row(id);
  });
  expect(plan.skippedExisting).toHaveLength(1);
  expect(plan.toInsert).toHaveLength(0);
  expect(usdaCalls).toBe(0);
});

test("todo nuevo con fila USDA → todo a insertar, con su fila", () => {
  const seeds = [seed("Pollo", 2), seed("Pavo", 3)];
  const plan = planSeed(seeds, [], (id) => row(id));
  expect(plan.toInsert).toHaveLength(2);
  expect(plan.toInsert[0].row.fdcId).toBe(2);
  expect(plan.skippedExisting).toHaveLength(0);
  expect(plan.missingUsda).toHaveLength(0);
});

test("buildSeedFoodInput deriva la clase de azúcar: una fruta del seed queda intrinsic", () => {
  const fruta = SEED_FOODS.find((f) => f.name === "Fresas");
  expect(fruta).toBeDefined();
  const input = buildSeedFoodInput(fruta!, row(fruta!.fdcId));
  expect(input.sugarClass).toBe("intrinsic");
});

test("buildSeedFoodInput: el override manual del data gana sobre el clasificador", () => {
  // "Manzana" clasificaría intrinsic, pero un override manual mixed debe ganar.
  const conOverride: SeedFood = { ...seed("Manzana", 5), sugarClass: "mixed" };
  expect(buildSeedFoodInput(conOverride, row(5)).sugarClass).toBe("mixed");
});
