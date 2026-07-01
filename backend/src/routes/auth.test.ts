import { test, expect } from "bun:test";
import { createApp } from "../app";
import { hashPassword } from "../auth/passwords";
import { users, sessions } from "../db/schema";

const KEY = "a".repeat(64);

function fakeDb(seedUsers: { id: string; email: string; passwordHash: string }[] = []) {
  const allUsers = [...seedUsers];
  const sessionsStore: { token: string; userId: string; expiresAt: Date }[] = [];
  let nextId = 1;
  return {
    _users: allUsers,
    _sessions: sessionsStore,
    query: {
      users: {
        findFirst: async ({ where }: any) => {
          // drizzle `eq` produces an object we can't easily introspect in a fake;
          // instead we re-derive the email by checking each user against the condition.
          for (const u of allUsers) {
            if (matchesEqCondition(where, u)) return { ...u };
          }
          return undefined;
        },
      },
    },
    insert: (table: any) => ({
      values: (v: any) => {
        if (table === users) {
          const created = { id: `user-${nextId++}`, email: v.email, passwordHash: v.passwordHash };
          allUsers.push(created);
          return {
            returning: async () => [created],
          };
        }
        if (table === sessions) {
          sessionsStore.push({ token: v.token, userId: v.userId, expiresAt: v.expiresAt });
          return Promise.resolve();
        }
        throw new Error(`unexpected insert table in fakeDb: ${String(table)}`);
      },
    }),
    delete: (table: any) => ({
      where: async (where: any) => {
        if (table !== sessions) throw new Error(`unexpected delete table in fakeDb: ${String(table)}`);
        const value = extractEqValue(where);
        const idx = sessionsStore.findIndex((s) => s.token === value);
        if (idx !== -1) sessionsStore.splice(idx, 1);
      },
    }),
  };
}

// Since we can't easily introspect a real drizzle `eq()` condition object without a
// running DB driver, the fake instead compares by re-evaluating equality against the
// `email` field encoded in the condition via drizzle-orm's SQL structure.
function matchesEqCondition(where: any, user: { email: string }): boolean {
  const value = extractEqValue(where);
  return value === user.email;
}

function extractEqValue(where: any): unknown {
  // drizzle's eq() returns a SQL object; the right-hand value is carried by a
  // `Param` chunk inside `where.queryChunks`, identifiable by its `brand` property
  // (unlike the `StringChunk` separators, which also have a `value` but no `brand`).
  if (!where || !Array.isArray(where.queryChunks)) return undefined;
  for (const chunk of where.queryChunks) {
    if (chunk && typeof chunk === "object" && "brand" in chunk && "value" in chunk) {
      return (chunk as { value: unknown }).value;
    }
  }
  return undefined;
}

function deps(db: any) {
  return {
    db,
    config: {
      encryptionKey: KEY,
      defaultModel: "claude-sonnet-4-6",
      inviteCode: "INV",
      sessionTtlDays: 4,
    },
    aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
  };
}

test("POST /auth/register con código de invitación incorrecto devuelve 403", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@example.com", password: "password1", inviteCode: "WRONG" }),
  });
  expect(res.status).toBe(403);
});

test("POST /auth/register con código correcto devuelve 200 y un token", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@example.com", password: "password1", inviteCode: "INV" }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(typeof body.token).toBe("string");
  expect(body.token.length).toBeGreaterThan(20);
});

test("POST /auth/register con email ya registrado devuelve 409", async () => {
  const existingHash = await hashPassword("password1");
  const db = fakeDb([{ id: "user-existing", email: "dup@example.com", passwordHash: existingHash }]);
  const app = createApp(deps(db) as any);
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dup@example.com", password: "password1", inviteCode: "INV" }),
  });
  expect(res.status).toBe(409);
});

test("POST /auth/login con email desconocido devuelve 401", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "nope@example.com", password: "whatever1" }),
  });
  expect(res.status).toBe(401);
});

test("POST /auth/login con contraseña incorrecta devuelve 401", async () => {
  const existingHash = await hashPassword("password1");
  const db = fakeDb([{ id: "user-existing", email: "b@example.com", passwordHash: existingHash }]);
  const app = createApp(deps(db) as any);
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "b@example.com", password: "wrongpass" }),
  });
  expect(res.status).toBe(401);
});

test("POST /auth/login con credenciales correctas devuelve 200 y un token", async () => {
  const existingHash = await hashPassword("password1");
  const db = fakeDb([{ id: "user-existing", email: "c@example.com", passwordHash: existingHash }]);
  const app = createApp(deps(db) as any);
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "c@example.com", password: "password1" }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(typeof body.token).toBe("string");
  expect(body.token.length).toBeGreaterThan(20);
});

test("POST /auth/logout devuelve ok", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/auth/logout", {
    method: "POST",
    headers: { Authorization: "Bearer sometoken" },
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
