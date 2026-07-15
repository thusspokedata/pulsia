import { test, expect } from "bun:test";
import { detectComponentOverlaps } from "./overlap";

const SUP_MG_A = "11111111-1111-4111-8111-111111111111";
const SUP_MG_B = "22222222-2222-4222-8222-222222222222";

const catalog = [
  {
    id: SUP_MG_A,
    name: "Magnesio Citrato Pro",
    components: [{ name: "Magnesio (citrato)", amount: 375, unit: "mg" }],
  },
  {
    id: SUP_MG_B,
    name: "ZMA Nocturno",
    components: [
      { name: "Magnesio bisglicinato", amount: 200, unit: "mg" },
      { name: "Zinc", amount: 10, unit: "mg" },
    ],
  },
];

test("dos suplementos con el mismo componente (por primera palabra) ambos daily → 1 warning nombrando el componente y ambos productos", () => {
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
    { supplementId: SUP_MG_B, frequency: { type: "daily" as const } },
  ];
  const warnings = detectComponentOverlaps(items, catalog, "2026-07-16");
  expect(warnings).toHaveLength(1);
  expect(warnings[0].toLowerCase()).toContain("magnesio");
  expect(warnings[0]).toContain("Magnesio Citrato Pro");
  expect(warnings[0]).toContain("ZMA Nocturno");
});

test("mismo componente pero frecuencias complementarias (weekdays que nunca coinciden) → sin warning", () => {
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "weekdays" as const, days: [1, 3, 5] } },
    { supplementId: SUP_MG_B, frequency: { type: "weekdays" as const, days: [2, 4, 6] } },
  ];
  const warnings = detectComponentOverlaps(items, catalog, "2026-07-16");
  expect(warnings).toEqual([]);
});

test("componentes distintos → sin warning", () => {
  const differentCatalog = [
    { id: SUP_MG_A, name: "Magnesio Citrato Pro", components: [{ name: "Magnesio (citrato)", amount: 375, unit: "mg" }] },
    { id: SUP_MG_B, name: "Zinc Puro", components: [{ name: "Zinc", amount: 10, unit: "mg" }] },
  ];
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
    { supplementId: SUP_MG_B, frequency: { type: "daily" as const } },
  ];
  const warnings = detectComponentOverlaps(items, differentCatalog, "2026-07-16");
  expect(warnings).toEqual([]);
});

test("mismo suplemento en 2 franjas (split dosing) → sin warning (mismo producto no es duplicación)", () => {
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
  ];
  const warnings = detectComponentOverlaps(items, catalog, "2026-07-16");
  expect(warnings).toEqual([]);
});
