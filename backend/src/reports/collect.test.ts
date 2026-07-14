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

test("collectReportData agrega comidas, líquido y gasto", async () => {
  // meals con 1 ítem 500 kcal; 1 agua de 250; 1 sesión 1h sin FC → MET 5*80 = 400 (bruto, sin bmr)
  const deps = {
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

test("hasAnyData false si no hay nada", async () => {
  const deps = { listMeals: async () => [], listWater: async () => [], listSessions: async () => [], getMetrics: async () => [] };
  const data = await collectReportData({} as any, "u", 0, 10, { goal: { status: "incomplete" } } as any, deps as any);
  expect(hasAnyData(data)).toBe(false);
});

test("periodDays y weightTrend (primer y último peso del rango)", async () => {
  const deps = {
    listMeals: async () => [], listWater: async () => [],
    listSessions: async () => [],
    getMetrics: async () => [ // ordenados asc por measuredAt (como el real)
      { id: "a", metricType: "weight_kg", value: 82, measuredAt: 100 },
      { id: "b", metricType: "steps", value: 5000, measuredAt: 150 },
      { id: "c", metricType: "weight_kg", value: 80, measuredAt: 900 },
    ],
  };
  const athlete = { goal: { status: "incomplete" } } as any;
  // período de 7 días: from=0, to=7*86400000-1
  const data = await collectReportData({} as any, "u", 0, 7 * 86400000 - 1, athlete, deps as any);
  expect(data.periodDays).toBe(7);
  expect(data.weightTrend).toEqual({ first: 82, last: 80 });
  expect(data.metrics.weight_kg).toBe(80); // último sigue siendo el "actual"
});

test("periodDays mínimo 1 y weightTrend null si no hay peso", async () => {
  const deps = { listMeals: async () => [], listWater: async () => [], listSessions: async () => [], getMetrics: async () => [] };
  const data = await collectReportData({} as any, "u", 0, 10, { goal: { status: "incomplete" } } as any, deps as any);
  expect(data.periodDays).toBe(1);
  expect(data.weightTrend).toBeNull();
});
