import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useMetric } from "./useMetric";
import { toSeries } from "./toSeries";

const fmt = (t: number) => new Date(t).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });

export function StepsCard() {
  const { data, isLoading, isError } = useMetric("steps");
  const series = toSeries(data ?? []);
  const avg = series.length ? Math.round(series.reduce((a, p) => a + p.v, 0) / series.length) : 0;
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <h3>Pasos</h3>
      {isLoading && <p>Cargando…</p>}
      {isError && <p role="alert">No se pudo cargar.</p>}
      {!isLoading && !isError && series.length === 0 && <p>Sin datos en el rango.</p>}
      {series.length > 0 && (
        <>
          <p>Promedio: {avg.toLocaleString("es")}</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={series}>
              <XAxis dataKey="t" tickFormatter={fmt} type="number" domain={["dataMin", "dataMax"]} />
              <YAxis />
              <Tooltip labelFormatter={(t) => fmt(Number(t))} />
              <Bar dataKey="v" fill="#0E7C86" />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
