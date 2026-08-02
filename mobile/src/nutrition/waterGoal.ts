export const WATER_GOAL_FALLBACK_ML = 2000;
export const WATER_ML_PER_KG = 35;

/**
 * Meta diaria de agua en ml. Orden: override manual válido → 35 ml/kg del peso → fallback fijo.
 * Función pura (sin AsyncStorage) para poder testearla aislada.
 */
export function computeWaterGoalMl(input: {
  overrideMl?: number | null;
  weightKg?: number | null;
}): number {
  const { overrideMl, weightKg } = input;
  if (overrideMl != null && Number.isFinite(overrideMl)) {
    // Un override sub-1 ml (redondea a 0) no es una meta usable: se ignora y cae a auto,
    // igual que 0 / negativo / NaN. Así get/set/compute quedan coherentes (nunca meta 0).
    const rounded = Math.round(overrideMl);
    if (rounded >= 1) return rounded;
  }
  if (weightKg != null && Number.isFinite(weightKg) && weightKg > 0) {
    return Math.round(WATER_ML_PER_KG * weightKg);
  }
  return WATER_GOAL_FALLBACK_ML;
}
