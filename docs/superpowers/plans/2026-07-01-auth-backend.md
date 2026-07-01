# Pulsia Auth — Backend (auth + multi-user scoping) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar autenticación por usuario (email+password, sesiones opacas con expiración deslizante de 4 días, registro con código de invitación) y scopear todos los datos (`settings`, `programs`, `profile`) al usuario autenticado, eliminando el `SINGLE_USER_ID`.

**Architecture:** Hono sobre Bun + Postgres/Drizzle. Contraseñas con `Bun.password`. Sesiones = token opaco random en tabla `sessions` con `expiresAt` deslizante. Middleware de sesión valida el token, corre la expiración y pone `userId` en el contexto. Endpoints de auth públicos; `settings`/`programs`/`profile` protegidos y scopeados al `userId` del contexto.

**Tech Stack:** Bun (`Bun.password`, `crypto`), Hono, Drizzle ORM, Postgres, Zod, `bun test`.

---

## Notas previas (workflow)
- **PRs revisados con CodeRabbit.** Rama por PR; nunca commitear directo a `main`. Ramas: `feat/auth-<slug>`. Base: `main`.
- **Commits firmados** (`git commit -S`), Conventional Commits, sin atribución a Claude/Anthropic.
- **Bun NO en PATH:** prefijar con `export PATH="$HOME/.bun/bin:$PATH"`.
- Tests backend/shared con `bun test shared backend` desde la raíz.
- **Reset de DB dev:** este plan cambia el esquema de `users` (email/hash obligatorios) y quita el seed del usuario fijo. Antes de migrar, resetear la DB dev: `docker compose down -v && docker compose up -d` (los datos actuales son de prueba, se descartan — está en el spec §6).

## Contexto existente (no recrear)
- `backend/src/db/schema.ts`: tablas `users` (id uuid PK, createdAt), `settings` (userId PK, aiApiKeyEncrypted, aiModel), `profiles` (userId PK, data jsonb), `programs` (id, userId, name, data, profileSnapshot, createdAt), `exerciseCatalog`.
- `backend/src/constants.ts`: `SINGLE_USER_ID` (se elimina en este plan).
- `backend/src/app.ts`: `createApp(deps)` con `AppDeps { db, config, aiClient }`; monta `/health`, `/settings`, `/programs`.
- `backend/src/db/seed.ts`: seedea el usuario `SINGLE_USER_ID` + catálogo (se saca el user seed).
- `backend/src/routes/settings.ts`, `backend/src/routes/programs.ts`: usan `SINGLE_USER_ID`.
- `@pulsia/shared`: `TrainingProfileSchema`.

## File Structure

```text
backend/src/
├── db/schema.ts              # + email/passwordHash en users; + tabla sessions (modificado)
├── db/seed.ts                # quitar seed de SINGLE_USER_ID (modificado)
├── constants.ts              # ELIMINADO (ya no hay usuario fijo)
├── auth/
│   ├── passwords.ts          # hashPassword / verifyPassword (Bun.password)
│   ├── passwords.test.ts
│   ├── sessions.ts           # createSession / validateSession (sliding) / deleteSession
│   ├── sessions.test.ts
│   └── middleware.ts         # requireAuth (Hono) → c.set("userId")
├── routes/
│   ├── auth.ts               # POST /auth/register|login|logout
│   ├── auth.test.ts
│   ├── settings.ts           # usa c.get("userId") (modificado)
│   ├── programs.ts           # usa c.get("userId") (modificado)
│   ├── profile.ts            # GET/PUT /profile (nuevo)
│   └── profile.test.ts
└── app.ts                    # monta /auth (público) + requireAuth en protegidos (modificado)
```

---

## PR 1 — Esquema (users + sessions) y hasheo de contraseñas

### Task 1.1: Password hashing (TDD)

**Files:**
- Create: `backend/src/auth/passwords.ts`
- Test: `backend/src/auth/passwords.test.ts`

