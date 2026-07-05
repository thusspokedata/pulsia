import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { appRelease } from "../db/schema";

const SINGLETON = "latest";

export type AppRelease = { versionCode: number; apkUrl: string; label: string } | null;

export async function getLatestRelease(db: Db): Promise<AppRelease> {
  const row = await db.query.appRelease.findFirst({ where: eq(appRelease.id, SINGLETON) });
  return row ? { versionCode: row.versionCode, apkUrl: row.apkUrl, label: row.label } : null;
}

export async function setLatestRelease(db: Db, r: { versionCode: number; apkUrl: string; label?: string }): Promise<void> {
  await db
    .insert(appRelease)
    .values({ id: SINGLETON, versionCode: r.versionCode, apkUrl: r.apkUrl, label: r.label ?? "" })
    .onConflictDoUpdate({ target: appRelease.id, set: { versionCode: r.versionCode, apkUrl: r.apkUrl, label: r.label ?? "", updatedAt: new Date() } });
}
