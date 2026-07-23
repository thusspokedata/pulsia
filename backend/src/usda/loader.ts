/*
 * Pulsia — compañero de salud y entrenamiento self-hosted.
 * Copyright (C) 2026 thusspokedata
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Carga idempotente del artefacto local de USDA (backend/data/usda-*.json.gz) en `usda_food`, al
// arrancar el backend. Si el dataset ya está cargado con la misma versión, no hace nada.
//
// Si la carga falla (archivo ausente, JSON corrupto, DB caída), se loguea y el arranque SIGUE: sin
// dataset, el alta de alimentos cae al comportamiento actual (macros por IA, micros en null), que
// es muchísimo mejor que un backend que no levanta.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { usdaFood, usdaDataset } from "./schema";
import { nutrientsToColumns, type NutrientColumns } from "../nutrition/columns";

// --------------------------------------------------------------------------------------------
// shouldLoad — decisión pura, sin IO. Ver tests para el porqué de cada caso.
// --------------------------------------------------------------------------------------------

export interface DatasetRow {
  version: string;
  rowCount: number;
}

export function shouldLoad(current: DatasetRow | null, artifactVersion: string): boolean {
  if (current == null) return true;
  if (current.version !== artifactVersion) return true;
  // Una carga interrumpida puede dejar la fila de versión escrita con la tabla vacía. Sin este
  // guard, ese estado se daría por bueno para siempre y el matcher no encontraría nunca nada.
  return current.rowCount <= 0;
}

// --------------------------------------------------------------------------------------------
// Fila del artefacto -> fila lista para insertar con Drizzle
// --------------------------------------------------------------------------------------------

/** Forma de una fila tal como viene en el `.json.gz` (claves en snake_case, ver build-usda-dataset.ts). */
export interface FilaArtefacto {
  fdc_id: number;
  description: string;
  data_type: string;
  [nutriente: string]: number | string | undefined;
}

export interface FilaUsdaFood extends NutrientColumns {
  fdcId: number;
  description: string;
  dataType: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/**
 * Traduce una fila del artefacto (snake_case) a la fila que espera `usda_food` (camelCase).
 *
 * Reutiliza `nutrientsToColumns` (el mismo puente que usa `food`/`meal_item`) para los 30
 * micronutrientes, así que un cambio en el registro no puede desincronizarse acá. Los 4 macros
 * NO están en el registro de nutrientes y se mapean a mano.
 */
export function filaAColumnas(fila: FilaArtefacto): FilaUsdaFood {
  const nutrientes = nutrientsToColumns(fila as unknown as Record<string, number | null | undefined>);
  return {
    fdcId: fila.fdc_id,
    description: fila.description,
    dataType: fila.data_type,
    kcal: numOrNull(fila.kcal),
    proteinG: numOrNull(fila.protein_g),
    carbsG: numOrNull(fila.carbs_g),
    fatG: numOrNull(fila.fat_g),
    ...nutrientes,
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

// --------------------------------------------------------------------------------------------
// Lectura del artefacto en disco
// --------------------------------------------------------------------------------------------

interface Artefacto {
  version: string;
  rows: FilaArtefacto[];
}

const DATA_DIR = join(import.meta.dir, "..", "..", "data");

/** Busca el único `.json.gz` de USDA en `backend/data`. null si no hay ninguno. */
async function encontrarArtefacto(dataDir: string): Promise<string | null> {
  let entradas: string[];
  try {
    entradas = await readdir(dataDir);
  } catch {
    return null;
  }
  const candidato = entradas.find((f) => f.startsWith("usda-") && f.endsWith(".json.gz"));
  return candidato ? join(dataDir, candidato) : null;
}

async function leerArtefacto(ruta: string): Promise<Artefacto> {
  const gz = new Uint8Array(await Bun.file(ruta).arrayBuffer());
  const json = gunzipSync(gz).toString("utf8");
  return JSON.parse(json) as Artefacto;
}

// --------------------------------------------------------------------------------------------
// Carga completa: DELETE + inserts en lotes + fila de versión, todo en una transacción.
// --------------------------------------------------------------------------------------------

const TAMANO_LOTE = 1000;

async function cargarFilas(db: Db, version: string, filas: FilaArtefacto[]): Promise<void> {
  await db.transaction(async (tx) => {
    // Primero se borra todo, después se inserta y RECIÉN AL FINAL se escribe la fila de versión.
    // En ese orden: si el proceso se corta a mitad de camino, la transacción entera se revierte y
    // no queda ni la versión ni datos a medio cargar.
    await tx.delete(usdaFood);
    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      const lote = filas.slice(i, i + TAMANO_LOTE).map(filaAColumnas);
      await tx.insert(usdaFood).values(lote);
    }
    await tx
      .insert(usdaDataset)
      .values({ id: 1, version, rowCount: filas.length })
      .onConflictDoUpdate({ target: usdaDataset.id, set: { version, rowCount: filas.length } });
  });
}

// --------------------------------------------------------------------------------------------
// Punto de entrada para el arranque
// --------------------------------------------------------------------------------------------

/**
 * Carga el dataset de USDA si hace falta (no está cargado, cambió de versión, o quedó a medias).
 * Nunca lanza: cualquier error se loguea y se traga, porque un backend sin catálogo local de USDA
 * sigue funcionando (macros por IA, micros en null) y un backend caído es mucho peor.
 */
export async function cargarUsdaSiHaceFalta(db: Db, dataDir: string = DATA_DIR): Promise<void> {
  try {
    const ruta = await encontrarArtefacto(dataDir);
    if (!ruta) {
      console.warn(`usda: no encontré ningún .json.gz en ${dataDir}; sigo sin catálogo local`);
      return;
    }

    const { version, rows } = await leerArtefacto(ruta);

    const actuales = await db.select().from(usdaDataset).where(eq(usdaDataset.id, 1));
    const actual: DatasetRow | null = actuales[0]
      ? { version: actuales[0].version, rowCount: actuales[0].rowCount }
      : null;

    if (!shouldLoad(actual, version)) {
      console.log(`usda: dataset ${version} ya cargado`);
      return;
    }

    await cargarFilas(db, version, rows);
    console.log(`usda: cargadas ${rows.length} filas (${version})`);
  } catch (err) {
    console.error("usda: falló la carga del dataset, arranco igual sin catálogo local", err);
  }
}
