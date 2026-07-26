import { test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import {
  toSupplement, toPlanView, snapshotForTake, insertSupplement, getSupplement, deleteSupplement,
  createPlan, upsertTake, takesWithComponents,
} from "./repository";
import { supplementPlan, supplementPlanItem, supplementTake } from "../db/schema";
import { createDb } from "../db/client";

// Usuario por defecto del entorno de desarrollo single-user (ver seed.ts).
const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

const row = {
  id: "11111111-1111-4111-8111-111111111111", userId: "u",
  name: "ZMA Pro", brand: "BrandX", servingLabel: "2 cápsulas",
  components: [{ name: "Zinc", amount: 10, unit: "mg" }],
  labelMaxPerDay: "2 cápsulas al día", source: "label",
  info: "El zinc participa en el sistema inmune.", notes: null,
  createdAt: new Date(0),
};

test("toSupplement mapea la fila a Supplement del shared", () => {
  const s = toSupplement(row as any);
  expect(s).toMatchObject({
    id: row.id, name: "ZMA Pro", brand: "BrandX", servingLabel: "2 cápsulas",
    labelMaxPerDay: "2 cápsulas al día", source: "label",
  });
  expect(s.components).toEqual([{ name: "Zinc", amount: 10, unit: "mg" }]);
  expect(s.createdAt).toBe(0);
});

test("toSupplement tolera nullables (alta manual sin brand/info/labelMaxPerDay)", () => {
  const s = toSupplement({ ...row, brand: null, info: null, labelMaxPerDay: null } as any);
  expect(s.brand ?? null).toBeNull();
  expect(s.info ?? null).toBeNull();
});

const planRow = { id: "55555555-5555-4555-8555-555555555555", userNote: "el zinc a la mañana no", createdAt: new Date(0) };
const itemRows = [{
  id: "33333333-3333-4333-8333-333333333333", planId: planRow.id,
  supplementId: "11111111-1111-4111-8111-111111111111",
  slot: "desayuno", frequency: { type: "daily" }, dose: "1 tableta", reason: "test",
  supplementName: "Zink", // viene del join
}];

test("toPlanView arma el PlanView con ítems y nombres", () => {
  const v = toPlanView(planRow as any, itemRows as any);
  expect(v).toMatchObject({ id: planRow.id, userNote: "el zinc a la mañana no", createdAt: 0 });
  expect(v.items[0]).toMatchObject({ slot: "desayuno", dose: "1 tableta", supplementName: "Zink" });
});

test("snapshotForTake congela nombre/dosis/franja del ítem", () => {
  const s = snapshotForTake(itemRows[0] as any);
  expect(s).toEqual({ supplementName: "Zink", plannedDose: "1 tableta", slot: "desayuno" });
});

test("persiste y devuelve unitLabel y los componentes con mapeo canónico", async () => {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "postgres://pulsia:pulsia@localhost:5432/pulsia");
  try {
    const s = await insertSupplement(db, DEV_USER_ID, {
      name: "Mg", servingLabel: "2 cápsulas", unitLabel: "cápsula", source: "label", info: "x",
      components: [{ name: "Magnesio", amount: 375, unit: "mg", nutrientKey: "magnesium_mg", amountPerUnit: 187.5 }],
    } as any);
    try {
      const got = await getSupplement(db, DEV_USER_ID, s.id);
      expect(got?.unitLabel).toBe("cápsula");
      expect(got?.components[0].nutrientKey).toBe("magnesium_mg");
      expect(got?.components[0].amountPerUnit).toBe(187.5);
    } finally {
      await deleteSupplement(db, DEV_USER_ID, s.id);
    }
  } finally {
    await sql.end();
  }
});

test("takesWithComponents sigue resolviendo tomas de un plan ya archivado (regenerar el plan no las pierde)", async () => {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "postgres://pulsia:pulsia@localhost:5432/pulsia");
  let supId: string | undefined;
  let planIdA: string | undefined;
  let planIdB: string | undefined;
  let planItemIdA: string | undefined;
  try {
    const sup = await insertSupplement(db, DEV_USER_ID, {
      name: "Mg Archivado", servingLabel: "1 cápsula", unitLabel: "cápsula", source: "label", info: "x",
      components: [{ name: "Magnesio", amount: 375, unit: "mg", nutrientKey: "magnesium_mg", amountPerUnit: 375 }],
    } as any);
    supId = sup.id;

    const planA = await createPlan(db, DEV_USER_ID, null, [
      { supplementId: sup.id, slot: "desayuno", frequency: { type: "daily" }, dose: "1 cápsula", reason: null },
    ]);
    planIdA = planA.id;
    planItemIdA = planA.items[0].id;

    await upsertTake(
      db, DEV_USER_ID,
      { date: "2026-07-20", planItemId: planItemIdA, status: "taken" } as any,
      { supplementName: sup.name, plannedDose: "1 cápsula", slot: "desayuno" },
    );

    // Regenerar el plan archiva A y crea B con ítems de IDs nuevos.
    const planB = await createPlan(db, DEV_USER_ID, null, [
      { supplementId: sup.id, slot: "desayuno", frequency: { type: "daily" }, dose: "1 cápsula", reason: null },
    ]);
    planIdB = planB.id;

    const result = await takesWithComponents(db, DEV_USER_ID, "2026-07-20");
    expect(result).toHaveLength(1);
    expect(result[0].supplementName).toBe("Mg Archivado");
    expect(result[0].components).toEqual([
      { name: "Magnesio", amount: 375, unit: "mg", nutrientKey: "magnesium_mg", amountPerUnit: 375 },
    ]);
  } finally {
    if (planItemIdA) await db.delete(supplementTake).where(eq(supplementTake.planItemId, planItemIdA));
    if (planIdA) {
      await db.delete(supplementPlanItem).where(eq(supplementPlanItem.planId, planIdA));
      await db.delete(supplementPlan).where(eq(supplementPlan.id, planIdA));
    }
    if (planIdB) {
      await db.delete(supplementPlanItem).where(eq(supplementPlanItem.planId, planIdB));
      await db.delete(supplementPlan).where(eq(supplementPlan.id, planIdB));
    }
    if (supId) await deleteSupplement(db, DEV_USER_ID, supId);
    await sql.end();
  }
});
