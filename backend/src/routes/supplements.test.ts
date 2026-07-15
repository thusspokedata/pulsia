import { test, expect } from "bun:test";
import { createApp } from "../app";
import { supplement, supplementPlanItem, supplementTake } from "../db/schema";

const KEY = "a".repeat(64);
const SUP_ID = "11111111-1111-4111-8111-111111111111";
const SUP_ID2 = "22222222-2222-4222-8222-222222222222";
const SUP_UNKNOWN = "99999999-9999-4999-8999-999999999999";
const PLAN_ID = "55555555-5555-4555-8555-555555555555";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID2 = "44444444-4444-4444-8444-444444444444";
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

// Ítem de plan ya "joineado" con el nombre del suplemento (lo que devuelven
// getActivePlan / getOwnedPlanItem tras el innerJoin con `supplement`).
const joinedItem = {
  id: ITEM_ID, planId: PLAN_ID, supplementId: SUP_ID,
  slot: "desayuno", frequency: { type: "daily" }, dose: "1 tableta", reason: "test",
  supplementName: "ZMA Pro",
};

const VALID_CONTEXT = { goal: { status: "incomplete" } };

function fakeDb(opts: {
  supplements?: any[];
  supRow?: any;
  settingsRow?: any;
  planRow?: any | null;
  planItemRows?: any[];
  ownedItemRows?: any[];
  takes?: any[];
  adjustmentRow?: any | null;
} = {}) {
  const inserts: any[] = [];
  const db: any = {
    _inserts: inserts,
    insert: (table: any) => ({
      values(v: any) {
        const rows = (Array.isArray(v) ? v : [v]).map((r, i) => ({ id: r.id ?? `${SUP_ID.slice(0, -1)}${i}`, createdAt: new Date(0), ...r }));
        inserts.push({ table, rows });
        const p: any = Promise.resolve(rows);
        p.returning = async () => rows;
        p.onConflictDoUpdate = async () => undefined;
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
    // select().from(table)[.innerJoin(...)[.innerJoin(...)]].where() — awaited directamente o
    // con .orderBy() encima. El número de innerJoin distingue getActivePlan (1) de
    // getOwnedPlanItem (2), ambos partiendo de supplementPlanItem.
    select: (_fields?: any) => ({
      from: (table: any) => {
        let joins = 0;
        const chain: any = {
          innerJoin: () => {
            joins++;
            return chain;
          },
          where: () => {
            let rows: any[];
            if (table === supplement) rows = opts.supplements ?? [];
            else if (table === supplementPlanItem) {
              if (joins === 1) rows = opts.planItemRows ?? [];
              else if (joins === 2) rows = opts.ownedItemRows ?? [];
              else throw new Error("query shape desconocida");
            }
            else if (table === supplementTake) rows = opts.takes ?? [];
            else rows = [];
            const p: any = Promise.resolve(rows);
            p.orderBy = async () => rows;
            return p;
          },
        };
        return chain;
      },
    }),
    transaction: async (fn: any) => fn(db),
    query: {
      supplement: { findFirst: async () => opts.supRow ?? null },
      settings: { findFirst: async () => opts.settingsRow ?? { aiApiKeyEncrypted: null } },
      supplementPlan: { findFirst: async () => opts.planRow ?? null },
      supplementAdjustment: { findFirst: async () => opts.adjustmentRow ?? null },
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

// ---- PR2: plan / día / tomas ----

test("POST /nutrition/supplements/plan/generate → 422 si el catálogo está vacío", async () => {
  const app = createApp(deps(fakeDb({ supplements: [] })));
  const res = await app.request("/nutrition/supplements/plan/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ athleteContext: VALID_CONTEXT, date: "2026-07-16" }),
  });
  expect(res.status).toBe(422);
});

test("POST /nutrition/supplements/plan/generate → filtra ids desconocidos y ancla every_other_day a body.date", async () => {
  const aiClient = makeAiClient({
    generateSupplementPlan: async () => [
      { supplementId: SUP_ID, slot: "desayuno", frequency: { type: "every_other_day" }, dose: "1 tableta", reason: "motivo" },
      { supplementId: SUP_UNKNOWN, slot: "cena", frequency: { type: "daily" }, dose: "1 g", reason: "motivo desconocido" },
    ],
  });
  const db = fakeDb({ supplements: [supRow] });
  const app = createApp(deps(db, aiClient));
  const res = await app.request("/nutrition/supplements/plan/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ athleteContext: VALID_CONTEXT, date: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.plan.items).toHaveLength(1);
  expect(body.plan.items[0]).toMatchObject({ supplementId: SUP_ID, supplementName: "ZMA Pro" });
  expect(body.warnings).toEqual([]);
  const insertedItems = db._inserts.find((i: any) => i.table === supplementPlanItem);
  expect(insertedItems.rows).toHaveLength(1);
  expect(insertedItems.rows[0].frequency).toMatchObject({ type: "every_other_day", anchorDate: "2026-07-16" });
});

test("POST /nutrition/supplements/plan/generate → dos suplementos con magnesio ambos daily → 1 warning nombrando el componente", async () => {
  const MG_A = "22222222-2222-4222-8222-222222222222";
  const MG_B = "33333333-3333-4333-8333-333333333333";
  const supMgA = { ...supRow, id: MG_A, name: "Magnesio Citrato", components: [{ name: "Magnesio (citrato)", amount: 200, unit: "mg" }] };
  const supMgB = { ...supRow, id: MG_B, name: "Magnesio Bisglicinato", components: [{ name: "Magnesio bisglicinato", amount: 150, unit: "mg" }] };
  const aiClient = makeAiClient({
    generateSupplementPlan: async () => [
      { supplementId: MG_A, slot: "desayuno", frequency: { type: "daily" }, dose: "1 tableta", reason: "x" },
      { supplementId: MG_B, slot: "cena", frequency: { type: "daily" }, dose: "1 tableta", reason: "x" },
    ],
  });
  const db = fakeDb({ supplements: [supMgA, supMgB] });
  const app = createApp(deps(db, aiClient));
  const res = await app.request("/nutrition/supplements/plan/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ athleteContext: VALID_CONTEXT, date: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.warnings).toHaveLength(1);
  expect(body.warnings[0]).toContain("magnesio");
});

test("POST /nutrition/supplements/plan/generate → catálogo limpio (sin solapamiento) → warnings: []", async () => {
  const aiClient = makeAiClient({
    generateSupplementPlan: async () => [
      { supplementId: SUP_ID, slot: "desayuno", frequency: { type: "daily" }, dose: "1 tableta", reason: "x" },
    ],
  });
  const db = fakeDb({ supplements: [supRow] });
  const app = createApp(deps(db, aiClient));
  const res = await app.request("/nutrition/supplements/plan/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ athleteContext: VALID_CONTEXT, date: "2026-07-16" }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.warnings).toEqual([]);
});

test("POST /nutrition/supplements/plan/generate → 422 si todos los ids son desconocidos", async () => {
  const aiClient = makeAiClient({
    generateSupplementPlan: async () => [
      { supplementId: SUP_UNKNOWN, slot: "cena", frequency: { type: "daily" }, dose: "1 g", reason: "x" },
    ],
  });
  const app = createApp(deps(fakeDb({ supplements: [supRow] }), aiClient));
  const res = await app.request("/nutrition/supplements/plan/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ athleteContext: VALID_CONTEXT, date: "2026-07-16" }),
  });
  expect(res.status).toBe(422);
});

test("POST /nutrition/supplements/plan/generate → 502 si la IA falla", async () => {
  const aiClient = makeAiClient({
    generateSupplementPlan: async () => {
      throw new Error("boom");
    },
  });
  const app = createApp(deps(fakeDb({ supplements: [supRow] }), aiClient));
  const res = await app.request("/nutrition/supplements/plan/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ athleteContext: VALID_CONTEXT, date: "2026-07-16" }),
  });
  expect(res.status).toBe(502);
});

test("GET /nutrition/supplements/plan → 200 { plan: null, warnings: [] } sin plan", async () => {
  const app = createApp(deps(fakeDb({ planRow: null })));
  const res = await app.request("/nutrition/supplements/plan");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ plan: null, warnings: [] });
});

test("GET /nutrition/supplements/plan → 200 { plan, warnings: [] } con plan activo sin solapamiento", async () => {
  const planRow = { id: PLAN_ID, userNote: null, createdAt: new Date(0) };
  const app = createApp(deps(fakeDb({ planRow, planItemRows: [joinedItem], supplements: [supRow] })));
  const res = await app.request("/nutrition/supplements/plan");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.plan).toMatchObject({ id: PLAN_ID });
  expect(body.plan.items[0]).toMatchObject({ id: ITEM_ID, supplementName: "ZMA Pro" });
  expect(body.warnings).toEqual([]);
});

// Warnings persistentes (T4 review): mismo componente ("Zinc") aportado por dos productos
// distintos del plan → GET /plan debe devolverlas también al recargar, no solo al generar.
test("GET /nutrition/supplements/plan → warnings de solapamiento de componentes al recargar", async () => {
  const planRow = { id: PLAN_ID, userNote: null, createdAt: new Date(0) };
  const sup2Row = { ...supRow, id: SUP_ID2, name: "Zinc Extra" };
  const joinedItem2 = {
    id: ITEM_ID2, planId: PLAN_ID, supplementId: SUP_ID2,
    slot: "cena", frequency: { type: "daily" }, dose: "1 tableta", reason: "test",
    supplementName: "Zinc Extra",
  };
  const app = createApp(deps(fakeDb({
    planRow, planItemRows: [joinedItem, joinedItem2], supplements: [supRow, sup2Row],
  })));
  const res = await app.request("/nutrition/supplements/plan");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.warnings.length).toBeGreaterThan(0);
  expect(body.warnings[0]).toMatch(/zinc/i);
});

test("PATCH /nutrition/supplements/plan/items/:id → 400 con id no-UUID (carry-over)", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/supplements/plan/items/not-a-uuid", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dose: "5 g" }),
  });
  expect(res.status).toBe(400);
});

