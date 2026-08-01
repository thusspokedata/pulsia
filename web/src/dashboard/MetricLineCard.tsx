import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useMetric } from "./useMetric";
import { toSeries } from "./toSeries";
import { mediaMovil } from "./mediaMovil";

const fmt = (t: number) => new Date(t).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });

export function MetricLineCard({ title, type, unit, showAverage }: { title: string; type: string; unit?: string; showAverage?: boolean }) {
  const { data, isLoading, isError } = useMetric(type);
  const series = toSeries(data ?? []);
  // Media móvil (7) opcional: línea de tendencia suave sobre los datos crudos.
  const media = showAverage ? mediaMovil(series, 7) : [];
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <h3>{title}{unit ? ` (${unit})` : ""}</h3>
      {isLoading && <p>Cargando…</p>}
      {isError && <p role="alert">No se pudo cargar.</p>}
      {!isLoading && !isError && series.length === 0 && <p>Sin datos en el rango.</p>}
      {series.length > 0 && (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={series.map((p, i) => ({ ...p, ma: media[i]?.v }))}>
            <XAxis dataKey="t" tickFormatter={fmt} type="number" domain={["dataMin", "dataMax"]} />
            <YAxis domain={["auto", "auto"]} />
            <Tooltip labelFormatter={(t) => fmt(Number(t))} />
            <Line type="monotone" dataKey="v" stroke="#0E7C86" dot={false} />
            {showAverage && (
              // Tendencia: media móvil superpuesta, gris tenue y punteada.
              <Line type="monotone" dataKey="ma" stroke="#94a3b8" strokeDasharray="4 4" dot={false} strokeWidth={2} />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
