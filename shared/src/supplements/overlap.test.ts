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
  // Las comillas anclan al componente interpolado: sin ellas, `toLowerCase()` hacía que
  // "Magnesio Citrato Pro" (el nombre del producto) matcheara aunque el componente no se nombrara.
  expect(warnings[0]).toContain('"magnesio"');
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
  expect(warnings[0]).toContain('"magnesio"'); // el componente, no el eco del nombre del producto
});

test("mismo suplemento en 2 franjas (split dosing) → sin warning (mismo producto no es duplicación)", () => {
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
  ];
  const warnings = detectComponentOverlaps(items, catalog, "2026-07-16");
  expect(warnings).toEqual([]);
});

// Fija el invariante del LCM de SCAN_DAYS: weekdays (período 7) × every_other_day (período 2)
// solo coinciden una vez cada 14 días. Desde 2026-07-16, weekdays=[3] aplica en offset 6 y 13;
// every_other_day anclado en 2026-07-29 tiene la paridad del offset 13 (opuesta a la del 6), así
// que el ÚNICO día de solapamiento en toda la ventana es el offset 13 (2026-07-29). Un scan más
// corto (p. ej. SCAN_DAYS=2, o cualquier valor < 14) no llega a ese día y pierde el warning.
test("solapamiento que recién ocurre en el último día del scan (offset 13) → warning; exige SCAN_DAYS=14", () => {
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "weekdays" as const, days: [3] } },
    { supplementId: SUP_MG_B, frequency: { type: "every_other_day" as const, anchorDate: "2026-07-29" } },
  ];
  const warnings = detectComponentOverlaps(items, catalog, "2026-07-16");
  expect(warnings).toHaveLength(1);
  expect(warnings[0].toLowerCase()).toContain("magnesio");
});

// Un componente cuyo nombre es 100% paréntesis ("(complejo B)") queda con clave de grupo vacía.
// La guarda `if (!group) continue` evita que esos productos SIN relación real se agrupen bajo la
// clave "" y disparen un falso warning. Acá dos productos distintos, ambos con un componente
// así, NO deben agruparse pese a compartir la clave vacía.
test("componentes con nombre 100% entre paréntesis (clave vacía) NO se agrupan → sin warning", () => {
  const parenCatalog = [
    { id: SUP_MG_A, name: "Complejo Uno", components: [{ name: "(complejo B)", amount: 1, unit: "mg" }] },
    { id: SUP_MG_B, name: "Complejo Dos", components: [{ name: "(mezcla propietaria)", amount: 1, unit: "mg" }] },
  ];
  const items = [
    { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
    { supplementId: SUP_MG_B, frequency: { type: "daily" as const } },
  ];
  expect(detectComponentOverlaps(items, parenCatalog, "2026-07-16")).toEqual([]);
});

// GENERIC_PREFIXES completo: cada prefijo genérico debe forzar la clave de DOS palabras para que
// dos componentes que solo comparten el prefijo (p. ej. "Ácido fólico" vs "Ácido pantoténico")
// NO se agrupen. Sin el prefijo en el set, ambos colapsarían a la primera palabra y darían un
// falso warning. Cubre los prefijos que ningún otro test ejercita (ácido/extracto/vit/vitamin…).
const GENERIC_PREFIX_PAIRS: [string, string][] = [
  ["Ácido fólico", "Ácido pantoténico"],
  ["Acido alfa-lipoico", "Acido hialurónico"],
  ["Acid folic", "Acid ascorbic"],
  ["Extracto Ginkgo", "Extracto Valeriana"],
  ["Extract Ginger", "Extract Garlic"],
  ["Extrakt Ginkgo", "Extrakt Baldrian"],
  ["Vit B12", "Vit B6"],
  ["Vitamin K2", "Vitamin B1"],
  ["Vitamine A", "Vitamine E"],
];

for (const [nameA, nameB] of GENERIC_PREFIX_PAIRS) {
  test(`prefijo genérico "${nameA.split(" ")[0]}": "${nameA}" y "${nameB}" NO se agrupan`, () => {
    const genCatalog = [
      { id: SUP_MG_A, name: "Producto A", components: [{ name: nameA, amount: 1, unit: "mg" }] },
      { id: SUP_MG_B, name: "Producto B", components: [{ name: nameB, amount: 1, unit: "mg" }] },
    ];
    const items = [
      { supplementId: SUP_MG_A, frequency: { type: "daily" as const } },
      { supplementId: SUP_MG_B, frequency: { type: "daily" as const } },
    ];
    expect(detectComponentOverlaps(items, genCatalog, "2026-07-16")).toEqual([]);
  });
}
