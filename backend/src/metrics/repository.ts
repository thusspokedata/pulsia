import { and, eq, gte, lte, asc, desc, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { bodyMetric } from "../db/schema";
import type { BodyMetric, MetricReading, MetricType } from "@pulsia/shared";

function toBodyMetric(row: typeof bodyMetric.$inferSelect): BodyMetric {
  return { id: row.id, metricType: row.metricType as MetricType, value: row.value, measuredAt: row.measuredAt };
}

// Upsert por (userId, metricType, measuredAt): el formulario de actividad diaria guarda con
// `measured_at` = mediodía local, o sea un instante fijo por día, así que volver a guardar el mismo
// día es una corrección — pisa el valor en vez de duplicar la fila (y en vez de reventar contra el
// índice único). Esto además saca una indeterminación: hasta ahora las filas duplicadas compartían
// `measured_at` y el desempate de `getLatestMetrics` (`orderBy(desc(measuredAt))`) y de
// `valuesForDay` (`.at(-1)`) era arbitrario, con lo que podía ganar el valor viejo.
// Nota: las entries de un mismo MetricReading vienen de un Record indexado por tipo, así que nunca
// hay dos con el mismo metricType y no puede darse el "cannot affect row a second time" de Postgres.
export async function insertReading(db: Db, userId: string, reading: MetricReading): Promise<BodyMetric[]> {
  const measuredAt = reading.measuredAt ?? Date.now();
  const rows = await db
    .insert(bodyMetric)
    .values(reading.entries.map((e) => ({ userId, metricType: e.metricType, value: e.value, measuredAt })))
    .onConflictDoUpdate({
      target: [bodyMetric.userId, bodyMetric.metricType, bodyMetric.measuredAt],
      set: { value: sql`excluded.value` },
    })
    .returning();
  return rows.map(toBodyMetric);
}

export async function getMetrics(
  db: Db, userId: string, opts: { type?: MetricType; from?: number; to?: number } = {},
): Promise<BodyMetric[]> {
  const conds = [eq(bodyMetric.userId, userId)];
  if (opts.type) conds.push(eq(bodyMetric.metricType, opts.type));
  if (opts.from != null) conds.push(gte(bodyMetric.measuredAt, opts.from));
  if (opts.to != null) conds.push(lte(bodyMetric.measuredAt, opts.to));
  const rows = await db.select().from(bodyMetric).where(and(...conds)).orderBy(asc(bodyMetric.measuredAt));
  return rows.map(toBodyMetric);
}

// Puro: dado filas ordenadas por measuredAt DESC, toma la primera (más reciente) por tipo.
export function pickLatestPerType(
  rows: { metricType: string; value: number; measuredAt: number }[],
): Partial<Record<MetricType, { value: number; measuredAt: number }>> {
  const out: Partial<Record<MetricType, { value: number; measuredAt: number }>> = {};
  for (const r of rows) {
    const t = r.metricType as MetricType;
    if (!out[t]) out[t] = { value: r.value, measuredAt: r.measuredAt };
  }
  return out;
}

export async function getLatestMetrics(
  db: Db, userId: string,
): Promise<Partial<Record<MetricType, { value: number; measuredAt: number }>>> {
  const rows = await db
    .select().from(bodyMetric)
    .where(eq(bodyMetric.userId, userId))
    .orderBy(desc(bodyMetric.measuredAt));
  return pickLatestPerType(rows);
}

export async function getMetricsSince(db: Db, userId: string, sinceMs: number): Promise<BodyMetric[]> {
  return getMetrics(db, userId, { from: sinceMs });
}

export async function deleteMetric(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(bodyMetric)
    .where(and(eq(bodyMetric.id, id), eq(bodyMetric.userId, userId)))
    .returning({ id: bodyMetric.id });
  return rows.length > 0;
}

// Inserta las lecturas de un import: el índice único (userId, metricType, measuredAt) garantiza
// la idempotencia, así reimportar ventanas de 7 días superpuestas no duplica nada. ON CONFLICT DO
// NOTHING además cierra la carrera entre reintentos concurrentes (el cliente móvil corta a los 15s)
// y `returning` cuenta lo que realmente se insertó.
// Postgres topea en 65.535 los parámetros de una sentencia. Son 4 por fila (userId, metricType,
// value, measuredAt), o sea ~16.383 filas — y el CSV de sueño emite hasta 8 métricas por día, así
// que el techo real son ~2.047 días (5,6 años) de historial. Verificado: 2.100 días fallan con un
// CSV de apenas 92 KB, muy por debajo de MAX_CSV_B64 (~2,2 MB), que por eso no alcanza a proteger.
const INSERT_CHUNK = 5000;

export async function insertReadingsDedup(
  db: Db,
  userId: string,
  rows: { measuredAt: number; entries: { metricType: string; value: number }[] }[],
): Promise<{ imported: number; duplicates: number }> {
  const batchSeen = new Set<string>();
  const all: { metricType: string; value: number; measuredAt: number }[] = [];
  for (const r of rows) {
    for (const e of r.entries) {
      const k = `${e.metricType}@${r.measuredAt}`;
      if (batchSeen.has(k)) continue;
      batchSeen.add(k);
      all.push({ metricType: e.metricType, value: e.value, measuredAt: r.measuredAt });
    }
  }
  if (all.length === 0) return { imported: 0, duplicates: 0 };

  let imported = 0;
  for (let i = 0; i < all.length; i += INSERT_CHUNK) {
    const inserted = await db
      .insert(bodyMetric)
      .values(all.slice(i, i + INSERT_CHUNK).map((x) => ({ userId, metricType: x.metricType, value: x.value, measuredAt: x.measuredAt })))
      .onConflictDoNothing({ target: [bodyMetric.userId, bodyMetric.metricType, bodyMetric.measuredAt] })
      .returning({ id: bodyMetric.id });
    imported += inserted.length;
  }
  return { imported, duplicates: all.length - imported };
}
