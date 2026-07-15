import { test, expect } from "bun:test";
import { toSupplement, toPlanView, snapshotForTake } from "./repository";

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
