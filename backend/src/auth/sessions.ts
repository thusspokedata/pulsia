import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { sessions } from "../db/schema";
import type { Db } from "../db/client";

function expiryFromNow(ttlDays: number): Date {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

export async function createSession(db: Db, userId: string, ttlDays: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ token, userId, expiresAt: expiryFromNow(ttlDays) });
  return token;
}

export async function validateSession(db: Db, token: string, ttlDays: number): Promise<string | null> {
  const row = await db.query.sessions.findFirst({ where: eq(sessions.token, token) });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  await db.update(sessions).set({ expiresAt: expiryFromNow(ttlDays) }).where(eq(sessions.token, token));
  return row.userId;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}
