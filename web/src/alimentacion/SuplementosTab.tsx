import { coveragePeriod, mealsByLocalDay, NUTRIENTS, type PerDayNutrients, type CoverageState } from "@pulsia/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMeals } from "./useMeals";
import { useProfile } from "./useProfile";
import { useSupplementDaily } from "./useSupplementDaily";
import { localDayKey } from "../dashboard/heatmap";

const label = (key: string) => NUTRIENTS.find((n) => n.key === key)?.label ?? key;
const unit = (key: string) => NUTRIENTS.find((n) => n.key === key)?.unit ?? "";

const STATE: Record<CoverageState, { label: string; color: string }> = {
  food: { label: "Solo comida", color: "#0F6E56" },
  supplement: { label: "Con suplemento", color: "#534AB7" },
  uncovered: { label: "Sin cubrir", color: "#BA7517" },
  few_data: { label: "Pocos datos", color: "#5F5E5A" },
};

export function SuplementosTab() {
  const meals = useMeals();
  const supp = useSupplementDaily();
  const profile = useProfile();
  const person = { sex: profile.data?.sex, age: profile.data?.age };

  const byDay = mealsByLocalDay(meals.data ?? [], (ms) => localDayKey(ms));
  const perDayFood: PerDayNutrients = Object.fromEntries(Object.entries(byDay).map(([d, t]) => [d, t.nutrients]));
  const perDaySupp: PerDayNutrients = Object.fromEntries(Object.entries(supp.data?.perDay ?? {}).map(([d, r]) => [d, r.totals]));

  const cov = coveragePeriod(perDayFood, perDaySupp, person, { minDataDays: 1 });
  const rows = cov.byNutrient.filter((c) => c.foodAvg != null || c.suppAvg > 0);

  const isLoading = meals.isLoading || supp.isLoading;
  const isError = meals.isError || supp.isError;

  return (
    <Card>
      <CardHeader><CardTitle role="heading" aria-level={2}>Comida vs suplemento</CardTitle></CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {isError && <p role="alert" className="text-sm text-destructive">No se pudo cargar.</p>}
        {!isLoading && !isError && cov.daysRegistered === 0 && <p className="text-sm text-muted-foreground">Sin registros en el rango.</p>}
        {cov.daysRegistered > 0 && (
          <>
            {cov.onlyFoodPct != null && (
              <p className="mb-3 text-sm text-muted-foreground">{cov.onlyFoodPct}% de los nutrientes los cubrís solo con comida.</p>
            )}
            <ul className="flex flex-col gap-3">
              {rows.map((c) => {
                const food = c.foodAvg ?? 0;
                const total = food + c.suppAvg;
                const foodPct = total > 0 ? (food / total) * 100 : 0;
                // Si no hay aporte de ninguno de los dos lados (total 0), ambos segmentos quedan en 0
                // → barra vacía, no 100% violeta (un nutriente "sin cubrir" no se pinta como suplemento).
                const suppPct = total > 0 ? 100 - foodPct : 0;
                return (
                  <li key={c.key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-muted-foreground">{label(c.key)}</span>
                      <span style={{ color: STATE[c.state].color }}>{STATE[c.state].label}</span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
                      <div style={{ width: `${foodPct}%`, background: "#0E7C86" }} />
                      <div style={{ width: `${suppPct}%`, background: "#7F77DD" }} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      comida {Math.round(food)} · suplemento {Math.round(c.suppAvg)} {unit(c.key)} (ref {Math.round(c.ref)})
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#0E7C86" }} />Comida</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#7F77DD" }} />Suplemento</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