- [ ] **Step 1: Test que falla** (`backend/src/auth/passwords.test.ts`)

```ts
import { test, expect } from "bun:test";
import { hashPassword, verifyPassword } from "./passwords";

test("hash + verify round-trip", async () => {
  const hash = await hashPassword("secret123");
  expect(hash).not.toBe("secret123");
  expect(await verifyPassword("secret123", hash)).toBe(true);
});

test("verify rechaza password incorrecta", async () => {
  const hash = await hashPassword("secret123");
  expect(await verifyPassword("otra", hash)).toBe(false);
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH" && bun test backend/src/auth/passwords.test.ts`

- [ ] **Step 3: Implementar `backend/src/auth/passwords.ts`**

```ts
export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain); // argon2id por defecto
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout -b feat/auth-schema
git add backend/src/auth/passwords.ts backend/src/auth/passwords.test.ts
git commit -S -m "feat(backend): add password hashing with Bun.password"
```

### Task 1.2: Esquema users + sessions + migración

**Files:**
- Modify: `backend/src/db/schema.ts`
- Modify: `backend/src/db/seed.ts`
- Delete: `backend/src/constants.ts`

- [ ] **Step 1: Modificar `backend/src/db/schema.ts`** — agregar columnas a `users` y la tabla `sessions`:

Reemplazar la definición de `users` por:
```ts
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```
(Mantener `settings`, `profiles`, `programs`, `exerciseCatalog` como están.)

- [ ] **Step 2: Quitar el seed del usuario fijo en `backend/src/db/seed.ts`**

Eliminar la línea `await db.insert(users).values({ id: SINGLE_USER_ID }).onConflictDoNothing();` y el import de `SINGLE_USER_ID`/`users` si quedan sin uso. El seed queda solo con el catálogo (`buildCatalogRows` + insert en `exerciseCatalog`).

- [ ] **Step 3: Eliminar `backend/src/constants.ts`**

Run: `rm /Users/kilo/desarrollo26/pulsia/backend/src/constants.ts`
(Los usos en `settings.ts`/`programs.ts` se reemplazan en PR 3; en este PR todavía compilan porque no se toca `app.ts`. Si el typecheck se queja por los imports de `constants` en settings/programs, **dejar** `constants.ts` por ahora y eliminarlo en PR 3. Verificá con typecheck en el Step 5 y actuá en consecuencia.)

- [ ] **Step 4: Reset DB + generar/aplicar migración + seed**

```bash
cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH"
docker compose down -v && docker compose up -d && sleep 3
cd backend && bun run db:generate && bun run db:migrate && bun run db:seed && cd ..
```
Expected: migración aplicada; seed imprime "Seeded N exercises" (sin usuario fijo). Verificar tablas:
```bash
docker compose exec -T db psql -U pulsia -d pulsia -c "\d sessions" -c "\d users"
```

- [ ] **Step 5: Typecheck**

Run: `cd /Users/kilo/desarrollo26/pulsia/backend && export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck`
Expected: si `constants.ts` se eliminó y settings/programs lo importan, va a fallar → en ese caso restaurá `constants.ts` (no lo borres hasta PR 3). Objetivo: typecheck limpio.

- [ ] **Step 6: Commit + PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/db/schema.ts backend/src/db/seed.ts backend/drizzle backend/src/constants.ts
git commit -S -m "feat(backend): add email/passwordHash to users and sessions table"
git push -u origin feat/auth-schema
gh pr create --base main --title "Auth — esquema users + sessions y hasheo" --body "Columnas email/passwordHash en users, tabla sessions (token opaco + expiresAt deslizante), hasheo con Bun.password. Reset de DB dev requerido (datos de prueba)."
```

---

## PR 2 — Sesiones, middleware y endpoints de auth

### Task 2.1: Servicio de sesiones (TDD)

**Files:**
- Create: `backend/src/auth/sessions.ts`
- Test: `backend/src/auth/sessions.test.ts`

> `validateSession` corre la expiración a +TTL en cada validación exitosa (deslizante). Los tests usan un fake db mínimo que simula la tabla `sessions`.

- [ ] **Step 1: Test que falla** (`backend/src/auth/sessions.test.ts`)

```ts
import { test, expect } from "bun:test";
import { createSession, validateSession, deleteSession } from "./sessions";

