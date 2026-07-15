import { test, expect } from "bun:test";
import { createApp } from "../app";

const KEY = "a".repeat(64);
const SUP_ID = "11111111-1111-4111-8111-111111111111";
const IMG = Buffer.from("fake jpeg").toString("base64");

const supRow = {
  id: SUP_ID, userId: "single-user", name: "ZMA Pro", brand: null,
  servingLabel: "2 cápsulas", components: [{ name: "Zinc", amount: 10, unit: "mg" }],
  labelMaxPerDay: null, source: "label", info: null, notes: null, createdAt: new Date(0),
};

const extraction = {
  name: "ZMA Pro", brand: "BrandX", servingLabel: "2 cápsulas",
  components: [{ name: "Zinc", amount: 10, unit: "mg" }],
  labelMaxPerDay: "2 cápsulas al día", source: "label",
  info: "El zinc participa en el sistema inmune.",
};

function fakeDb(opts: { supplements?: any[]; supRow?: any; settingsRow?: any } = {}) {
  const inserts: any[] = [];
  const db: any = {
    _inserts: inserts,
    insert: (table: any) => ({
      values(v: any) {
        const rows = (Array.isArray(v) ? v : [v]).map((r, i) => ({ id: r.id ?? `${SUP_ID.slice(0, -1)}${i}`, createdAt: new Date(0), ...r }));
        inserts.push({ table, rows });
        const p: any = Promise.resolve(rows);
        p.returning = async () => rows;
        return p;
      },
    }),
    update: () => ({
      set: (patch: any) => ({
        where: () => {
          const p: any = Promise.resolve([]);
          p.returning = async () => (opts.supRow ? [{ ...opts.supRow, ...patch }] : []);
          return p;
        },
      }),
    }),
    delete: () => ({
      where: () => {
        const p: any = Promise.resolve(undefined);
        p.returning = async () => (opts.supRow ? [{ id: opts.supRow.id }] : []);
        return p;
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => opts.supplements ?? [] }) }) }),
    transaction: async (fn: any) => fn(db),
    query: {
      supplement: { findFirst: async () => opts.supRow ?? null },
      settings: { findFirst: async () => opts.settingsRow ?? { aiApiKeyEncrypted: null } },
    },
  };
  return db;
}

const baseConfig = { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "x", sessionTtlDays: 4, singleUserMode: true, defaultAiApiKey: "sk-x" };

function makeAiClient(overrides: any = {}) {
  return {
    generateProgram: async () => ({ name: "x", weeks: [] }),
    ...overrides,
  };
}

const deps = (db: any, aiClient: any = makeAiClient()): any => ({ db, config: baseConfig, aiClient });

test("POST /nutrition/supplements/extract → 200 con la extracción", async () => {
  const aiClient = makeAiClient({ extractSupplement: async () => extraction });
  const app = createApp(deps(fakeDb(), aiClient));
  const res = await app.request("/nutrition/supplements/extract", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageBase64: IMG, mediaType: "image/jpeg" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ name: "ZMA Pro", source: "label" });
});

test("POST /nutrition/supplements/extract → 500 si el servidor no soporta extracción", async () => {
  const app = createApp(deps(fakeDb())); // sin extractSupplement
  const res = await app.request("/nutrition/supplements/extract", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageBase64: IMG, mediaType: "image/jpeg" }),
  });
  expect(res.status).toBe(500);
});

test("POST /nutrition/supplements/extract → 502 si la IA falla", async () => {
  const aiClient = makeAiClient({
    extractSupplement: async () => {
      throw new Error("boom");
    },
  });
  const app = createApp(deps(fakeDb(), aiClient));
  const res = await app.request("/nutrition/supplements/extract", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageBase64: IMG, mediaType: "image/jpeg" }),
  });
  expect(res.status).toBe(502);
});

test("POST /nutrition/supplements crea un suplemento", async () => {
  const db = fakeDb();
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/supplements", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "ZMA Pro", brand: null, servingLabel: "2 cápsulas",
      components: [{ name: "Zinc", amount: 10, unit: "mg" }],
      labelMaxPerDay: null, source: "label", info: null, notes: null,
    }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ name: "ZMA Pro" });
});

test("GET /nutrition/supplements lista los suplementos", async () => {
  const db = fakeDb({ supplements: [supRow] });
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/supplements");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveLength(1);
  expect(body[0]).toMatchObject({ name: "ZMA Pro" });
});

test("POST /nutrition/supplements → 400 con body inválido", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/supplements", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "" }),
  });
  expect(res.status).toBe(400);
});

test("PATCH /nutrition/supplements/:id → 404 si no existe / es de otro usuario", async () => {
  const res = await createApp(deps(fakeDb())).request(`/nutrition/supplements/${SUP_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "ZMA Pro", brand: null, servingLabel: "2 cápsulas",
      components: [{ name: "Zinc", amount: 10, unit: "mg" }],
      labelMaxPerDay: null, source: "label", info: null, notes: null,
    }),
  });
  expect(res.status).toBe(404);
});

test("DELETE /nutrition/supplements/:id → 404 si no existe / es de otro usuario", async () => {
  const res = await createApp(deps(fakeDb())).request(`/nutrition/supplements/${SUP_ID}`, { method: "DELETE" });
  expect(res.status).toBe(404);
});

test("POST /nutrition/supplements/:id/explain → 200 y guarda la explicación", async () => {
  const aiClient = makeAiClient({ explainSupplement: async () => "El zinc participa en el sistema inmune." });
  const db = fakeDb({ supRow });
  const app = createApp(deps(db, aiClient));
  const res = await app.request(`/nutrition/supplements/${SUP_ID}/explain`, { method: "POST" });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ info: "El zinc participa en el sistema inmune." });
});

test("POST /nutrition/supplements/:id/explain → 404 si el suplemento no existe", async () => {
  const aiClient = makeAiClient({ explainSupplement: async () => "x" });
  const app = createApp(deps(fakeDb(), aiClient));
  const res = await app.request(`/nutrition/supplements/${SUP_ID}/explain`, { method: "POST" });
  expect(res.status).toBe(404);
});