test("PATCH /nutrition/supplements/plan/items/:id → 404 si el ítem no es del usuario", async () => {
  const app = createApp(deps(fakeDb({ ownedItemRows: [] })));
  const res = await app.request(`/nutrition/supplements/plan/items/${ITEM_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dose: "5 g" }),
  });
  expect(res.status).toBe(404);
});

test("PATCH /nutrition/supplements/plan/items/:id → 400 con patch vacío", async () => {
  const app = createApp(deps(fakeDb({ ownedItemRows: [joinedItem] })));
  const res = await app.request(`/nutrition/supplements/plan/items/${ITEM_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
});

test("PATCH /nutrition/supplements/plan/items/:id → 200 feliz", async () => {
  const app = createApp(deps(fakeDb({ ownedItemRows: [joinedItem] })));
  const res = await app.request(`/nutrition/supplements/plan/items/${ITEM_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dose: "5 g" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: ITEM_ID, dose: "5 g" });
});

test("GET /nutrition/supplements/day → 400 sin date o con date inválida", async () => {
  const app = createApp(deps(fakeDb()));
  expect((await app.request("/nutrition/supplements/day")).status).toBe(400);
  expect((await app.request("/nutrition/supplements/day?date=not-a-date")).status).toBe(400);
});

test("GET /nutrition/supplements/day → sin plan: {hasPlan:false, entries:[]}", async () => {
  const app = createApp(deps(fakeDb({ planRow: null })));
  const res = await app.request("/nutrition/supplements/day?date=2026-07-16");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ hasPlan: false, entries: [] });
});

test("GET /nutrition/supplements/day → con plan: resuelve el checklist con tomas y ajustes", async () => {
  const planRow = { id: PLAN_ID, userNote: null, createdAt: new Date(0) };
  const takeRow = {
    id: "t1", userId: "single-user", date: "2026-07-16", planItemId: ITEM_ID,
    status: "taken", actualDose: null, note: null,
    supplementName: "ZMA Pro", plannedDose: "1 tableta", slot: "desayuno",
  };
  const app = createApp(deps(fakeDb({ planRow, planItemRows: [joinedItem], takes: [takeRow] })));
  const res = await app.request("/nutrition/supplements/day?date=2026-07-16");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.hasPlan).toBe(true);
  expect(body.entries).toHaveLength(1);
  expect(body.entries[0]).toMatchObject({ planItemId: ITEM_ID, status: "taken", slot: "desayuno" });
});

test("GET /nutrition/supplements/day → un ajuste (skip) marca la entrada como adjusted", async () => {
  const planRow = { id: PLAN_ID, userNote: null, createdAt: new Date(0) };
  const adjustmentRow = {
    userId: "single-user", forDate: "2026-07-16",
    items: [{ supplementId: SUP_ID, action: "skip", reason: "ayer comiste rico en zinc" }],
  };
  const app = createApp(deps(fakeDb({ planRow, planItemRows: [joinedItem], adjustmentRow })));
  const res = await app.request("/nutrition/supplements/day?date=2026-07-16");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.hasPlan).toBe(true);
  expect(body.entries).toHaveLength(1);
  expect(body.entries[0]).toMatchObject({
    planItemId: ITEM_ID,
    adjusted: { action: "skip", reason: "ayer comiste rico en zinc" },
  });
});

test("PUT /nutrition/supplements/takes → 404 si el ítem del plan no es del usuario", async () => {
  const app = createApp(deps(fakeDb({ ownedItemRows: [] })));
  const res = await app.request("/nutrition/supplements/takes", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: "2026-07-16", planItemId: ITEM_ID, status: "taken" }),
  });
  expect(res.status).toBe(404);
});

test("PUT /nutrition/supplements/takes → 200 feliz, el insert lleva el snapshot", async () => {
  const db = fakeDb({ ownedItemRows: [joinedItem] });
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/supplements/takes", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: "2026-07-16", planItemId: ITEM_ID, status: "deviated", actualDose: "2 g" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  const insertedTake = db._inserts.find((i: any) => i.table === supplementTake);
  expect(insertedTake.rows[0]).toMatchObject({
    supplementName: "ZMA Pro", plannedDose: "1 tableta", slot: "desayuno",
    status: "deviated", actualDose: "2 g",
  });
});

test("GET/PATCH/DELETE/explain de PR1 → 400 con id no-UUID (carry-over de familia completa)", async () => {
  const app = createApp(deps(fakeDb()));
  expect((await app.request("/nutrition/supplements/not-a-uuid")).status).toBe(400);
  expect(
    (
      await app.request("/nutrition/supplements/not-a-uuid", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "ZMA Pro", brand: null, servingLabel: "2 cápsulas",
          components: [{ name: "Zinc", amount: 10, unit: "mg" }],
          labelMaxPerDay: null, source: "label", info: null, notes: null,
        }),
      })
    ).status,
  ).toBe(400);
  expect((await app.request("/nutrition/supplements/not-a-uuid", { method: "DELETE" })).status).toBe(400);
  expect((await app.request("/nutrition/supplements/not-a-uuid/explain", { method: "POST" })).status).toBe(400);
});

test("GET /nutrition/supplements/:id → 200 feliz", async () => {
  const app = createApp(deps(fakeDb({ supRow })));
  const res = await app.request(`/nutrition/supplements/${SUP_ID}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: SUP_ID, name: "ZMA Pro" });
});

test("GET /nutrition/supplements/:id → 404 si es ajeno o no existe", async () => {
  const app = createApp(deps(fakeDb({ supRow: null })));
  const res = await app.request(`/nutrition/supplements/${SUP_ID}`);
  expect(res.status).toBe(404);
});
