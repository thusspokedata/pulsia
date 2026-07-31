import { test, expect } from "bun:test";
import { Hono } from "hono";
import { requireAuth } from "./middleware";
import { SESSION_COOKIE } from "./cookie";

const okValidate = async () => "user-1";
function appWith(validate = okValidate) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", requireAuth({} as any, 30, validate));
  app.get("/g", (c) => c.text(c.get("userId")));
  app.post("/m", (c) => c.text("mutado"));
  return app;
}

test("acepta el token por cookie en un GET", async () => {
  const res = await appWith().request("/g", { headers: { Cookie: `${SESSION_COOKIE}=t` } });
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("user-1");
});

test("el header Bearer tiene precedencia sobre la cookie", async () => {
  const validate = async (_db: any, token: string) => (token === "bearer-tok" ? "user-bearer" : null);
  const res = await appWith(validate).request("/g", {
    headers: { Authorization: "Bearer bearer-tok", Cookie: `${SESSION_COOKIE}=cookie-tok` },
  });
  expect(await res.text()).toBe("user-bearer");
});

test("sin token → 401", async () => {
  const res = await appWith().request("/g");
  expect(res.status).toBe(401);
});

test("mutación autenticada por COOKIE sin X-Requested-With → 403 (CSRF)", async () => {
  const res = await appWith().request("/m", { method: "POST", headers: { Cookie: `${SESSION_COOKIE}=t` } });
  expect(res.status).toBe(403);
});

test("mutación por cookie CON X-Requested-With → pasa", async () => {
  const res = await appWith().request("/m", {
    method: "POST",
    headers: { Cookie: `${SESSION_COOKIE}=t`, "X-Requested-With": "fetch" },
  });
  expect(res.status).toBe(200);
});

test("mutación por BEARER no exige X-Requested-With (móvil intacto)", async () => {
  const validate = async (_db: any, token: string) => (token === "b" ? "u" : null);
  const res = await appWith(validate).request("/m", {
    method: "POST", headers: { Authorization: "Bearer b" },
  });
  expect(res.status).toBe(200);
});
