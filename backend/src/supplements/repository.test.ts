import { test, expect } from "bun:test";
import { toSupplement } from "./repository";

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
