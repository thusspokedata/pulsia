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
    },
    insert: () => ({ values: (v: any) => ({ returning: async () => { saved.push(v); return [{ ...v, id: "prog-1" }]; } }) }),
  };
}

const validProfileBody = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

function deps(db: any) {
  return {
    db,
    config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6" },
    aiClient: { generateProgram: async () => validProgram },
  };
}

test("POST /programs/generate genera y guarda el programa", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.program.name).toBe("Plan");
  expect(db._saved.length).toBe(1);
});

test("POST /programs/generate sin API key configurada devuelve 400", async () => {
  const db = fakeDb(false);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(400);
});

test("POST /programs/generate con perfil inválido devuelve 400", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validProfileBody, daysPerWeek: 99 }),
  });
  expect(res.status).toBe(400);
});
