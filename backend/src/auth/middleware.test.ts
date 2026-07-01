import { test, expect } from "bun:test";
import { Hono } from "hono";
import { requireAuth } from "./middleware";

const KNOWN_TOKEN = "valid-token";

async function fakeValidate(_db: any, token: string, _ttlDays: number): Promise<string | null> {
  return token === KNOWN_TOKEN ? "user-9" : null;
}

function buildApp() {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("/protected", requireAuth({} as any, 4, fakeValidate));
  app.get("/protected", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

test("sin header Authorization devuelve 401", async () => {
  const app = buildApp();
  const res = await app.request("/protected");
  expect(res.status).toBe(401);
});

test("con token inválido devuelve 401", async () => {
  const app = buildApp();
  const res = await app.request("/protected", {
    headers: { Authorization: "Bearer bad-token" },
  });
  expect(res.status).toBe(401);
});

test("con token válido devuelve 200 y el userId", async () => {
  const app = buildApp();
  const res = await app.request("/protected", {
    headers: { Authorization: `Bearer ${KNOWN_TOKEN}` },
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ userId: "user-9" });
});
