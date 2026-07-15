// Epoch (ms) → fecha YYYY-MM-DD en UTC. Aproximación honesta: el período/instante viaja en epoch
// del dispositivo, pero algunas cosas (tomas de suplementos, fecha de memoria) se guardan como
// date-string de calendario. Convertir a UTC puede correr un día en el borde para TZs lejanas al
// UTC, pero es suficiente para el usuario (Europe/Berlin). Punto único: antes había 3 copias de
// este one-liner (ai/history.ts, routes/nutrition.ts, reports/collect.ts).
export function epochToUtcDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
