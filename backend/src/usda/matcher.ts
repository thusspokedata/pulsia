// Matcher: traduce un texto de búsqueda (una frase en inglés que arma la IA) a filas de la copia
// local de USDA. Es un módulo con interfaz propia, NO parte del handler de `/foods/extract`: el
// spec siguiente (descomponer un plato en ingredientes) lo va a llamar una vez por ingrediente.
//
// La estrategia de búsqueda vive DETRÁS de esta interfaz. Hoy es pg_trgm; si mañana pasa a
// embeddings, quien llama sigue pasando un texto y recibiendo candidatos, sin enterarse.

import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { usdaFood } from "./schema";

// --------------------------------------------------------------------------------------------
// Parte pura: el ranking. Testeable sin base (ver matcher.test.ts).
// --------------------------------------------------------------------------------------------

export interface UsdaCandidate {
  fdcId: number;
  description: string;
  dataType: string;
  similarity: number; // 0..1, de pg_trgm
}

// Foundation y SR Legacy son valores de laboratorio; FNDDS (survey) son valores derivados de
// recetas — muy por encima de una estimación de IA, un escalón por debajo de los otros dos.
const TYPE_BONUS: Record<string, number> = {
  foundation: 0.1,
  sr_legacy: 0.05,
  survey: 0,
};

export const MAX_CANDIDATES = 8;

// El bonus es un EMPUJÓN, no un orden lexicográfico: 0.10 no alcanza para que un match malo de
// Foundation le gane a uno bueno de Survey. Con prioridad estricta por tipo, "leche" terminaría
// matcheando un huevo de Foundation.
export function rankCandidates(rows: UsdaCandidate[]): UsdaCandidate[] {
  return [...rows]
    .sort((a, b) => {
      const sa = a.similarity + (TYPE_BONUS[a.dataType] ?? 0);
      const sb = b.similarity + (TYPE_BONUS[b.dataType] ?? 0);
      if (sb !== sa) return sb - sa;
      return a.fdcId - b.fdcId; // desempate estable: sin esto el orden depende del planner
    })
    .slice(0, MAX_CANDIDATES);
}

// --------------------------------------------------------------------------------------------
// Búsqueda contra la base. Corre el SQL, delega el orden en rankCandidates.
// --------------------------------------------------------------------------------------------

/** Fila cruda del SELECT (snake_case, tal como la devuelve el driver). */
interface FilaBusqueda {
  fdc_id: number;
  description: string;
  data_type: string;
  similarity: number;
}

/**
 * Busca en `usda_food` las filas cuya descripción se parezca a `texto` y las devuelve rankeadas
 * (hasta MAX_CANDIDATES). Trae SOLO lo necesario para el paso "¿no es este?": fdcId, descripción,
 * tipo y similitud — NO los 34 nutrientes.
 *
 * El texto se pasa parametrizado ($1 vía `sql`...``), nunca interpolado: viene de la IA, que a su
 * vez procesó input del usuario. `pg_trgm` es case-insensitive, así que no hace falta bajar a
 * minúsculas; solo se recorta el whitespace de los bordes. El umbral queda en el default del
 * operador `%` (pg_trgm.similarity_threshold = 0.3): más alto no matchea nombres razonables, más
 * bajo trae basura.
 *
 * Se traen 40 filas y se rankean en TS (no 8): el bonus por tipo puede subir un candidato que el
 * ORDER BY del SQL, guiado solo por similitud cruda, dejaría fuera del top 8.
 */
export async function searchUsda(db: Db, texto: string): Promise<UsdaCandidate[]> {
  const consulta = texto.trim();
  if (consulta.length === 0) return [];
  const filas = (await db.execute(sql`
    SELECT fdc_id, description, data_type, similarity(description, ${consulta}) AS similarity
    FROM usda_food
    WHERE description % ${consulta}
    ORDER BY similarity DESC
    LIMIT 40
  `)) as unknown as FilaBusqueda[];
  const candidatos: UsdaCandidate[] = filas.map((f) => ({
    fdcId: f.fdc_id,
    description: f.description,
    dataType: f.data_type,
    similarity: f.similarity,
  }));
  return rankCandidates(candidatos);
}

/** Fila completa de `usda_food`: los 4 macros + 30 micronutrientes en camelCase (typeado). */
export type UsdaFoodRow = typeof usdaFood.$inferSelect;

/**
 * Trae la fila COMPLETA de un alimento de USDA (34 valores) por su fdcId. null si no existe.
 *
 * Es una consulta APARTE de `searchUsda` a propósito: la búsqueda muestra hasta 8 candidatos y el
 * usuario elige uno solo; recién ahí se necesitan sus 34 nutrientes. Traer 34 columnas × 40 filas
 * en cada búsqueda para usar una es un desperdicio de ancho de banda por búsqueda descartada. El
 * costo es un round-trip extra, pero solo al elegir (una vez por ingrediente, no por candidato).
 */
export async function getUsdaFood(db: Db, fdcId: number): Promise<UsdaFoodRow | null> {
  const filas = await db.select().from(usdaFood).where(eq(usdaFood.fdcId, fdcId)).limit(1);
  return filas[0] ?? null;
}
