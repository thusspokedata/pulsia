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

test("prefijo genérico: Vitamina C y Vitamina D3 NO se agrupan (clave de dos palabras)", () => {
  const vitCatalog = [
    { id: SUP_MG_A, name: "Vitamina C Retard", components: [{ name: "Vitamina C", amount: 500, unit: "mg" }] },
    { id: SUP_MG_B, name: "Vitamina D3 Gotas", components: [{ name: "Vitamina D3", amount: 25, unit: "µg" }] },
  ];
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
    { supplementId: SUP_MG_B, frequency: { type: "daily" as const } },
  ];
  expect(detectComponentOverlaps(items, vitCatalog, "2026-07-16")).toEqual([]);
});

test("prefijo genérico: Omega 3 y Omega 6 NO se agrupan", () => {
  const omegaCatalog = [
    { id: SUP_MG_A, name: "Fish Oil", components: [{ name: "Omega 3", amount: 1000, unit: "mg" }] },
    { id: SUP_MG_B, name: "Aceite de Onagra", components: [{ name: "Omega 6", amount: 500, unit: "mg" }] },
  ];
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
    { supplementId: SUP_MG_B, frequency: { type: "daily" as const } },
  ];
  expect(detectComponentOverlaps(items, omegaCatalog, "2026-07-16")).toEqual([]);
});

test("every_other_day con anclas de paridad OPUESTA nunca coinciden → sin warning; misma paridad → warning", () => {
  const oppositeParity = [
    { supplementId: SUP_MG_A, frequency: { type: "every_other_day" as const, anchorDate: "2026-07-15" } },
    { supplementId: SUP_MG_B, frequency: { type: "every_other_day" as const, anchorDate: "2026-07-16" } },
  ];
  expect(detectComponentOverlaps(oppositeParity, catalog, "2026-07-16")).toEqual([]);

  const sameParity = [
    { supplementId: SUP_MG_A, frequency: { type: "every_other_day" as const, anchorDate: "2026-07-15" } },
    { supplementId: SUP_MG_B, frequency: { type: "every_other_day" as const, anchorDate: "2026-07-17" } },
  ];
  const warnings = detectComponentOverlaps(sameParity, catalog, "2026-07-16");
  expect(warnings).toHaveLength(1);
  expect(warnings[0].toLowerCase()).toContain("magnesio");
});

test("mismo suplemento en 2 franjas (split dosing) → sin warning (mismo producto no es duplicación)", () => {
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
  ];
  const warnings = detectComponentOverlaps(items, catalog, "2026-07-16");
  expect(warnings).toEqual([]);
});
