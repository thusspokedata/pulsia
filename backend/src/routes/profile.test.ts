import { test, expect } from "bun:test";
import { createApp } from "../app";

const validSession = { token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) };
const validProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell"], homeEquipment: ["bodyweight"], limitations: [],
};

function fakeDb() {
  const store: Record<string, any> = {};
  return {
    _store: store,
    query: {
      sessions: { findFirst: async () => validSession },
      profiles: { findFirst: async () => store["profile"] ?? null },
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async ({ set }: any) => { store["profile"] = { ...v, ...set }; } }) }),
  };
}
const deps = (db: any) => ({ db, config: { encryptionKey: "a".repeat(64), defaultModel: "m", inviteCode: "INV", sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({}) } });
const auth = { Authorization: "Bearer t", "content-type": "application/json" };

test("GET /profile devuelve 404 si no hay perfil", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/profile", { headers: auth });
  expect(res.status).toBe(404);
});

test("PUT /profile guarda el perfil", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const put = await app.request("/profile", { method: "PUT", headers: auth, body: JSON.stringify(validProfile) });
  expect(put.status).toBe(200);
  expect(db._store["profile"].data.daysPerWeek).toBe(2);
});

test("PUT /profile rechaza perfil inválido con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/profile", { method: "PUT", headers: auth, body: JSON.stringify({ experience: "x" }) });
  expect(res.status).toBe(400);
});
