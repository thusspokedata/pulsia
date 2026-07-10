import { expect, test } from "bun:test";
import { createApp } from "../app";

const baseConfig = { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6", inviteCode: "x", sessionTtlDays: 4, singleUserMode: true };
const aiClient = { generateProgram: async () => ({ name: "x", weeks: [] }) };

test("POST /metrics inserta y responde 200 con las filas", async () => {
  const db: any = { insert: () => ({ values: (v: any[]) => ({ returning: async () => v.map((r, i) => ({ id: `id-${i}`, ...r })) }) }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ measuredAt: 1000, entries: [{ metricType: "weight_kg", value: 80 }] }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body[0].value).toBe(80);
});

test("POST /metrics rechaza payload inválido con 400", async () => {
  const db: any = {};
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries: [] }),
  });
  expect(res.status).toBe(400);
});

test("GET /progress/performance responde 200 con la forma esperada", async () => {
  const db: any = { query: { workoutSession: { findMany: async () => [] } } };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/progress/performance", {});
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("perExercise");
  expect(body).toHaveProperty("volumeSeries");
  expect(body).toHaveProperty("prs");
});

test("GET /metrics?type=weight_kg responde 200 con la serie mapeada", async () => {
  const dbRows = [{ id: "a", userId: "u1", metricType: "weight_kg", value: 79, measuredAt: 3000, createdAt: new Date() }];
  const db: any = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => dbRows }) }) }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics?type=weight_kg", {});
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual([{ id: "a", metricType: "weight_kg", value: 79, measuredAt: 3000 }]);
});

test("GET /metrics?from=abc no filtra por fecha (from inválido se ignora) y responde 200", async () => {
  const dbRows = [{ id: "a", userId: "u1", metricType: "weight_kg", value: 79, measuredAt: 3000, createdAt: new Date() }];
  const db: any = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => dbRows }) }) }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics?from=abc", {});
  expect(res.status).toBe(200);
});

test("GET /metrics/latest responde 200 con el último valor por tipo", async () => {
  const dbRows = [
    { metricType: "weight_kg", value: 79, measuredAt: 3000 },
    { metricType: "weight_kg", value: 80, measuredAt: 1000 },
    { metricType: "waist_cm", value: 85, measuredAt: 2000 },
  ];
  const db: any = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => dbRows }) }) }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/latest", {});
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.weight_kg).toEqual({ value: 79, measuredAt: 3000 });
  expect(body.waist_cm).toEqual({ value: 85, measuredAt: 2000 });
});

test("DELETE /metrics/:id responde 200 cuando borra una fila", async () => {
  const db: any = { delete: () => ({ where: () => ({ returning: async () => [{ id: "x" }] }) }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/x", { method: "DELETE" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ ok: true });
});

test("DELETE /metrics/:id responde 404 cuando no borra nada", async () => {
  const db: any = { delete: () => ({ where: () => ({ returning: async () => [] }) }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/x", { method: "DELETE" });
  expect(res.status).toBe(404);
});
