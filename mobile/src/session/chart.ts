export interface XY { x: number; y: number }
export interface ChartBox { width: number; height: number; padding: number }

// Escala puntos de datos al viewport SVG. Y invertido (SVG crece hacia abajo).
export function scalePoints(points: XY[], box: ChartBox): XY[] {
  const { width, height, padding } = box;
  if (points.length === 0) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY;
  const flatY = points.length > 1 && spanY === 0;
  const w = width - padding * 2;
  const h = height - padding * 2;
  return points.map((p) => ({
    x: points.length === 1 ? width / 2 : padding + ((p.x - minX) / spanX) * w,
    y: points.length === 1 || flatY ? height / 2 : padding + (1 - (p.y - minY) / (spanY || 1)) * h,
  }));
}

export function toPath(points: XY[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}
