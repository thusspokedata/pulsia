import { test, expect } from "bun:test";
import { createApp } from "../app";
import { decryptSecret } from "../crypto/secrets";

function fakeDb() {
  const store: Record<string, any> = {};
  return {
    _store: store,
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => {
          // Simula upsert: si ya existe la fila, sólo aplica `set` sobre lo previo
          // (no reemplaza columnas no incluidas); si no existe, usa `values`.
          store["settings"] = store["settings"] ? { ...store["settings"], ...set } : { ...v, ...set };
        },
      }),
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    query: {
      settings: { findFirst: async () => store["settings"] ?? null },
      sessions: { findFirst: async () => ({ token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) }) },
    },
  };
}

const KEY = "a".repeat(64);
const baseDeps = (db: any) => ({
  db,
  config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4 },
  aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
});

const authHeaders = { "content-type": "application/json", Authorization: "Bearer t" };

test("POST /settings guarda la API key encriptada", async () => {
  const db = fakeDb();
  const app = createApp(baseDeps(db) as any);
  const res = await app.request("/settings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ aiApiKey: "sk-ant-secret", aiModel: "claude-sonnet-4-6" }),
  });
  expect(res.status).toBe(200);
  const stored = db._store["settings"];
  expect(stored.userId).toBe("u1");
  expect(stored.aiApiKeyEncrypted).not.toContain("sk-ant-secret");
  expect(decryptSecret(stored.aiApiKeyEncrypted, KEY)).toBe("sk-ant-secret");
});

test("GET /settings no devuelve la key en claro", async () => {
  const db = fakeDb();
  const app = createApp(baseDeps(db) as any);
  await app.request("/settings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ aiApiKey: "sk-ant-secret", aiModel: "claude-sonnet-4-6" }),
  });
  const res = await app.request("/settings", { headers: authHeaders });
  const body = await res.json();
  expect(body.hasApiKey).toBe(true);
  expect(JSON.stringify(body)).not.toContain("sk-ant-secret");
});

test("POST /settings persiste ecgEnabled + contraseña Kardia (encriptada)", async () => {
  const db = fakeDb();
  const app = createApp(baseDeps(db) as any);
  const res = await app.request("/settings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ aiApiKey: "sk-ant-secret", ecgEnabled: true, kardiaPdfPassword: "1234" }),
  });
  expect(res.status).toBe(200);
  const stored = db._store["settings"];
  expect(stored.ecgEnabled).toBe(true);
  expect(stored.kardiaPwEncrypted).not.toContain("1234");
  expect(decryptSecret(stored.kardiaPwEncrypted, KEY)).toBe("1234");
});

test("GET /settings devuelve ecgEnabled + hasKardiaPw (no el valor)", async () => {
  const db = fakeDb();
  const app = createApp(baseDeps(db) as any);
  await app.request("/settings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ aiApiKey: "sk-ant-secret", ecgEnabled: true, kardiaPdfPassword: "1234" }),
  });
  const res = await app.request("/settings", { headers: authHeaders });
  const body = await res.json();
  expect(body.ecgEnabled).toBe(true);
  expect(body.hasKardiaPw).toBe(true);
  expect(JSON.stringify(body)).not.toContain("1234");
});

test("POST /settings con {ecgEnabled} SIN aiApiKey no borra la key existente", async () => {
  const db = fakeDb();
  const app = createApp(baseDeps(db) as any);
  // Primero se guarda la key
  await app.request("/settings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ aiApiKey: "sk-ant-secret" }),
  });
  // Luego se togglea ecgEnabled sin mandar la key
  const res = await app.request("/settings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ ecgEnabled: true }),
  });
  expect(res.status).toBe(200);
  const stored = db._store["settings"];
  expect(stored.ecgEnabled).toBe(true);
  expect(decryptSecret(stored.aiApiKeyEncrypted, KEY)).toBe("sk-ant-secret");

  const get = await app.request("/settings", { headers: authHeaders });
  const body = await get.json();
  expect(body.hasApiKey).toBe(true);
});
