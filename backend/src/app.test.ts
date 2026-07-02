import { test, expect } from "bun:test";
import { createApp } from "./app";

const deps = {
  db: {} as any,
  config: { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6" },
  aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
};

test("GET /health responde ok", async () => {
  const app = createApp(deps as any);
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

const baseConfig = { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6", inviteCode: "x", sessionTtlDays: 4 };

test("singleUserMode saltea el auth en rutas protegidas (POST /settings sin token)", async () => {
  const fakeDb = { insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }) };
  const app = createApp({
    db: fakeDb as any,
    config: { ...baseConfig, singleUserMode: true },
    aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
  } as any);
  const res = await app.request("/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ aiApiKey: "sk-ant-x", aiModel: "claude-sonnet-4-6" }),
  });
  expect(res.status).toBe(200);
});

test("sin singleUserMode las rutas protegidas exigen token (401)", async () => {
  const app = createApp({
    db: {} as any,
    config: { ...baseConfig, singleUserMode: false },
    aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
  } as any);
  const res = await app.request("/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(res.status).toBe(401);
});