function fakeDb() {
  const rows = new Map<string, { token: string; userId: string; expiresAt: Date }>();
  return {
    _rows: rows,
    insert: () => ({ values: async (v: any) => { rows.set(v.token, v); } }),
    query: {
      sessions: {
        findFirst: async ({ where }: any) => {
          // where nos pasa el token vía un matcher simple que guardamos en _lastToken
          return rows.get((globalThis as any)._lastToken) ?? null;
        },
      },
    },
    update: () => ({ set: (s: any) => ({ where: async () => {
      const row = rows.get((globalThis as any)._lastToken);
      if (row) Object.assign(row, s);
    } }) }),
    delete: () => ({ where: async () => { rows.delete((globalThis as any)._lastToken); } }),
  };
}

const TTL_DAYS = 4;

test("createSession guarda y devuelve un token", async () => {
  const db = fakeDb();
  const token = await createSession(db as any, "user-1", TTL_DAYS);
  expect(typeof token).toBe("string");
  expect(token.length).toBeGreaterThan(20);
  expect(db._rows.get(token)?.userId).toBe("user-1");
});

test("validateSession devuelve userId y corre la expiración", async () => {
  const db = fakeDb();
  const token = await createSession(db as any, "user-1", TTL_DAYS);
  (globalThis as any)._lastToken = token;
  const before = db._rows.get(token)!.expiresAt.getTime();
  await new Promise((r) => setTimeout(r, 5));
  const userId = await validateSession(db as any, token, TTL_DAYS);
  expect(userId).toBe("user-1");
  expect(db._rows.get(token)!.expiresAt.getTime()).toBeGreaterThanOrEqual(before);
});

