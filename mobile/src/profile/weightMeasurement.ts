import { METRIC_RANGES } from "@pulsia/shared";

// Peso como fuente única: el "Peso actual" del perfil refleja la última medición `weight_kg`.
// Al guardar el perfil, si el usuario cambió ese valor respecto del que se cargó, registramos
// una medición nueva (así perfil y "Valores actuales" quedan siempre en la misma fuente).
// Devuelve el valor a registrar, o null si no hay que registrar nada (sin cambios / vacío / fuera de rango).
export function weightToRecordOnSave(loadedWeight: string, currentWeight: string): number | null {
  const cur = currentWeight.trim();
  if (cur === "" || cur === loadedWeight.trim()) return null;
  const value = Number(cur);
  const [min, max] = METRIC_RANGES.weight_kg;
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}
