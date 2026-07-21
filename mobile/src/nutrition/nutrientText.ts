import type { FlaggedNutrient, NutrientSentiment } from "@pulsia/shared";

export const NUTRIENT_LABELS: Record<FlaggedNutrient, string> = {
  fat_g: "grasa",
  saturated_fat_g: "saturadas",
  sugars_g: "azúcar",
  salt_g: "sal",
  cholesterol_mg: "colesterol",
  fiber_g: "fibra",
};

// Las frases se escriben enteras en vez de componer `${etiqueta} ${nivel}` porque el español
// concuerda en género y número: "grasa alta" pero "azúcar alto" y "saturadas altas". Componer
// mecánicamente produciría "grasa alto".
//
// El nivel va en el TEXTO, no solo en el color: quien no distingue rojo de ámbar tiene que
// poder leer la diferencia.
const FLAG_TEXT: Record<FlaggedNutrient, Partial<Record<NutrientSentiment, string>>> = {
  fat_g: { bad: "grasa alta", warn: "grasa media" },
  saturated_fat_g: { bad: "saturadas altas", warn: "saturadas medias" },
  sugars_g: { bad: "azúcar alto", warn: "azúcar medio" },
  salt_g: { bad: "sal alta", warn: "sal media" },
  cholesterol_mg: { bad: "colesterol alto", warn: "colesterol medio" },
  fiber_g: { good: "buena fibra" },
};

/** Texto del chip. Devuelve null para las combinaciones que no se muestran (neutral, unknown). */
export function flagText(nutrient: FlaggedNutrient, sentiment: NutrientSentiment): string | null {
  return FLAG_TEXT[nutrient][sentiment] ?? null;
}

/**
 * Aviso de datos faltantes. Nombra hasta dos nutrientes; a partir del tercero resume, porque el
 * chip entra en una fila de lista y una enumeración de cinco la desborda.
 */
export function unknownLabel(unknown: readonly FlaggedNutrient[]): string | null {
  if (unknown.length === 0) return null;
  if (unknown.length === 1) return `sin datos de ${NUTRIENT_LABELS[unknown[0]!]}`;
  if (unknown.length === 2) {
    return `sin datos de ${NUTRIENT_LABELS[unknown[0]!]} y ${NUTRIENT_LABELS[unknown[1]!]}`;
  }
  return `sin datos de ${unknown.length} nutrientes`;
}
