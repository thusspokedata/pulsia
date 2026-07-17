import { test, expect } from "bun:test";
import { createApp } from "../app";
import { SINGLE_USER_ID } from "../constants";
import { buildFitFixture } from "../cardio/fitFixture";

const KEY = "a".repeat(64);
const AID = "11111111-1111-4111-8111-111111111111";

const activity = {
  id: AID, type: "walk", startedAt: 1784000000000, durationMs: 1800000,
  distanceM: 2500, avgHr: 105, maxHr: 128, elevationGainM: 30,
  kcal: 140, kcalSource: "device", source: "fit", notes: "",
};

// fakeDb configurable: `rows` es lo que devuelven los SELECT de fila completa;
// `ownerId` lo que devuelve el select({userId}) de getCardioOwnerId.
function fakeDb(opts: { rows?: any[]; ownerId?: string | null } = {}) {
  const inserts: any[] = [];
  const updates: any[] = [];
  const rows = opts.rows ?? [];
  const thenableRows = (data: any[]) => {
    const p: any = Promise.resolve(data);
    p.orderBy = async () => data;      // listCardio hace .where().orderBy()
    return p;
  };
  const db: any = {
    _inserts: inserts, _updates: updates,
    insert: () => ({ values: async (v: any) => { inserts.push(v); } }),
    // select() sin args = fila completa (getCardio/listCardio/findCardioAtSecond);
    // select({userId}) = getCardioOwnerId.
    select: (proj?: any) => ({
      from: () => ({
        where: (cond: any) => proj
          ? Promise.resolve(opts.ownerId != null ? [{ userId: opts.ownerId }] : [])
          : thenableRows(rows),
      }),
    }),
    update: () => ({ set: (s: any) => ({ where: () => ({ returning: async () => { updates.push(s); return rows.length ? [{ id: AID }] : []; } }) }) }),
    delete: () => ({ where: () => ({ returning: async () => (rows.length ? [{ id: AID }] : []) }) }),
  };
  return db;
}

const deps = (db: any) => ({ db, config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", singleUserMode: true, sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) } });
// deps multi-usuario (sin single-user): exige token de sesión.
const depsAuth = (db: any) => ({ db, config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", singleUserMode: false, sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) } });

test("POST /cardio rechaza un body inválido con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...activity, type: "yoga" }) });
  expect(res.status).toBe(400);
});

test("POST /cardio fuerza kcalSource=estimate cuando el cliente dice device sin kcal", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...activity, kcal: null, kcalSource: "device", source: "manual" }) });
  expect(res.status).toBe(200);
  expect(db._inserts[0].kcalSource).toBe("estimate");
});

test("POST /cardio con source=fit y kcal del reloj → kcalSource=device", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(200);
  expect(db._inserts[0].kcalSource).toBe("device");
});

test("POST /cardio con source=fit y startedAt duplicado → 409", async () => {
  const db = fakeDb({ rows: [activity] }); // findCardioAtSecond encuentra una
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(409);
});

test("POST /cardio manual NO dedupea (aunque exista una en el mismo segundo)", async () => {
  const db = fakeDb({ rows: [activity] });
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...activity, source: "manual", kcal: null, kcalSource: "estimate" }) });
  expect(res.status).toBe(200);
});

test("POST /cardio con un id que pertenece a otro usuario → 409 (no 500 por choque de PK)", async () => {
  const db = fakeDb({ ownerId: "otro-user" }); // getCardioOwnerId ve un dueño distinto
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(409);
  expect(db._inserts.length).toBe(0);
});

test("re-POST del mismo id por el mismo usuario → 200 idempotente, SIN reinsertar", async () => {
  const db = fakeDb({ ownerId: SINGLE_USER_ID }); // el id ya existe y es del mismo usuario (retry)
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activity) });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: AID });
  expect(db._inserts.length).toBe(0);
});

test("GET /cardio/:id de otro usuario → 409 (no 404)", async () => {
  const db = fakeDb({ rows: [], ownerId: "otro-user" }); // getCardio no encuentra (no es suya), owner es otro
  const app = createApp(deps(db) as any);
  const res = await app.request(`/cardio/${AID}`);
  expect(res.status).toBe(409);
});

test("GET /cardio/:id inexistente → 404", async () => {
  const db = fakeDb({ rows: [], ownerId: null });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/cardio/${AID}`);
  expect(res.status).toBe(404);
});

test("GET /cardio SIN token (multi-usuario) devuelve 401 — no es público", async () => {
  const app = createApp(depsAuth(fakeDb()) as any);
  const res = await app.request("/cardio");
  expect(res.status).toBe(401);
});

test("GET /cardio/:id SIN token (multi-usuario) devuelve 401 — la subruta también está protegida", async () => {
  const app = createApp(depsAuth(fakeDb()) as any);
  const res = await app.request(`/cardio/${AID}`);
  expect(res.status).toBe(401);
});

test("GET /cardio con from/to no numéricos los ignora (no rompe con NaN)", async () => {
  const db = fakeDb({ rows: [activity] });
  const app = createApp(deps(db) as any);
  const res = await app.request("/cardio?from=abc&to=xyz");
  expect(res.status).toBe(200);
  expect(await res.json()).toHaveLength(1);
});

test("POST /cardio/parse devuelve el preview de un .FIT válido", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const fitB64 = Buffer.from(buildFitFixture({ sport: "walking", totalCalories: 150 })).toString("base64");
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: fitB64 }),
  });
  expect(res.status).toBe(200);
  const preview = await res.json();
  expect(preview.type).toBe("walk");
  expect(preview.kcal).toBe(150);
});

test("POST /cardio/parse rechaza algo que no es .FIT con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: Buffer.from("no soy un fit de verdad").toString("base64") }),
  });
  expect(res.status).toBe(400);
});

test("POST /cardio/parse rechaza un base64 demasiado grande con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const huge = "A".repeat(7_000_001);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: huge }),
  });
  expect(res.status).toBe(400);
  // Debe rechazar por el guard de tamaño, no por los magic bytes: un base64 de 7 MB de "A"
  // decodifica a bytes que igual fallan el magic ".FIT", así que sin este assert la mutación
  // del límite sobrevive (el 400 lo daría el otro gate). El mensaje fija el gate correcto.
  expect((await res.json()).error).toMatch(/demasiado grande/i);
});

test("POST /cardio/parse no queda capturada por /:id (orden de rutas)", async () => {
  // Con base64 vacío da 400 (lo rechaza ParseFitSchema.min(1) antes de los magic bytes): lo tomó
  // /parse. Si /:id la capturara, el POST ni siquiera matchearía (no hay POST /:id) y daría 404.
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: "" }),
  });
  expect(res.status).toBe(400);
});
