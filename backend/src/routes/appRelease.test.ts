import { test, expect } from "bun:test";
import { createApp } from "../app";

function fakeDb(opts: { stored?: any } = {}) {
  let stored: any = opts.stored ?? null;
  return {
    _get: () => stored,
    query: {
      sessions: { findFirst: async () => ({ token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) }) },
      appRelease: { findFirst: async () => stored },
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
    insert: (_t: any) => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { stored = { ...(stored ?? { id: v.id }), ...v, ...set }; },
      }),
    }),
  } as any;
}

function deps(db: any, adminToken: string | undefined = "admintok") {
  return {
    db,
    config: { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4, adminToken },
    aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
  };
}

const authHeaders = { "content-type": "application/json", Authorization: "Bearer t" };
const adminHeaders = { ...authHeaders, "x-admin-token": "admintok" };

test("GET /app/latest devuelve release null cuando no hay fila (abierto, sin admin token)", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/app/latest", { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.release).toBeNull();
});

test("PUT /app/latest con admin token guarda y GET lo devuelve", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const putRes = await app.request("/app/latest", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ versionCode: 5, apkUrl: "https://x.test/a.apk" }),
  });
  expect(putRes.status).toBe(200);
  const putBody = await putRes.json();
  expect(putBody.release).toEqual({ versionCode: 5, apkUrl: "https://x.test/a.apk", label: "" });

  const getRes = await app.request("/app/latest", { headers: authHeaders });
  expect((await getRes.json()).release).toEqual({ versionCode: 5, apkUrl: "https://x.test/a.apk", label: "" });
});

test("PUT /app/latest SIN admin token → 403 (no escribe)", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/app/latest", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ versionCode: 5, apkUrl: "https://x.test/a.apk" }),
  });
  expect(res.status).toBe(403);
  expect(db._get()).toBeNull();
});

test("PUT /app/latest con admin token INCORRECTO → 403", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/app/latest", {
    method: "PUT",
    headers: { ...authHeaders, "x-admin-token": "wrong" },
    body: JSON.stringify({ versionCode: 5, apkUrl: "https://x.test/a.apk" }),
  });
  expect(res.status).toBe(403);
});

test("PUT /app/latest sin ADMIN_TOKEN configurado → 403 (fail-closed)", async () => {
  const d = deps(fakeDb());
  (d.config as any).adminToken = undefined; // simular ADMIN_TOKEN no seteado (pasar undefined al param dispara el default)
  const app = createApp(d as any);
  const res = await app.request("/app/latest", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ versionCode: 5, apkUrl: "https://x.test/a.apk" }),
  });
  expect(res.status).toBe(403);
});

test("PUT /app/latest con body inválido (y admin token) → 400", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await app.request("/app/latest", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ versionCode: -1, apkUrl: "not-a-url" }),
  });
  expect(res.status).toBe(400);
});
