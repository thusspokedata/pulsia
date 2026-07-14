import { and, eq, gte, lte, asc } from "drizzle-orm";
import { report } from "../db/schema";
import type { Db } from "../db/client";
import type { Report, ReportKind, ReportListItem } from "@pulsia/shared";

type Row = typeof report.$inferSelect;
const toReport = (r: Row): Report => ({
  id: r.id, kind: r.kind as ReportKind, periodStart: r.periodStart, periodEnd: r.periodEnd,
  content: r.content, createdAt: new Date(r.createdAt).getTime(),
});

export async function getReport(db: Db, userId: string, kind: ReportKind, periodStart: number): Promise<Report | null> {
  const row = await db.query.report.findFirst({
    where: and(eq(report.userId, userId), eq(report.kind, kind), eq(report.periodStart, periodStart)),
  });
  return row ? toReport(row) : null;
}

export async function upsertReport(
  db: Db, userId: string,
  input: { kind: ReportKind; periodStart: number; periodEnd: number; content: string },
): Promise<Report> {
  const [row] = await db.insert(report)
    .values({ userId, kind: input.kind, periodStart: input.periodStart, periodEnd: input.periodEnd, content: input.content })
    .onConflictDoUpdate({
      target: [report.userId, report.kind, report.periodStart],
      set: { periodEnd: input.periodEnd, content: input.content, createdAt: new Date() },
    })
    .returning();
  return toReport(row);
}

export async function listReports(
  db: Db, userId: string, kind?: ReportKind, from?: number, to?: number,
): Promise<ReportListItem[]> {
  const conds = [eq(report.userId, userId)];
  if (kind) conds.push(eq(report.kind, kind));
  if (from != null) conds.push(gte(report.periodStart, from));
  if (to != null) conds.push(lte(report.periodStart, to));
  const rows = await db.select().from(report).where(and(...conds)).orderBy(asc(report.periodStart));
  return rows.map((r): ReportListItem => ({ kind: r.kind as ReportKind, periodStart: r.periodStart, periodEnd: r.periodEnd, createdAt: new Date(r.createdAt).getTime() }));
}
