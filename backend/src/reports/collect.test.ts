import { test, expect } from "bun:test";
import { collectReportData, hasAnyData } from "./collect";

const meal = (items: any[]) => ({ id: "m", eatenAt: 1, mealType: "almuerzo", note: null, items });
const item = (o: any) => ({ id: "i", foodId: null, foodName: "Pollo", quantity: 100, quantityUnit: "g", grams: 100, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, saturated_fat_g: null, sugars_g: null, fiber_g: null, salt_g: null, cholesterol_mg: null, water_ml: null, ...o });

function fakeDb(opts: any) {
  return {
    query: {},
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => opts.metrics ?? [] }) }) }),
  } as any;
}

// Deps con defaults vacíos (sin plan activo): las suites spreadean y overridean lo que necesitan.
const baseDeps = {
  listMeals: async () => [], listWater: async () => [], listSessions: async () => [], listCardio: async () => [], getMetrics: async () => [],
  getActivePlan: async () => null, listTakesForRange: async () => [], listSupplements: async () => [],
};
const athleteIncomplete = { goal: { status: "incomplete" } } as any;

test("collectReportData agrega comidas, líquido y gasto", async () => {
  // meals con 1 ítem 500 kcal; 1 agua de 250; 1 sesión 1h sin FC → MET 5*80 = 400 (bruto, sin bmr)
  const deps = {
    ...baseDeps,
    listMeals: async () => [meal([item({ kcal: 500, protein_g: 30, cholesterol_mg: 90, water_ml: 50 })])],
    listWater: async () => [{ id: "w", ml: 250, loggedAt: 1 }],
    listSessions: async () => [{ id: "s", startedAt: 1, totalDurationMs: 3600000, avgHr: null, dayLabel: "A", location: "gym", programId: "p", completionPct: 100 }],
    getMetrics: async () => [{ id: "x", metricType: "weight_kg", value: 80, measuredAt: 1 }],
  };
  const athlete = { weightKg: 80, age: 40, sex: "male", goal: { status: "ok", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: null } } as any;
  const data = await collectReportData({} as any, "u", 0, 10, athlete, deps as any);
  expect(data.totals.kcal).toBe(500);
  expect(data.cholesterolMg).toBe(90);
  expect(data.liquid.total).toBe(300); // 250 tomada + 50 aporte
  expect(data.exercise).toBe(400);
  expect(data.sessionsCount).toBe(1);
  expect(data.metrics.weight_kg).toBe(80);
  expect(hasAnyData(data)).toBe(true);
});

test("collectReportData suma el gasto de cardio del período (device kcal + estimado)", async () => {
  const deps = {
    ...baseDeps,
    // sesión 1h sin FC → MET 5*80 = 400 bruto (sin bmr)
    listSessions: async () => [{ id: "s", startedAt: 1, totalDurationMs: 3600000, avgHr: null, dayLabel: "A", location: "gym", programId: "p", completionPct: 100 }],
    // una caminata con kcal del reloj (device → se usa tal cual) y otra fuera del período (se ignora)
    listCardio: async () => [
      { id: "c1", type: "walk", startedAt: 5, durationMs: 1800000, avgHr: null, maxHr: null, elevationGainM: null, distanceM: null, kcal: 150, kcalSource: "device", source: "fit", notes: "" },
      { id: "c2", type: "run", startedAt: 999, durationMs: 600000, avgHr: null, maxHr: null, elevationGainM: null, distanceM: null, kcal: 99, kcalSource: "device", source: "fit", notes: "" },
    ],
  };
  const athlete = { weightKg: 80, age: 40, sex: "male", goal: { status: "ok", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: null } } as any;
  // período [0, 10]: entra la sesión (startedAt 1) y c1 (startedAt 5), NO c2 (startedAt 999)
  const data = await collectReportData({} as any, "u", 0, 10, athlete, deps as any);
  expect(data.exercise).toBe(550); // 400 fuerza + 150 device del cardio; c2 fuera de rango
});

test("hasAnyData false si no hay nada", async () => {
  const data = await collectReportData({} as any, "u", 0, 10, athleteIncomplete, baseDeps as any);
  expect(hasAnyData(data)).toBe(false);
});

