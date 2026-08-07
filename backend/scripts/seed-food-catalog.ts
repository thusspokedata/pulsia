// Siembra el catálogo BASE de ingredientes (ver seed-food-catalog.data.ts) en la tabla `food`,
// armando cada alimento entero desde su fila de USDA. Es una población de datos de UNA sola vez —
// NO el `db:seed` de arranque (que es genérico: usuario default + catálogo de ejercicios).
//
// Idempotente: saltea los alimentos cuyo nombre ya existe en el catálogo (compartido, todos los
// usuarios), case-insensitive. Corré primero con --dry-run.
//
// Uso (en la Pi, con el backend levantado):
//   SEED_OWNER_ID=<uuid-del-dueño-del-catálogo> \
//     docker compose -f deploy/docker-compose.yml exec -e SEED_OWNER_ID=... \
//     backend bun scripts/seed-food-catalog.ts --dry-run
//   # revisar la salida; luego sin --dry-run
//
// `SEED_OWNER_ID` NO tiene default en código a propósito: el repo es público y el UUID del dueño
// del catálogo no vive acá.

import { inArray } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { food, usdaFood } from "../src/db/schema";
import { insertFood } from "../src/nutrition/repository";
import { foodInputFromUsdaRow } from "../src/nutrition/fromUsda";
import type { UsdaFoodRow } from "../src/usda/matcher";
import { SEED_FOODS, type SeedFood } from "./seed-food-catalog.data";

export interface SeedPlan {
  toInsert: { food: SeedFood; row: UsdaFoodRow }[];
  skippedExisting: SeedFood[]; // el nombre ya está en el catálogo
  missingUsda: SeedFood[]; // el fdcId no está en usda_food (dataset viejo, o fdcId mal curado)
}

// PURO: decide qué sembrar sin tocar la base. `existingNames` son los nombres del catálogo actual;
// `getRow` resuelve un fdcId a su fila de USDA (o null). Se testea sin DB.
export function planSeed(
  seeds: SeedFood[],
  existingNames: Iterable<string>,
  getRow: (fdcId: number) => UsdaFoodRow | null,
): SeedPlan {
  const existing = new Set<string>();
  for (const n of existingNames) existing.add(n.trim().toLowerCase());

  const plan: SeedPlan = { toInsert: [], skippedExisting: [], missingUsda: [] };
  for (const f of seeds) {
    if (existing.has(f.name.trim().toLowerCase())) {
      plan.skippedExisting.push(f);
      continue;
    }
    const row = getRow(f.fdcId);
    if (!row) {
      plan.missingUsda.push(f);
      continue;
    }
    plan.toInsert.push({ food: f, row });
  }
  return plan;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const ownerId = process.env.SEED_OWNER_ID;
  if (!ownerId) {
    console.error("Falta SEED_OWNER_ID (uuid del dueño del catálogo compartido).");
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }

  const { db, sql } = createDb(dbUrl);
  try {
    // Nombres existentes (catálogo COMPARTIDO: todos los usuarios).
    const existingRows = await db.select({ name: food.name }).from(food);
    const existingNames = existingRows.map((r) => r.name);

    // Filas de USDA de todos los fdcId de una vez.
    const fdcIds = [...new Set(SEED_FOODS.map((f) => f.fdcId))];
    const usdaRows = await db.select().from(usdaFood).where(inArrayFdc(fdcIds));
    const byFdc = new Map<number, UsdaFoodRow>(usdaRows.map((r) => [r.fdcId, r]));

    const plan = planSeed(SEED_FOODS, existingNames, (id) => byFdc.get(id) ?? null);

    console.log(`Catálogo actual: ${existingNames.length} alimentos.`);
    console.log(`Seed: ${SEED_FOODS.length} ingredientes base.`);
    console.log(`  → a insertar: ${plan.toInsert.length}`);
    console.log(`  → ya existen (salteados): ${plan.skippedExisting.length}`);
    console.log(`  → sin fila USDA (salteados): ${plan.missingUsda.length}`);

    if (plan.skippedExisting.length > 0) {
      console.log("\nYa existían:");
      for (const f of plan.skippedExisting) console.log(`  · ${f.name}`);
    }
    if (plan.missingUsda.length > 0) {
      console.log("\n⚠️  Sin fila USDA (revisar fdcId):");
      for (const f of plan.missingUsda) console.log(`  · ${f.name} (fdcId ${f.fdcId})`);
    }

    if (dryRun) {
      console.log("\n[dry-run] A insertar (valores YA armados, con negativos recortados):");
      for (const { food: f, row } of plan.toInsert) {
        const input = foodInputFromUsdaRow(row, { name: f.name, basis: f.basis, unitWeightG: f.unitWeightG });
        console.log(`  + ${f.name}  ←  ${row.description}  (${input.kcal} kcal, P${input.protein_g} C${input.carbs_g} G${input.fat_g})`);
      }
      console.log("\n[dry-run] No se escribió nada.");
      return;
    }

    let inserted = 0;
    for (const { food: f, row } of plan.toInsert) {
      await insertFood(db, ownerId, foodInputFromUsdaRow(row, { name: f.name, basis: f.basis, unitWeightG: f.unitWeightG }));
      inserted++;
    }
    console.log(`\nInsertados ${inserted} alimentos bajo ${ownerId}.`);
  } finally {
    await sql.end();
  }
}

function inArrayFdc(fdcIds: number[]) {
  // `inArray` con lista vacía genera SQL inválido; con la lista curada nunca pasa, pero por las
  // dudas devolvemos una condición que no matchea nada.
  return fdcIds.length > 0 ? inArray(usdaFood.fdcId, fdcIds) : inArray(usdaFood.fdcId, [-1]);
}

if (import.meta.main) {
  await main();
}
