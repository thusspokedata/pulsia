import { expect, test } from "bun:test";
import { insertReading, getMetrics, deleteMetric, pickLatestPerType, insertReadingsDedup } from "./repository";

test("insertReading arma una fila por entry con measuredAt común y mapea al shape compartido", async () => {
  let captured: any[] = [];
  const db: any = { insert: () => ({ values: (v: any[]) => { captured = v; return { returning: async () => v.map((r, i) => ({ id: `id-${i}`, ...r })) }; } }) };
  const rows = await insertReading(db, "u1", {
    measuredAt: 1000,
    entries: [{ metricType: "weight_kg", value: 80 }, { metricType: "waist_cm", value: 85 }],
  });
  expect(captured.length).toBe(2);
  expect(captured.every((r) => r.measuredAt === 1000 && r.userId === "u1")).toBe(true);
  expect(rows[0]).toEqual({ id: "id-0", metricType: "weight_kg", value: 80, measuredAt: 1000 });
});

test("getMetrics mapea filas de la DB al shape BodyMetric", async () => {
  const dbRows = [{ id: "a", userId: "u1", metricType: "weight_kg", value: 79, measuredAt: 3000, createdAt: new Date() }];
  const db: any = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => dbRows }) }) }) };
  const series = await getMetrics(db, "u1", { type: "weight_kg" });
  expect(series).toEqual([{ id: "a", metricType: "weight_kg", value: 79, measuredAt: 3000 }]);
});

test("pickLatestPerType elige el más reciente por tipo (filas ordenadas desc)", () => {
  const rows = [
    { metricType: "weight_kg", value: 79, measuredAt: 3000 },
    { metricType: "weight_kg", value: 80, measuredAt: 1000 },
    { metricType: "waist_cm", value: 85, measuredAt: 2000 },
  ] as any;
  const latest = pickLatestPerType(rows);
  expect(latest.weight_kg).toEqual({ value: 79, measuredAt: 3000 });
  expect(latest.waist_cm).toEqual({ value: 85, measuredAt: 2000 });
});

test("deleteMetric devuelve true/false según haya borrado", async () => {
  const dbHit: any = { delete: () => ({ where: () => ({ returning: async () => [{ id: "x" }] }) }) };
  const dbMiss: any = { delete: () => ({ where: () => ({ returning: async () => [] }) }) };
  expect(await deleteMetric(dbHit, "u1", "x")).toBe(true);
  expect(await deleteMetric(dbMiss, "u1", "x")).toBe(false);
});

// Fake db para el insert conflict-aware: `returning` devuelve solo las primeras `insertedCount`
// filas, simulando las que el índice único dejó pasar.
function fakeDedupDb(insertedCount: (rows: any[]) => number) {
  const captured: any[] = [];
  const db: any = {
    insert: () => ({
      values: (v: any[]) => {
        captured.push(...v);
        return {
          onConflictDoNothing: () => ({
            returning: async () => v.slice(0, insertedCount(v)).map((_, i) => ({ id: `id-${i}` })),
          }),
        };
      },
    }),
  };
  return { db, captured };
}

test("insertReadingsDedup cuenta como duplicadas las filas que el índice único rechazó", async () => {
  const { db, captured } = fakeDedupDb(() => 2); // de 3 enviadas, la DB acepta 2
  const rows = [
    { measuredAt: 100, entries: [{ metricType: "sleep_score", value: 85 }, { metricType: "hrv", value: 45 }] },
    { measuredAt: 200, entries: [{ metricType: "sleep_score", value: 60 }] },
  ];
  const res = await insertReadingsDedup(db, "u1", rows);
  expect(captured).toHaveLength(3);
  expect(captured.every((r) => r.userId === "u1")).toBe(true);
  expect(res.imported).toBe(2);
  expect(res.duplicates).toBe(1);
});

test("insertReadingsDedup colapsa los duplicados dentro del mismo batch antes de tocar la DB", async () => {
  const { db, captured } = fakeDedupDb((v) => v.length); // la DB acepta todo lo que le llega
  const rows = [
    { measuredAt: 100, entries: [{ metricType: "sleep_score", value: 85 }] },
    { measuredAt: 100, entries: [{ metricType: "sleep_score", value: 85 }] },
    { measuredAt: 200, entries: [{ metricType: "sleep_score", value: 60 }] },
  ];
  const res = await insertReadingsDedup(db, "u1", rows);
  expect(captured).toHaveLength(2);
  expect(res.imported).toBe(2);
  expect(res.duplicates).toBe(0);
});

test("insertReadingsDedup no toca la DB si no hay filas", async () => {
  const db: any = { insert: () => { throw new Error("no debería insertar"); } };
  const res = await insertReadingsDedup(db, "u1", [{ measuredAt: 100, entries: [] }]);
  expect(res).toEqual({ imported: 0, duplicates: 0 });
});
