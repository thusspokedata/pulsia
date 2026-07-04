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

function fakeDb(withKey: boolean) {
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
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
    insert: () => ({ values: (v: any) => ({ returning: async () => { saved.push(v); return [{ ...v, id: "prog-1" }]; } }) }),
  };
}

const validProfileBody = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

let lastAiInput: any = null;

function deps(db: any) {
  return {
    db,
    config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4 },
    aiClient: {
      generateProgram: async (input: any) => {
        lastAiInput = input;
        return validProgram;
      },
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

test("POST /programs/generate con perfil inválido devuelve 400", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ ...validProfileBody, daysPerWeek: 99 }),
  });
  expect(res.status).toBe(400);
});