test("validateSession devuelve null si está expirada", async () => {
  const db = fakeDb();
  const token = await createSession(db as any, "user-1", TTL_DAYS);
  (globalThis as any)._lastToken = token;
  db._rows.get(token)!.expiresAt = new Date(Date.now() - 1000);
  expect(await validateSession(db as any, token, TTL_DAYS)).toBeNull();
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH" && bun test backend/src/auth/sessions.test.ts`

- [ ] **Step 3: Implementar `backend/src/auth/sessions.ts`**

```ts
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { sessions } from "../db/schema";
import type { Db } from "../db/client";

function expiryFromNow(ttlDays: number): Date {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

export async function createSession(db: Db, userId: string, ttlDays: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ token, userId, expiresAt: expiryFromNow(ttlDays) });
  return token;
}

export async function validateSession(db: Db, token: string, ttlDays: number): Promise<string | null> {
  const row = await db.query.sessions.findFirst({ where: eq(sessions.token, token) });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  await db.update(sessions).set({ expiresAt: expiryFromNow(ttlDays) }).where(eq(sessions.token, token));
  return row.userId;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}
```
> Nota: los tests usan `_lastToken` global para simular el `where` de Drizzle; en runtime real el `where: eq(...)` funciona normalmente.

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout -b feat/auth-endpoints
git add backend/src/auth/sessions.ts backend/src/auth/sessions.test.ts
git commit -S -m "feat(backend): add opaque session service with sliding expiry"
```

### Task 2.2: Middleware de sesión (TDD)

**Files:**
- Create: `backend/src/auth/middleware.ts`
- Test: `backend/src/auth/middleware.test.ts`

- [ ] **Step 1: Test que falla** (`backend/src/auth/middleware.test.ts`)

```ts
import { test, expect } from "bun:test";
import { Hono } from "hono";
import { requireAuth } from "./middleware";

function appWith(validToken: string | null) {
  const app = new Hono();
  const db = {} as any;
  // Inyectamos un validador fake vía dependencia del middleware.
  app.use("/protected", requireAuth(db, 4, async (_db, token) => (token === validToken ? "user-9" : null)));
  app.get("/protected", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

test("401 sin header Authorization", async () => {
  const res = await appWith("tok").request("/protected");
  expect(res.status).toBe(401);
});

test("401 con token inválido", async () => {
  const res = await appWith("tok").request("/protected", { headers: { Authorization: "Bearer nope" } });
  expect(res.status).toBe(401);
});

test("pasa y setea userId con token válido", async () => {
  const res = await appWith("tok").request("/protected", { headers: { Authorization: "Bearer tok" } });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ userId: "user-9" });
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH" && bun test backend/src/auth/middleware.test.ts`

- [ ] **Step 3: Implementar `backend/src/auth/middleware.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/client";
import { validateSession } from "./sessions";

type Validator = (db: Db, token: string, ttlDays: number) => Promise<string | null>;

// El validador es inyectable para testear; por defecto usa validateSession real.
export function requireAuth(db: Db, ttlDays: number, validate: Validator = validateSession): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return c.json({ error: "No autorizado" }, 401);
    const userId = await validate(db, token, ttlDays);
    if (!userId) return c.json({ error: "Sesión inválida o expirada" }, 401);
    c.set("userId", userId);
    await next();
  };
}
```
> Nota: el test pasa un `validate` fake con la firma `(db, token) => ...`; la firma real es `(db, token, ttlDays)`. Ajustar el fake del test a `(_db, token, _ttl)` si el typecheck lo pide.

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/auth/middleware.ts backend/src/auth/middleware.test.ts
git commit -S -m "feat(backend): add session auth middleware"
```

### Task 2.3: Endpoints de auth (TDD)

**Files:**
- Create: `backend/src/routes/auth.ts`
- Modify: `backend/src/app.ts` (montar `/auth` y sumar config `inviteCode`, `sessionTtlDays`)
- Test: `backend/src/routes/auth.test.ts`

- [ ] **Step 1: Extender `AppConfig` en `backend/src/app.ts`** — agregar `inviteCode: string;` y `sessionTtlDays: number;` a la interfaz `AppConfig`, y en `createApp` montar (antes del `return app`):
```ts
import { authRoutes } from "./routes/auth";
// ...
  app.route("/auth", authRoutes(deps));
```
Y en `backend/src/index.ts`, al construir `config`, agregar:
```ts
    inviteCode: process.env.INVITE_CODE!,
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 4),
```
Y sumar a `backend/.env.example`:
```dotenv
INVITE_CODE=cambiame
SESSION_TTL_DAYS=4
```

- [ ] **Step 2: Test que falla** (`backend/src/routes/auth.test.ts`)

```ts
import { test, expect } from "bun:test";
import { createApp } from "../app";

function fakeDb() {
  const users: any[] = [];
  const sessions: any[] = [];
  return {
    _users: users, _sessions: sessions,
    insert: (table: any) => ({
      values: async (v: any) => {
        if (String(table).includes("session") || v.token) sessions.push(v);
        else users.push({ id: `u${users.length + 1}`, ...v });
        return undefined;
      },
      returning: async () => { const row = { id: `u${users.length + 1}`, ...({} as any) }; return [row]; },
    }),
    query: {
      users: { findFirst: async ({ where }: any) => users.find((u) => u.email === (globalThis as any)._email) ?? null },
    },
  };
}

const deps = (db: any) => ({
  db,
  config: { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4 },
  aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
});

test("register rechaza código de invitación inválido con 403", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/auth/register", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@b.com", password: "secret123", inviteCode: "MAL" }),
  });
  expect(res.status).toBe(403);
});

