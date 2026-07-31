# Web de Pulsia (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una web (React + Vite SPA) servida desde la Pi por el backend Hono existente, con login por cookie httpOnly, subida batch de `.fit`/`.csv` contra los endpoints que ya existen, y un dashboard con 4 gráficos.

**Architecture:** Workspace nuevo `web/` en el monorepo Bun. El backend recibe dos cambios chicos (auth por cookie + servir estáticos); todo lo demás lo hace el cliente contra endpoints existentes. Same-origin → cookie sin CORS. La clasificación de archivos es delgada en el cliente: `.fit` vs `.csv` por extensión, subtipo de CSV resuelto probando los endpoints `/parse` (autoritativos, no persisten), `.fit` cardio vs fuerza resuelto por el 422 de `/sessions/from-fit`.

**Tech Stack:** React 19 + Vite + TypeScript, TanStack Query, react-router, Recharts, Vitest + Testing Library. Backend: Hono (+ `hono/cookie`), Bun, Postgres/Drizzle (sin cambios de esquema).

**Convenciones del repo (obligatorias):** TDD con verificación por mutación de cada test nuevo (romper el código y confirmar que el test se queja). Commits firmados `git commit -S`, SIN atribución a Claude/Anthropic. Un PR por fase. `bun test shared backend` para back/shared; `web/` corre con `bun run --filter @pulsia/web test`.

**Contratos de API ya existentes (no se modifican, salvo lo indicado):**
- `POST /auth/login` `{email,password}` → `{token}`. `POST /auth/logout`. `POST /auth/register`.
- `requireAuth` (`backend/src/auth/middleware.ts`) lee `Authorization: Bearer <token>`.
- `POST /cardio/parse` `{fitBase64}` → `CardioActivity` (preview, no persiste).
- `POST /cardio` `{...CardioActivity, fitBase64}` → `{id}`. `source:"fit"` guarda el crudo. Dedup por segundo (409 "Ya importaste esta actividad").
- `POST /sessions/from-fit` `{fitBase64, id(uuid), location:"gym"|"home"}` → `{id}` (200) | 422 "no es fuerza" | 400.
- `POST /metrics/import/{weight,steps,sleep}/parse` `{csvBase64, tzOffsetMinutes?}` → `MetricCsvPreview` `{rows, skipped}` (no persiste).
- `POST /metrics/import/{weight,steps,sleep}` (mismos args) → `{imported, duplicates, rows, skipped}`.
- `GET /metrics?type=<MetricType>&from=<ms>&to=<ms>` → `BodyMetric[]` (`{id, metricType, value, measuredAt, ...}`, orden asc por `measuredAt`).
- `GET /sessions` → `{id, startedAt(ms), totalDurationMs, completionPct, avgHr, location, dayLabel}[]`.
- `MetricType` (de `@pulsia/shared`): incluye `weight_kg`, `body_fat_pct`, `steps`, `sleep_hours`, `sleep_score`, etc.

---

## Fase 0 — Andamiaje del workspace `web/`

### Task 1: Crear el workspace `web/` y que Vite arranque

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Modify: `package.json` (raíz, `workspaces`)

- [ ] **Step 1: Agregar `web` a los workspaces raíz**

En `package.json` (raíz), cambiar la línea de workspaces:

```json
  "workspaces": ["shared", "backend", "mobile", "web"],
```

- [ ] **Step 2: Crear `web/package.json`**

```json
{
  "name": "@pulsia/web",
  "version": "0.0.0",
  "private": true,
  "license": "AGPL-3.0-only",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@pulsia/shared": "workspace:*",
    "@tanstack/react-query": "^5.101.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.1.1",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^6.0.3",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Crear `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": [],
    "jsx": "react-jsx",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["src"]
}
```

Nota: `types: []` sobreescribe el `bun-types` del base (la web corre en browser, no Bun).

- [ ] **Step 4: Crear `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El backend Hono corre en :8787 en dev. Se proxean las rutas de API para trabajar same-origin
// sin CORS (y para que la cookie de sesión funcione igual que en prod).
const API_PREFIXES = ["/auth", "/cardio", "/sessions", "/metrics", "/health"];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  server: {
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: "http://localhost:8787", changeOrigin: true }]),
    ),
  },
});
```

- [ ] **Step 5: Crear `web/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pulsia</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Crear `web/src/App.tsx`**

```tsx
export function App() {
  return <h1>Pulsia</h1>;
}
```

- [ ] **Step 7: Crear `web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 8: Crear `web/src/test/setup.ts`** (para Vitest + jest-dom)

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 9: Instalar deps y verificar el build**

Run:
```bash
cd /Users/kilo/desarrollo26/pulsia && bun install
cd web && bun run build
```
Expected: `bun install` resuelve `@pulsia/web`; `vite build` genera `web/dist/index.html` sin errores de TS.

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lock web/
git commit -S -m "feat(web): andamiaje del workspace web (Vite + React + TS)"
```

---

### Task 2: Smoke test de render (Vitest funciona)

**Files:**
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renderiza el nombre de la app", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Pulsia" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Correr el test**

Run: `cd web && bun run test`
Expected: PASS (App ya renderiza `<h1>Pulsia</h1>`).

- [ ] **Step 3: Verificación por mutación**

Cambiar temporalmente `App.tsx` a `<h1>Otra cosa</h1>`, correr el test → debe FALLAR. Revertir.

- [ ] **Step 4: Commit**

```bash
git add web/src/App.test.tsx
git commit -S -m "test(web): smoke test de render con Vitest + Testing Library"
```

---

## Fase 1 — Auth por cookie httpOnly

### Task 3: Helpers de cookie de sesión en el backend

**Files:**
- Create: `backend/src/auth/cookie.ts`
- Test: `backend/src/auth/cookie.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
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
```

- [ ] **Step 2: Correr para ver que falla**

Run: `bun test backend/src/auth/cookie.test.ts`
Expected: FAIL ("Cannot find module './cookie'").

- [ ] **Step 3: Implementar `backend/src/auth/cookie.ts`**

```ts
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

export const SESSION_COOKIE = "pulsia_session";

// httpOnly → el JS de la página no la puede leer (a prueba de robo por XSS).
// Secure → solo por HTTPS (los browsers hacen excepción para http://localhost en dev).
// SameSite=Strict → no viaja en requests cross-site (base de la defensa CSRF).
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}
```

- [ ] **Step 4: Correr los tests**

Run: `bun test backend/src/auth/cookie.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificación por mutación**

Quitar `httpOnly: true` de `setSessionCookie` → el primer test debe FALLAR. Revertir.

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/cookie.ts backend/src/auth/cookie.test.ts
git commit -S -m "feat(backend): helpers de cookie de sesión (httpOnly/Secure/SameSite)"
```

---

### Task 4: `login`/`register` setean la cookie; `logout` la lee y la limpia

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Test: `backend/src/routes/auth.cookie.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { createApp } from "../app";
import { SESSION_COOKIE } from "../auth/cookie";
import { makeTestDeps } from "../test/deps"; // helper de tests ya usado por app.test.ts

// Si `makeTestDeps` no existe con ese nombre, replicar el patrón de backend/src/app.test.ts
// para construir `createApp` con una DB de test y un usuario dado de alta.

test("POST /auth/login setea la cookie de sesión httpOnly", async () => {
  const { deps, seedUser } = await makeTestDeps();
  await seedUser("a@b.com", "password123");
  const app = createApp(deps);
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
  const app = createApp(deps);
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
```

