import { test, expect } from "bun:test";
import { createApp } from "../app";
import { ecgRecording } from "../db/schema";
import { SINGLE_USER_ID } from "../constants";

const KEY = "a".repeat(64);
const EID = "33333333-3333-4333-8333-333333333333";
const PDF_BASE64 = Buffer.from("%PDF-1.4\nfake ecg pdf bytes").toString("base64");
const NOT_PDF_BASE64 = Buffer.from("esto no es un pdf, es texto plano").toString("base64");

// fakeDb que soporta insert().values().returning(), query.ecgRecording.findFirst/findMany,
// query.settings.findFirst, delete().where(), update().set().where().
function fakeDb(opts: { row?: any; rows?: any[]; settings?: any } = {}) {
  const inserts: Array<{ table: any; rows: any[] }> = [];
  const deletes: Array<{ table: any }> = [];
  const updates: any[] = [];
  let seq = 0;
  const db: any = {
    _inserts: inserts,
    _deletes: deletes,
    _updates: updates,
    insert: (table: any) => ({
      values(v: any) {
        const rows = (Array.isArray(v) ? v : [v]).map((r) => ({
          id: r.id ?? EID,
          createdAt: r.createdAt ?? new Date(),
          status: r.status ?? "pending",
          ...r,
        }));
        inserts.push({ table, rows });
        const p: any = Promise.resolve(rows);
        p.returning = async () => rows;
        return p;
      },
    }),
    delete: (table: any) => ({ where: async () => { deletes.push({ table }); } }),
    update: () => ({ set: (v: any) => ({ where: async () => { updates.push(v); } }) }),
    query: {
      ecgRecording: {
        findFirst: async () => opts.row ?? null,
        findMany: async () => opts.rows ?? [],
      },
      settings: {
        findFirst: async () => opts.settings ?? { kardiaPwEncrypted: null, aiApiKeyEncrypted: null },
      },
    },
  };
  return db;
}

const baseConfig = { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "x", sessionTtlDays: 4 };
// aiClient con interpretEcg que resuelve → el floating promise de runEcgAnalysis no toca la red.
const aiClient = {
  generateProgram: async () => ({ name: "x", weeks: [] }),
  interpretEcg: async () => ({ kardiaVerdict: "Normal", avgHeartRate: 60, recordedAt: "2026-07-01", interpretation: "ok" }),
};
const deps = (db: any) => ({ db, config: { ...baseConfig, singleUserMode: true, defaultAiApiKey: "sk-x" }, aiClient });
const depsAuth = (db: any) => ({ db, config: { ...baseConfig, singleUserMode: false }, aiClient });

test("POST /ecg con un PDF válido → 200 { id, status: 'pending' } y encola el análisis", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/ecg", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pdfBase64: PDF_BASE64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("pending");
  expect(body.id).toBe(EID);
  expect(db._inserts.some((i: any) => i.table === ecgRecording)).toBe(true);
});

test("POST /ecg con base64 que no es un PDF → 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/ecg", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pdfBase64: NOT_PDF_BASE64 }),
  });
  expect(res.status).toBe(400);
});

test("POST /ecg con body inválido (sin pdfBase64) → 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/ecg", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
});

test("GET /ecg devuelve las grabaciones del usuario", async () => {
  const rows = [
    { id: EID, status: "done", createdAt: new Date(1782900000000), kardiaVerdict: "Normal", avgHr: 61, recordedAt: "2026-07-01", interpretation: "ok", error: null },
    { id: "otro", status: "pending", createdAt: new Date(1782800000000), kardiaVerdict: null, avgHr: null, recordedAt: null, interpretation: null, error: null },
  ];
  const app = createApp(deps(fakeDb({ rows })) as any);
  const res = await app.request("/ecg");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.recordings).toHaveLength(2);
  expect(body.recordings[0].id).toBe(EID);
  expect(body.recordings[0].analysis.kardiaVerdict).toBe("Normal");
  expect(body.recordings[1].analysis).toBeNull();
});

test("GET /ecg/:id de otro usuario → 409", async () => {
  const db = fakeDb({ row: { id: EID, userId: "otro-usuario-distinto", status: "pending", createdAt: new Date() } });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/ecg/${EID}`);
  expect(res.status).toBe(409);
});

test("GET /ecg/:id inexistente → 404", async () => {
  const app = createApp(deps(fakeDb({ row: null })) as any);
  const res = await app.request(`/ecg/${EID}`);
  expect(res.status).toBe(404);
});

test("GET /ecg/:id propio → 200 con la grabación", async () => {
  const db = fakeDb({ row: { id: EID, userId: SINGLE_USER_ID, status: "done", createdAt: new Date(1782900000000), kardiaVerdict: "Normal", avgHr: 61, recordedAt: "2026-07-01", interpretation: "ok", error: null } });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/ecg/${EID}`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.id).toBe(EID);
  expect(body.analysis.avgHeartRate).toBe(61);
});

test("DELETE /ecg/:id propio → 200 { ok: true } y borra", async () => {
  const db = fakeDb({ row: { id: EID, userId: SINGLE_USER_ID, status: "pending", createdAt: new Date() } });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/ecg/${EID}`, { method: "DELETE" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(db._deletes.some((d: any) => d.table === ecgRecording)).toBe(true);
});

test("DELETE /ecg/:id de otro usuario → 409", async () => {
  const db = fakeDb({ row: { id: EID, userId: "otro-usuario-distinto", status: "pending", createdAt: new Date() } });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/ecg/${EID}`, { method: "DELETE" });
  expect(res.status).toBe(409);
  expect(db._deletes.length).toBe(0);
});

test("GET /ecg SIN token (multi-usuario) → 401", async () => {
  const app = createApp(depsAuth(fakeDb()) as any);
  const res = await app.request("/ecg");
  expect(res.status).toBe(401);
});

test("POST /ecg SIN token (multi-usuario) → 401", async () => {
  const app = createApp(depsAuth(fakeDb()) as any);
  const res = await app.request("/ecg", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pdfBase64: PDF_BASE64 }),
  });
  expect(res.status).toBe(401);
});