test("periodDays y weightTrend (primer y último peso del rango)", async () => {
  const deps = {
    ...baseDeps,
    getMetrics: async () => [ // ordenados asc por measuredAt (como el real)
      { id: "a", metricType: "weight_kg", value: 82, measuredAt: 100 },
      { id: "b", metricType: "steps", value: 5000, measuredAt: 150 },
      { id: "c", metricType: "weight_kg", value: 80, measuredAt: 900 },
    ],
  };
  // período de 7 días: from=0, to=7*86400000-1
  const data = await collectReportData({} as any, "u", 0, 7 * 86400000 - 1, athleteIncomplete, deps as any);
  expect(data.periodDays).toBe(7);
  expect(data.weightTrend).toEqual({ first: 82, last: 80 });
  expect(data.metrics.weight_kg).toBe(80); // último sigue siendo el "actual"
});

test("periodDays mínimo 1 y weightTrend null si no hay peso", async () => {
  const data = await collectReportData({} as any, "u", 0, 10, athleteIncomplete, baseDeps as any);
  expect(data.periodDays).toBe(1);
  expect(data.weightTrend).toBeNull();
});

test("foodNames: únicos y con cap 40, foodNamesTotal es el total sin capear", async () => {
  const names = Array.from({ length: 45 }, (_, i) => `Alimento ${i % 42}`); // 42 nombres únicos, algunos repetidos
  const deps = {
    ...baseDeps,
    listMeals: async () => [meal(names.map((n) => item({ foodName: n })))],
  };
  const data = await collectReportData({} as any, "u", 0, 10, athleteIncomplete, deps as any);
  expect(new Set(data.foodNames).size).toBe(data.foodNames.length); // sin duplicados
  expect(data.foodNames.length).toBe(40); // cap
  expect(data.foodNamesTotal).toBe(42); // total único, sin capear
});

test("supplements null si no hay plan activo", async () => {
  const data = await collectReportData({} as any, "u", 0, 10, athleteIncomplete, baseDeps as any);
  expect(data.supplements).toBeNull();
});

test("supplements poblado con plan activo: planItems, takes y catálogo mapeados", async () => {
  const deps = {
    ...baseDeps,
    getActivePlan: async () => ({
      id: "p", userNote: null, createdAt: 0,
      items: [{ id: "it1", supplementId: "s1", slot: "desayuno", frequency: { type: "daily" }, dose: "1 cápsula", reason: null, supplementName: "Zinc" }],
    }),
    listTakesForRange: async () => [
      { id: "t1", userId: "u", date: "2026-07-15", planItemId: "it1", supplementName: "Zinc", plannedDose: "1 cápsula", slot: "desayuno", status: "taken", actualDose: null, note: null, createdAt: new Date(0) },
    ],
    listSupplements: async () => [
      { id: "s1", name: "Zinc", brand: null, servingLabel: "1 cápsula", components: [{ name: "Zinc", amount: 10, unit: "mg" }], labelMaxPerDay: null, source: "label", info: null, notes: null, createdAt: 0 },
    ],
  };
  const data = await collectReportData({} as any, "u", 0, 10, athleteIncomplete, deps as any);
  expect(data.supplements).not.toBeNull();
  expect(data.supplements!.planItems).toEqual([{ supplementName: "Zinc", dose: "1 cápsula", slot: "desayuno" }]);
  expect(data.supplements!.takes).toEqual([{ supplementName: "Zinc", status: "taken", plannedDose: "1 cápsula", actualDose: null, date: "2026-07-15" }]);
  expect(data.supplements!.catalog).toEqual([{ id: "s1", name: "Zinc", components: [{ name: "Zinc", amount: 10, unit: "mg" }] }]);
});

test("hasAnyData false si SOLO hay datos de suplementos (no justifican un informe solos)", async () => {
  const deps = {
    ...baseDeps,
    getActivePlan: async () => ({
      id: "p", userNote: null, createdAt: 0,
      items: [{ id: "it1", supplementId: "s1", slot: "desayuno", frequency: { type: "daily" }, dose: "1 cápsula", reason: null, supplementName: "Zinc" }],
    }),
    listTakesForRange: async () => [
      { id: "t1", userId: "u", date: "2026-07-15", planItemId: "it1", supplementName: "Zinc", plannedDose: "1 cápsula", slot: "desayuno", status: "taken", actualDose: null, note: null, createdAt: new Date(0) },
    ],
  };
  const data = await collectReportData({} as any, "u", 0, 10, athleteIncomplete, deps as any);
  expect(data.supplements).not.toBeNull();
  expect(hasAnyData(data)).toBe(false);
});
