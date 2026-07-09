import { test, expect } from "bun:test";
import { createApp } from "../app";
import { encryptSecret } from "../crypto/secrets";
import type { Program } from "@pulsia/shared";

const KEY = "a".repeat(64);
const validProgram: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", focus: "chest", exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

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

function fakeDb(withKey: boolean, opts?: { job?: any; program?: any }) {
  const saved: any[] = [];
  return {
    _saved: saved,
    query: {
      settings: {
        findFirst: async () => withKey
          ? { aiApiKeyEncrypted: encryptSecret("sk-ant-real", KEY), aiModel: "claude-sonnet-4-6" }
          : null,
      },
      sessions: { findFirst: async () => ({ token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) }) },
      workoutSession: { findMany: async (_args: any) => [nestedSessionRow] },
      athleteMemory: { findFirst: async () => ({ userId: "u1", content: "memoria previa" }) },
      // El GET generate-async scopea por (id, userId): el fake devuelve lo que cada test configure
      // (null simula job inexistente o de otro usuario → 404).
      generationJobs: { findFirst: async () => opts?.job ?? null },
      programs: { findFirst: async () => opts?.program ?? null },
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
    insert: () => ({
      values: (v: any) => ({
        returning: async () => { saved.push(v); return [{ ...v, id: "prog-1" }]; },
        onConflictDoUpdate: async () => {},
      }),
    }),
  };
}

const validProfileBody = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

let lastAiInput: any = null;

function deps(db: any, defaultAiApiKey?: string) {
  return {
    db,
    config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4, defaultAiApiKey },
    aiClient: {
      generateProgram: async (input: any) => {
        lastAiInput = input;
        return validProgram;
      },
      updateMemory: async (_input: any) => "memoria nueva",
    },
  };
}

const authHeaders = { "content-type": "application/json", Authorization: "Bearer t" };

test("POST /programs/generate genera y guarda el programa", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.program.name).toBe("Plan");
  expect(db._saved.length).toBe(1);
  expect(db._saved[0].userId).toBe("u1");
});

test("POST /programs/generate pasa historySummary con las últimas sesiones a la IA", async () => {
  lastAiInput = null;
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(200);
  expect(lastAiInput).not.toBeNull();
  expect(lastAiInput.historySummary).toContain("Día 1 - Pecho");
});

test("POST /programs/generate sin API key configurada devuelve 400", async () => {
  const db = fakeDb(false);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(400);
});

test("la generación usa la memoria guardada (el refresh es en background, no bloquea)", async () => {
  // El generador recibe la memoria YA guardada ("memoria previa"), no la refrescada en el momento:
  // el refresh (otra llamada a la IA) se dispara en background después de responder, para no alargar
  // el camino crítico (el cliente móvil corta conexiones ociosas de >~60s).
  lastAiInput = null;
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(200);
  expect(lastAiInput).not.toBeNull();
  expect(lastAiInput.memory).toBe("memoria previa");
});

test("POST /programs/generate con perfil inválido devuelve 400", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ ...validProfileBody, daysPerWeek: 99 }),
  });
  expect(res.status).toBe(400);
});

test("POST /programs/generate-oneoff (payload nuevo) pasa focus[], minutos, equipo y notas a la IA", async () => {
  lastAiInput = null;
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-oneoff", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({
      profile: validProfileBody, location: "gym",
      focus: ["chest", "triceps"], sessionMinutes: 30, equipment: ["dumbbell"], notes: "sin barra",
    }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.program.weeks.length).toBe(1);
  expect(lastAiInput.oneOff).toEqual({
    location: "gym", focus: ["chest", "triceps"], sessionMinutes: 30, equipment: ["dumbbell"], notes: "sin barra",
  });
});

test("POST /programs/generate-oneoff back-compat: focus single legacy → array", async () => {
  lastAiInput = null;
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-oneoff", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ profile: validProfileBody, location: "home", focus: "chest" }),
  });
  expect(res.status).toBe(200);
  expect(lastAiInput.oneOff.focus).toEqual(["chest"]);
  // Fallbacks: sessionMinutes del profile (45), equipment del homeEquipment (["bodyweight"])
  expect(lastAiInput.oneOff.sessionMinutes).toBe(45);
  expect(lastAiInput.oneOff.equipment).toEqual(["bodyweight"]);
});

