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
