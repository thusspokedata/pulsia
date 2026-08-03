// Clave de día LOCAL (no UTC): usada por Alimentación para agrupar comidas/suplementos por día.
// El heatmap de "Días entrenados y gasto" usa el `localDayKey` de @pulsia/shared (mismo formato),
// no este — ver ConsistencyCard.tsx / YearHeatmapGrid.tsx.
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
