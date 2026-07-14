import { sumNullableMicro, sumDayExerciseBurn } from "@pulsia/shared";
import type { AthleteContext, Meal, WaterLog } from "@pulsia/shared";
import { listMeals as listMealsImpl, listWater as listWaterImpl } from "../nutrition/repository";
import { listSessions as listSessionsImpl } from "../sessions/repository";
import { getMetrics as getMetricsImpl } from "../metrics/repository";
import type { Db } from "../db/client";

export interface ReportData {
  totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; sugars_g: number | null; fiber_g: number | null; saturated_fat_g: number | null; salt_g: number | null };
  cholesterolMg: number | null;
  liquid: { total: number; drank: number; fromFood: number };
  exercise: number;
  sessionsCount: number;
  metrics: Partial<Record<string, number>>; // último valor por tipo en el período
  athlete: AthleteContext;
}

// Deps inyectables para testear sin DB real.
export interface CollectDeps {
  listMeals: (db: Db, userId: string, from: number, to: number) => Promise<Meal[]>;
  listWater: (db: Db, userId: string, from: number, to: number) => Promise<WaterLog[]>;
  listSessions: (db: Db, userId: string) => Promise<any[]>;
  getMetrics: (db: Db, userId: string, opts: { from: number; to: number }) => Promise<{ metricType: string; value: number; measuredAt: number }[]>;
}
const defaultDeps: CollectDeps = {
  listMeals: (db, u, f, t) => listMealsImpl(db, u, f, t),
  listWater: (db, u, f, t) => listWaterImpl(db, u, f, t),
  listSessions: (db, u) => listSessionsImpl(db, u),
  getMetrics: (db, u, opts) => getMetricsImpl(db, u, opts),
};

export async function collectReportData(
  db: Db, userId: string, from: number, to: number, athlete: AthleteContext, deps: CollectDeps = defaultDeps,
): Promise<ReportData> {
  const [meals, water, allSessions, metrics] = await Promise.all([
    deps.listMeals(db, userId, from, to), deps.listWater(db, userId, from, to),
    deps.listSessions(db, userId), deps.getMetrics(db, userId, { from, to }),
  ]);
  const items = meals.flatMap((m) => m.items);
  const micro = (k: "sugars_g" | "fiber_g" | "saturated_fat_g" | "salt_g") => sumNullableMicro(items.map((it) => it[k]));
  const totals = {
    kcal: items.reduce((a, it) => a + it.kcal, 0),
    protein_g: Math.round(items.reduce((a, it) => a + it.protein_g, 0)),
    carbs_g: Math.round(items.reduce((a, it) => a + it.carbs_g, 0)),
    fat_g: Math.round(items.reduce((a, it) => a + it.fat_g, 0)),
    sugars_g: micro("sugars_g"), fiber_g: micro("fiber_g"), saturated_fat_g: micro("saturated_fat_g"), salt_g: micro("salt_g"),
  };
  const cholesterolMg = sumNullableMicro(items.map((it) => it.cholesterol_mg));
  const fromFood = sumNullableMicro(items.map((it) => it.water_ml)) ?? 0;
  const drank = water.reduce((a, w) => a + w.ml, 0);
  const daySessions = allSessions.filter((s) => s.startedAt >= from && s.startedAt <= to);
  const bmr = athlete.goal.status === "ok" ? (athlete.goal.bmr ?? null) : null;
  const exercise = sumDayExerciseBurn(daySessions, { weightKg: athlete.weightKg, age: athlete.age, sex: athlete.sex, bmr });
  const metricsByType: Partial<Record<string, number>> = {};
  for (const m of metrics) metricsByType[m.metricType] = m.value; // ordenados asc → queda el último
  return {
    totals, cholesterolMg, liquid: { total: Math.round(fromFood + drank), drank, fromFood },
    exercise, sessionsCount: daySessions.length, metrics: metricsByType, athlete,
  };
}

export function hasAnyData(d: ReportData): boolean {
  return d.totals.kcal > 0 || d.sessionsCount > 0 || d.liquid.total > 0 || Object.keys(d.metrics).length > 0;
}
