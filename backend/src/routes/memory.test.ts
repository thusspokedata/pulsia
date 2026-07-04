import { test, expect } from "bun:test";
import { createApp } from "../app";
import { encryptSecret } from "../crypto/secrets";

const KEY = "a".repeat(64);

// Fila anidada tal como la devuelve db.query.workoutSession.findMany({ with: ... }).
const nestedSessionRow = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "u1",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1,
  dayLabel: "Día 1 - Pecho",
  location: "gym",
  startedAt: 1782900000000,
  endedAt: 1782903600000,
  totalDurationMs: 3600000,
  notes: "",
  exercises: [
    {
      id: "ex-1", sessionId: "11111111-1111-4111-8111-111111111111",
      catalogId: "barbell_bench_press", garminName: "Barbell Bench Press",
      orderIndex: 0, planned: { sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 }, skipped: false,
      note: "", substitutedFromId: null,
      sets: [
        {
          id: "s-1", sessionExerciseId: "ex-1", setNumber: 1, reps: 10, weightKg: 40, rpe: 7,
          startedAt: 1782900000000, endedAt: 1782900045000, durationMs: 45000,
          repTimestamps: [0, 4000], hrAvg: null, hrMax: null, skipped: false,
        },
      ],
    },
  ],
};

function fakeDb(opts: { withKey?: boolean; memoryContent?: string | null } = {}) {
  const { withKey = true, memoryContent = "memoria vieja" } = opts;
  const upserts: any[] = [];
  return {
    _upserts: upserts,
    query: {
      settings: {
        findFirst: async () => withKey
          ? { aiApiKeyEncrypted: encryptSecret("sk-ant-real", KEY), aiModel: "claude-sonnet-4-6" }
          : null,
      },
      sessions: { findFirst: async () => ({ token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) }) },
      athleteMemory: {
        findFirst: async () => memoryContent == null ? null : { userId: "u1", content: memoryContent },
      },
      workoutSession: { findMany: async (_args: any) => [nestedSessionRow] },
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: async (_arg: any) => { upserts.push(v); },
      }),
    }),
  };
}

let lastAiInput: any = null;

function deps(db: any, updateMemoryImpl?: (input: any) => Promise<string>) {
  return {
    db,
    config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4 },
    aiClient: {
      generateProgram: async () => ({ name: "x", weeks: [] }),
      updateMemory: updateMemoryImpl ?? (async (input: any) => {
        lastAiInput = input;
        return "memoria nueva";
      }),
    },
  };
}

const authHeaders = { "content-type": "application/json", Authorization: "Bearer t" };

test("GET /memory devuelve el content guardado", async () => {
  const db = fakeDb({ memoryContent: "memoria vieja" });
  const app = createApp(deps(db) as any);
  const res = await app.request("/memory", { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.content).toBe("memoria vieja");
});

test("GET /memory sin fila guardada devuelve content vacío", async () => {
  const db = fakeDb({ memoryContent: null });
  const app = createApp(deps(db) as any);
  const res = await app.request("/memory", { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.content).toBe("");
});

test("POST /memory/refresh arma el historial, llama a la IA y persiste", async () => {
  lastAiInput = null;
  const db = fakeDb({ memoryContent: "memoria vieja" });
  const app = createApp(deps(db) as any);
  const res = await app.request("/memory/refresh", { method: "POST", headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.content).toBe("memoria nueva");

  expect(lastAiInput).not.toBeNull();
  expect(lastAiInput.current).toBe("memoria vieja");
  expect(lastAiInput.historySummary).toContain("Día 1 - Pecho");

  expect(db._upserts.length).toBe(1);
  expect(db._upserts[0].content).toBe("memoria nueva");
});

test("POST /memory/refresh sin API key configurada devuelve 400", async () => {
  const db = fakeDb({ withKey: false });
  const app = createApp(deps(db) as any);
  const res = await app.request("/memory/refresh", { method: "POST", headers: authHeaders });
  expect(res.status).toBe(400);
});

test("POST /memory/refresh sin updateMemory disponible devuelve 501", async () => {
  const db = fakeDb({ memoryContent: "memoria vieja" });
  const d: any = deps(db);
  delete d.aiClient.updateMemory;
  const app = createApp(d);
  const res = await app.request("/memory/refresh", { method: "POST", headers: authHeaders });
  expect(res.status).toBe(501);
});

test("POST /memory/refresh propaga fallo de la IA como 502", async () => {
  const db = fakeDb({ memoryContent: "memoria vieja" });
  const app = createApp(deps(db, async () => { throw new Error("boom"); }) as any);
  const res = await app.request("/memory/refresh", { method: "POST", headers: authHeaders });
  expect(res.status).toBe(502);
});
