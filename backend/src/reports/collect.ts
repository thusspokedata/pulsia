import { sumNullableMicro, dayExerciseBurn, saltGFromSodiumMg } from "@pulsia/shared";
import type { AthleteContext, Meal, WaterLog, PlanView, CardioActivity } from "@pulsia/shared";
import { listMeals as listMealsImpl, listWater as listWaterImpl } from "../nutrition/repository";
import { listSessions as listSessionsImpl } from "../sessions/repository";
import { listCardio as listCardioImpl } from "../cardio/repository";
import { getMetrics as getMetricsImpl } from "../metrics/repository";
import {
  getActivePlan as getActivePlanImpl, listTakesForRange as listTakesForRangeImpl,
  listSupplements as listSupplementsImpl,
} from "../supplements/repository";
import { epochToUtcDateStr } from "../lib/dateUtc";
import type { Db } from "../db/client";

interface TakeRow {
  supplementName: string; status: string; plannedDose: string; actualDose: string | null; date: string;
}
interface SupplementRow { id: string; name: string; components: { name: string; amount: number; unit: string }[] }

export interface ReportData {
  totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; sugars_g: number | null; fiber_g: number | null; saturated_fat_g: number | null; salt_g: number | null };
  cholesterolMg: number | null;
  liquid: { total: number; drank: number; fromFood: number };
  exercise: number;
  sessionsCount: number;
  metrics: Partial<Record<string, number>>; // último valor por tipo en el período
  athlete: AthleteContext;
  periodDays: number;
  weightTrend: { first: number; last: number } | null;
  foodNames: string[]; // nombres únicos de los ítems comidos en el período (cap 40)
  foodNamesTotal: number; // total de nombres únicos ANTES del cap, para que el prompt sepa si truncó ("y N más")
  supplements: {
    planItems: { supplementName: string; dose: string; slot: string }[]; // plan activo
    takes: { supplementName: string; status: string; plannedDose: string; actualDose: string | null; date: string }[];
    // id incluido: es la referencia que el prompt le da a la IA para `supplementAdjustment.supplementId`
    // (el ajuste se valida por id EXACTO del catálogo, ver ai/report.ts).
    catalog: { id: string; name: string; components: { name: string; amount: number; unit: string }[] }[];
  } | null; // null si no hay plan activo
}

// Deps inyectables para testear sin DB real.
export interface CollectDeps {
  listMeals: (db: Db, userId: string, from: number, to: number) => Promise<Meal[]>;
  listWater: (db: Db, userId: string, from: number, to: number) => Promise<WaterLog[]>;
  listSessions: (db: Db, userId: string) => Promise<any[]>;
  listCardio: (db: Db, userId: string) => Promise<CardioActivity[]>;
  getMetrics: (db: Db, userId: string, opts: { from: number; to: number }) => Promise<{ metricType: string; value: number; measuredAt: number }[]>;
  getActivePlan: (db: Db, userId: string) => Promise<PlanView | null>;
  listTakesForRange: (db: Db, userId: string, fromDate: string, toDate: string) => Promise<TakeRow[]>;
  listSupplements: (db: Db, userId: string) => Promise<SupplementRow[]>;
}
const defaultDeps: CollectDeps = {
  listMeals: (db, u, f, t) => listMealsImpl(db, u, f, t),
  listWater: (db, u, f, t) => listWaterImpl(db, u, f, t),
  listSessions: (db, u) => listSessionsImpl(db, u),
  listCardio: (db, u) => listCardioImpl(db, u),
  getMetrics: (db, u, opts) => getMetricsImpl(db, u, opts),
  getActivePlan: (db, u) => getActivePlanImpl(db, u),
  listTakesForRange: (db, u, f, t) => listTakesForRangeImpl(db, u, f, t),
  listSupplements: (db, u) => listSupplementsImpl(db, u),
};

