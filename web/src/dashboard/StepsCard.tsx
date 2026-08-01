import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useMetric } from "./useMetric";
import { toSeries } from "./toSeries";
import { mediaMovil } from "./mediaMovil";

const fmt = (t: number) => new Date(t).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });

export function StepsCard() {
  const { data, isLoading, isError } = useMetric("steps");
  const series = toSeries(data ?? []);
  const avg = series.length ? Math.round(series.reduce((a, p) => a + p.v, 0) / series.length) : 0;
  // Media móvil (7) + barras comparten el MISMO array de datos (misma t categórica).
  const media = mediaMovil(series, 7);
  const chartData = series.map((p, i) => ({ t: p.t, v: p.v, ma: media[i]?.v }));
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
            {/* ComposedChart + eje X categórico: evita que se recorte la mitad de la primera y última barra. */}
            <ComposedChart data={chartData}>
              <XAxis dataKey="t" type="category" tickFormatter={fmt} interval="preserveStartEnd" />
              <YAxis />
              <Tooltip labelFormatter={(t) => fmt(Number(t))} />
              <Bar dataKey="v" fill="#0E7C86" />
              {/* Tendencia: media móvil superpuesta, gris tenue y punteada. */}
              <Line type="monotone" dataKey="ma" stroke="#94a3b8" strokeDasharray="4 4" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
