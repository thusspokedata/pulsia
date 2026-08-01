import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessions } from "./useSessions";
import { countByLocalDay, localDayKey, yearOf } from "./heatmap";

const DAY = 24 * 3600 * 1000;

// Intensidad 0..4 por cantidad de entrenos ese día (paleta teal).
function color(count: number): string {
  if (count <= 0) return "#e2e8f0";
  const shades = ["#99f6e4", "#5eead4", "#2dd4bf", "#0E7C86"];
  return shades[Math.min(count, shades.length) - 1];
}

export function ConsistencyCard() {
  const { data, isLoading, isError } = useSessions();
  const years = Array.from(new Set((data ?? []).map((s) => yearOf(s.startedAt)))).sort((a, b) => b - a);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // Por defecto se muestra el año más reciente CON datos (no necesariamente el actual); una vez
  // que el usuario elige, esa elección manda.
  const year = selectedYear ?? years[0] ?? new Date().getFullYear();
  const counts = countByLocalDay((data ?? []).map((s) => s.startedAt));

  // Grilla de todos los días del año elegido.
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year, 11, 31).getTime();
  const cells: { key: string; count: number }[] = [];
  for (let t = start; t <= end; t += DAY) {
    const key = localDayKey(t);
    cells.push({ key, count: counts.get(key) ?? 0 });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle role="heading" aria-level={2}>Constancia de entrenos</CardTitle>
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
        {!isLoading && !isError && (
          <div className="grid grid-flow-col grid-cols-[repeat(53,1fr)] grid-rows-[repeat(7,10px)] gap-0.5">
            {cells.map((c) => (
              <div key={c.key} title={`${c.key}: ${c.count}`} className="h-2.5 w-2.5 rounded-sm" style={{ background: color(c.count) }} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
