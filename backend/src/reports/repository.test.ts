import { test, expect } from "bun:test";
import { getReport, upsertReport } from "./repository";

test("getReport devuelve null si no existe", async () => {
  const db: any = { query: { report: { findFirst: async () => null } } };
  expect(await getReport(db, "u", "daily", 100)).toBeNull();
});

test("getReport mapea la fila", async () => {
  const row = { id: "r1", kind: "daily", periodStart: 100, periodEnd: 200, content: "x", createdAt: new Date(0) };
  const db: any = { query: { report: { findFirst: async () => row } } };
  expect(await getReport(db, "u", "daily", 100)).toEqual({ id: "r1", kind: "daily", periodStart: 100, periodEnd: 200, content: "x", createdAt: 0 });
});

test("upsertReport inserta con onConflict y devuelve el report", async () => {
  const calls: any[] = [];
  const db: any = { insert: () => ({ values(v: any) { calls.push(v); return { onConflictDoUpdate: () => ({ returning: async () => [{ id: "r1", createdAt: new Date(0), ...v }] }) }; } }) };
  const r = await upsertReport(db, "u", { kind: "daily", periodStart: 100, periodEnd: 200, content: "hola" });
  expect(r).toMatchObject({ kind: "daily", periodStart: 100, periodEnd: 200, content: "hola" });
  expect(calls[0]).toMatchObject({ userId: "u", kind: "daily" });
});
