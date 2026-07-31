import { useState } from "react";
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
  const [year, setYear] = useState<number>(new Date().getFullYear());
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
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Constancia de entrenos</h3>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Año">
          {(years.length ? years : [year]).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {isLoading && <p>Cargando…</p>}
      {isError && <p role="alert">No se pudo cargar.</p>}
      {!isLoading && !isError && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(53, 1fr)", gridAutoFlow: "column", gridTemplateRows: "repeat(7, 10px)", gap: 2 }}>
          {cells.map((c) => (
            <div key={c.key} title={`${c.key}: ${c.count}`} style={{ width: 10, height: 10, borderRadius: 2, background: color(c.count) }} />
          ))}
        </div>
      )}
    </div>
  );
}
