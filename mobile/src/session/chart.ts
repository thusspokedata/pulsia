export interface XY { x: number; y: number }

// Convierte puntos ya escalados (en coords SVG) a un path de línea.
export function toPath(points: XY[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}
