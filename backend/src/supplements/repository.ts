import { and, asc, eq } from "drizzle-orm";
import { supplement } from "../db/schema";
import type { Supplement, SupplementInput } from "@pulsia/shared";
import type { Db } from "../db/client";

type SupplementRow = typeof supplement.$inferSelect;

export function toSupplement(row: SupplementRow): Supplement {
  return {
    id: row.id, name: row.name, brand: row.brand ?? null,
    servingLabel: row.servingLabel,
    components: row.components,
    labelMaxPerDay: row.labelMaxPerDay ?? null,
    source: row.source as Supplement["source"],
    info: row.info ?? null, notes: row.notes ?? null,
    createdAt: new Date(row.createdAt).getTime(),
  };
}

export async function insertSupplement(db: Db, userId: string, input: SupplementInput): Promise<Supplement> {
  const rows = await db.insert(supplement).values({
    userId, name: input.name, brand: input.brand ?? null,
    servingLabel: input.servingLabel, components: [...input.components],
    labelMaxPerDay: input.labelMaxPerDay ?? null, source: input.source,
    info: input.info ?? null, notes: input.notes ?? null,
  }).returning();
  return toSupplement(rows[0]);
}

export async function listSupplements(db: Db, userId: string): Promise<Supplement[]> {
  const rows = await db.select().from(supplement)
    .where(eq(supplement.userId, userId)).orderBy(asc(supplement.name));
  return rows.map(toSupplement);
}

export async function getSupplement(db: Db, userId: string, id: string): Promise<Supplement | null> {
  const row = await db.query.supplement.findFirst({ where: and(eq(supplement.id, id), eq(supplement.userId, userId)) });
  return row ? toSupplement(row) : null;
}

export async function updateSupplement(db: Db, userId: string, id: string, input: SupplementInput): Promise<Supplement | null> {
  const rows = await db.update(supplement).set({
    name: input.name, brand: input.brand ?? null,
    servingLabel: input.servingLabel, components: [...input.components],
    labelMaxPerDay: input.labelMaxPerDay ?? null, source: input.source,
    info: input.info ?? null, notes: input.notes ?? null,
  }).where(and(eq(supplement.id, id), eq(supplement.userId, userId))).returning();
  return rows[0] ? toSupplement(rows[0]) : null;
}

export async function setSupplementInfo(db: Db, userId: string, id: string, info: string): Promise<Supplement | null> {
  const rows = await db.update(supplement).set({ info })
    .where(and(eq(supplement.id, id), eq(supplement.userId, userId))).returning();
  return rows[0] ? toSupplement(rows[0]) : null;
}

export async function deleteSupplement(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(supplement)
    .where(and(eq(supplement.id, id), eq(supplement.userId, userId))).returning();
  return rows.length > 0;
}