test("register con código válido devuelve token", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/auth/register", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@b.com", password: "secret123", inviteCode: "INV" }),
  });
  expect(res.status).toBe(200);
  expect(typeof (await res.json()).token).toBe("string");
});
```
> Este fake db es intencionalmente mínimo y puede requerir ajustes según cómo el handler arme las queries. El implementador puede refinar el fake para reflejar las llamadas reales (`db.insert(users).returning()`, `db.query.users.findFirst`, `createSession`). Lo esencial a testear: 403 con código inválido, 200 + token con código válido, y (agregar) 409 si el email ya existe y 401 en login con credenciales inválidas.

- [ ] **Step 3: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH" && bun test backend/src/routes/auth.test.ts`

- [ ] **Step 4: Implementar `backend/src/routes/auth.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { createSession, deleteSession } from "../auth/sessions";
import type { AppDeps } from "../app";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteCode: z.string().min(1),
});
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export function authRoutes(deps: AppDeps) {
  const r = new Hono();

  r.post("/register", async (c) => {
    const parsed = RegisterSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    if (parsed.data.inviteCode !== deps.config.inviteCode) return c.json({ error: "Código de invitación inválido" }, 403);
    const existing = await deps.db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
    if (existing) return c.json({ error: "Ese email ya está registrado" }, 409);
    const passwordHash = await hashPassword(parsed.data.password);
    const inserted = await deps.db.insert(users).values({ email: parsed.data.email, passwordHash }).returning();
    const token = await createSession(deps.db, inserted[0].id, deps.config.sessionTtlDays);
    return c.json({ token });
  });

  r.post("/login", async (c) => {
    const parsed = LoginSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const user = await deps.db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return c.json({ error: "Email o contraseña incorrectos" }, 401);
    }
    const token = await createSession(deps.db, user.id, deps.config.sessionTtlDays);
    return c.json({ token });
  });

  r.post("/logout", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token) await deleteSession(deps.db, token);
    return c.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 5: Correr → PASS** (ajustar el fake db del test si hace falta para reflejar `returning()` y `findFirst`).

- [ ] **Step 6: Suite backend + typecheck**

Run: `cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH" && bun test shared backend && (cd backend && bun run typecheck)`

