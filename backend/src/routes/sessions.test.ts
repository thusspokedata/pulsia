import { test, expect } from "bun:test";
import { createApp } from "../app";
import { workoutSession } from "../db/schema";

const KEY = "a".repeat(64);
const SID = "11111111-1111-4111-8111-111111111111";

const validSession = {
  id: SID, programId: "22222222-2222-4222-8222-222222222222", weekNumber: 1,
  dayLabel: "Día 1", location: "gym", startedAt: 1782900000000, endedAt: 1782903600000,
  totalDurationMs: 3600000, notes: "",
  exercises: [{
    catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", order: 0,
    planned: { sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 }, skipped: false,
    sets: [{ setNumber: 1, reps: 10, weightKg: 40, rpe: 7, startedAt: 1782900000000, endedAt: 1782900045000, durationMs: 45000, repTimestamps: [0, 4000], hrAvg: null, hrMax: null, skipped: false }],
  }],
};

// fakeDb que registra inserts/deletes y sirve una fila para el GET.
function fakeDb(storedRow: any = null, recentRows: any[] | null = null) {
  const inserts: Array<{ table: any; rows: any[] }> = [];
  const deletes: Array<{ table: any }> = [];
  let seq = 0;
  const insert = (table: any) => ({
    values(v: any) {
      const rows = (Array.isArray(v) ? v : [v]).map((r) => ({ id: r.id ?? `gen-${++seq}`, ...r }));
      inserts.push({ table, rows });
      const p: any = Promise.resolve(rows);
      p.returning = async () => rows;
      return p;
    },
  });
  const db: any = {
    _inserts: inserts, _deletes: deletes,
    insert,
    delete: (table: any) => ({ where: async () => { deletes.push({ table }); } }),
    transaction: async (fn: any) => fn(db),
    select: () => ({ from: () => ({ where: async () => [] }) }),
    query: {
      workoutSession: {
        findFirst: async () => storedRow,
        findMany: async () => (recentRows ?? []),
      },
    },
  };
  return db;
}

const deps = (db: any) => ({ db, config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", singleUserMode: true, sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) } });

// deps multi-usuario (sin single-user): exige token de sesión.
const depsAuth = (db: any) => ({ db, config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", singleUserMode: false, sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) } });

test("GET /sessions SIN token (multi-usuario) devuelve 401 — no es público", async () => {
  const app = createApp(depsAuth(fakeDb()) as any);
  const res = await app.request("/sessions");
  expect(res.status).toBe(401);
});

test("PUT /sessions/:id SIN token (multi-usuario) devuelve 401", async () => {
  const app = createApp(depsAuth(fakeDb()) as any);
  const res = await app.request(`/sessions/${SID}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validSession),
  });
  expect(res.status).toBe(401);
});

test("PUT /sessions/:id con un id que pertenece a otro usuario devuelve 409", async () => {
  // findFirst (getSessionOwnerId) devuelve una fila con dueño distinto al del request (SINGLE_USER_ID en single-user).
  const db = fakeDb({ userId: "otro-usuario-distinto" });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/sessions/${SID}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validSession),
  });
  expect(res.status).toBe(409);
});

test("PUT /sessions/:id guarda la sesión (borra + reinserta)", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request(`/sessions/${SID}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validSession),
  });
  expect(res.status).toBe(200);
  expect(db._deletes.some((d: any) => d.table === workoutSession)).toBe(true);
  expect(db._inserts.some((i: any) => i.table === workoutSession)).toBe(true);
});

test("PUT rechaza id de URL != id del body", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request(`/sessions/otro-id`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validSession),
  });
  expect(res.status).toBe(400);
});

test("PUT rechaza payload inválido (rpe 99)", async () => {
  const bad = structuredClone(validSession);
  bad.exercises[0].sets[0].rpe = 99;
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request(`/sessions/${SID}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(bad),
  });
  expect(res.status).toBe(400);
});

test("GET /sessions/:id devuelve la sesión", async () => {
  const storedRow = {
    id: SID, userId: "u", programId: validSession.programId, weekNumber: 1, dayLabel: "Día 1",
    location: "gym", startedAt: 1782900000000, endedAt: null, totalDurationMs: null, notes: "",
    createdAt: new Date(), updatedAt: new Date(),
    exercises: [{ id: "ex1", catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", orderIndex: 0, planned: validSession.exercises[0].planned, skipped: false, sets: [] }],
  };
  const app = createApp(deps(fakeDb(storedRow)) as any);
  const res = await app.request(`/sessions/${SID}`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.exercises[0].order).toBe(0);
});

test("GET /sessions/last-weights devuelve el mapa de últimos pesos", async () => {
  const nestedSessionRow = {
    id: SID, userId: "u", programId: validSession.programId, weekNumber: 1, dayLabel: "Día 1",
    location: "gym", startedAt: 1782900000000, endedAt: null, totalDurationMs: null, notes: "",
    createdAt: new Date(), updatedAt: new Date(),
    exercises: [{
      id: "ex1", catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", orderIndex: 0,
      planned: validSession.exercises[0].planned, skipped: false, note: null, substitutedFromId: null,
      sets: [{ setNumber: 1, reps: 8, weightKg: 40, rpe: 8, startedAt: 1, endedAt: 2, durationMs: 1, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false }],
    }],
  };
  const app = createApp(deps(fakeDb(null, [nestedSessionRow])) as any);
  const res = await app.request("/sessions/last-weights");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.barbell_bench_press).toBe(40);
});

test("GET /sessions/:id inexistente devuelve 404", async () => {
  const app = createApp(deps(fakeDb(null)) as any);
  const res = await app.request(`/sessions/${SID}`);
  expect(res.status).toBe(404);
});

test("PUT con JSON malformado devuelve 400 (no 500)", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request(`/sessions/${SID}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: "{ not json",
  });
  expect(res.status).toBe(400);
});

test("DELETE /sessions/:id borra la sesión → 200 y GET posterior da 404", async () => {
  // fakeDb con un row almacenado; el delete devuelve la fila borrada (returning) y luego el GET no la encuentra.
  const db = fakeDb({ id: SID });
  // el delete debe devolver la fila borrada para que deleteSession devuelva true
  db.delete = (table: any) => ({
    where: () => {
      const p: any = Promise.resolve([{ id: SID }]);
      p.returning = async () => [{ id: SID }];
      return p;
    },
  });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/sessions/${SID}`, { method: "DELETE" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: SID });

  // GET posterior: sin fila almacenada → 404
  const dbEmpty = fakeDb(null);
  const app2 = createApp(deps(dbEmpty) as any);
  const getRes = await app2.request(`/sessions/${SID}`);
  expect(getRes.status).toBe(404);
});

test("DELETE /sessions/:id inexistente devuelve 404", async () => {
  const db = fakeDb(null);
  db.delete = (table: any) => ({
    where: () => {
      const p: any = Promise.resolve([]);
      p.returning = async () => [];
      return p;
    },
  });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/sessions/${SID}`, { method: "DELETE" });
  expect(res.status).toBe(404);
});
