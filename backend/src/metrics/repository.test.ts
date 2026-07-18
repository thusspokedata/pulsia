import { expect, test } from "bun:test";
import { insertReading, getMetrics, deleteMetric, pickLatestPerType, insertReadingsDedup } from "./repository";

// Fake db para el upsert: `returning` devuelve lo que la DB dejó en la tabla (insertado o pisado).
function fakeUpsertDb(returned?: (rows: any[]) => any[]) {
  const captured: any[] = [];
  let conflict: any = null;
  const db: any = {
    insert: () => ({
      values: (v: any[]) => {
        captured.push(...v);
        return {
          onConflictDoUpdate: (arg: any) => {
            conflict = arg;
            return { returning: async () => (returned ?? ((r) => r.map((x, i) => ({ id: `id-${i}`, ...x }))))(v) };
          },
        };
      },
    }),
  };
  return { db, captured, getConflict: () => conflict };
}

test("insertReading arma una fila por entry con measuredAt común y mapea al shape compartido", async () => {
  const { db, captured } = fakeUpsertDb();
  const rows = await insertReading(db, "u1", {
    measuredAt: 1000,
    entries: [{ metricType: "weight_kg", value: 80 }, { metricType: "waist_cm", value: 85 }],
  });
  expect(captured.length).toBe(2);
  expect(captured.every((r) => r.measuredAt === 1000 && r.userId === "u1")).toBe(true);
  expect(rows[0]).toEqual({ id: "id-0", metricType: "weight_kg", value: 80, measuredAt: 1000 });
});

test("insertReading pisa el valor al reguardar el mismo (user, tipo, measuredAt)", async () => {
  // La DB ya tenía steps=11652 para ese mediodía; el upsert devuelve la fila con el valor corregido.
  const { db, getConflict } = fakeUpsertDb(() => [
    { id: "existente", userId: "u1", metricType: "steps", value: 19000, measuredAt: 1000 },
  ]);
  const rows = await insertReading(db, "u1", { measuredAt: 1000, entries: [{ metricType: "steps", value: 19000 }] });
  const conflict = getConflict();
  expect(conflict.target.map((c: any) => c.name)).toEqual(["user_id", "metric_type", "measured_at"]);
  expect(conflict.set.value).toBeDefined();
  expect(rows).toEqual([{ id: "existente", metricType: "steps", value: 19000, measuredAt: 1000 }]);
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
  const batches: number[] = [];
  const db: any = {
    insert: () => ({
      values: (v: any[]) => {
        captured.push(...v);
        batches.push(v.length);
        return {
          onConflictDoNothing: () => ({
            returning: async () => v.slice(0, insertedCount(v)).map((_, i) => ({ id: `id-${i}` })),
          }),
        };
      },
    }),
  };
  return { db, captured, batches: () => batches };
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

test("insertReadingsDedup parte el insert en chunks para no pasarse del tope de parámetros de Postgres", async () => {
  // 12.000 filas: son 4 parámetros por fila, así que en una sola sentencia (48.000) todavía entraría,
  // pero un historial de sueño más largo no — el chunk tiene que partirlo igual.
  const { db, captured, batches } = fakeDedupDb((v) => v.length);
  const rows = Array.from({ length: 12_000 }, (_, i) => ({
    measuredAt: i * 86_400_000,
    entries: [{ metricType: "sleep_score", value: 85 }],
  }));
  const res = await insertReadingsDedup(db, "u1", rows);
  expect(res.imported).toBe(12_000);
  expect(captured).toHaveLength(12_000);
  expect(batches()).toEqual([5000, 5000, 2000]);
  expect(Math.max(...batches()) * 4).toBeLessThan(65_535);
});
