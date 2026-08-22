import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { workObjective } from "../db/schema";

// Cota defensiva contra crecimiento accidental (el objetivo es prosa corta, 2-4 frases).
export const MAX_OBJECTIVE_CHARS = 2000;

export async function getWorkObjective(db: Db, userId: string): Promise<string> {
  const row = await db.query.workObjective.findFirst({ where: eq(workObjective.userId, userId) });
  return row?.content ?? "";
}

export async function upsertWorkObjective(db: Db, userId: string, content: string): Promise<void> {
  const capped = content.length > MAX_OBJECTIVE_CHARS ? content.slice(0, MAX_OBJECTIVE_CHARS) : content;
  await db
    .insert(workObjective)
    .values({ userId, content: capped })
    .onConflictDoUpdate({ target: workObjective.userId, set: { content: capped, updatedAt: new Date() } });
}