- [ ] **Step 7: Commit + PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/routes/auth.ts backend/src/routes/auth.test.ts backend/src/app.ts backend/src/index.ts backend/.env.example
git commit -S -m "feat(backend): add register/login/logout endpoints"
git push -u origin feat/auth-endpoints
gh pr create --base main --title "Auth — endpoints register/login/logout + middleware" --body "Servicio de sesiones (sliding expiry), middleware de auth, y endpoints /auth/register (con código de invitación), /auth/login, /auth/logout. Sesiones opacas en DB."
```

---

## PR 3 — Scoping al usuario autenticado + perfil server-side

### Task 3.1: Proteger y scopear settings/programs (TDD)

**Files:**
- Modify: `backend/src/app.ts` (aplicar `requireAuth` a `/settings`, `/programs`, `/profile`)
- Modify: `backend/src/routes/settings.ts`, `backend/src/routes/programs.ts` (usar `c.get("userId")`)
- Delete: `backend/src/constants.ts` (si aún existe)
- Modify: `backend/src/routes/settings.test.ts`, `backend/src/routes/programs.test.ts` (inyectar userId)

- [ ] **Step 1: Tipar `userId` en el contexto de Hono.** En `backend/src/app.ts`, definir el tipo de variables de Hono y aplicar el middleware. Cambiar `createApp` para:
```ts
import { requireAuth } from "./auth/middleware";
// ...
export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/auth", authRoutes(deps));
  const auth = requireAuth(deps.db, deps.config.sessionTtlDays);
  app.use("/settings/*", auth);
  app.use("/settings", auth);
  app.use("/programs/*", auth);
  app.use("/profile/*", auth);
  app.use("/profile", auth);
  app.route("/settings", settingsRoutes(deps));
  app.route("/programs", programsRoutes(deps));
  app.route("/profile", profileRoutes(deps));
  return app;
}
```

- [ ] **Step 2: `settings.ts` usa `c.get("userId")`** — reemplazar `SINGLE_USER_ID` por `const userId = c.get("userId");` en ambos handlers (POST usa `userId` en el insert/onConflict; GET filtra por `userId`). Importar nada de `constants`. El `GET` debe filtrar por el usuario:
```ts
r.get("/", async (c) => {
  const userId = c.get("userId");
  const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
  return c.json({ hasApiKey: !!row?.aiApiKeyEncrypted, aiModel: row?.aiModel ?? deps.config.defaultModel });
});
```
(agregar `import { eq } from "drizzle-orm";` y usar `userId` en el POST `values`/`onConflictDoUpdate target: settings.userId`).

- [ ] **Step 3: `programs.ts` usa `c.get("userId")`** — reemplazar `SINGLE_USER_ID` por `const userId = c.get("userId");` en el insert del programa. Quitar el import de `constants`.

- [ ] **Step 4: Eliminar `backend/src/constants.ts`** (ya sin usos): `rm backend/src/constants.ts`.

- [ ] **Step 5: Actualizar los tests de settings/programs** para pasar por auth. La forma más simple: en `createApp`, el middleware real hace `validateSession(db,...)`. En los tests, extender el fake db para que `query.sessions.findFirst` devuelva `{ userId: "u1", expiresAt: <futuro> }` para cualquier token, y mandar `headers: { Authorization: "Bearer t" }` en cada request. Agregar al fake db:
```ts
query: {
  settings: { findFirst: async () => /* ... */ },
  sessions: { findFirst: async () => ({ token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) }) },
},
update: () => ({ set: () => ({ where: async () => {} }) }),
```
y en cada `app.request(...)` sumar el header `Authorization: "Bearer t"`. Los asserts existentes (200/400, key encriptada, etc.) se mantienen. Ajustar el insert de settings/programs para usar `userId: "u1"`.

- [ ] **Step 6: Correr los tests de settings/programs → PASS**

Run: `cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH" && bun test backend/src/routes/settings.test.ts backend/src/routes/programs.test.ts`

- [ ] **Step 7: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout -b feat/auth-scoping
git add backend/src/app.ts backend/src/routes/settings.ts backend/src/routes/programs.ts backend/src/routes/settings.test.ts backend/src/routes/programs.test.ts
git rm backend/src/constants.ts 2>/dev/null || true
git commit -S -m "feat(backend): scope settings and programs to authenticated user"
```

### Task 3.2: Endpoints de perfil server-side (TDD)

**Files:**
- Create: `backend/src/routes/profile.ts`
- Test: `backend/src/routes/profile.test.ts`

- [ ] **Step 1: Test que falla** (`backend/src/routes/profile.test.ts`)

```ts
import { test, expect } from "bun:test";
import { createApp } from "../app";

const validSession = { token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) };
const validProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell"], homeEquipment: ["bodyweight"], limitations: [],
};

function fakeDb() {
  const store: Record<string, any> = {};
  return {
    _store: store,
    query: {
      sessions: { findFirst: async () => validSession },
      profiles: { findFirst: async () => store["profile"] ?? null },
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async ({ set }: any) => { store["profile"] = { ...v, ...set }; } }) }),
  };
}
const deps = (db: any) => ({ db, config: { encryptionKey: "a".repeat(64), defaultModel: "m", inviteCode: "INV", sessionTtlDays: 4 }, aiClient: { generateProgram: async () => ({}) } });
const auth = { Authorization: "Bearer t", "content-type": "application/json" };

test("GET /profile devuelve 404 si no hay perfil", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/profile", { headers: auth });
  expect(res.status).toBe(404);
});

