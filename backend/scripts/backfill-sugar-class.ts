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
// --reclassify: además de las filas NULL, RE-EVALÚA las ya clasificadas por el backfill
// (`sugar_class IN ('intrinsic','free')`) y las CORRIGE si el clasificador mejorado ahora da otra
// clase. Motiva: al agregar términos de POSTRE a free, alimentos como "Torta de manzana con
// streusel" —que habían quedado intrinsic (pescaban la fruta) escondiendo la azúcar agregada— pasan
// a free. Sólo se re-escribe cuando el clasificador da una clase DISTINTA (un null del clasificador
// nunca borra una clase existente).
//   · Filtro anti-IA: en --reclassify se restringe a filas con `source_micros = 'usda'` o NULL. Los
//     alimentos con micros de IA (`source_micros = 'ai'`) pudieron recibir su sugar_class con
//     conocimiento de la ETIQUETA real (algo que el clasificador por-nombre no ve), así que se dejan
//     INTACTOS para no pisar esa señal. No hay forma 100% de distinguir el origen del sugar_class,
//     así que usamos source_micros como proxy conservador. Este filtro NO se aplica en modo normal:
//     ahí clasificamos TODAS las filas sugar_class IS NULL (incluidas las de IA con clase NULL), o
//     una fruta cargada por IA seguiría marcando azúcar alto.
//   · Idempotente: correr --reclassify dos veces no cambia nada la segunda vez (las ya corregidas
//     coinciden con el clasificador → unchanged).
//
// Uso (en la Pi, con el backend levantado):
//   docker compose -f deploy/docker-compose.yml exec backend bun scripts/backfill-sugar-class.ts --dry-run
//   # revisar la salida; luego sin --dry-run
//   # para corregir clases ya seteadas tras mejorar el clasificador:
//   docker compose -f deploy/docker-compose.yml exec backend bun scripts/backfill-sugar-class.ts --reclassify --dry-run

import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { SugarClass } from "@pulsia/shared";
import { createDb } from "../src/db/client";
import { food, usdaFood } from "../src/db/schema";
import { classifySugar } from "../src/nutrition/classifySugar";

export interface FoodToClassify {
  id: string;
  name: string;
  usdaDescription: string | null;
  // Clase actual de la fila. null = sin clasificar (modo normal). En modo --reclassify puede venir
  // 'intrinsic'|'free' para re-evaluarla. Opcional: default null → el modo normal se comporta igual
  // que antes (cualquier clase que dé el clasificador difiere de null → va a toSet).
  current?: SugarClass | null;
}

export interface SugarClassPlan {
  // Filas a escribir: el clasificador dio una clase que DIFIERE de la actual. `from` = clase previa
  // (null si venía sin clasificar) para el log "viejo → nuevo".
  toSet: { id: string; name: string; sugarClass: SugarClass; from: SugarClass | null }[];
  // El clasificador dio null (no sabe): se DEJA como está (en modo normal era NULL; en reclassify
  // conserva su clase actual). Nunca borramos una clase por un null del clasificador.
  unclassified: FoodToClassify[];
  // El clasificador coincide con la clase actual: ya está bien, no re-escribimos (idempotencia).
  unchanged: FoodToClassify[];
}

// PURO: decide qué `sugar_class` setear sin tocar la base. Para cada food corre el clasificador y:
//   · da null            → `unclassified` (se deja como está; conservador, nunca borra).
//   · da una clase == current → `unchanged` (ya está bien; no re-escribe → idempotente).
//   · da una clase != current → `toSet` (setear/corregir), con `from` = clase previa.
// `current` default null hace que el modo normal (sólo filas NULL) se comporte como antes: cualquier
// clase difiere de null → toSet. Se testea sin DB.
// Qué filas selecciona el WHERE según el modo (PURO, single source of truth del criterio):
//   · includeClassified: además de las NULL, incluir las ya clasificadas (intrinsic/free) para
//     re-evaluarlas. Solo en --reclassify.
//   · excludeAi: excluir source_micros='ai'. SOLO en --reclassify: la IA pudo poner sugar_class con
//     conocimiento de la ETIQUETA (algo que el clasificador por-nombre no ve), y no queremos
//     pisarlo. En modo NORMAL (solo NULL) NO se filtra: una fila de IA con sugar_class NULL y
//     nombre clasificable (p.ej. "Manzana", source_micros='ai') DEBE clasificarse, o la fruta
//     seguiría marcando azúcar alto.
export interface CandidateConditions {
  includeClassified: boolean;
  excludeAi: boolean;
}
export function candidateConditions(reclassify: boolean): CandidateConditions {
  return { includeClassified: reclassify, excludeAi: reclassify };
}

