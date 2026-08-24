// Re-deriva los micronutrientes de los alimentos con `sourceMicros='usda'` desde su fila actual de
// `usda_food`, y los ACTUALIZA en la tabla `food`. Es el backfill que el seed NO hace: `seed-food-
// catalog` saltea los nombres que ya existen, así que después de ampliar el dataset (p.ej. agregar
// mono/poli/trans en 2026-08) los ~114 ingredientes base ya sembrados seguían con esas columnas en
// null. Este script los rellena re-derivando TODO el bloque de micros del registro desde USDA.
//
// Idempotente: re-derivar dos veces desde la misma fila da el mismo resultado. Solo toca las
// columnas de micronutrientes (las del registro), NO el nombre, la basis ni los macros.
//
// Alcance: TODO alimento con `sourceMicros='usda'` y `usdaFdcId` no nulo — el catálogo base y
// cualquier alimento de usuario que haya matcheado USDA. Un alimento con micros de IA
// (`sourceMicros='ai'`) o de etiqueta NO se toca: su procedencia no es USDA.
//
// Uso (en la Pi, con el backend levantado):
//   docker compose -f deploy/docker-compose.yml exec backend bun scripts/refresh-usda-micros.ts --dry-run
//   # revisar la salida; luego sin --dry-run

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { NutrientValues } from "@pulsia/shared";
import { createDb } from "../src/db/client";
import { food, usdaFood } from "../src/db/schema";
import { nutrientsFromRow, nutrientsToColumns } from "../src/nutrition/columns";
import type { UsdaFoodRow } from "../src/usda/matcher";

export interface RefreshFood {
  id: string;
  name: string;
  usdaFdcId: number;
}

export interface RefreshPlan {
  toUpdate: { id: string; name: string; values: NutrientValues }[];
  missingUsda: RefreshFood[]; // el fdcId no está en usda_food (dataset viejo, o fdcId mal curado)
}

// PURO: decide qué actualizar sin tocar la base. `getRow` resuelve un fdcId a su fila de USDA
// (o null). Los valores nuevos salen de re-derivar el registro completo desde la fila (mono/poli/
// trans incluidos). Se testea sin DB.
export function planRefresh(
  foods: RefreshFood[],
  getRow: (fdcId: number) => UsdaFoodRow | null,
): RefreshPlan {
  const plan: RefreshPlan = { toUpdate: [], missingUsda: [] };
  for (const f of foods) {
    const row = getRow(f.usdaFdcId);
    if (!row) {
      plan.missingUsda.push(f);
      continue;
    }
    plan.toUpdate.push({ id: f.id, name: f.name, values: nutrientsFromRow(row as Record<string, unknown>) });
  }
  return plan;
}

function inArrayFdc(fdcIds: number[]) {
  // `inArray` con lista vacía genera SQL inválido; devolvemos una condición que no matchea nada.
  return fdcIds.length > 0 ? inArray(usdaFood.fdcId, fdcIds) : inArray(usdaFood.fdcId, [-1]);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }

  const { db, sql } = createDb(dbUrl);
  try {
    // Alimentos cuya procedencia de micros es USDA y que trazan a una fila (usdaFdcId no nulo).
    const foods = await db
      .select({ id: food.id, name: food.name, usdaFdcId: food.usdaFdcId })
      .from(food)
      .where(and(eq(food.sourceMicros, "usda"), isNotNull(food.usdaFdcId)));

    const candidates: RefreshFood[] = foods
      .filter((f): f is { id: string; name: string; usdaFdcId: number } => f.usdaFdcId != null)
      .map((f) => ({ id: f.id, name: f.name, usdaFdcId: f.usdaFdcId }));

    const fdcIds = [...new Set(candidates.map((f) => f.usdaFdcId))];
    const usdaRows = await db.select().from(usdaFood).where(inArrayFdc(fdcIds));
    const byFdc = new Map<number, UsdaFoodRow>(usdaRows.map((r) => [r.fdcId, r as UsdaFoodRow]));

    const plan = planRefresh(candidates, (id) => byFdc.get(id) ?? null);

    console.log(`Alimentos con micros de USDA: ${candidates.length}.`);
    console.log(`  → a actualizar: ${plan.toUpdate.length}`);
    console.log(`  → sin fila USDA (salteados): ${plan.missingUsda.length}`);
    if (plan.missingUsda.length > 0) {
      console.log("\n⚠️  Sin fila USDA (revisar fdcId):");
      for (const f of plan.missingUsda) console.log(`  · ${f.name} (fdcId ${f.usdaFdcId})`);
    }

    if (dryRun) {
      console.log("\n[dry-run] Ejemplos de grasas que se rellenarían (mono/poli/trans):");
      for (const u of plan.toUpdate.slice(0, 12)) {
        const v = u.values as Record<string, number | null>;
        console.log(
          `  · ${u.name}  mono=${v.monounsaturated_fat_g} poli=${v.polyunsaturated_fat_g} trans=${v.trans_fat_g}`,
        );
      }
      console.log("\n[dry-run] No se escribió nada.");
      return;
    }

    let updated = 0;
    for (const u of plan.toUpdate) {
      await db.update(food).set(nutrientsToColumns(u.values)).where(eq(food.id, u.id));
      updated++;
    }
    console.log(`\nActualizados ${updated} alimentos.`);
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  await main();
}
