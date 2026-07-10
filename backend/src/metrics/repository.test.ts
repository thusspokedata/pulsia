import { expect, test } from "bun:test";
import { insertReading, getMetrics, deleteMetric, pickLatestPerType } from "./repository";

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
