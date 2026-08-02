import { useState } from "react";
import type { Meal } from "@pulsia/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMeals } from "./useMeals";
import { useNutritionGoal } from "./useNutritionGoal";
import { itemFlags } from "./itemFlags";
import { localDayKey } from "../dashboard/heatmap";

const MEAL_LABEL: Record<string, string> = { desayuno: "Desayuno", almuerzo: "Almuerzo", cena: "Cena", snack: "Snack" };
const SENTIMENT_STYLE: Record<string, { bg: string; fg: string }> = {
  bad: { bg: "#FCEBEB", fg: "#791F1F" },
  warn: { bg: "#FAEEDA", fg: "#633806" },
  good: { bg: "#E1F5EE", fg: "#085041" },
};
const NUTR_SHORT: Record<string, string> = {
  fat_g: "Grasa", saturated_fat_g: "Saturadas", sugars_g: "Azúcares", salt_g: "Sal", cholesterol_mg: "Colest.", fiber_g: "Fibra",
};
const ORDER = ["desayuno", "almuerzo", "cena", "snack", "sin_tipo"];
const fmtDay = (key: string) => new Date(key + "T12:00:00").toLocaleDateString("es", { weekday: "short", day: "2-digit", month: "2-digit" });

export function DiarioTab() {
  const { data, isLoading, isError } = useMeals();
  const goal = useNutritionGoal();
  const meta = goal?.status === "ok" ? goal : null;
  const meals = data ?? [];

  const byDay: Record<string, Meal[]> = {};
  for (const m of meals) (byDay[localDayKey(m.eatenAt)] ??= []).push(m);
  const days = Object.keys(byDay).sort().reverse();
  const [selected, setSelected] = useState<string | null>(null);
  const day = selected && byDay[selected] ? selected : (days[0] ?? null);

  const dayMeals = day ? byDay[day] : [];
  const consumido = Math.round(dayMeals.reduce((a, m) => a + m.items.reduce((s, it) => s + it.kcal, 0), 0));
  const restante = meta ? meta.kcal - consumido : null;
  const grouped = ORDER
    .map((type) => ({ type, items: dayMeals.filter((m) => (m.mealType ?? "sin_tipo") === type).flatMap((m) => m.items) }))
    .filter((g) => g.items.length > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle role="heading" aria-level={2}>Diario</CardTitle>
        {days.length > 0 && (
          <select value={day ?? ""} onChange={(e) => setSelected(e.target.value)} aria-label="Día" className="rounded-md border px-2 py-1 text-sm">
            {days.map((d) => <option key={d} value={d}>{fmtDay(d)}</option>)}
          </select>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {isError && <p role="alert" className="text-sm text-destructive">No se pudo cargar.</p>}
        {!isLoading && !isError && days.length === 0 && <p className="text-sm text-muted-foreground">Sin comidas en el rango.</p>}
        {day && (
          <>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-2xl font-medium">{consumido.toLocaleString("es")}</span>
              <span className="text-sm text-muted-foreground">
                kcal{meta ? ` · meta ${meta.kcal.toLocaleString("es")} · ${restante! >= 0 ? `${restante!.toLocaleString("es")} restante` : `${Math.abs(restante!).toLocaleString("es")} de más`}` : ""}
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {grouped.map((g) => (
                <div key={g.type}>
                  <h3 className="mb-1 text-sm font-medium">{MEAL_LABEL[g.type] ?? "Sin tipo"}</h3>
                  <ul className="flex flex-col gap-2">
                    {g.items.map((it) => {
                      const notable = itemFlags(it).notable;
                      return (
                        <li key={it.id} className="rounded-md border px-3 py-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate font-medium">{it.foodName}</span>
                            <span className="text-muted-foreground">{Math.round(it.grams)} g · {Math.round(it.kcal)} kcal</span>
                          </div>
                          {notable.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {notable.map((f) => (
                                <span key={f.nutrient} className="rounded-full px-2 py-0.5 text-xs" style={{ background: SENTIMENT_STYLE[f.sentiment].bg, color: SENTIMENT_STYLE[f.sentiment].fg }}>
                                  {NUTR_SHORT[f.nutrient]}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
