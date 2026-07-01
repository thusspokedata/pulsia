import { test, expect } from "bun:test";
import { createApp } from "../app";
import { decryptSecret } from "../crypto/secrets";

function fakeDb() {
  const store: Record<string, any> = {};
  return {
    _store: store,
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { store["settings"] = { ...v, ...set }; },
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
