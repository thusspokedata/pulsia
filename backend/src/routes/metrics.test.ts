import { expect, test } from "bun:test";
import { createApp } from "../app";

const baseConfig = { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6", inviteCode: "x", sessionTtlDays: 4, singleUserMode: true };
const aiClient = { generateProgram: async () => ({ name: "x", weeks: [] }) };

test("POST /metrics inserta y responde 200 con las filas", async () => {
  const db: any = { insert: () => ({ values: (v: any[]) => ({ onConflictDoUpdate: () => ({ returning: async () => v.map((r, i) => ({ id: `id-${i}`, ...r })) }) }) }) };
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

const SLEEP_CSV =
  "Sleep Score 7 Days,Score,Resting Heart Rate,Body Battery,Pulse Ox,Respiration,HRV Status,Quality,Duration,Sleep Need,Bedtime,Wake Time\n" +
  "2026-07-17,70,60,50,97.00,15.00,40,Good,7h 42min,8h 45min,11:52 PM,7:34 AM";
const SLEEP_B64 = Buffer.from(SLEEP_CSV).toString("base64");

test("POST /metrics/import/sleep/parse devuelve el preview sin persistir", async () => {
  let inserted = false;
  const db: any = { insert: () => ({ values: () => { inserted = true; return { returning: async () => [] }; } }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/sleep/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: SLEEP_B64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.rows).toHaveLength(1);
  expect(body.rows[0].date).toBe("2026-07-17");
  expect(inserted).toBe(false);
});

test("POST /metrics/import/sleep/parse con base64 basura → 400 legible", async () => {
  const db: any = {};
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/sleep/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: Buffer.from("no es un csv").toString("base64") }),
  });
  expect(res.status).toBe(400);
});

test("POST /metrics/import/sleep inserta y devuelve conteos", async () => {
  const values: any[] = [];
  const db: any = {
    insert: () => ({
      values: (v: any[]) => {
        values.push(...v);
        return {
          onConflictDoNothing: () => ({ returning: async () => v.map((_, i) => ({ id: `id-${i}` })) }),
        };
      },
    }),
  };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/sleep", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: SLEEP_B64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.imported).toBe(8);
  expect(body.duplicates).toBe(0);
  expect(values.length).toBe(8);
});

test("POST /metrics/import/sleep/parse con tzOffsetMinutes llega al parser (mediodía local)", async () => {
  const db: any = {};
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/sleep/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: SLEEP_B64, tzOffsetMinutes: -120 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.rows[0].measuredAt).toBe(Date.UTC(2026, 6, 17, 10, 0, 0));
});

const WEIGHT_CSV =
  "Time,Weight,Change,BMI,Body Fat,Skeletal Muscle Mass,Bone Mass,Body Water,\n" +
  '" Jul 15, 2026",\n' +
  "9:46 AM,80.5 kg,0.5 kg,25.0,18.5 %,35.0 kg,3.5 kg,60.5 %,";
const WEIGHT_B64 = Buffer.from(WEIGHT_CSV).toString("base64");

const STEPS_CSV = ",Actual,Goal\n07/17/2026,19002,11170";
const STEPS_B64 = Buffer.from(STEPS_CSV).toString("base64");

test("POST /metrics/import/weight/parse devuelve el preview sin persistir", async () => {
  let inserted = false;
  const db: any = { insert: () => ({ values: () => { inserted = true; return { returning: async () => [] }; } }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/weight/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: WEIGHT_B64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.rows).toHaveLength(1);
  expect(body.rows[0].date).toBe("2026-07-15");
  expect(inserted).toBe(false);
});

test("POST /metrics/import/weight/parse con base64 basura → 400 legible", async () => {
  const db: any = {};
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/weight/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: Buffer.from("no es un csv").toString("base64") }),
  });
  expect(res.status).toBe(400);
});

test("POST /metrics/import/weight inserta y devuelve conteos", async () => {
  const values: any[] = [];
  const db: any = {
    insert: () => ({
      values: (v: any[]) => {
        values.push(...v);
        return {
          onConflictDoNothing: () => ({ returning: async () => v.map((_, i) => ({ id: `id-${i}` })) }),
        };
      },
    }),
  };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/weight", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: WEIGHT_B64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.imported).toBe(5);
  expect(body.duplicates).toBe(0);
  expect(values.length).toBe(5);
});

test("POST /metrics/import/steps/parse devuelve el preview sin persistir", async () => {
  let inserted = false;
  const db: any = { insert: () => ({ values: () => { inserted = true; return { returning: async () => [] }; } }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/steps/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: STEPS_B64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.rows).toHaveLength(1);
  expect(body.rows[0].date).toBe("2026-07-17");
  expect(inserted).toBe(false);
});

test("POST /metrics/import/steps/parse con base64 basura → 400 legible", async () => {
  const db: any = {};
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/steps/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: Buffer.from("no es un csv").toString("base64") }),
  });
  expect(res.status).toBe(400);
});

test("POST /metrics/import/steps inserta y devuelve conteos", async () => {
  const values: any[] = [];
  const db: any = {
    insert: () => ({
      values: (v: any[]) => {
        values.push(...v);
        return {
          onConflictDoNothing: () => ({ returning: async () => v.map((_, i) => ({ id: `id-${i}` })) }),
        };
      },
    }),
  };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/steps", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: STEPS_B64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.imported).toBe(2);
  expect(body.duplicates).toBe(0);
  expect(values.length).toBe(2);
});
