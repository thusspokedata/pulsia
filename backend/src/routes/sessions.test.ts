import { test, expect } from "bun:test";
import { createApp } from "../app";
import { SINGLE_USER_ID } from "../constants";
import { buildStrengthFitBase64, buildStrengthFitWithHrBase64, buildFitFixtureBase64 } from "../cardio/fitFixture";
import { workoutSession, setLog } from "../db/schema";

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
// `sessionAtSecond`: lo que devuelve el select().from().where() de findSessionAtSecond (dedupe del import).
function fakeDb(storedRow: any = null, recentRows: any[] | null = null, sessionAtSecond: any[] = []) {
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
    select: () => ({ from: () => ({ where: async () => sessionAtSecond }) }),
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

// ── Import de fuerza del .FIT ─────────────────────────────────────────────────────────────────
const FIT_SID = "66666666-6666-4666-8666-666666666666";
const FIT_SID2 = "77777777-7777-4777-8777-777777777777";
const postJson = (app: any, path: string, body: any) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("POST /sessions/from-fit/preview devuelve ejercicios y series con catalogId resuelto", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await postJson(app, "/sessions/from-fit/preview", { fitBase64: buildStrengthFitBase64() });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.workoutName).toBe("Push A");
  expect(body.exercises).toHaveLength(2);
  // shoulderPress#8 → dumbbell_push_press (resuelto server-side)
  expect(body.exercises[0].catalogId).toBe("dumbbell_push_press");
  expect(body.totalReps).toBe(16);
});

test("POST /sessions/from-fit/preview con un .FIT de CARDIO da 422", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await postJson(app, "/sessions/from-fit/preview", { fitBase64: buildFitFixtureBase64() }); // walking, sin subSport strength
  expect(res.status).toBe(422);
});

test("POST /sessions/from-fit persiste el entrenamiento (borra + reinserta en workout_session)", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await postJson(app, "/sessions/from-fit", { fitBase64: buildStrengthFitBase64(), id: FIT_SID, location: "home" });
  expect(res.status).toBe(200);
  expect((await res.json()).id).toBe(FIT_SID);
  expect(db._deletes.some((d: any) => d.table === workoutSession)).toBe(true);
  expect(db._inserts.some((i: any) => i.table === workoutSession)).toBe(true);
});

test("POST /sessions/from-fit guarda las series con FC y la sesión con hrSeries", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await postJson(app, "/sessions/from-fit", { fitBase64: buildStrengthFitWithHrBase64(), id: FIT_SID2, location: "gym" });
  expect(res.status).toBe(200);
  // el insert de workout_session lleva hrSeries; algún set_log lleva hrAvg (la serie con FC en su intervalo)
  const wsInsert = db._inserts.find((i: any) => i.table === workoutSession);
  expect(wsInsert.rows[0].hrSeries).toBeTruthy();
  const setInserts = db._inserts.filter((i: any) => i.table === setLog);
  expect(setInserts.some((i: any) => i.rows[0].hrAvg != null)).toBe(true);
});

test("POST /sessions/from-fit dedupea un entreno ya importado en el mismo segundo → 409, sin persistir", async () => {
  // getSessionOwnerId (findFirst) → null (id nuevo, como el de la web batch); findSessionAtSecond
  // (select().where()) → una fila ya existente en ese segundo. Debe rechazar sin borrar/insertar.
  const db = fakeDb(null, null, [{ id: "ya-existe" }]);
  const app = createApp(deps(db) as any);
  const res = await postJson(app, "/sessions/from-fit", { fitBase64: buildStrengthFitBase64(), id: FIT_SID, location: "gym" });
  expect(res.status).toBe(409);
  expect(db._inserts.some((i: any) => i.table === workoutSession)).toBe(false);
  expect(db._deletes.some((d: any) => d.table === workoutSession)).toBe(false);
});

test("POST /sessions/from-fit: re-POST del mismo id por el mismo dueño NO dispara el dedupe (idempotente)", async () => {
  // owner === userId (SINGLE_USER_ID): re-POST del MISMO id. findSessionAtSecond se encontraría a sí
  // misma en ese segundo (sessionAtSecond trae la fila), pero el guard owner==null saltea el dedupe y
  // evita el 409 falso. Debe persistir (upsert idempotente). Blinda la decisión de diseño del guard.
  const db = fakeDb({ userId: SINGLE_USER_ID }, null, [{ id: FIT_SID }]);
  const app = createApp(deps(db) as any);
  const res = await postJson(app, "/sessions/from-fit", { fitBase64: buildStrengthFitBase64(), id: FIT_SID, location: "gym" });
  expect(res.status).toBe(200);
  expect(db._inserts.some((i: any) => i.table === workoutSession)).toBe(true);
});

test("POST /sessions/from-fit con un id de otro usuario devuelve 409", async () => {
  const db = fakeDb({ userId: "otro-usuario-distinto" }); // findFirst (getSessionOwnerId) → dueño distinto
  const app = createApp(deps(db) as any);
  const res = await postJson(app, "/sessions/from-fit", { fitBase64: buildStrengthFitBase64(), id: FIT_SID, location: "gym" });
  expect(res.status).toBe(409);
});

test("POST /sessions/from-fit sin id devuelve 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await postJson(app, "/sessions/from-fit", { fitBase64: buildStrengthFitBase64() });
  expect(res.status).toBe(400);
});

test("POST /sessions/from-fit con id no-UUID se rechaza en el borde (antes de decodificar)", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await postJson(app, "/sessions/from-fit", { fitBase64: buildStrengthFitBase64(), id: "no-es-uuid" });
  expect(res.status).toBe(400);
  // El mensaje distingue el rechazo en el borde del rechazo posterior por schema: sin el guard del
  // borde, un id no-UUID caería al safeParse del ws ("...sesión inválida"), no acá.
  expect((await res.json()).error).toBe("id inválido");
});

test("PUT /sessions loguea userId + id + status (200)", async () => {
  const logs: string[] = [];
  const spy = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  try {
    const app = createApp(deps(fakeDb(null, null, [])) as any);
    const res = await app.request(`/sessions/${SID}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validSession),
    });
    expect(res.status).toBe(200);
  } finally { console.log = spy; }
  const line = logs.find((l) => l.includes("PUT /sessions") && l.includes(SID));
  expect(line).toBeTruthy();
  expect(line).toContain("200");
  expect(line).toContain(SINGLE_USER_ID);
});

test("PUT /sessions loguea status 500 si upsertSession tira (excepción no controlada)", async () => {
  // db donde getSessionOwnerId (findFirst) → null (id nuevo, no corta con 409) pero la persistencia
  // (upsertSession → db.transaction) tira: la excepción se propaga sin pasar por ninguna salida
  // conocida, y sin este log el request se perdería sin rastro en `docker logs`.
  const boomDb: any = {
    query: { workoutSession: { findFirst: async () => null, findMany: async () => [] } },
    select: () => ({ from: () => ({ where: async () => [] }) }),
    transaction: async () => { throw new Error("db down"); },
    insert: () => { throw new Error("db down"); },
    delete: () => ({ where: async () => { throw new Error("db down"); } }),
  };
  const logs: string[] = [];
  const spy = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  let res: Response;
  try {
    const app = createApp(deps(boomDb) as any);
    res = await app.request(`/sessions/${SID}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validSession),
    });
  } finally { console.log = spy; }
  expect(res!.status).toBe(500);
  const line = logs.find((l) => l.includes("PUT /sessions") && l.includes(SID) && l.includes("500"));
  expect(line).toBeTruthy();
});
