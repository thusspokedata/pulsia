import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getBackendUrl } from "../storage/config";
import { listMeals, listWater, getNutritionGoal } from "../api/nutrition";
import { getProfile } from "../storage/profile";
import { getLatestMetrics } from "../api/metrics";
import { computeNutritionGoal } from "@pulsia/shared";
import type { Meal, WaterLog, NutritionGoalInput, TrainingProfile, NutritionGoalResult } from "@pulsia/shared";
import { buildGoalView, type GoalView } from "./goalView";
import { buildNutritionDaySummary, type NutritionDaySummary } from "./daySummary";
import { dayBounds } from "./dayBounds";

export interface NutritionDay {
  error: string | null;
  setError: (msg: string | null) => void;
  meals: Meal[];
  water: WaterLog[];
  summary: NutritionDaySummary;
  goalResult: NutritionGoalResult | null;
  goalView: GoalView | null;
  baseUrl: string | null;
  reload: () => Promise<void>;
}

export function useNutritionDay(offset: number): NutritionDay {
  const baseUrl = useRef<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [goalInput, setGoalInput] = useState<NutritionGoalInput | null>(null);
  const [profile, setProfile] = useState<TrainingProfile | null>(null);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const url = await getBackendUrl(); baseUrl.current = url;
    const { from, to } = dayBounds(offset);
    try {
      const [ms, ws, gi, p] = await Promise.all([
        listMeals(url, from, to), listWater(url, from, to), getNutritionGoal(url), getProfile(),
      ]);
      setMeals(ms); setWater(ws); setGoalInput(gi); setProfile(p);
      let w = p?.weightKg;
      try { const latest = await getLatestMetrics(url); if (latest.weight_kg?.value != null) w = latest.weight_kg.value; } catch { /* offline */ }
      setWeightKg(w); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [offset]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const summary = buildNutritionDaySummary(meals, water);
  const goalResult = goalInput
    ? computeNutritionGoal({
        sex: profile?.sex, age: profile?.age, heightCm: profile?.heightCm, weightKg,
        activityLevel: profile?.activityLevel,
        objective: goalInput.objective, rateKgPerWeek: goalInput.rateKgPerWeek, manualKcal: goalInput.manualKcal,
      })
    : null;
  const goalView = goalResult
    ? buildGoalView(goalResult, {
        kcal: summary.dayTotals.kcal, protein_g: summary.dayTotals.protein_g,
        carbs_g: summary.dayTotals.carbs_g, fat_g: summary.dayTotals.fat_g,
      })
    : null;

  return { error, setError, meals, water, summary, goalResult, goalView, baseUrl: baseUrl.current, reload };
}
