import { coveragePeriod, NUTRIENTS, NUTRIENT_REFERENCES, NUTRIENT_REFERENCE_KIND, mealsByLocalDay, type PerDayNutrients, type NutrientKey } from "@pulsia/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMeals } from "./useMeals";
import { useProfile } from "./useProfile";
import { localDayKey } from "../dashboard/heatmap";

const label = (key: string) => NUTRIENTS.find((n) => n.key === key)?.label ?? key;
const unit = (key: string) => NUTRIENTS.find((n) => n.key === key)?.unit ?? "";

export function MicrosCard() {
  const { data, isLoading, isError } = useMeals();
  const profile = useProfile();
  const person = { sex: profile.data?.sex, age: profile.data?.age };

  const byDay = mealsByLocalDay(data ?? [], (ms) => localDayKey(ms));
  const perDayFood: PerDayNutrients = Object.fromEntries(Object.entries(byDay).map(([d, t]) => [d, t.nutrients]));
  const days = Object.keys(byDay);

  const cov = coveragePeriod(perDayFood, {}, person, { minDataDays: 1 });
  const floors = cov.byNutrient
    .filter((c) => c.foodAvg != null)
    .map((c) => ({ key: c.key, pct: Math.round(((c.foodAvg as number) / c.ref) * 100) }));

  const limitKeys = ["cholesterol_mg", "saturated_fat_g", "sodium_mg", "sugars_g"].filter(
    (k) => (NUTRIENT_REFERENCE_KIND as Record<string, string>)[k] === "max",
  );
  const limits = limitKeys.map((k) => {
    const vals = days.map((d) => byDay[d].nutrients[k as NutrientKey]).filter((v): v is number => v != null);
    const avg = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
    const ref = (NUTRIENT_REFERENCES as Record<string, number>)[k];
    return { key: k, avg, ref, over: avg != null && avg > ref };
  });
  const colesterol = limits.find((l) => l.key === "cholesterol_mg");

  return (
    <Card>
      <CardHeader><CardTitle role="heading" aria-level={2}>Micronutrientes</CardTitle></CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {isError && <p role="alert" className="text-sm text-destructive">No se pudo cargar.</p>}
        {!isLoading && !isError && days.length === 0 && <p className="text-sm text-muted-foreground">Sin comidas en el rango.</p>}
        {days.length > 0 && (
          <>
            {colesterol && colesterol.avg != null && (
              <div className="mb-3 rounded-md p-3" style={{ background: colesterol.over ? "#FAEEDA" : "#E1F5EE" }}>
                <div className="flex items-center justify-between text-sm font-medium" style={{ color: colesterol.over ? "#633806" : "#085041" }}>
                  <span>Colesterol</span>
                  <span>{Math.round(colesterol.avg)} / {colesterol.ref} {unit("cholesterol_mg")} · límite</span>
                </div>
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {floors.map((f) => (
                <li key={f.key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">{label(f.key)}</span>
                    <span>{f.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.pct)}%`, background: f.pct >= 90 ? "#1D9E75" : "#EF9F27" }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
