import { and, eq, gte, lte, desc } from "drizzle-orm";
import type { CardioActivity } from "@pulsia/shared";
import { cardioActivity, cardioFitFile } from "../db/schema";
import type { Db } from "../db/client";

// La ventana [from, to] del segundo de `ts`. Es la fuente única del criterio de dedupe:
// findCardioAtSecond la usa para el rango SQL. El .FIT guarda el timestamp en segundos, así que
// dos parseos del mismo archivo caen en la misma ventana.
export const secondWindow = (ts: number): { from: number; to: number } => {
  const from = Math.floor(ts / 1000) * 1000;
  return { from, to: from + 999 };
};

export type CardioRow = typeof cardioActivity.$inferSelect;

const toActivity = (r: CardioRow): CardioActivity => ({
  id: r.id,
  type: r.type as CardioActivity["type"],
  startedAt: r.startedAt,
  durationMs: r.durationMs,
  distanceM: r.distanceM,
  avgHr: r.avgHr,
  maxHr: r.maxHr,
  elevationGainM: r.elevationGainM,
  kcal: r.kcal,
  kcalSource: r.kcalSource as CardioActivity["kcalSource"],
  source: r.source as CardioActivity["source"],
  ...(r.hrSeries ? { hrSeries: r.hrSeries } : {}),
  // Métricas extendidas del .FIT (Fase 1): nullable+optional en el schema, así que el valor
  // (incluido null cuando el reloj no lo reportó) siempre puede viajar.
  totalCycles: r.totalCycles,
  trainingLoad: r.trainingLoad,
  trainingEffectAerobic: r.trainingEffectAerobic,
  trainingEffectAnaerobic: r.trainingEffectAnaerobic,
  avgCadence: r.avgCadence,
  maxCadence: r.maxCadence,
  avgFractionalCadence: r.avgFractionalCadence,
  avgRespiration: r.avgRespiration,
  maxRespiration: r.maxRespiration,
  minRespiration: r.minRespiration,
  metabolicKcal: r.metabolicKcal,
  // sportProfileName/tzOffsetMinutes/samples/fitExtras son optional SIN nullable en el schema
  // (metadata derivada, no una medición): si la columna es null (fila vieja o manual), se omite
  // la clave en vez de mandar null, igual que hrSeries arriba.
  ...(r.sportProfileName != null ? { sportProfileName: r.sportProfileName } : {}),
  ...(r.tzOffsetMinutes != null ? { tzOffsetMinutes: r.tzOffsetMinutes } : {}),
  ...(r.samples ? { samples: r.samples } : {}),
  ...(r.fitExtras ? { fitExtras: r.fitExtras } : {}),
  notes: r.notes,
});

export async function insertCardio(db: Db, userId: string, a: CardioActivity): Promise<void> {
  await db.insert(cardioActivity).values({
    id: a.id, userId, type: a.type, startedAt: a.startedAt, durationMs: a.durationMs,
    distanceM: a.distanceM, avgHr: a.avgHr, maxHr: a.maxHr, elevationGainM: a.elevationGainM,
    kcal: a.kcal, kcalSource: a.kcalSource, source: a.source,
    hrSeries: a.hrSeries ?? null, notes: a.notes,
    totalCycles: a.totalCycles ?? null,
    trainingLoad: a.trainingLoad ?? null,
    trainingEffectAerobic: a.trainingEffectAerobic ?? null,
    trainingEffectAnaerobic: a.trainingEffectAnaerobic ?? null,
    avgCadence: a.avgCadence ?? null,
    maxCadence: a.maxCadence ?? null,
    avgFractionalCadence: a.avgFractionalCadence ?? null,
    avgRespiration: a.avgRespiration ?? null,
    maxRespiration: a.maxRespiration ?? null,
    minRespiration: a.minRespiration ?? null,
    metabolicKcal: a.metabolicKcal ?? null,
    sportProfileName: a.sportProfileName ?? null,
    tzOffsetMinutes: a.tzOffsetMinutes ?? null,
    samples: a.samples ?? null,
    fitExtras: a.fitExtras ?? null,
  });
}

// Bytes crudos del .FIT, en su propia tabla (ver comentario en db/schema.ts: el listado de
// actividades no debe arrastrar el binario). onConflictDoNothing en la PK (activityId): un
// re-POST del mismo id (retry / idempotencia) no debe reventar por choque de PK.
export async function insertCardioFitFile(
  db: Db, activityId: string, bytes: Buffer, sizeBytes: number, sha256: string,
): Promise<void> {
  await db.insert(cardioFitFile).values({ activityId, bytes, sizeBytes, sha256 }).onConflictDoNothing();
}

// Para el dedupe del import: la actividad del mismo segundo, si existe.
export async function findCardioAtSecond(db: Db, userId: string, startedAt: number): Promise<CardioActivity | null> {
  const { from, to } = secondWindow(startedAt);
  const rows = await db.select().from(cardioActivity).where(
    and(eq(cardioActivity.userId, userId), gte(cardioActivity.startedAt, from), lte(cardioActivity.startedAt, to)),
  );
  return rows[0] ? toActivity(rows[0]) : null;
}

export async function listCardio(db: Db, userId: string, from?: number, to?: number): Promise<CardioActivity[]> {
  const filters = [eq(cardioActivity.userId, userId)];
  if (from != null) filters.push(gte(cardioActivity.startedAt, from));
  if (to != null) filters.push(lte(cardioActivity.startedAt, to));
  const rows = await db.select().from(cardioActivity)
    .where(and(...filters)).orderBy(desc(cardioActivity.startedAt));
  return rows.map(toActivity);
}

export async function getCardio(db: Db, id: string, userId: string): Promise<CardioActivity | null> {
  const rows = await db.select().from(cardioActivity)
    .where(and(eq(cardioActivity.id, id), eq(cardioActivity.userId, userId)));
  return rows[0] ? toActivity(rows[0]) : null;
}

export async function getCardioOwnerId(db: Db, id: string): Promise<string | null> {
  const rows = await db.select({ userId: cardioActivity.userId }).from(cardioActivity)
    .where(eq(cardioActivity.id, id));
  return rows[0]?.userId ?? null;
}

export async function updateCardio(
  db: Db, id: string, userId: string,
  patch: Partial<Pick<CardioActivity, "type" | "durationMs" | "distanceM" | "notes">>,
): Promise<boolean> {
  const res = await db.update(cardioActivity).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(cardioActivity.id, id), eq(cardioActivity.userId, userId))).returning({ id: cardioActivity.id });
  return res.length > 0;
}

export async function deleteCardio(db: Db, id: string, userId: string): Promise<boolean> {
  const res = await db.delete(cardioActivity)
    .where(and(eq(cardioActivity.id, id), eq(cardioActivity.userId, userId))).returning({ id: cardioActivity.id });
  return res.length > 0;
}
