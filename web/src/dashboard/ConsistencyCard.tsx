import { useState } from "react";
import { buildDailyBurn, burnThresholds, availableYears, countTrainedDays, daysInYear, type DayBurn } from "@pulsia/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessions } from "./useSessions";
import { useCardio } from "./useCardio";
import { useProfile } from "../alimentacion/useProfile";
import { useNutritionGoal } from "../alimentacion/useNutritionGoal";
import { YearHeatmapGrid } from "./YearHeatmapGrid";

export function ConsistencyCard() {
  const sessionsQ = useSessions();
  const cardioQ = useCardio();
  const profileQ = useProfile();
  const goal = useNutritionGoal();

  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Se incluye el perfil: sin él no se sabe si mostrar el heatmap o el empty state "completá
  // peso y edad", así que mientras carga es "cargando" y si falla de verdad es "error" (no el
  // empty state, que sería una remediación equivocada). `useProfile` traga el 404 → null, así
  // que `isError` solo se prende ante una falla real de /profile.
  const isLoading = sessionsQ.isLoading || cardioQ.isLoading || profileQ.isLoading;
  const isError = sessionsQ.isError || cardioQ.isError || profileQ.isError;

  const sessions = sessionsQ.data ?? [];
  const activities = cardioQ.data ?? [];
  const profile = profileQ.data ?? null;

  const athlete = {
    weightKg: profile?.weightKg,
    age: profile?.age,
    sex: profile?.sex,
    bmr: goal?.status === "ok" ? goal.bmr : null,
  };
  const canComputeBurn = profile?.weightKg != null && profile?.age != null;

  const years = availableYears(sessions, activities);
  const year = selectedYear ?? years[0] ?? new Date().getFullYear();

  let burnByDate = new Map<string, DayBurn>();
  let thresholds: [number, number, number] = [0, 0, 0];
  if (canComputeBurn) {
    burnByDate = buildDailyBurn(
      sessions.map((s) => ({ startedAt: s.startedAt, totalDurationMs: s.totalDurationMs, avgHr: s.avgHr })),
      activities,
      athlete,
    );
    thresholds = burnThresholds(Array.from(burnByDate.values(), (d) => d.kcal));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle role="heading" aria-level={2}>Días entrenados y gasto</CardTitle>
        <select
          value={year}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          aria-label="Año"
          className="rounded-md border px-2 py-1 text-sm"
        >
          {(years.length ? years : [year]).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {isError && <p role="alert" className="text-sm text-destructive">No se pudo cargar.</p>}
        {!isLoading && !isError && years.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay entrenamientos registrados.</p>
        )}
        {!isLoading && !isError && years.length > 0 && !canComputeBurn && (
          <p className="text-sm text-muted-foreground">Completá peso y edad en tu perfil para ver el gasto.</p>
        )}
        {!isLoading && !isError && years.length > 0 && canComputeBurn && (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              {countTrainedDays(burnByDate, year)}/{daysInYear(year)} días
            </p>
            <YearHeatmapGrid burnByDate={burnByDate} thresholds={thresholds} year={year} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
