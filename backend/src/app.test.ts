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
