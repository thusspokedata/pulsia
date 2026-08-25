// Clasifica retroactivamente `food.sugar_class` en los alimentos ya sembrados. El feature NUT-10
// (azúcares LIBRES vs. intrínsecos, columna `sugar_class` en `food`/`meal_item`) llegó a prod DESPUÉS
// de que el catálogo base y los alimentos de usuario ya existían: todos ellos quedaron con
// `sugar_class = NULL`. El motor trata el NULL de forma conservadora (todo el azúcar cuenta como
// libre), así que una FRUTA ENTERA ya cargada sigue marcando "azúcar alto" indebidamente.
//
// Este es el backfill que el seed NO hace: `seed-food-catalog` saltea los nombres que ya existen, así
// que nunca vuelve a tocar los ~114 ingredientes base ya sembrados. Acá recorremos los `food` con
// `sugar_class IS NULL` y les aplicamos el clasificador existente `classifySugar(name, usdaDescription)`.
//
// Conservador: si el clasificador devuelve null (no sabe), el alimento se DEJA en NULL — no inventamos
// una clase. Sólo seteamos cuando hay una pista clara (fruta/verdura entera → intrinsic; jugo/seco/
// dulce → free).
//
// Idempotente: sólo toca `sugar_class IS NULL`; correrlo dos veces no re-clasifica lo ya seteado.
//
// Uso (en la Pi, con el backend levantado):
//   docker compose -f deploy/docker-compose.yml exec backend bun scripts/backfill-sugar-class.ts --dry-run
//   # revisar la salida; luego sin --dry-run

import { eq, isNull } from "drizzle-orm";
import type { SugarClass } from "@pulsia/shared";
import { createDb } from "../src/db/client";
import { food, usdaFood } from "../src/db/schema";
import { classifySugar } from "../src/nutrition/classifySugar";

export interface FoodToClassify {
  id: string;
  name: string;
  usdaDescription: string | null;
}

export interface SugarClassPlan {
  toSet: { id: string; name: string; sugarClass: SugarClass }[];
  unclassified: FoodToClassify[];
}

// PURO: decide qué `sugar_class` setear sin tocar la base. Para cada food corre el clasificador; si
// devuelve una clase va a `toSet`, si devuelve null va a `unclassified` (se deja en NULL, conservador).
// Se testea sin DB. NOTA: sólo recibe los food con `sugar_class IS NULL` (lo garantiza el WHERE de
// main()), así que nunca re-clasifica algo ya seteado.
export function planSugarClass(foods: FoodToClassify[]): SugarClassPlan {
  const plan: SugarClassPlan = { toSet: [], unclassified: [] };
  for (const f of foods) {
    const c = classifySugar(f.name, f.usdaDescription);
    if (c != null) {
      plan.toSet.push({ id: f.id, name: f.name, sugarClass: c });
    } else {
      plan.unclassified.push(f);
    }
  }
  return plan;
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
    // Candidatos: los food todavía sin clasificar. LEFT JOIN a usda_food para traer la descripción
    // en inglés (null si el food no tiene usdaFdcId o su fdcId no está en el dataset actual).
    const rows = await db
      .select({ id: food.id, name: food.name, usdaDescription: usdaFood.description })
      .from(food)
      .leftJoin(usdaFood, eq(food.usdaFdcId, usdaFood.fdcId))
      .where(isNull(food.sugarClass));

    const candidates: FoodToClassify[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      usdaDescription: r.usdaDescription ?? null,
    }));

    const plan = planSugarClass(candidates);

    const byClass = plan.toSet.reduce<Record<string, number>>((acc, x) => {
      acc[x.sugarClass] = (acc[x.sugarClass] ?? 0) + 1;
      return acc;
    }, {});

    console.log(`Alimentos con sugar_class NULL (candidatos): ${candidates.length}.`);
    console.log(`  → a setear: ${plan.toSet.length}`);
    console.log(`  → sin clasificar (quedan NULL): ${plan.unclassified.length}`);
    console.log(
      `  → desglose: intrinsic=${byClass.intrinsic ?? 0} free=${byClass.free ?? 0} mixed=${byClass.mixed ?? 0}`,
    );

    if (dryRun) {
      console.log("\n[dry-run] Ejemplos de clasificación (name → sugarClass):");
      for (const u of plan.toSet.slice(0, 15)) {
        console.log(`  · ${u.name} → ${u.sugarClass}`);
      }
      console.log("\n[dry-run] No se escribió nada.");
      return;
    }

    let updated = 0;
    for (const u of plan.toSet) {
      await db.update(food).set({ sugarClass: u.sugarClass }).where(eq(food.id, u.id));
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