export async function collectReportData(
  db: Db, userId: string, from: number, to: number, athlete: AthleteContext, deps: CollectDeps = defaultDeps,
): Promise<ReportData> {
  // El período viene en epoch (ms) del dispositivo, pero las tomas de suplementos se guardan con
  // el date-string (YYYY-MM-DD) del dispositivo — ver comentario de epochToUtcDateStr (misma
  // aproximación que usa la fecha de memoria del atleta en routes/nutrition.ts).
  const fromDateStr = epochToUtcDateStr(from);
  const toDateStr = epochToUtcDateStr(to);
  // Todo en un solo Promise.all: takes/catalog no dependen del plan activo, así que se piden en
  // paralelo con él en vez de encadenar; si no hay plan activo se descartan (supplements: null).
  const [meals, water, allSessions, allCardio, metrics, activePlan, takes, catalog] = await Promise.all([
    deps.listMeals(db, userId, from, to), deps.listWater(db, userId, from, to),
    deps.listSessions(db, userId), deps.listCardio(db, userId), deps.getMetrics(db, userId, { from, to }),
    deps.getActivePlan(db, userId), deps.listTakesForRange(db, userId, fromDateStr, toDateStr),
    deps.listSupplements(db, userId),
  ]);
  const items = meals.flatMap((m) => m.items);
  const uniqueNames = [...new Set(items.map((it) => it.foodName).filter(Boolean))];
  const foodNames = uniqueNames.slice(0, 40);
  const foodNamesTotal = uniqueNames.length;
  const supplements = activePlan ? {
    planItems: activePlan.items.map((it) => ({ supplementName: it.supplementName, dose: it.dose, slot: it.slot })),
    takes: takes.map((t) => ({ supplementName: t.supplementName, status: t.status, plannedDose: t.plannedDose, actualDose: t.actualDose ?? null, date: t.date })),
    catalog: catalog.map((s) => ({ id: s.id, name: s.name, components: s.components })),
  } : null;
  const micro = (k: "sugars_g" | "fiber_g" | "saturated_fat_g") => sumNullableMicro(items.map((it) => it[k]));
  const totals = {
    kcal: items.reduce((a, it) => a + it.kcal, 0),
    protein_g: Math.round(items.reduce((a, it) => a + it.protein_g, 0)),
    carbs_g: Math.round(items.reduce((a, it) => a + it.carbs_g, 0)),
    fat_g: Math.round(items.reduce((a, it) => a + it.fat_g, 0)),
    sugars_g: micro("sugars_g"), fiber_g: micro("fiber_g"), saturated_fat_g: micro("saturated_fat_g"),
    // El informe sigue hablando en SAL (referencia OMS de 5 g/día, que es la que el usuario
    // reconoce) pero lo persistido es SODIO — misma regla que el semáforo. Se SUMA el sodio y se
    // convierte AL FINAL: convertir ítem por ítem y después sumar acumularía el redondeo a 1
    // decimal de cada ítem.
    salt_g: saltGFromSodiumMg(sumNullableMicro(items.map((it) => it.sodium_mg))),
  };
  const cholesterolMg = sumNullableMicro(items.map((it) => it.cholesterol_mg));
  const fromFood = sumNullableMicro(items.map((it) => it.water_ml)) ?? 0;
  const drank = water.reduce((a, w) => a + w.ml, 0);
  const daySessions = allSessions.filter((s) => s.startedAt >= from && s.startedAt <= to);
  const dayCardio = allCardio
    .filter((a) => a.startedAt >= from && a.startedAt <= to)
    .map((a) => ({ type: a.type, durationMs: a.durationMs, avgHr: a.avgHr, kcal: a.kcal }));
  const bmr = athlete.goal.status === "ok" ? (athlete.goal.bmr ?? null) : null;
  const exercise = dayExerciseBurn(daySessions, dayCardio, { weightKg: athlete.weightKg, age: athlete.age, sex: athlete.sex, bmr });
  const metricsByType: Partial<Record<string, number>> = {};
  for (const m of metrics) metricsByType[m.metricType] = m.value; // ordenados asc → queda el último
  const periodDays = Math.max(1, Math.round((to - from + 1) / 86_400_000));
  const weights = metrics.filter((m) => m.metricType === "weight_kg");
  const weightTrend = weights.length > 0 ? { first: weights[0].value, last: weights[weights.length - 1].value } : null;
  return {
    totals, cholesterolMg, liquid: { total: Math.round(fromFood + drank), drank, fromFood },
    exercise, sessionsCount: daySessions.length, metrics: metricsByType, athlete, periodDays, weightTrend,
    foodNames, foodNamesTotal, supplements,
  };
}

export function hasAnyData(d: ReportData): boolean {
  return d.totals.kcal > 0 || d.sessionsCount > 0 || d.liquid.total > 0 || Object.keys(d.metrics).length > 0;
}
