// Ticks "redondos" (1/2/5 × 10^n) dentro de [min, max] para el eje Y de los gráficos.
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return Number.isFinite(min) ? [min] : [];
  const rawStep = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step = niceNorm * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

// Ticks redondos ESTRICTAMENTE dentro de (min, max) — para gridlines intermedias, sin pisar
// las etiquetas de borde (min/max de los datos).
export function innerTicks(min: number, max: number, count = 4): number[] {
  return niceTicks(min, max, count).filter((t) => t > min && t < max);
}

// Etiqueta corta de fecha para el eje X (timestamp → "9 jul").
export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}
