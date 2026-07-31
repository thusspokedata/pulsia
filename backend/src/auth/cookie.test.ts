import { test, expect } from "bun:test";
import { Hono } from "hono";
import { SESSION_COOKIE, setSessionCookie, clearSessionCookie, readSessionCookie } from "./cookie";

test("setSessionCookie emite la cookie con los flags de seguridad", async () => {
  const app = new Hono();
  app.get("/", (c) => { setSessionCookie(c, "tok123"); return c.text("ok"); });
  const res = await app.request("/");
  const sc = res.headers.get("set-cookie") ?? "";
  expect(sc).toContain(`${SESSION_COOKIE}=tok123`);
  expect(sc).toContain("HttpOnly");
  expect(sc).toContain("Secure");
  expect(sc).toContain("SameSite=Strict");
  expect(sc).toContain("Path=/");
});

test("clearSessionCookie vacía la cookie", async () => {
  const app = new Hono();
  app.get("/", (c) => { clearSessionCookie(c); return c.text("ok"); });
  const res = await app.request("/");
  const sc = res.headers.get("set-cookie") ?? "";
  expect(sc).toContain(`${SESSION_COOKIE}=`);
  expect(sc).toContain("Max-Age=0");
});

test("readSessionCookie lee el token del request", async () => {
  const app = new Hono();
  app.get("/", (c) => c.text(readSessionCookie(c) ?? "none"));
  const res = await app.request("/", { headers: { Cookie: `${SESSION_COOKIE}=abc` } });
  expect(await res.text()).toBe("abc");
});
