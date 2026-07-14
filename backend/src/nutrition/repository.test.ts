import { test, expect } from "bun:test";
import { snapshotItems, toFood, toMeal, insertWater, deleteWater } from "./repository";

const banana = {
  id: "11111111-1111-4111-8111-111111111111", userId: "u", name: "Banana", basis: "per_100g",
  kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, unitWeightG: 120, source: "estimate", createdAt: new Date(0),
  saturatedFatG: 0.1, sugarsG: 12, fiberG: 2.6, saltG: 0, cholesterolMg: 0, waterMl: 75,
};

test("toFood mapea la fila a Food del shared", () => {
  const f = toFood(banana as any);
  expect(f).toMatchObject({ id: banana.id, name: "Banana", basis: "per_100g", protein_g: 1.1, unitWeightG: 120, source: "estimate" });
  expect(f.createdAt).toBe(0);
});

test("snapshotItems calcula macros por ítem desde el catálogo", () => {
  const items = snapshotItems(
    [{ foodId: banana.id, quantity: 1, quantityUnit: "unit" }],
    new Map([[banana.id, banana as any]]),
  );
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ foodId: banana.id, foodName: "Banana", grams: 120, kcal: 107, quantityUnit: "unit" });
});

test("snapshotItems tira si un foodId no está en el catálogo", () => {
  expect(() => snapshotItems([{ foodId: "x", quantity: 1, quantityUnit: "g" }], new Map())).toThrow(/no encontrado|catálogo/i);
});

test("toMeal arma la comida con sus ítems", () => {
  const row = { id: "22222222-2222-4222-8222-222222222222", eatenAt: 5, mealType: "desayuno", note: null };
  const m = toMeal(row as any, [{
    id: "33333333-3333-4333-8333-333333333333", foodId: banana.id, foodName: "Banana",
    quantity: 1, quantityUnit: "unit", grams: 120, kcal: 107, proteinG: 1.3, carbsG: 27.6, fatG: 0.4,
  }] as any);
  expect(m).toMatchObject({ id: row.id, eatenAt: 5, mealType: "desayuno", note: null });
  expect(m.items[0]).toMatchObject({ foodName: "Banana", protein_g: 1.3, carbs_g: 27.6, fat_g: 0.4 });
});

test("toFood mapea los micros (y null si faltan)", () => {
  expect(toFood(banana as any)).toMatchObject({ saturated_fat_g: 0.1, sugars_g: 12, fiber_g: 2.6, salt_g: 0 });
  const legacy = { ...banana, saturatedFatG: null, sugarsG: null, fiberG: null, saltG: null };
  expect(toFood(legacy as any)).toMatchObject({ saturated_fat_g: null, sugars_g: null, fiber_g: null, salt_g: null });
});

test("snapshotItems escala y persiste los micros", () => {
  const items = snapshotItems(
    [{ foodId: banana.id, quantity: 1, quantityUnit: "unit" }],
    new Map([[banana.id, banana as any]]),
  );
  // 1 unidad = 120g → factor 1.2
  expect(items[0]).toMatchObject({ sugarsG: 14.4, fiberG: 3.1, saturatedFatG: 0.1, saltG: 0 });
});

test("snapshotItems deja los micros en null si el alimento no los tiene", () => {
  const legacy = { ...banana, saturatedFatG: null, sugarsG: null, fiberG: null, saltG: null };
  const items = snapshotItems([{ foodId: legacy.id, quantity: 100, quantityUnit: "g" }], new Map([[legacy.id, legacy as any]]));
  expect(items[0]).toMatchObject({ sugarsG: null, fiberG: null, saturatedFatG: null, saltG: null });
});

test("toFood mapea colesterol y agua (y null si faltan)", () => {
  expect(toFood(banana as any)).toMatchObject({ cholesterol_mg: 0, water_ml: 75 });
  const legacy = { ...banana, cholesterolMg: null, waterMl: null };
  expect(toFood(legacy as any)).toMatchObject({ cholesterol_mg: null, water_ml: null });
});

test("snapshotItems escala y persiste colesterol y agua", () => {
  const items = snapshotItems(
    [{ foodId: banana.id, quantity: 1, quantityUnit: "unit" }],
    new Map([[banana.id, banana as any]]),
  );
  // 1 unidad = 120g → factor 1.2 ; agua 75*1.2 = 90
  expect(items[0]).toMatchObject({ cholesterolMg: 0, waterMl: 90 });
});

test("insertWater mapea ml + loggedAt y devuelve WaterLog", async () => {
  const inserted: any[] = [];
  const db: any = {
    insert: () => ({ values(v: any) { const row = { id: "w1", ...v }; inserted.push(row); const p: any = Promise.resolve([row]); p.returning = async () => [row]; return p; } }),
  };
  const w = await insertWater(db, "u", { ml: 250, loggedAt: 1700 });
  expect(w).toEqual({ id: "w1", ml: 250, loggedAt: 1700 });
  expect(inserted[0]).toMatchObject({ userId: "u", ml: 250, loggedAt: 1700 });
});

test("deleteWater devuelve true si borró, false si no", async () => {
  const dbHit: any = { delete: () => ({ where: () => { const p: any = Promise.resolve(undefined); p.returning = async () => [{ id: "w1" }]; return p; } }) };
  const dbMiss: any = { delete: () => ({ where: () => { const p: any = Promise.resolve(undefined); p.returning = async () => []; return p; } }) };
  expect(await deleteWater(dbHit, "u", "w1")).toBe(true);
  expect(await deleteWater(dbMiss, "u", "w1")).toBe(false);
});

import { getGoalInput, upsertGoalInput } from "./repository";

test("getGoalInput devuelve mantenimiento por defecto si no hay fila", async () => {
  const db: any = { query: { nutritionGoal: { findFirst: async () => null } } };
  expect(await getGoalInput(db, "u")).toEqual({ objective: "maintain", rateKgPerWeek: 0, manualKcal: null });
});

test("getGoalInput mapea la fila guardada", async () => {
  const db: any = { query: { nutritionGoal: { findFirst: async () => ({ userId: "u", objective: "lose", rateKgPerWeek: 0.5, manualKcal: null }) } } };
  expect(await getGoalInput(db, "u")).toEqual({ objective: "lose", rateKgPerWeek: 0.5, manualKcal: null });
});

test("upsertGoalInput inserta con onConflict y devuelve el input", async () => {
  const calls: any[] = [];
  const db: any = { insert: () => ({ values(v: any) { calls.push(v); return { onConflictDoUpdate: async () => {} }; } }) };
  const out = await upsertGoalInput(db, "u", { objective: "gain", rateKgPerWeek: 0.25, manualKcal: null });
  expect(out).toEqual({ objective: "gain", rateKgPerWeek: 0.25, manualKcal: null });
  expect(calls[0]).toMatchObject({ userId: "u", objective: "gain", rateKgPerWeek: 0.25 });
});
