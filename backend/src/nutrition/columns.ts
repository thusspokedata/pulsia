import { NUTRIENT_KEYS, type NutrientKey, type NutrientValues } from "@pulsia/shared";

// Puente único entre el snake_case del schema Zod (`sodium_mg`) y el camelCase de Drizzle
// (`sodiumMg`). Con 30 nutrientes y ~6 lugares del repositorio que los listaban a mano, escribir
// el mapeo en cada lugar es exactamente cómo se pierde uno en silencio.
export function nutrientColumn(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

// Pares (clave del registro → nombre de columna), calculados una vez.
const KEY_TO_COLUMN = NUTRIENT_KEYS.map((k) => [k, nutrientColumn(k)] as const);

// Versión en tipos de nutrientColumn, para que el objeto que sale de nutrientsToColumns tenga las
// claves EXACTAS que espera Drizzle en vez de un index signature. Sin esto, un typo en un nombre
// de columna compilaría igual y el nutriente se perdería en silencio al insertar.
type SnakeToCamel<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<SnakeToCamel<T>>}`
  : S;

export type NutrientColumns = { [K in NutrientKey as SnakeToCamel<K>]: number | null };

// Valores en snake_case → objeto listo para el insert/update de Drizzle.
// Escribe null explícito para lo ausente: en un UPDATE, omitir la clave dejaría el valor anterior,
// que es cómo un alimento editado se quedaría con las vitaminas del alimento que era antes.
export function nutrientsToColumns(values: NutrientValues): NutrientColumns {
  const src = values as Record<string, number | null | undefined>;
  const out: Record<string, number | null> = {};
  for (const [key, column] of KEY_TO_COLUMN) out[column] = src[key] ?? null;
  return out as NutrientColumns;
}

// Fila de Drizzle → valores en snake_case. Todas las claves presentes, con null (no 0) para lo
// que la fila no tenga: `null` es "no sabemos" y 0 sería afirmar "no tiene".
export function nutrientsFromRow(row: Record<string, unknown>): { [K in NutrientKey]: number | null } {
  const out = {} as Record<string, number | null>;
  for (const [key, column] of KEY_TO_COLUMN) {
    const v = row[column];
    out[key] = typeof v === "number" ? v : null;
  }
  return out as { [K in NutrientKey]: number | null };
}
