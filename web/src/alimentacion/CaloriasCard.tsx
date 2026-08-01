import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { macroSplit, mealsByLocalDay } from "@pulsia/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMeals } from "./useMeals";
import { useNutritionGoal } from "./useNutritionGoal";
import { localDayKey } from "../dashboard/heatmap";

const fmt = (t: number) => new Date(t).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });

export function CaloriasCard() {
  const { data, isLoading, isError } = useMeals();
  const goal = useNutritionGoal();
  const meta = goal?.status === "ok" ? goal : null;

  const byDay = mealsByLocalDay(data ?? [], (ms) => localDayKey(ms));
  const days = Object.keys(byDay).sort();
  const serie = days.map((d) => ({ t: new Date(d + "T12:00:00").getTime(), kcal: Math.round(byDay[d].kcal), meta: meta?.kcal }));
  const n = days.length;
  const avg = n
    ? {
        kcal: Math.round(days.reduce((a, d) => a + byDay[d].kcal, 0) / n),
        protein_g: days.reduce((a, d) => a + byDay[d].protein_g, 0) / n,
        carbs_g: days.reduce((a, d) => a + byDay[d].carbs_g, 0) / n,
        fat_g: days.reduce((a, d) => a + byDay[d].fat_g, 0) / n,
      }
    : null;
  const macros = avg ? macroSplit(avg, meta ? { protein_g: meta.protein_g, carbs_g: meta.carbs_g, fat_g: meta.fat_g } : null) : [];

  return (
    <Card>
      <CardHeader><CardTitle role="heading" aria-level={2}>Calorías y macros</CardTitle></CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {isError && <p role="alert" className="text-sm text-destructive">No se pudo cargar.</p>}
        {!isLoading && !isError && n === 0 && <p className="text-sm text-muted-foreground">Sin comidas en el rango.</p>}
        {n > 0 && avg && (
          <>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-2xl font-medium">{avg.kcal.toLocaleString("es")}</span>
              <span className="text-sm text-muted-foreground">
                kcal/día promedio{meta ? ` · meta ${meta.kcal.toLocaleString("es")}` : ""}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={serie}>
                <XAxis dataKey="t" type="category" tickFormatter={fmt} interval="preserveStartEnd" />
                <YAxis />
                <Tooltip labelFormatter={(t) => fmt(Number(t))} />
                <Bar dataKey="kcal" name="kcal" fill="#0E7C86" />
                {meta && <Line dataKey="meta" name="Meta" stroke="#94a3b8" strokeDasharray="4 4" dot={false} strokeWidth={2} />}
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {macros.map((m) => (
                <div key={m.key}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-medium">{m.g} g</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, m.pctActual)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