test("POST /programs/generate-oneoff con focus vacío devuelve 400", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-oneoff", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ profile: validProfileBody, location: "gym", focus: [] }),
  });
  expect(res.status).toBe(400);
});

test("POST /programs/generate sin key de usuario pero con key del server → 200", async () => {
  const db = fakeDb(false); // settings.findFirst → null (sin aiApiKeyEncrypted)
  const app = createApp(deps(db, "sk-server-default") as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: authHeaders, body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(200);
});

test("POST /programs/generate-async devuelve un jobId y crea el job", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-async", { method: "POST", headers: authHeaders, body: JSON.stringify(validProfileBody) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(typeof body.jobId).toBe("string");
});

test("POST /programs/generate-async sin key (ni user ni server) → 400", async () => {
  const db = fakeDb(false);
  const app = createApp(deps(db) as any); // deps sin defaultAiApiKey
  const res = await app.request("/programs/generate-async", { method: "POST", headers: authHeaders, body: JSON.stringify(validProfileBody) });
  expect(res.status).toBe(400);
});

const JOB_UUID = "11111111-1111-4111-8111-111111111111";

test("GET /programs/generate-async/:jobId done → 200 con el programa", async () => {
  const db = fakeDb(true, {
    job: { id: JOB_UUID, userId: "u1", status: "done", programId: "prog-1" },
    program: { id: "prog-1", userId: "u1", data: validProgram },
  });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/programs/generate-async/${JOB_UUID}`, { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("done");
  expect(body.programId).toBe("prog-1");
  expect(body.program.name).toBe("Plan");
});

test("GET /programs/generate-async/:jobId pending → { status: pending }", async () => {
  const db = fakeDb(true, { job: { id: JOB_UUID, userId: "u1", status: "pending", programId: null, createdAt: new Date() } });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/programs/generate-async/${JOB_UUID}`, { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("pending");
});

test("GET /programs/generate-async/:jobId error → { status: error, error }", async () => {
  const db = fakeDb(true, { job: { id: JOB_UUID, userId: "u1", status: "error", programId: null, error: "IA caída" } });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/programs/generate-async/${JOB_UUID}`, { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("error");
  expect(body.error).toBe("IA caída");
});

test("GET /programs/generate-async/:jobId de otro usuario / inexistente → 404", async () => {
  const db = fakeDb(true, { job: null }); // findFirst scopea por userId → null
  const app = createApp(deps(db) as any);
  const res = await app.request(`/programs/generate-async/${JOB_UUID}`, { headers: authHeaders });
  expect(res.status).toBe(404);
});

test("GET /programs/generate-async/:jobId con jobId malformado → 404 (sin tocar la DB)", async () => {
  const db = fakeDb(true, { job: { id: JOB_UUID, userId: "u1", status: "done", programId: "prog-1" } });
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-async/no-es-uuid", { headers: authHeaders });
  expect(res.status).toBe(404);
});

test("GET /programs/generate-async/:jobId pending viejo (>10 min) → degrada a error", async () => {
  const db = fakeDb(true, {
    job: { id: JOB_UUID, userId: "u1", status: "pending", programId: null, createdAt: new Date(Date.now() - 11 * 60 * 1000) },
  });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/programs/generate-async/${JOB_UUID}`, { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("error");
});

test("GET /programs/generate-async/:jobId done pero sin programa resoluble → degrada a error", async () => {
  const db = fakeDb(true, {
    job: { id: JOB_UUID, userId: "u1", status: "done", programId: "x" },
    program: null, // el programa no existe / es de otro user
  });
  const app = createApp(deps(db) as any);
  const res = await app.request(`/programs/generate-async/${JOB_UUID}`, { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("error");
  expect(body.program).toBeUndefined();
});
