import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getBackendUrl } from "../storage/config";
import { listMeals, listWater } from "../api/nutrition";
import { getSessions, type SessionListItem } from "../api/sessions";
import { dayExerciseBurn } from "@pulsia/shared";
import type { Meal, WaterLog, NutritionGoalResult, CardioBurnInput, TrainingProfile, NutrientKey } from "@pulsia/shared";
import { listCardio } from "../api/cardio";
import { getDayNutrients } from "../api/supplements";
import { loadDailyGoalContext, type DailyGoalContext } from "./dailyGoal";
import { buildGoalView, type GoalView } from "./goalView";
import { buildNutritionDaySummary, type NutritionDaySummary } from "./daySummary";
import { dayBounds } from "./dayBounds";
import { dateKey } from "../session/dateKey";

export interface NutritionDay {
  error: string | null;
  setError: (msg: string | null) => void;
  meals: Meal[];
  water: WaterLog[];
  summary: NutritionDaySummary;
  // El perfil se expone porque las referencias de micronutrientes dependen del sexo y la edad.
  // Sale del MISMO `loadDailyGoalContext` que la meta: resolverlo aparte en la pantalla es cómo
  // dos vistas del mismo día terminan comparando contra referencias distintas.
  profile: TrainingProfile | null;
  goalResult: NutritionGoalResult | null;
  weightKg: number | undefined;
  goalView: GoalView | null;
  exercise: number;
  baseUrl: string | null;
  reload: () => Promise<void>;
}

export function useNutritionDay(offset: number): NutritionDay {
  const baseUrl = useRef<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [goalCtx, setGoalCtx] = useState<DailyGoalContext>({ profile: null, goalResult: null });
  const [daySessions, setDaySessions] = useState<SessionListItem[]>([]);
  const [dayCardio, setDayCardio] = useState<CardioBurnInput[]>([]);
  const [supplementNutrients, setSupplementNutrients] = useState<Partial<Record<NutrientKey, number>>>({});
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const url = await getBackendUrl(); baseUrl.current = url;
    const { from, to, noon } = dayBounds(offset);
    const dateStr = dateKey(noon);
    try {
      const [ms, ws, ctx, ss, cardio, supplementNutrientsRes] = await Promise.all([
        listMeals(url, from, to), listWater(url, from, to), loadDailyGoalContext(url), getSessions(url), listCardio(url, from, to),
        getDayNutrients(url, dateStr),
      ]);
      setMeals(ms); setWater(ws); setGoalCtx(ctx);
      setDaySessions(ss.filter((s) => s.startedAt >= from && s.startedAt <= to));
      setDayCardio(cardio.map((a) => ({ type: a.type, durationMs: a.durationMs, avgHr: a.avgHr, kcal: a.kcal })));
      setSupplementNutrients(supplementNutrientsRes.totals as Partial<Record<NutrientKey, number>>);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [offset]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const summary = { ...buildNutritionDaySummary(meals, water), supplementNutrients };
  const { profile, weightKg, goalResult } = goalCtx;
  const bmrForBurn = goalResult?.status === "ok" ? goalResult.bmr : null; // narrowing: la variante incomplete no tiene bmr
  const exercise = dayExerciseBurn(daySessions, dayCardio, { weightKg, age: profile?.age, sex: profile?.sex, bmr: bmrForBurn });
  const goalView = goalResult
    ? buildGoalView(goalResult, {
        kcal: summary.dayTotals.kcal, protein_g: summary.dayTotals.protein_g,
        carbs_g: summary.dayTotals.carbs_g, fat_g: summary.dayTotals.fat_g,
      }, exercise)
    : null;

  return { error, setError, meals, water, summary, profile, weightKg, goalResult, goalView, exercise, baseUrl: baseUrl.current, reload };
}
