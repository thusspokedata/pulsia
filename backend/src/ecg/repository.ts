import { eq, desc, and } from "drizzle-orm";
import { ecgRecording } from "../db/schema";
import type { Db } from "../db/client";

export async function insertEcg(db: Db, userId: string, pdf: Buffer, mime: string) {
  const [row] = await db.insert(ecgRecording).values({ userId, pdf, mime, status: "pending" }).returning();
  return row;
}
export async function getEcgById(db: Db, id: string) {
  return db.query.ecgRecording.findFirst({ where: eq(ecgRecording.id, id) });
}
export async function listEcg(db: Db, userId: string) {
  return db.query.ecgRecording.findMany({
    where: eq(ecgRecording.userId, userId),
    orderBy: [desc(ecgRecording.createdAt)],
    columns: { id: true, status: true, createdAt: true, kardiaVerdict: true, avgHr: true, recordedAt: true, interpretation: true, error: true },
  });
}
export async function priorEcgFor(db: Db, userId: string) {
  return db.query.ecgRecording.findMany({
    where: and(eq(ecgRecording.userId, userId), eq(ecgRecording.status, "done")),
    columns: { recordedAt: true, kardiaVerdict: true, avgHr: true, createdAt: true },
  });
}
export async function deleteEcg(db: Db, id: string) {
  await db.delete(ecgRecording).where(eq(ecgRecording.id, id));
}
