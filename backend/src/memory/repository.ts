import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { athleteMemory } from "../db/schema";

export async function getMemory(db: Db, userId: string): Promise<string> {
  const row = await db.query.athleteMemory.findFirst({ where: eq(athleteMemory.userId, userId) });
  return row?.content ?? "";
}

export async function upsertMemory(db: Db, userId: string, content: string): Promise<void> {
  await db
    .insert(athleteMemory)
    .values({ userId, content })
    .onConflictDoUpdate({ target: athleteMemory.userId, set: { content, updatedAt: new Date() } });
}