export function planSugarClass(foods: FoodToClassify[]): SugarClassPlan {
  const plan: SugarClassPlan = { toSet: [], unclassified: [], unchanged: [] };
  for (const f of foods) {
    const current = f.current ?? null;
    const c = classifySugar(f.name, f.usdaDescription);
    if (c == null) {
      plan.unclassified.push(f);
    } else if (c === current) {
      plan.unchanged.push(f);
    } else {
      plan.toSet.push({ id: f.id, name: f.name, sugarClass: c, from: current });
    }
  }
  return plan;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const reclassify = process.argv.includes("--reclassify");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }

  const { db, sql } = createDb(dbUrl);
  try {
    // Candidatos según el modo (ver candidateConditions):
    //   · normal:      sólo `sugar_class IS NULL`, TODAS las filas (sin filtrar source_micros).
    //   · --reclassify: `sugar_class IS NULL OR sugar_class IN ('intrinsic','free')`, restringido a
    //                   filas con `source_micros = 'usda'` o NULL (nunca las de IA, que pudieron
    //                   clasificar por etiqueta).
    const cond = candidateConditions(reclassify);
    const clase: SQL = cond.includeClassified
      ? (or(isNull(food.sugarClass), inArray(food.sugarClass, ["intrinsic", "free"])) as SQL)
      : isNull(food.sugarClass);
    const filtros: SQL[] = [clase];
    if (cond.excludeAi) {
      filtros.push(or(eq(food.sourceMicros, "usda"), isNull(food.sourceMicros)) as SQL);
    }
    const where: SQL = filtros.length === 1 ? (filtros[0] as SQL) : (and(...filtros) as SQL);

    // LEFT JOIN a usda_food para traer la descripción en inglés (null si el food no tiene usdaFdcId
    // o su fdcId no está en el dataset actual). Traemos también el sugar_class actual (current).
    const rows = await db
      .select({
        id: food.id,
        name: food.name,
        usdaDescription: usdaFood.description,
        current: food.sugarClass,
      })
      .from(food)
      .leftJoin(usdaFood, eq(food.usdaFdcId, usdaFood.fdcId))
      .where(where);

    const candidates: FoodToClassify[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      usdaDescription: r.usdaDescription ?? null,
      current: (r.current as SugarClass | null) ?? null,
    }));

    const plan = planSugarClass(candidates);

    const byClass = plan.toSet.reduce<Record<string, number>>((acc, x) => {
      acc[x.sugarClass] = (acc[x.sugarClass] ?? 0) + 1;
      return acc;
    }, {});

    // Distinguir "seteados desde NULL" de "corregidos (cambio de clase)".
    const desdeNull = plan.toSet.filter((x) => x.from == null);
    const corregidos = plan.toSet.filter((x) => x.from != null);

    console.log(
      `Modo: ${reclassify ? "--reclassify (NULL + intrinsic/free, excluye source_micros='ai')" : "normal (sólo NULL)"}.`,
    );
    console.log(`Candidatos evaluados: ${candidates.length}.`);
    console.log(`  → a escribir: ${plan.toSet.length}`);
    console.log(`      · seteados desde NULL: ${desdeNull.length}`);
    console.log(`      · corregidos (cambio de clase): ${corregidos.length}`);
    console.log(`  → sin cambios (ya coincidían): ${plan.unchanged.length}`);
    console.log(`  → sin clasificar (se dejan como están): ${plan.unclassified.length}`);
    console.log(
      `  → desglose de lo escrito: intrinsic=${byClass.intrinsic ?? 0} free=${byClass.free ?? 0} mixed=${byClass.mixed ?? 0}`,
    );

    if (corregidos.length > 0) {
      console.log("\nCorrecciones (name: viejo → nuevo):");
      for (const u of corregidos.slice(0, 20)) {
        console.log(`  · ${u.name}: ${u.from} → ${u.sugarClass}`);
      }
    }

    if (dryRun) {
      console.log("\n[dry-run] Ejemplos de seteos desde NULL (name → sugarClass):");
      for (const u of desdeNull.slice(0, 15)) {
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
