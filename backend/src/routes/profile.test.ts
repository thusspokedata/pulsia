import { test, expect } from "bun:test";
import { createApp } from "../app";

const validProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell"], homeEquipment: ["bodyweight"], limitations: [],
};

// Extrae el valor comparado en un `eq(columna, valor)` de drizzle para que el
// fake pueda respetar el filtro `where` (aislamiento por usuario). Solo soporta
// ese predicado: si el shape del AST de drizzle cambia, falla fuerte y visible
// en vez de devolver undefined y dar falsos positivos.
function eqValue(where: any): string {
  const param = where?.queryChunks?.find((c: any) => c?.constructor?.name === "Param");
  if (param?.value === undefined) {
    throw new Error("fakeDb: solo soporta filtros eq(columna, valor); ¿cambió el AST de drizzle?");
  }
  return param.value;
}

// Fake keyeado por identidad: las sesiones por token y los perfiles por userId.
// Así una request autenticada como un usuario solo puede ver su propio perfil.
function fakeDb(profilesByUser: Record<string, any> = {}) {
  const sessionsByToken: Record<string, { token: string; userId: string; expiresAt: Date }> = {
    "t-u1": { token: "t-u1", userId: "u1", expiresAt: new Date(Date.now() + 1e9) },
    "t-u2": { token: "t-u2", userId: "u2", expiresAt: new Date(Date.now() + 1e9) },
  };
  return {
    _profiles: profilesByUser,
    query: {
      sessions: { findFirst: async ({ where }: any) => sessionsByToken[eqValue(where)] },
      profiles: { findFirst: async ({ where }: any) => profilesByUser[eqValue(where)] ?? null },
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { profilesByUser[v.userId] = { ...v, ...set }; },
      }),
    }),
  };
}

const deps = (db: any) => ({ db, config: { encryptionKey: "a".repeat(64), defaultModel: "m", inviteCode: "INV", sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({}) } });
const authFor = (token: string) => ({ Authorization: `Bearer ${token}`, "content-type": "application/json" });
const authU1 = authFor("t-u1");
const authU2 = authFor("t-u2");

test("GET /profile devuelve 404 si no hay perfil", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/profile", { headers: authU1 });
  expect(res.status).toBe(404);
});

test("PUT /profile guarda el perfil", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const put = await app.request("/profile", { method: "PUT", headers: authU1, body: JSON.stringify(validProfile) });
  expect(put.status).toBe(200);
  expect(db._profiles["u1"].data.daysPerWeek).toBe(2);
});

test("PUT /profile rechaza perfil inválido con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/profile", { method: "PUT", headers: authU1, body: JSON.stringify({ experience: "x" }) });
  expect(res.status).toBe(400);
});

test("un usuario no puede ver el perfil de otro", async () => {
  // Solo u1 tiene perfil guardado.
  const db = fakeDb({ u1: { userId: "u1", data: validProfile } });
  const app = createApp(deps(db) as any);

  const propio = await app.request("/profile", { headers: authU1 });
  expect(propio.status).toBe(200);
  expect(await propio.json()).toMatchObject({ daysPerWeek: 2 });

  const ajeno = await app.request("/profile", { headers: authU2 });
  expect(ajeno.status).toBe(404);
});
