// Cortes de nivel del heatmap, en kcal. La escala es RELATIVA al propio historial del usuario
// (cuartiles), decisión del owner: un gasto "alto" depende de la persona.
//
// Se calculan sobre TODO el historial, nunca sobre el año mostrado. Con cuartiles por año, el
// mismo día cambiaría de color al cambiar de año en el selector y dos años dejarían de ser
// comparables — que es justamente para lo que existe un heatmap anual.

// Fallback con pocos datos: ~30 min de fuerza ≈ 200 kcal netas, ~1 h ≈ 400, día fuerte > 600.
export const FIXED_THRESHOLDS: [number, number, number] = [200, 400, 600];

// Por debajo de esto los cuartiles son inestables: un mes flojo pintaría días normales de oscuro.
export const MIN_DAYS_FOR_PERCENTILES = 20;

// Percentil por rango más cercano (nearest-rank): el índice es ceil(n * fraction) - 1.
// Con `Math.floor(n * fraction)` el corte se corre un puesto hacia arriba y deja de partir el
// historial en cuartos parejos (con 20 días daría 600/1100/1600 en vez de 500/1000/1500).
function quartile(sorted: number[], fraction: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[idx];
}

// `allDayKcal` = el gasto de CADA día con actividad, de todo el historial (los ceros se ignoran).
export function burnThresholds(allDayKcal: number[]): [number, number, number] {
  const active = allDayKcal.filter((k) => k > 0).sort((a, b) => a - b);
  if (active.length < MIN_DAYS_FOR_PERCENTILES) return FIXED_THRESHOLDS;
  return [quartile(active, 0.25), quartile(active, 0.5), quartile(active, 0.75)];
}