Nota para el implementador: revisar `backend/src/app.test.ts` para el patrón exacto de construir `deps`/DB de test y crear un usuario. Reusar ese helper; si está inline, extraer un `makeTestDeps` a `backend/src/test/deps.ts` en este mismo commit.

- [ ] **Step 2: Correr para ver que falla**

Run: `bun test backend/src/routes/auth.cookie.test.ts`
Expected: FAIL (login no emite `set-cookie`).

- [ ] **Step 3: Modificar `backend/src/routes/auth.ts`**

Agregar el import arriba:

```ts
import { setSessionCookie, clearSessionCookie, readSessionCookie } from "../auth/cookie";
```

En `/register`, reemplazar `return c.json({ token });` (línea ~28) por:

```ts
    setSessionCookie(c, token);
    return c.json({ token });
```

En `/login`, reemplazar `return c.json({ token });` (línea ~39) por:

```ts
    setSessionCookie(c, token);
    return c.json({ token });
```

Reemplazar el handler de `/logout` completo (líneas ~42-47) por:

```ts
  r.post("/logout", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const token = bearer || readSessionCookie(c) || "";
    if (token) await deleteSession(deps.db, token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });
```

- [ ] **Step 4: Correr los tests**

Run: `bun test backend/src/routes/auth.cookie.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Comentar `setSessionCookie(c, token)` en `/login` → el primer test debe FALLAR. Revertir.

- [ ] **Step 6: Correr toda la suite de auth para no romper nada**

Run: `bun test backend/src/routes/auth.test.ts backend/src/auth`
Expected: PASS (los tests de token siguen verdes; el móvil sigue recibiendo `{token}`).

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/routes/auth.cookie.test.ts backend/src/test/deps.ts
git commit -S -m "feat(backend): login/register setean cookie de sesión; logout la limpia"
```

---

### Task 5: `requireAuth` acepta la cookie + exige header anti-CSRF en mutaciones por cookie

**Files:**
- Modify: `backend/src/auth/middleware.ts`
- Test: `backend/src/auth/middleware.cookie.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
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
```

- [ ] **Step 2: Correr para ver que falla**

Run: `bun test backend/src/auth/middleware.cookie.test.ts`
Expected: FAIL (la cookie no se lee; no hay chequeo CSRF).

- [ ] **Step 3: Reescribir `backend/src/auth/middleware.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/client";
import { validateSession } from "./sessions";
import { readSessionCookie } from "./cookie";

type Validator = (db: Db, token: string, ttlDays: number) => Promise<string | null>;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireAuth(db: Db, ttlDays: number, validate: Validator = validateSession): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const cookieToken = readSessionCookie(c);
    // Precedencia: header (móvil) sobre cookie (web).
    const token = bearer || cookieToken || "";
    const viaCookie = !bearer && !!cookieToken;
    if (!token) return c.json({ error: "No autorizado" }, 401);

    // CSRF: una request que muta y se autenticó SOLO por la cookie debe traer un header custom
    // que un <form> cross-site no puede setear. El móvil (Bearer) queda exento.
    if (viaCookie && MUTATING.has(c.req.method) && !c.req.header("X-Requested-With")) {
      return c.json({ error: "Falta cabecera anti-CSRF" }, 403);
    }

    const userId = await validate(db, token, ttlDays);
    if (!userId) return c.json({ error: "Sesión inválida o expirada" }, 401);
    c.set("userId", userId);
    await next();
  };
}
```

- [ ] **Step 4: Correr los tests**

Run: `bun test backend/src/auth/middleware.cookie.test.ts backend/src/auth/middleware.test.ts`
Expected: PASS (los nuevos + los viejos de Bearer).

- [ ] **Step 5: Verificación por mutación**

Cambiar `viaCookie && MUTATING.has(...)` por `false && ...` → el test de CSRF 403 debe FALLAR. Revertir.

- [ ] **Step 6: Correr toda la suite del backend**

Run: `bun test shared backend`
Expected: PASS (sin regresiones).

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/middleware.ts backend/src/auth/middleware.cookie.test.ts
git commit -S -m "feat(backend): requireAuth acepta cookie + exige header anti-CSRF en mutaciones por cookie"
```

---

### Task 6: Cliente de API de la web (fetch same-origin, credenciales, 401)

**Files:**
- Create: `web/src/api/client.ts`
- Test: `web/src/api/client.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { apiFetch, ApiError } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

test("GET no manda X-Requested-With ni body", async () => {
  const f = mockFetch(200, { hola: 1 });
  vi.stubGlobal("fetch", f);
  const data = await apiFetch("/metrics");
  expect(data).toEqual({ hola: 1 });
  const [, init] = f.mock.calls[0];
  expect(init.credentials).toBe("same-origin");
  expect(init.headers["X-Requested-With"]).toBeUndefined();
});

test("POST agrega X-Requested-With y serializa el body", async () => {
  const f = mockFetch(200, { id: "x" });
  vi.stubGlobal("fetch", f);
  await apiFetch("/cardio", { method: "POST", body: { a: 1 } });
  const [, init] = f.mock.calls[0];
  expect(init.headers["X-Requested-With"]).toBe("fetch");
  expect(init.headers["content-type"]).toBe("application/json");
  expect(init.body).toBe(JSON.stringify({ a: 1 }));
});

test("un 401 dispara el handler de no-autorizado y lanza ApiError", async () => {
  vi.stubGlobal("fetch", mockFetch(401, { error: "no" }));
  const onUnauthorized = vi.fn();
  await expect(apiFetch("/metrics", { onUnauthorized })).rejects.toBeInstanceOf(ApiError);
  expect(onUnauthorized).toHaveBeenCalled();
});

