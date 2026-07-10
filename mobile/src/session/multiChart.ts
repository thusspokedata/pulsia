import type { XY, ChartBox } from "./chart";

// Como scalePoints, pero calcula un único min/max compartido entre TODAS las series
// (x e y combinados) para que queden en la misma escala visual (ej: sistólica y diastólica
// en el mismo gráfico, comparables entre sí).
export function scaleMultiSeries(series: { points: XY[] }[], box: ChartBox): { points: XY[] }[] {
  const { width, height, padding } = box;
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) return series.map((s) => ({ points: [] }));

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY;
  const flatY = allPoints.length > 1 && spanY === 0;
  const single = allPoints.length === 1;
  const w = width - padding * 2;
  const h = height - padding * 2;

  return series.map((s) => ({
    points: s.points.map((p) => ({
      x: single ? width / 2 : padding + ((p.x - minX) / spanX) * w,
      y: single || flatY ? height / 2 : padding + (1 - (p.y - minY) / (spanY || 1)) * h,
    })),
  }));
}
