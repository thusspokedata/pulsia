import { test, expect } from "bun:test";
import { createApp } from "../app";
import { SESSION_COOKIE } from "../auth/cookie";
import { makeTestDeps } from "../test/deps";

test("POST /auth/login setea la cookie de sesión httpOnly", async () => {
  const { deps, seedUser } = await makeTestDeps();
  await seedUser("a@b.com", "password123");
  const app = createApp(deps as any);
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@b.com", password: "password123" }),
  });
  expect(res.status).toBe(200);
  const sc = res.headers.get("set-cookie") ?? "";
  expect(sc).toContain(`${SESSION_COOKIE}=`);
  expect(sc).toContain("HttpOnly");
  // El body sigue trayendo el token (back-compat con el móvil).
  expect((await res.json()).token).toBeTruthy();
});

test("POST /auth/logout limpia la cookie", async () => {
  const { deps, seedUser } = await makeTestDeps();
  await seedUser("a@b.com", "password123");
  const app = createApp(deps as any);
  const login = await app.request("/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@b.com", password: "password123" }),
  });
  const token = (await login.json()).token;
  const res = await app.request("/auth/logout", {
    method: "POST", headers: { Cookie: `${SESSION_COOKIE}=${token}` },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
});