test("un 4xx no-401 lanza ApiError con el mensaje del server", async () => {
  vi.stubGlobal("fetch", mockFetch(409, { error: "Ya importaste esta actividad" }));
  await expect(apiFetch("/cardio", { method: "POST", body: {} }))
    .rejects.toMatchObject({ status: 409, message: "Ya importaste esta actividad" });
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/api/client.test.ts`
Expected: FAIL ("Cannot find module './client'").

- [ ] **Step 3: Implementar `web/src/api/client.ts`**

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface Options {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  onUnauthorized?: () => void;
  signal?: AbortSignal;
}

// Same-origin en prod (el mismo Hono sirve la SPA) y en dev (proxy de Vite). La cookie httpOnly
// viaja sola con `credentials: "same-origin"`. Las mutaciones llevan X-Requested-With para el
// chequeo anti-CSRF del backend.
export async function apiFetch<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (method !== "GET") headers["X-Requested-With"] = "fetch";

  const res = await fetch(path, { method, headers, body, credentials: "same-origin", signal: opts.signal });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    opts.onUnauthorized?.();
    throw new ApiError(401, (data as any)?.error ?? "No autorizado");
  }
  if (!res.ok) {
    const msg = (data as any)?.error;
    throw new ApiError(res.status, typeof msg === "string" ? msg : `Error ${res.status}`);
  }
  return data as T;
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd web && bun run test src/api/client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verificación por mutación**

Cambiar `credentials: "same-origin"` por `"omit"` → el primer test debe FALLAR. Revertir.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/client.ts web/src/api/client.test.ts
git commit -S -m "feat(web): cliente de API (same-origin, cookie, anti-CSRF, manejo de 401)"
```

---

### Task 7: Estado de auth + página de login + guard de rutas

**Files:**
- Create: `web/src/auth/AuthContext.tsx`
- Create: `web/src/auth/LoginPage.tsx`
- Create: `web/src/auth/RequireSession.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/auth/AuthContext.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { status, login } = useAuth();
  return (
    <div>
      <span>estado:{status}</span>
      <button onClick={() => login("a@b.com", "password123")}>entrar</button>
    </div>
  );
}

test("empieza autenticado si /health-auth responde ok, si no anónimo", async () => {
  // La sesión se prueba pidiendo un endpoint autenticado liviano; 200 = con sesión, 401 = sin.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText("estado:anon")).toBeInTheDocument());
});

test("login exitoso pasa a autenticado", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }) // check inicial
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: "t" }) })); // login
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => screen.getByText("estado:anon"));
  await userEvent.click(screen.getByRole("button", { name: "entrar" }));
  await waitFor(() => expect(screen.getByText("estado:auth")).toBeInTheDocument());
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/auth/AuthContext.test.tsx`
Expected: FAIL ("Cannot find module './AuthContext'").

- [ ] **Step 3: Implementar `web/src/auth/AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, ApiError } from "../api/client";

type Status = "checking" | "auth" | "anon";
interface AuthValue {
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");

  // Al montar, se prueba la sesión pidiendo un endpoint autenticado liviano. La cookie httpOnly
  // no es legible desde JS, así que "¿tengo sesión?" solo se sabe preguntándole al server.
  useEffect(() => {
    apiFetch("/metrics/latest")
      .then(() => setStatus("auth"))
      .catch((e) => setStatus(e instanceof ApiError && e.status === 401 ? "anon" : "anon"));
  }, []);

  async function login(email: string, password: string) {
    await apiFetch("/auth/login", { method: "POST", body: { email, password } });
    setStatus("auth");
  }
  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    setStatus("anon");
  }

  return <Ctx.Provider value={{ status, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
```

- [ ] **Step 4: Implementar `web/src/auth/LoginPage.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { ApiError } from "../api/client";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label="login">
      <h1>Pulsia</h1>
      <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Contraseña <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
```

- [ ] **Step 5: Implementar `web/src/auth/RequireSession.tsx`**

```tsx
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { LoginPage } from "./LoginPage";

// Guard de la app: mientras chequea, nada; sin sesión, login; con sesión, el contenido.
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "checking") return null;
  if (status === "anon") return <LoginPage />;
  return <>{children}</>;
}
```

- [ ] **Step 6: Actualizar `web/src/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { RequireSession } from "./auth/RequireSession";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RequireSession>
          <h1>Dashboard</h1>
        </RequireSession>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

Nota: el `App.test.tsx` de la Task 2 ahora renderiza el árbol de auth; su assertion `heading "Pulsia"` seguirá válida en estado `checking`/`anon` (LoginPage tiene `<h1>Pulsia</h1>`). Si el test flaquea por el `useEffect`, envolver el assert en `findByRole`.

- [ ] **Step 7: Correr los tests**

Run: `cd web && bun run test`
Expected: PASS (auth + smoke).

- [ ] **Step 8: Verificación por mutación**

En `AuthContext`, hacer que `login` no llame a `setStatus("auth")` → el segundo test debe FALLAR. Revertir.

- [ ] **Step 9: Commit**

```bash
git add web/src/auth web/src/App.tsx web/src/App.test.tsx
git commit -S -m "feat(web): estado de auth, login y guard de sesión"
```

---

## Fase 2 — Subida batch de `.fit`/`.csv`

### Task 8: Clasificador de archivo por extensión

**Files:**
- Create: `web/src/upload/classify.ts`
- Test: `web/src/upload/classify.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { classifyByExtension } from "./classify";

test("detecta .fit y .FIT", () => {
  expect(classifyByExtension("actividad.fit")).toBe("fit");
  expect(classifyByExtension("ACT.FIT")).toBe("fit");
});
test("detecta .csv", () => {
  expect(classifyByExtension("peso.csv")).toBe("csv");
});
test("desconocido para otras extensiones", () => {
  expect(classifyByExtension("foto.png")).toBe("unknown");
  expect(classifyByExtension("sinextension")).toBe("unknown");
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/upload/classify.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/upload/classify.ts`**

```ts
export type FileKind = "fit" | "csv" | "unknown";

export function classifyByExtension(filename: string): FileKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "fit") return "fit";
  if (ext === "csv") return "csv";
  return "unknown";
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd web && bun run test src/upload/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Cambiar `=== "fit"` por `=== "xxx"` → el primer test debe FALLAR. Revertir.

- [ ] **Step 6: Commit**

```bash
git add web/src/upload/classify.ts web/src/upload/classify.test.ts
git commit -S -m "feat(web): clasificador de archivos por extensión"
```

---

### Task 9: Import de un archivo (orquestación fit/csv contra el backend)

**Files:**
- Create: `web/src/upload/importFile.ts`
- Test: `web/src/upload/importFile.test.ts`

Contrato del resultado:

```ts
export interface ImportResult {
  kind: "cardio" | "strength" | "weight" | "steps" | "sleep";
  imported?: number;   // CSV: filas nuevas
  duplicates?: number; // CSV: filas ya existentes
  duplicate?: boolean; // FIT: la actividad ya estaba (409)
}
```

- [ ] **Step 1: Escribir el test que falla**

```ts
import { importFile } from "./importFile";

// Helper: File a partir de contenido + nombre.
const file = (name: string, content = "x") => new File([content], name);

function fetchSeq(...responses: Array<{ status: number; body: unknown }>) {
  const f = vi.fn();
  for (const r of responses) {
    f.mockResolvedValueOnce({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body });
  }
  return f;
}

test(".fit de fuerza: from-fit responde 200 → strength", async () => {
  vi.stubGlobal("fetch", fetchSeq({ status: 200, body: { id: "s1" } }));
  const res = await importFile(file("entreno.fit"));
  expect(res).toMatchObject({ kind: "strength" });
});

test(".fit no-fuerza: from-fit 422 → cae a cardio (parse + post)", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 422, body: { error: "no es fuerza" } },     // /sessions/from-fit
    { status: 200, body: { source: "fit", startedAt: 1, kcal: 100 } }, // /cardio/parse
    { status: 200, body: { id: "c1" } },                  // /cardio
  ));
  const res = await importFile(file("caminata.fit"));
  expect(res).toMatchObject({ kind: "cardio", duplicate: false });
});

test(".fit cardio duplicado: /cardio responde 409 → duplicate:true", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 422, body: { error: "no es fuerza" } },
    { status: 200, body: { source: "fit", startedAt: 1 } },
    { status: 409, body: { error: "Ya importaste esta actividad" } },
  ));
  const res = await importFile(file("caminata.fit"));
  expect(res).toMatchObject({ kind: "cardio", duplicate: true });
});

test(".csv: prueba weight/parse (vacío) luego steps/parse (con filas) → steps", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 200, body: { rows: [], skipped: [] } },              // weight/parse
    { status: 200, body: { rows: [{ date: "2026-01-01" }], skipped: [] } }, // steps/parse
    { status: 200, body: { imported: 3, duplicates: 1 } },          // steps (persist)
  ));
  const res = await importFile(file("pasos.csv"));
  expect(res).toMatchObject({ kind: "steps", imported: 3, duplicates: 1 });
});

test(".csv sin match en ningún parser → lanza error de tipo desconocido", async () => {
  vi.stubGlobal("fetch", fetchSeq(
    { status: 200, body: { rows: [], skipped: [] } },
    { status: 200, body: { rows: [], skipped: [] } },
    { status: 200, body: { rows: [], skipped: [] } },
  ));
  await expect(importFile(file("raro.csv"))).rejects.toThrow(/no se pudo reconocer/i);
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/upload/importFile.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/upload/importFile.ts`**

```ts
import { apiFetch, ApiError } from "../api/client";
import { classifyByExtension } from "./classify";

export interface ImportResult {
  kind: "cardio" | "strength" | "weight" | "steps" | "sleep";
  imported?: number;
  duplicates?: number;
  duplicate?: boolean;
}

const CSV_TYPES = ["weight", "steps", "sleep"] as const;
type CsvType = (typeof CSV_TYPES)[number];

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function importFit(fitBase64: string): Promise<ImportResult> {
  // Fuerza primero: /sessions/from-fit toma el .fit crudo y persiste, o 422 si no es fuerza.
  const id = crypto.randomUUID();
  try {
    await apiFetch("/sessions/from-fit", { method: "POST", body: { fitBase64, id, location: "gym" } });
    return { kind: "strength" };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 422) throw e;
  }
  // No es fuerza → cardio: parsear (sin persistir) y luego persistir con un id nuevo.
  const activity = await apiFetch<Record<string, unknown>>("/cardio/parse", { method: "POST", body: { fitBase64 } });
  try {
    await apiFetch("/cardio", { method: "POST", body: { ...activity, id: crypto.randomUUID(), fitBase64 } });
    return { kind: "cardio", duplicate: false };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { kind: "cardio", duplicate: true };
    throw e;
  }
}

async function importCsv(csvBase64: string): Promise<ImportResult> {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  // Probar cada parser (no persiste); el primero que devuelve filas define el tipo.
  for (const type of CSV_TYPES) {
    const preview = await apiFetch<{ rows: unknown[] }>(`/metrics/import/${type}/parse`, {
      method: "POST", body: { csvBase64, tzOffsetMinutes },
    });
    if (preview.rows.length > 0) {
      const res = await apiFetch<{ imported: number; duplicates: number }>(`/metrics/import/${type}`, {
        method: "POST", body: { csvBase64, tzOffsetMinutes },
      });
      return { kind: type as CsvType, imported: res.imported, duplicates: res.duplicates };
    }
  }
  throw new Error("No se pudo reconocer el tipo de CSV");
}

export async function importFile(file: File): Promise<ImportResult> {
  const kind = classifyByExtension(file.name);
  if (kind === "unknown") throw new Error("Tipo de archivo no soportado");
  const base64 = await fileToBase64(file);
  return kind === "fit" ? importFit(base64) : importCsv(base64);
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd web && bun run test src/upload/importFile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verificación por mutación**

En `importFit`, borrar el `if (!(e instanceof ApiError) || e.status !== 422) throw e;` y dejar que siga siempre a cardio → el test de strength debe FALLAR (esperaría kind cardio). Revertir.

- [ ] **Step 6: Commit**

```bash
git add web/src/upload/importFile.ts web/src/upload/importFile.test.ts
git commit -S -m "feat(web): import de un archivo (fit fuerza/cardio, csv por probing)"
```

---

### Task 10: Runner del lote (concurrencia limitada, un fallo no frena el resto)

**Files:**
- Create: `web/src/upload/runBatch.ts`
- Test: `web/src/upload/runBatch.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { runBatch, type BatchItem } from "./runBatch";

test("procesa todos; un fallo no frena a los demás; reporta por archivo", async () => {
  const files = [new File(["a"], "a.fit"), new File(["b"], "b.csv"), new File(["c"], "c.fit")];
  const importer = vi.fn(async (f: File) => {
    if (f.name === "b.csv") throw new Error("boom");
    return { kind: "cardio" as const };
  });
  const updates: BatchItem[][] = [];
  const results = await runBatch(files, { concurrency: 2, importer, onUpdate: (items) => updates.push(items.map((i) => ({ ...i }))) });

  expect(results).toHaveLength(3);
  expect(results.find((r) => r.file.name === "a.fit")!.status).toBe("ok");
  expect(results.find((r) => r.file.name === "b.csv")!.status).toBe("error");
  expect(results.find((r) => r.file.name === "b.csv")!.error).toBe("boom");
  expect(results.find((r) => r.file.name === "c.fit")!.status).toBe("ok");
  expect(importer).toHaveBeenCalledTimes(3);
  expect(updates.length).toBeGreaterThan(0); // hubo notificaciones de progreso
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/upload/runBatch.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/upload/runBatch.ts`**

```ts
import type { ImportResult } from "./importFile";

export interface BatchItem {
  file: File;
  status: "pending" | "running" | "ok" | "error";
  result?: ImportResult;
  error?: string;
}

interface Opts {
  concurrency?: number;
  importer: (file: File) => Promise<ImportResult>;
  onUpdate?: (items: BatchItem[]) => void;
}

// Corre los imports con un tope de concurrencia (para no saturar la Pi). Cada archivo es
// independiente: si uno falla, se marca error y el lote sigue. Notifica el estado en cada cambio.
export async function runBatch(files: File[], opts: Opts): Promise<BatchItem[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const items: BatchItem[] = files.map((file) => ({ file, status: "pending" }));
  const notify = () => opts.onUpdate?.(items);

  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      item.status = "running"; notify();
      try {
        item.result = await opts.importer(item.file);
        item.status = "ok";
      } catch (e) {
        item.status = "error";
        item.error = e instanceof Error ? e.message : String(e);
      }
      notify();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return items;
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd web && bun run test src/upload/runBatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Reemplazar el `try/catch` por solo `item.result = await opts.importer(item.file); item.status = "ok";` (sin catch) → el test debe FALLAR (el error de b.csv aborta el lote). Revertir.

- [ ] **Step 6: Commit**

```bash
git add web/src/upload/runBatch.ts web/src/upload/runBatch.test.ts
git commit -S -m "feat(web): runner del lote con concurrencia limitada y aislamiento de fallos"
```

---

### Task 11: Pantalla de subida (dropzone + lista de resultados)

**Files:**
- Create: `web/src/upload/UploadPage.tsx`
- Test: `web/src/upload/UploadPage.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadPage } from "./UploadPage";
import * as importer from "./importFile";

test("al elegir archivos, los sube y muestra el resultado por archivo", async () => {
  vi.spyOn(importer, "importFile").mockImplementation(async (f: File) =>
    f.name.endsWith(".fit") ? { kind: "cardio", duplicate: false } : { kind: "weight", imported: 2, duplicates: 0 },
  );
  render(<UploadPage />);
  const input = screen.getByLabelText(/elegir archivos/i) as HTMLInputElement;
  await userEvent.upload(input, [new File(["a"], "a.fit"), new File(["b"], "peso.csv")]);

  await waitFor(() => {
    expect(screen.getByText("a.fit")).toBeInTheDocument();
    expect(screen.getByText("peso.csv")).toBeInTheDocument();
  });
  await waitFor(() => expect(screen.getAllByText(/importado|cardio/i).length).toBeGreaterThan(0));
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/upload/UploadPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/upload/UploadPage.tsx`**

```tsx
import { useState } from "react";
import { importFile } from "./importFile";
import { runBatch, type BatchItem } from "./runBatch";

function describe(item: BatchItem): string {
  if (item.status === "pending") return "en cola";
  if (item.status === "running") return "subiendo…";
  if (item.status === "error") return `✗ ${item.error}`;
  const r = item.result!;
  if (r.kind === "strength") return "✓ entreno de fuerza importado";
  if (r.kind === "cardio") return r.duplicate ? "• ya estaba (duplicado)" : "✓ actividad importada";
  return `✓ ${r.imported} importados / ${r.duplicates} duplicados (${r.kind})`;
}

export function UploadPage() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    await runBatch(Array.from(fileList), {
      concurrency: 3,
      importer: importFile,
      onUpdate: (next) => setItems([...next]),
    });
    setBusy(false);
  }

  return (
    <section>
      <h2>Subir archivos</h2>
      <p>Arrastrá o elegí varios <code>.fit</code> y <code>.csv</code> (peso, pasos, sueño).</p>
      <label>
        Elegir archivos
        <input type="file" multiple accept=".fit,.csv" onChange={(e) => onFiles(e.target.files)} disabled={busy} />
      </label>
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            <strong>{it.file.name}</strong> — {describe(it)}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Nota: el drag-and-drop visual se agrega en la Task 12 (el layout envuelve esta página); el `<input multiple>` ya cubre "elegir varios". Para el drop nativo, un handler `onDrop` sobre un contenedor que llame a `onFiles(e.dataTransfer.files)` — mismo camino de datos, sin lógica nueva.

- [ ] **Step 4: Correr los tests**

Run: `cd web && bun run test src/upload/UploadPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

En `onUpdate`, cambiar `setItems([...next])` por `setItems([])` → el test debe FALLAR (no aparecen los nombres). Revertir.

- [ ] **Step 6: Commit**

```bash
git add web/src/upload/UploadPage.tsx web/src/upload/UploadPage.test.tsx
git commit -S -m "feat(web): pantalla de subida batch con resultados por archivo"
```

---

## Fase 3 — Dashboard (layout + 4 gráficos)

### Task 12: Layout con barra lateral + rutas + selector de rango

**Files:**
- Create: `web/src/layout/AppLayout.tsx`
- Create: `web/src/dashboard/DateRangeContext.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/dashboard/DateRangeContext.test.tsx`

- [ ] **Step 1: Escribir el test que falla (el contexto de rango)**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeProvider, useDateRange } from "./DateRangeContext";

function Probe() {
  const { fromMs, toMs, setDays } = useDateRange();
  return (
    <div>
      <span>span:{Math.round((toMs - fromMs) / (24 * 3600 * 1000))}</span>
      <button onClick={() => setDays(30)}>30d</button>
    </div>
  );
}

test("por defecto 90 días y cambia a 30", async () => {
  render(<DateRangeProvider><Probe /></DateRangeProvider>);
  expect(screen.getByText(/^span:9[0-1]$/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "30d" }));
  expect(screen.getByText(/^span:3[0-1]$/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/dashboard/DateRangeContext.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/dashboard/DateRangeContext.tsx`**

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface RangeValue {
  fromMs: number;
  toMs: number;
  days: number;
  setDays: (d: number) => void;
}
const Ctx = createContext<RangeValue | null>(null);
const DAY = 24 * 3600 * 1000;

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [days, setDays] = useState(90);
  const value = useMemo<RangeValue>(() => {
    const toMs = Date.now();
    return { days, setDays, toMs, fromMs: toMs - days * DAY };
  }, [days]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDateRange(): RangeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDateRange fuera de DateRangeProvider");
  return v;
}
```

- [ ] **Step 4: Implementar `web/src/layout/AppLayout.tsx`**

```tsx
import { NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { useDateRange } from "../dashboard/DateRangeContext";

const RANGES = [30, 90, 365];

export function AppLayout() {
  const { logout } = useAuth();
  const { days, setDays } = useDateRange();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 200, background: "#0f172a", color: "#e2e8f0", padding: 16 }}>
        <div style={{ color: "#5eead4", fontWeight: 700, marginBottom: 16 }}>Pulsia</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/subir">Subir archivos</NavLink>
        </nav>
        <button onClick={logout} style={{ marginTop: 24 }}>Salir</button>
      </aside>
      <main style={{ flex: 1, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
          {RANGES.map((d) => (
            <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}>
              {d === 365 ? "1 año" : `${d} días`}
            </button>
          ))}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Actualizar `web/src/App.tsx` con el router**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider } from "./auth/AuthContext";
import { RequireSession } from "./auth/RequireSession";
import { DateRangeProvider } from "./dashboard/DateRangeContext";
import { AppLayout } from "./layout/AppLayout";
import { DashboardPage } from "./dashboard/DashboardPage";
import { UploadPage } from "./upload/UploadPage";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RequireSession>
          <DateRangeProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="subir" element={<UploadPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </DateRangeProvider>
        </RequireSession>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

Nota: crear un `web/src/dashboard/DashboardPage.tsx` mínimo por ahora (`export function DashboardPage(){ return <h2>Dashboard</h2>; }`) para que compile; se llena en las tasks siguientes. El `App.test.tsx` de la Task 2 espera `heading "Pulsia"`; sigue válido vía LoginPage en estado `anon`.

- [ ] **Step 6: Correr los tests**

Run: `cd web && bun run test && bun run typecheck`
Expected: PASS + sin errores de TS.

- [ ] **Step 7: Verificación por mutación**

En `DateRangeContext`, fijar `fromMs: toMs` (span 0) → el test de span debe FALLAR. Revertir.

- [ ] **Step 8: Commit**

```bash
git add web/src/layout web/src/dashboard/DateRangeContext.tsx web/src/dashboard/DateRangeContext.test.tsx web/src/dashboard/DashboardPage.tsx web/src/App.tsx
git commit -S -m "feat(web): layout con barra lateral, router y selector de rango"
```

---

### Task 13: Hooks de datos (métricas y sesiones)

**Files:**
- Create: `web/src/dashboard/useMetric.ts`
- Create: `web/src/dashboard/useSessions.ts`
- Test: `web/src/dashboard/useMetric.test.ts`

Tipos esperados del backend (subset):
```ts
export interface BodyMetric { id: string; metricType: string; value: number; measuredAt: number }
export interface SessionRow { id: string; startedAt: number; totalDurationMs: number | null; completionPct: number | null }
```

- [ ] **Step 1: Escribir el test que falla**

```ts
import { metricUrl } from "./useMetric";

test("metricUrl arma el query con type/from/to", () => {
  expect(metricUrl("weight_kg", 1000, 2000)).toBe("/metrics?type=weight_kg&from=1000&to=2000");
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/dashboard/useMetric.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/dashboard/useMetric.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { useDateRange } from "./DateRangeContext";

export interface BodyMetric { id: string; metricType: string; value: number; measuredAt: number }

export function metricUrl(type: string, fromMs: number, toMs: number): string {
  return `/metrics?type=${type}&from=${Math.round(fromMs)}&to=${Math.round(toMs)}`;
}

export function useMetric(type: string) {
  const { fromMs, toMs } = useDateRange();
  return useQuery({
    queryKey: ["metric", type, Math.round(fromMs), Math.round(toMs)],
    queryFn: () => apiFetch<BodyMetric[]>(metricUrl(type, fromMs, toMs)),
  });
}
```

- [ ] **Step 4: Implementar `web/src/dashboard/useSessions.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export interface SessionRow {
  id: string; startedAt: number; totalDurationMs: number | null; completionPct: number | null;
}

// GET /sessions no filtra por rango (es liviano); el filtrado por fecha/año lo hace el consumidor.
export function useSessions() {
  return useQuery({ queryKey: ["sessions"], queryFn: () => apiFetch<SessionRow[]>("/sessions") });
}
```

- [ ] **Step 5: Correr los tests**

Run: `cd web && bun run test src/dashboard/useMetric.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Verificación por mutación**

En `metricUrl`, borrar `&to=...` → el test debe FALLAR. Revertir.

- [ ] **Step 7: Commit**

```bash
git add web/src/dashboard/useMetric.ts web/src/dashboard/useSessions.ts web/src/dashboard/useMetric.test.ts
git commit -S -m "feat(web): hooks de datos de métricas y sesiones (TanStack Query)"
```

---

### Task 14: Serie temporal reutilizable + gráfico de Peso

**Files:**
- Create: `web/src/dashboard/toSeries.ts`
- Create: `web/src/dashboard/MetricLineCard.tsx`
- Create: `web/src/dashboard/WeightCard.tsx`
- Test: `web/src/dashboard/toSeries.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { toSeries } from "./toSeries";

test("mapea métricas a puntos {t, v} ordenados por tiempo", () => {
  const pts = toSeries([
    { id: "b", metricType: "weight_kg", value: 79, measuredAt: 2000 },
    { id: "a", metricType: "weight_kg", value: 80, measuredAt: 1000 },
  ]);
  expect(pts).toEqual([{ t: 1000, v: 80 }, { t: 2000, v: 79 }]);
});

test("lista vacía → []", () => {
  expect(toSeries([])).toEqual([]);
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/dashboard/toSeries.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/dashboard/toSeries.ts`**

```ts
import type { BodyMetric } from "./useMetric";

export interface Point { t: number; v: number }

export function toSeries(metrics: BodyMetric[]): Point[] {
  return metrics
    .map((m) => ({ t: m.measuredAt, v: m.value }))
    .sort((a, b) => a.t - b.t);
}
```

- [ ] **Step 4: Implementar `web/src/dashboard/MetricLineCard.tsx`** (tarjeta genérica de línea)

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useMetric } from "./useMetric";
import { toSeries } from "./toSeries";

const fmt = (t: number) => new Date(t).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });

export function MetricLineCard({ title, type, unit }: { title: string; type: string; unit?: string }) {
  const { data, isLoading, isError } = useMetric(type);
  const series = toSeries(data ?? []);
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <h3>{title}{unit ? ` (${unit})` : ""}</h3>
      {isLoading && <p>Cargando…</p>}
      {isError && <p role="alert">No se pudo cargar.</p>}
      {!isLoading && !isError && series.length === 0 && <p>Sin datos en el rango.</p>}
      {series.length > 0 && (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={series}>
            <XAxis dataKey="t" tickFormatter={fmt} type="number" domain={["dataMin", "dataMax"]} />
            <YAxis domain={["auto", "auto"]} />
            <Tooltip labelFormatter={(t) => fmt(Number(t))} />
            <Line type="monotone" dataKey="v" stroke="#0E7C86" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implementar `web/src/dashboard/WeightCard.tsx`**

```tsx
import { MetricLineCard } from "./MetricLineCard";

export function WeightCard() {
  return <MetricLineCard title="Peso" type="weight_kg" unit="kg" />;
}
```

- [ ] **Step 6: Correr los tests**

Run: `cd web && bun run test src/dashboard/toSeries.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Verificación por mutación**

En `toSeries`, quitar `.sort(...)` → el primer test debe FALLAR. Revertir.

- [ ] **Step 8: Commit**

```bash
git add web/src/dashboard/toSeries.ts web/src/dashboard/toSeries.test.ts web/src/dashboard/MetricLineCard.tsx web/src/dashboard/WeightCard.tsx
git commit -S -m "feat(web): serie temporal reutilizable + gráfico de peso"
```

---

### Task 15: Gráfico de Sueño

**Files:**
- Create: `web/src/dashboard/SleepCard.tsx`
- Test: `web/src/dashboard/SleepCard.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateRangeProvider } from "./DateRangeContext";
import { SleepCard } from "./SleepCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><DateRangeProvider>{ui}</DateRangeProvider></QueryClientProvider>;
}

test("pide sleep_hours y muestra el título", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
  render(wrap(<SleepCard />));
  await waitFor(() => expect(screen.getByRole("heading", { name: /sueño/i })).toBeInTheDocument());
  const url = (globalThis.fetch as any).mock.calls[0][0] as string;
  expect(url).toContain("type=sleep_hours");
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/dashboard/SleepCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/dashboard/SleepCard.tsx`**

```tsx
import { MetricLineCard } from "./MetricLineCard";

export function SleepCard() {
  return <MetricLineCard title="Sueño" type="sleep_hours" unit="h" />;
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd web && bun run test src/dashboard/SleepCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Cambiar `type="sleep_hours"` por `type="weight_kg"` → el test debe FALLAR (la URL no contiene sleep_hours). Revertir.

- [ ] **Step 6: Commit**

```bash
git add web/src/dashboard/SleepCard.tsx web/src/dashboard/SleepCard.test.tsx
git commit -S -m "feat(web): gráfico de sueño"
```

---

### Task 16: Gráfico de Pasos (barras + promedio)

**Files:**
- Create: `web/src/dashboard/StepsCard.tsx`
- Test: `web/src/dashboard/StepsCard.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateRangeProvider } from "./DateRangeContext";
import { StepsCard } from "./StepsCard";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><DateRangeProvider>{ui}</DateRangeProvider></QueryClientProvider>;
}

test("muestra el promedio de pasos del rango", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => [
      { id: "1", metricType: "steps", value: 8000, measuredAt: 1000 },
      { id: "2", metricType: "steps", value: 12000, measuredAt: 2000 },
    ],
  }));
  render(wrap(<StepsCard />));
  await waitFor(() => expect(screen.getByText(/promedio: 10\.000/)).toBeInTheDocument());
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/dashboard/StepsCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/dashboard/StepsCard.tsx`**

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useMetric } from "./useMetric";
import { toSeries } from "./toSeries";

const fmt = (t: number) => new Date(t).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });

export function StepsCard() {
  const { data, isLoading, isError } = useMetric("steps");
  const series = toSeries(data ?? []);
  const avg = series.length ? Math.round(series.reduce((a, p) => a + p.v, 0) / series.length) : 0;
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <h3>Pasos</h3>
      {isLoading && <p>Cargando…</p>}
      {isError && <p role="alert">No se pudo cargar.</p>}
      {!isLoading && !isError && series.length === 0 && <p>Sin datos en el rango.</p>}
      {series.length > 0 && (
        <>
          <p>Promedio: {avg.toLocaleString("es")}</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={series}>
              <XAxis dataKey="t" tickFormatter={fmt} type="number" domain={["dataMin", "dataMax"]} />
              <YAxis />
              <Tooltip labelFormatter={(t) => fmt(Number(t))} />
              <Bar dataKey="v" fill="#0E7C86" />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd web && bun run test src/dashboard/StepsCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

En el cálculo de `avg`, cambiar `/ series.length` por `/ 1` → el test debe FALLAR (promedio 20.000, no 10.000). Revertir.

- [ ] **Step 6: Commit**

```bash
git add web/src/dashboard/StepsCard.tsx web/src/dashboard/StepsCard.test.tsx
git commit -S -m "feat(web): gráfico de pasos con promedio"
```

---

### Task 17: Heatmap de constancia de entrenos (estilo GitHub)

**Files:**
- Create: `web/src/dashboard/heatmap.ts`
- Create: `web/src/dashboard/ConsistencyCard.tsx`
- Test: `web/src/dashboard/heatmap.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { countByLocalDay, yearOf } from "./heatmap";

test("agrupa timestamps por día local (YYYY-MM-DD) y cuenta", () => {
  const d1 = new Date(2026, 0, 5, 10).getTime(); // 5 ene
  const d2 = new Date(2026, 0, 5, 20).getTime(); // 5 ene (mismo día, otra hora)
  const d3 = new Date(2026, 0, 6, 8).getTime();  // 6 ene
  const map = countByLocalDay([d1, d2, d3]);
  expect(map.get("2026-01-05")).toBe(2);
  expect(map.get("2026-01-06")).toBe(1);
});

test("yearOf devuelve el año local del timestamp", () => {
  expect(yearOf(new Date(2026, 5, 1).getTime())).toBe(2026);
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `cd web && bun run test src/dashboard/heatmap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `web/src/dashboard/heatmap.ts`**

```ts
// Clave de día LOCAL (no UTC): el heatmap muestra "qué días entrené" según el huso del usuario.
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function yearOf(ms: number): number {
  return new Date(ms).getFullYear();
}

export function countByLocalDay(timestamps: number[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ms of timestamps) {
    const k = localDayKey(ms);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
```

- [ ] **Step 4: Implementar `web/src/dashboard/ConsistencyCard.tsx`**

```tsx
import { useState } from "react";
import { useSessions } from "./useSessions";
import { countByLocalDay, localDayKey, yearOf } from "./heatmap";

const DAY = 24 * 3600 * 1000;

// Intensidad 0..4 por cantidad de entrenos ese día (paleta teal).
function color(count: number): string {
  if (count <= 0) return "#e2e8f0";
  const shades = ["#99f6e4", "#5eead4", "#2dd4bf", "#0E7C86"];
  return shades[Math.min(count, shades.length) - 1];
}

export function ConsistencyCard() {
  const { data, isLoading, isError } = useSessions();
  const years = Array.from(new Set((data ?? []).map((s) => yearOf(s.startedAt)))).sort((a, b) => b - a);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const counts = countByLocalDay((data ?? []).map((s) => s.startedAt));

  // Grilla de todos los días del año elegido.
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year, 11, 31).getTime();
  const cells: { key: string; count: number }[] = [];
  for (let t = start; t <= end; t += DAY) {
    const key = localDayKey(t);
    cells.push({ key, count: counts.get(key) ?? 0 });
  }

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Constancia de entrenos</h3>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Año">
          {(years.length ? years : [year]).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {isLoading && <p>Cargando…</p>}
      {isError && <p role="alert">No se pudo cargar.</p>}
      {!isLoading && !isError && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(53, 1fr)", gridAutoFlow: "column", gridTemplateRows: "repeat(7, 10px)", gap: 2 }}>
          {cells.map((c) => (
            <div key={c.key} title={`${c.key}: ${c.count}`} style={{ width: 10, height: 10, borderRadius: 2, background: color(c.count) }} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Correr los tests**

Run: `cd web && bun run test src/dashboard/heatmap.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Verificación por mutación**

En `countByLocalDay`, cambiar `(map.get(k) ?? 0) + 1` por `1` → el test de conteo debe FALLAR (5 ene daría 1, no 2). Revertir.

- [ ] **Step 7: Ensamblar el dashboard** — reemplazar `web/src/dashboard/DashboardPage.tsx`:

```tsx
import { WeightCard } from "./WeightCard";
import { SleepCard } from "./SleepCard";
import { StepsCard } from "./StepsCard";
import { ConsistencyCard } from "./ConsistencyCard";

export function DashboardPage() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <WeightCard />
      <SleepCard />
      <StepsCard />
      <ConsistencyCard />
    </div>
  );
}
```

- [ ] **Step 8: Correr toda la suite web + typecheck**

Run: `cd web && bun run test && bun run typecheck && bun run build`
Expected: PASS + build OK.

- [ ] **Step 9: Commit**

```bash
git add web/src/dashboard/heatmap.ts web/src/dashboard/heatmap.test.ts web/src/dashboard/ConsistencyCard.tsx web/src/dashboard/DashboardPage.tsx
git commit -S -m "feat(web): heatmap de constancia + ensamblado del dashboard"
```

---

## Fase 4 — Servir la SPA desde Hono + deploy

### Task 18: Hono sirve los estáticos del build (catch-all → index.html)

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/app.static.test.ts`

Nota: Bun trae `Bun.file`; Hono expone `serveStatic` desde `hono/bun`. Se sirve `web/dist` en las
rutas NO tomadas por el API. Como el catch-all va al final, no intercepta `/auth`, `/cardio`, etc.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { createApp } from "./app";
import { makeTestDeps } from "./test/deps";

test("una ruta desconocida devuelve el index.html de la SPA", async () => {
  const { deps } = await makeTestDeps();
  // Se pasa un root de estáticos apuntando a un dir de fixture con un index.html conocido.
  const app = createApp({ ...deps, config: { ...deps.config, webDistDir: "backend/src/test/fixtures/webdist" } });
  const res = await app.request("/dashboard");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("<!doctype html>");
});

test("el /health sigue respondiendo JSON (no lo tapa la SPA)", async () => {
  const { deps } = await makeTestDeps();
  const app = createApp({ ...deps, config: { ...deps.config, webDistDir: "backend/src/test/fixtures/webdist" } });
  const res = await app.request("/health");
  expect(await res.json()).toEqual({ status: "ok" });
});
```

Crear el fixture `backend/src/test/fixtures/webdist/index.html`:
```html
<!doctype html><html><body>spa</body></html>
```

- [ ] **Step 2: Correr para ver que falla**

Run: `bun test backend/src/app.static.test.ts`
Expected: FAIL (no hay static ni `webDistDir`).

- [ ] **Step 3: Agregar `webDistDir` al `AppConfig`** en `backend/src/app.ts` (interface, ~línea 21):

```ts
  defaultAiApiKey?: string;
  // Dir del build de la SPA (web/dist). Si está seteado, se sirve como estáticos con
  // fallback a index.html. En dev suele estar ausente (la web corre con `vite dev`).
  webDistDir?: string;
```

- [ ] **Step 4: Servir los estáticos al FINAL de `createApp`** (antes de `return app;`):

```ts
  if (deps.config.webDistDir) {
    const root = deps.config.webDistDir;
    // Estáticos (assets con extensión) y fallback SPA a index.html para el resto.
    app.get("/assets/*", serveStatic({ root }));
    app.get("*", async (c, next) => {
      // No tapar las rutas de API ya registradas: si el método no es GET o ya hubo match, seguir.
      const html = Bun.file(`${root}/index.html`);
      if (await html.exists()) return c.html(await html.text());
      return next();
    });
  }
  return app;
```

Agregar el import arriba del archivo:
```ts
import { serveStatic } from "hono/bun";
```

Nota de orden: este bloque va DESPUÉS de todos los `app.route(...)`, así el `app.get("*")` solo
atrapa lo que ninguna ruta de API tomó. Las rutas de API responden su propio 404 JSON antes de
llegar acá porque están registradas antes.

- [ ] **Step 5: Cablear `webDistDir` en `backend/src/index.ts`**

Después de `const { databaseUrl, config } = loadServerEnv();`, pasar el dir del build al crear la app:

```ts
const app = createApp({
  db,
  config: { ...config, webDistDir: process.env.WEB_DIST_DIR ?? "/app/web/dist" },
  aiClient: new AnthropicAiClient(),
});
```

Nota: en dev local, si no existe ese dir, `Bun.file(...).exists()` es `false` y el catch-all cae a
`next()` (404 normal) — la web se sirve con `vite dev`, no por Hono. En prod el Dockerfile copia el
build a `/app/web/dist`.

- [ ] **Step 6: Correr los tests**

Run: `bun test backend/src/app.static.test.ts backend/src/app.test.ts`
Expected: PASS (SPA servida + endpoints intactos).

- [ ] **Step 7: Verificación por mutación**

Mover el bloque de estáticos ARRIBA de los `app.route(...)` → el test de `/health` debe FALLAR (la SPA tapa el endpoint). Revertir al final.

- [ ] **Step 8: Correr toda la suite**

Run: `bun test shared backend`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/app.ts backend/src/index.ts backend/src/app.static.test.ts backend/src/test/fixtures
git commit -S -m "feat(backend): servir la SPA (web/dist) con fallback a index.html"
```

---

### Task 19: Build de la web en la imagen Docker + deploy

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `deploy/docker-compose.yml` (solo si el build context excluye `web/` — verificar)
- Modify: `.dockerignore` (asegurar que `web/dist` y `web/node_modules` no rompan el context)

- [ ] **Step 1: Leer el `backend/Dockerfile` actual** y confirmar el patrón (multi-stage, Bun arm64, usuario no-root). Run: `cat backend/Dockerfile`.

- [ ] **Step 2: Agregar el build de la web al Dockerfile.** En la etapa de build (donde ya corre `bun install`), agregar tras el install:

```dockerfile
# Build de la SPA (web/dist). El monorepo ya está copiado y las deps instaladas.
RUN cd web && bun run build
```

Y en la etapa final (runtime), copiar el build junto al backend, al path que espera
`WEB_DIST_DIR` (`/app/web/dist`):

```dockerfile
COPY --from=build /app/web/dist /app/web/dist
```

Nota para el implementador: ajustar los paths exactos al layout real del Dockerfile (nombres de
etapas, WORKDIR). El objetivo: que `/app/web/dist/index.html` exista en la imagen final y que el
proceso corra con `WEB_DIST_DIR=/app/web/dist` (default ya puesto en index.ts).

- [ ] **Step 3: Verificar el `.dockerignore`.** Run: `cat .dockerignore`. Asegurar que NO excluya `web/` (se necesita para buildear) pero SÍ ignore `web/node_modules` y `web/dist` locales (se generan en la imagen). Agregar si falta:

```text
web/node_modules
web/dist
```

- [ ] **Step 4: Build local de la imagen (smoke).**

Run:
```bash
cd /Users/kilo/desarrollo26/pulsia && docker build -f backend/Dockerfile -t pulsia-web-test .
```
Expected: build OK; la etapa `cd web && bun run build` pasa; la imagen final contiene `/app/web/dist/index.html`.

- [ ] **Step 5: Verificar el contenido de la imagen.**

Run:
```bash
docker run --rm pulsia-web-test sh -c "ls /app/web/dist/index.html"
```
Expected: imprime la ruta (existe).

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile .dockerignore
git commit -S -m "build(deploy): buildear la SPA en la imagen y servirla desde el backend"
```

- [ ] **Step 7: Nota de deploy (NO ejecutar sin confirmación del owner).** El deploy a la Pi es
  automático en push a `main` (runner self-hosted). Este plan NO despliega: el merge del PR de la
  Fase 4 dispara el deploy. Antes de exponer la web públicamente, confirmar con el owner (memoria
  [[autonomous-deploy-boundary]]). No hay cambios de nginx/VPS: la web sale por el mismo dominio.

---

## Self-Review (cobertura del spec)

- **§3 Stack (web workspace, React+Vite, shared, TanStack Query, Recharts):** Tasks 1, 6, 13, 14.
- **§4 Upload batch (clasificación, fit fuerza/cardio, csv probing, resultado por archivo, dedup, un fallo no frena):** Tasks 8, 9, 10, 11.
- **§5 Seguridad (cookie httpOnly/Secure/SameSite, requireAuth cookie+header, CSRF, login-only):** Tasks 3, 4, 5, 6, 7.
- **§6 Servir SPA + deploy (Hono estáticos, Docker):** Tasks 18, 19.
- **§7 Testing:** cada task trae test + verificación por mutación.
- **§9 Gráficos (peso, sueño, pasos, heatmap + selector de rango/año):** Tasks 12, 14, 15, 16, 17.

Sin placeholders. Nombres de funciones consistentes entre tasks (`apiFetch`, `ApiError`,
`classifyByExtension`, `importFile`, `runBatch`, `useMetric`/`metricUrl`, `useSessions`, `toSeries`,
`countByLocalDay`/`localDayKey`/`yearOf`, `setSessionCookie`/`readSessionCookie`/`clearSessionCookie`).

**Ambigüedad resuelta vs el spec:** el spec decía "endpoints que ya existen" para el `.fit`; en la
práctica el `.fit` no tiene un único endpoint (cardio es 2 pasos; fuerza es 1 con 422). Se resuelve
en el cliente (Task 9) sin endpoints nuevos, preservando el diseño. El único agregado de backend son
los dos cambios ya previstos (cookie + estáticos).