test("PUT /profile guarda y GET lo devuelve", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const put = await app.request("/profile", { method: "PUT", headers: auth, body: JSON.stringify(validProfile) });
  expect(put.status).toBe(200);
  expect(db._store["profile"].data.daysPerWeek).toBe(2);
});

test("PUT /profile rechaza perfil inválido con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/profile", { method: "PUT", headers: auth, body: JSON.stringify({ experience: "x" }) });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH" && bun test backend/src/routes/profile.test.ts`

- [ ] **Step 3: Implementar `backend/src/routes/profile.ts`**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { TrainingProfileSchema } from "@pulsia/shared";
import { profiles } from "../db/schema";
import type { AppDeps } from "../app";

export function profileRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.get("/", async (c) => {
    const userId = c.get("userId");
    const row = await deps.db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    if (!row) return c.json({ error: "Sin perfil" }, 404);
    return c.json(row.data);
  });

  r.put("/", async (c) => {
    const userId = c.get("userId");
    const parsed = TrainingProfileSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    await deps.db
      .insert(profiles)
      .values({ userId, data: parsed.data })
      .onConflictDoUpdate({ target: profiles.userId, set: { data: parsed.data } });
    return c.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Suite completa + typecheck + smoke**

```bash
cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH"
bun test shared backend
(cd backend && bun run typecheck)
```
Expected: todos PASS, typecheck limpio.

- [ ] **Step 6: Smoke test manual (opcional, requiere DB + API key real)**

```bash
# backend corriendo con INVITE_CODE=INV en .env
TOKEN=$(curl -s -X POST localhost:8787/auth/register -H 'content-type: application/json' -d '{"email":"yo@test.com","password":"secret123","inviteCode":"INV"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -X PUT localhost:8787/profile -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"experience":"beginner","goal":"general_fitness","daysPerWeek":2,"sessionMinutes":45,"gymEquipment":["barbell"],"homeEquipment":["bodyweight"],"limitations":[]}'
curl -s localhost:8787/profile -H "Authorization: Bearer $TOKEN"
curl -s localhost:8787/settings   # sin token -> 401
```

- [ ] **Step 7: Commit + PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/routes/profile.ts backend/src/routes/profile.test.ts backend/src/app.ts
git commit -S -m "feat(backend): add per-user profile endpoints"
git push -u origin feat/auth-scoping
gh pr create --base main --title "Auth — scoping por usuario + perfil server-side" --body "settings/programs scopeados al userId autenticado (chau SINGLE_USER_ID), endpoints GET/PUT /profile por usuario, requireAuth aplicado a las rutas protegidas."
```

---

## Self-Review (cobertura del spec — backend, Fases A+B)

- **users +email/passwordHash, tabla sessions (spec §4.1):** Task 1.2. ✅
- **Bun.password (spec §4.2):** Task 1.1. ✅
- **register (código invitación)/login/logout (spec §4.3):** Task 2.3. ✅
- **Middleware de sesión + expiración deslizante (spec §4.2, §4.4):** Tasks 2.1, 2.2. ✅
- **Chau SINGLE_USER_ID; settings/programs por usuario (spec §4.5):** Task 3.1. ✅
- **Perfil server-side GET/PUT (spec §4.5):** Task 3.2. ✅
- **Config INVITE_CODE / SESSION_TTL_DAYS (spec §4.6):** Task 2.3. ✅
- **Migración: reset DB (spec §6):** Task 1.2 Step 4. ✅
- **Errores 400/401/403/409 (spec §7):** Tasks 2.3, 3.1, 3.2. ✅

**Fuera de este plan (plan siguiente — mobile, Fases C+D):** pantallas Login/Registro, token en secure-store, navegación gateada, manejo de 401, logout, y perfil mobile vía API. **Passkeys** y **registro público** quedan como futuro (spec §10).
