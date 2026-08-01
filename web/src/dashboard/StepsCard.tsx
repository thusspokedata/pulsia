import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Pasos</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {isError && <p role="alert" className="text-sm text-destructive">No se pudo cargar.</p>}
        {!isLoading && !isError && series.length === 0 && <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>}
        {series.length > 0 && (
          <>
            <p className="mb-2 text-sm text-muted-foreground">Promedio: {avg.toLocaleString("es")}</p>
            <ResponsiveContainer width="100%" height={160}>
              {/* ComposedChart + eje X categórico: evita que se recorte la mitad de la primera y última barra. */}
              <ComposedChart data={chartData}>
                <XAxis dataKey="t" type="category" tickFormatter={fmt} interval="preserveStartEnd" />
                <YAxis />
                <Tooltip labelFormatter={(t) => fmt(Number(t))} />
                <Bar dataKey="v" name="Pasos" fill="#0E7C86" />
                {/* Tendencia: media móvil superpuesta, gris tenue y punteada. */}
                <Line type="monotone" dataKey="ma" name="Media móvil (7d)" stroke="#94a3b8" strokeDasharray="4 4" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
