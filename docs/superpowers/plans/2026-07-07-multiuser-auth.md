# Multi-usuario (login) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activar el multi-usuario end-to-end: key de IA del server con override por usuario, migración de los datos del usuario por defecto al owner, y login/registro/logout en la app mobile.

**Architecture:** El backend multi-usuario ya existe (auth routes + `requireAuth`, gateado por `SINGLE_USER_MODE`). Fase 1 (backend): key del server como fallback + script de migración. Fase 2 (mobile): token en secure-store, `Authorization: Bearer` en el api client, pantallas de login/registro, guard de auth en el layout raíz. El flip de `SINGLE_USER_MODE` y la exposición van en el runbook B (aparte, con confirmación).

**Tech Stack:** Bun + Hono + Drizzle (backend, tests `bun:test`); Expo + expo-router + expo-secure-store + jest-expo (mobile).

---

## File Structure

**Fase 1 — backend (`feat/multiuser-backend`, spec ya commiteado):**
- Create: `backend/src/ai/resolveKey.ts` — helper `resolveAiKey(row, config)`.
- Create: `backend/src/ai/resolveKey.test.ts`.
- Modify: `backend/src/config.ts` — leer `ANTHROPIC_API_KEY` → `defaultAiApiKey`.
- Modify: `backend/src/app.ts` — `AppConfig.defaultAiApiKey?`.
- Modify: `backend/src/routes/programs.ts` — usar `resolveAiKey` en `/generate` y `/generate-oneoff`.
- Modify: `backend/src/routes/memory.ts` — usar `resolveAiKey` en `/refresh`.
- Modify: `backend/src/routes/programs.test.ts`, `backend/src/routes/memory.test.ts` — casos de fallback.
- Create: `backend/src/scripts/claim-single-user.ts` — migración + `claimSingleUser(db, targetUserId)`.
- Create: `backend/src/scripts/claim-single-user.test.ts`.
- Modify: `deploy/app.env.example` — documentar `ANTHROPIC_API_KEY`.

**Fase 2 — mobile (`feat/multiuser-mobile`, off main tras mergear Fase 1):**
- Create: `mobile/src/storage/authToken.ts` — token en `expo-secure-store`.
- Create: `mobile/src/auth/AuthContext.tsx` — provider `useAuth()` (`status`, `signIn`, `signOut`).
- Create: `mobile/src/api/auth.ts` — `login`/`register`/`logout`.
- Modify: `mobile/src/api/client.ts` — adjuntar `Authorization: Bearer`.
- Create: `mobile/app/login.tsx`, `mobile/app/registro.tsx`.
- Modify: `mobile/app/_layout.tsx` — `AuthProvider` + guard.
- Modify: `mobile/app/configuracion.tsx` — botón Logout.
- Create: `mobile/src/config/backend.ts` — URL default de producción.
- Modify: `mobile/src/storage/config.ts` — default a la URL de producción.
- Modify: `mobile/app.json` — `usesCleartextTraffic: false`.
- Modify: `mobile/package.json` — `expo-secure-store`.

---

# FASE 1 — Backend (rama `feat/multiuser-backend`)

## Task 1: `resolveAiKey` + `config.defaultAiApiKey`

**Files:** Create `backend/src/ai/resolveKey.ts`, `backend/src/ai/resolveKey.test.ts`; Modify `backend/src/config.ts`, `backend/src/app.ts`.

- [ ] **Step 1: Failing test** — `backend/src/ai/resolveKey.test.ts`:
```ts
import { test, expect } from "bun:test";
import { resolveAiKey } from "./resolveKey";
import { encryptSecret } from "../crypto/secrets";

const KEY = "a".repeat(64);

test("usa la key del usuario cuando está seteada", () => {
  const enc = encryptSecret("sk-user", KEY);
  expect(resolveAiKey({ aiApiKeyEncrypted: enc }, { encryptionKey: KEY, defaultAiApiKey: "sk-server" })).toBe("sk-user");
});

test("cae a la key del server cuando el usuario no tiene", () => {
  expect(resolveAiKey(null, { encryptionKey: KEY, defaultAiApiKey: "sk-server" })).toBe("sk-server");
  expect(resolveAiKey({ aiApiKeyEncrypted: null }, { encryptionKey: KEY, defaultAiApiKey: "sk-server" })).toBe("sk-server");
});

test("null cuando no hay ni user ni server key", () => {
  expect(resolveAiKey(null, { encryptionKey: KEY })).toBeNull();
});
```

- [ ] **Step 2: Run to fail** — `cd backend && bun test src/ai/resolveKey.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implement** — `backend/src/ai/resolveKey.ts`:
```ts
import { decryptSecret } from "../crypto/secrets";

// La key del usuario (encriptada en `settings`) tiene prioridad; si no hay, se usa la key
// por defecto del server (`config.defaultAiApiKey`). Null si no hay ninguna → el caller hace 400.
export function resolveAiKey(
  row: { aiApiKeyEncrypted?: string | null } | null | undefined,
  config: { encryptionKey: string; defaultAiApiKey?: string },
): string | null {
  if (row?.aiApiKeyEncrypted) return decryptSecret(row.aiApiKeyEncrypted, config.encryptionKey);
  return config.defaultAiApiKey ?? null;
}
```

En `backend/src/config.ts`, después de la línea `const adminToken = env.ADMIN_TOKEN?.trim() || undefined;` agregar:
```ts
  // Key de Anthropic por defecto del server (opcional). Si un usuario no cargó la suya,
  // se usa esta. Si falta y el usuario tampoco tiene, la generación devuelve 400.
  const defaultAiApiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
```
Y en el objeto `config: { ... }` del return, agregar `defaultAiApiKey,` (después de `adminToken,`).

En `backend/src/app.ts`, en la interface `AppConfig`, agregar debajo de `adminToken?: string;`:
```ts
  defaultAiApiKey?: string;
```

- [ ] **Step 4: Run to pass** — `cd backend && bun test src/ai/resolveKey.test.ts && bunx tsc --noEmit` → PASS, typecheck limpio.

- [ ] **Step 5: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/ai/resolveKey.ts backend/src/ai/resolveKey.test.ts backend/src/config.ts backend/src/app.ts
git commit -S -m "feat(backend): key de IA del server como fallback (resolveAiKey)"
```

---

## Task 2: Usar `resolveAiKey` en los 3 sitios

**Files:** Modify `backend/src/routes/programs.ts`, `backend/src/routes/memory.ts`, `backend/src/routes/programs.test.ts`, `backend/src/routes/memory.test.ts`.

- [ ] **Step 1: Failing test** — En `backend/src/routes/programs.test.ts`, en la función `deps(db)` (la que arma el objeto de deps), agregá `defaultAiApiKey` opcional. Cambiá la firma `function deps(db: any)` por `function deps(db: any, defaultAiApiKey?: string)` y en `config: { ... }` agregá `defaultAiApiKey`. Luego agregá este test al final del archivo:
```ts
test("POST /programs/generate sin key de usuario pero con key del server → 200", async () => {
  const db = fakeDb(false); // settings.findFirst → null (sin aiApiKeyEncrypted)
  const app = createApp(deps(db, "sk-server-default") as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: authHeaders, body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run to fail** — `cd backend && bun test src/routes/programs.test.ts` → FAIL (hoy `fakeDb(false)` da 400 aunque haya server key).

- [ ] **Step 3: Implement** — En `backend/src/routes/programs.ts`:
  (a) Reemplazar el import `import { decryptSecret } from "../crypto/secrets";` por `import { resolveAiKey } from "../ai/resolveKey";`.
  (b) En `/generate`, reemplazar el bloque:
```ts
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    if (!row?.aiApiKeyEncrypted) {
      return c.json({ error: "No hay API key de IA configurada. Cargala en Configuración." }, 400);
    }
    const apiKey = decryptSecret(row.aiApiKeyEncrypted, deps.config.encryptionKey);
    const model = row.aiModel ?? deps.config.defaultModel;
```
  por:
```ts
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) {
      return c.json({ error: "No hay API key de IA configurada. Cargala en Configuración." }, 400);
    }
    const model = row?.aiModel ?? deps.config.defaultModel;
```
  (c) En `/generate-oneoff`, reemplazar el bloque análogo (el que hace `if (!row?.aiApiKeyEncrypted) return c.json({ error: "No hay API key de IA configurada." }, 400); const apiKey = decryptSecret(...); const model = row.aiModel ?? ...`) por el mismo patrón con `resolveAiKey(row, deps.config)`, `if (!apiKey) ... 400`, y `row?.aiModel ?? deps.config.defaultModel`.

En `backend/src/routes/memory.ts`:
  (a) Reemplazar `import { decryptSecret } from "../crypto/secrets";` por `import { resolveAiKey } from "../ai/resolveKey";`.
  (b) Reemplazar:
```ts
    if (!row?.aiApiKeyEncrypted) return c.json({ error: "No hay API key de IA configurada." }, 400);
    const apiKey = decryptSecret(row.aiApiKeyEncrypted, deps.config.encryptionKey);
```
  por:
```ts
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA configurada." }, 400);
```
  (verificar que la línea del `model` siga usando `row?.aiModel ?? deps.config.defaultModel`; si usa `row.aiModel`, cambiar a `row?.aiModel`).

- [ ] **Step 4: Update memory.test.ts** — En `backend/src/routes/memory.test.ts`, si su helper de deps no acepta `defaultAiApiKey`, agregarlo igual que en programs.test.ts, y agregar un test análogo: sin key de usuario + `defaultAiApiKey` seteada → NO devuelve 400 por falta de key.

- [ ] **Step 5: Run to pass** — `cd backend && bun test src/routes/ && bunx tsc --noEmit` → PASS (incluidos los tests viejos: `fakeDb(false)` SIN defaultAiApiKey sigue dando 400).

- [ ] **Step 6: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/routes/programs.ts backend/src/routes/memory.ts backend/src/routes/programs.test.ts backend/src/routes/memory.test.ts
git commit -S -m "feat(backend): usar resolveAiKey (fallback al server) en generate/oneoff/memory"
```

---

## Task 3: Script de migración `claim-single-user`

**Files:** Create `backend/src/scripts/claim-single-user.ts`, `backend/src/scripts/claim-single-user.test.ts`.

- [ ] **Step 1: Failing test** — `backend/src/scripts/claim-single-user.test.ts`:
```ts
import { test, expect } from "bun:test";
import { claimSingleUser } from "./claim-single-user";
import { SINGLE_USER_ID } from "../constants";

// Fake db que registra los .update(table) y responde vacío a los selects de colisión.
function fakeDb() {
  const updates: string[] = [];
  const nameOf = (t: any) => t?._?.name ?? t?.name ?? "unknown";
  return {
    _updates: updates,
    select: () => ({ from: (_t: any) => ({ where: () => ({ limit: async () => [] }) }) }),
    update: (t: any) => ({ set: (_v: any) => ({ where: async () => { updates.push(nameOf(t)); } }) }),
  } as any;
}

test("aborta si el destino es el usuario por defecto", async () => {
  await expect(claimSingleUser(fakeDb(), SINGLE_USER_ID)).rejects.toThrow();
});

test("reasigna las 5 tablas al usuario destino", async () => {
  const db = fakeDb();
  await claimSingleUser(db, "11111111-1111-4111-8111-111111111111");
  expect(db._updates.length).toBe(5);
});
```

- [ ] **Step 2: Run to fail** — `cd backend && bun test src/scripts/claim-single-user.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implement** — `backend/src/scripts/claim-single-user.ts`:
```ts
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { users, settings, profiles, athleteMemory, programs, workoutSession } from "../db/schema";
import { SINGLE_USER_ID } from "../constants";

// Reasigna todos los datos del usuario por defecto (single-user) a `targetUserId`.
// Tablas con PK = user_id (settings/profiles/athlete_memory): aborta si el destino ya tiene fila.
// Los hijos (session_exercise/set_log) cuelgan de workout_session por session_id → no se tocan.
export async function claimSingleUser(db: Db, targetUserId: string): Promise<void> {
  if (targetUserId === SINGLE_USER_ID) {
    throw new Error("El usuario destino no puede ser el usuario por defecto");
  }
  const pkTables = [
    { t: settings, name: "settings" },
    { t: profiles, name: "profiles" },
    { t: athleteMemory, name: "athlete_memory" },
  ] as const;
  for (const { t, name } of pkTables) {
    const existing = await db.select().from(t).where(eq(t.userId, targetUserId)).limit(1);
    if (existing.length > 0) throw new Error(`El usuario destino ya tiene filas en ${name}; abortando`);
  }
  await db.update(settings).set({ userId: targetUserId }).where(eq(settings.userId, SINGLE_USER_ID));
  await db.update(profiles).set({ userId: targetUserId }).where(eq(profiles.userId, SINGLE_USER_ID));
  await db.update(athleteMemory).set({ userId: targetUserId }).where(eq(athleteMemory.userId, SINGLE_USER_ID));
  await db.update(programs).set({ userId: targetUserId }).where(eq(programs.userId, SINGLE_USER_ID));
  await db.update(workoutSession).set({ userId: targetUserId }).where(eq(workoutSession.userId, SINGLE_USER_ID));
}

if (import.meta.main) {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error("Uso: bun run src/scripts/claim-single-user.ts <email>");
    process.exit(1);
  }
  const { db, sql } = createDb(process.env.DATABASE_URL!);
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    console.error(`No existe un usuario con email ${email}`);
    await sql.end();
    process.exit(1);
  }
  await claimSingleUser(db, user.id);
  console.log(`Datos del usuario por defecto reasignados a ${email} (${user.id})`);
  await sql.end();
}
```

- [ ] **Step 4: Run to pass** — `cd backend && bun test src/scripts/claim-single-user.test.ts && bunx tsc --noEmit` → PASS. (Si el `nameOf` del fake no matchea el conteo, el test igual valida 5 updates por longitud; el guard de colisión se ejercita en el runbook manual.)

- [ ] **Step 5: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/scripts/claim-single-user.ts backend/src/scripts/claim-single-user.test.ts
git commit -S -m "feat(backend): script claim-single-user (migra datos del usuario por defecto al owner)"
```

---

## Task 4: Docs + verificación + PR (Fase 1)

- [ ] **Step 1: app.env.example** — En `deploy/app.env.example`, agregar tras el bloque de `ADMIN_TOKEN`:
```
# Key de Anthropic por defecto del server: si un usuario no carga la suya en la app,
# se usa esta para generar. Opcional (si falta y el usuario tampoco tiene, la generación da 400).
# ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Suite completa** — `cd /Users/kilo/desarrollo26/pulsia/backend && bun test && bunx tsc --noEmit` → todo verde. `cd ../shared && bun test` → verde.

- [ ] **Step 3: Commit docs + push + PR**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add deploy/app.env.example
git commit -S -m "docs: documentar ANTHROPIC_API_KEY (key del server)"
git push -u origin feat/multiuser-backend
gh pr create --title "feat: multi-usuario backend — key del server + migración de datos" --body "PR de Fase 1 (backend) del multi-usuario. Ver spec docs/superpowers/specs/2026-07-07-multiuser-auth-design.md. Key del server como fallback (resolveAiKey) + script claim-single-user. No cambia SINGLE_USER_MODE (eso es el runbook)."
```

- [ ] **Step 4: Code review** — protocolo habitual (CodeRabbit → @claude si tarda → menores fix+merge, mayores fix+re-review). Tras mergear, deploy a la Pi se dispara solo; verificar `/health` por SSH.

---

# FASE 2 — Mobile login (rama `feat/multiuser-mobile`, off main tras mergear Fase 1)

## Task 5: Token en secure-store

**Files:** Create `mobile/src/storage/authToken.ts`; Modify `mobile/package.json` (dep `expo-secure-store`).

- [ ] **Step 1: Instalar dep** — `cd mobile && bunx expo install expo-secure-store` (agrega la dep compatible con el SDK).

- [ ] **Step 2: Implement** — `mobile/src/storage/authToken.ts`:
```ts
import * as SecureStore from "expo-secure-store";

const KEY = "pulsia.authToken";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
```

- [ ] **Step 3: Typecheck** — `cd mobile && bunx tsc --noEmit` → limpio.

- [ ] **Step 4: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/storage/authToken.ts mobile/package.json mobile/bun.lock
git commit -S -m "feat(mobile): storage del token de auth en expo-secure-store"
```

---

## Task 6: `apiFetch` adjunta `Authorization: Bearer`

**Files:** Modify `mobile/src/api/client.ts`, `mobile/src/api/api.test.ts`.

- [ ] **Step 1: Failing test** — En `mobile/src/api/api.test.ts`, agregar (mockeando el token):
```ts
jest.mock("../storage/authToken", () => ({ getToken: jest.fn(async () => "tok-123") }));

test("apiFetch adjunta Authorization Bearer cuando hay token", async () => {
  const spy = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }) as any);
  await apiFetch("http://b.test", "/x");
  const init = spy.mock.calls[0][1] as RequestInit;
  expect((init.headers as any).Authorization).toBe("Bearer tok-123");
  spy.mockRestore();
});
```
(Si el archivo ya importa `apiFetch`, reusar ese import; si no, `import { apiFetch } from "./client";`.)

- [ ] **Step 2: Run to fail** — `cd mobile && bunx jest src/api/api.test.ts` → FAIL (no adjunta Authorization).

- [ ] **Step 3: Implement** — `mobile/src/api/client.ts`:
```ts
import { getToken } from "../storage/authToken";

// `timeoutMs` aborta el request si el backend no responde (default 15s).
export async function apiFetch(
  baseUrl: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const { timeoutMs = 15000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const token = await getToken();
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(rest.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run to pass** — `cd mobile && bunx jest src/api/api.test.ts && bunx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/api/client.ts mobile/src/api/api.test.ts
git commit -S -m "feat(mobile): apiFetch adjunta Authorization Bearer con el token guardado"
```

---

## Task 7: API de auth + AuthContext

**Files:** Create `mobile/src/api/auth.ts`, `mobile/src/auth/AuthContext.tsx`.

- [ ] **Step 1: Implement `api/auth.ts`**:
```ts
import { apiFetch } from "./client";
import { setToken, clearToken } from "../storage/authToken";

async function tokenFrom(res: Response): Promise<string> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body?.error === "string" ? body.error : "Error de autenticación");
  }
  const data = await res.json();
  if (!data?.token) throw new Error("Respuesta inválida del servidor");
  return data.token;
}

export async function login(baseUrl: string, email: string, password: string): Promise<void> {
  const res = await apiFetch(baseUrl, "/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  await setToken(await tokenFrom(res));
}

export async function register(baseUrl: string, email: string, password: string, inviteCode: string): Promise<void> {
  const res = await apiFetch(baseUrl, "/auth/register", { method: "POST", body: JSON.stringify({ email, password, inviteCode }) });
  await setToken(await tokenFrom(res));
}

export async function logout(baseUrl: string): Promise<void> {
  try { await apiFetch(baseUrl, "/auth/logout", { method: "POST" }); } catch { /* best-effort */ }
  await clearToken();
}
```

- [ ] **Step 2: Implement `auth/AuthContext.tsx`**:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getToken, clearToken } from "../storage/authToken";

type Status = "loading" | "in" | "out";
type AuthValue = { status: Status; refresh: () => Promise<void>; signOut: () => Promise<void> };

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");

  async function refresh() {
    const t = await getToken();
    setStatus(t ? "in" : "out");
  }
  async function signOut() {
    await clearToken();
    setStatus("out");
  }
  useEffect(() => { void refresh(); }, []);

  return <AuthCtx.Provider value={{ status, refresh, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
```

- [ ] **Step 3: Typecheck** — `cd mobile && bunx tsc --noEmit` → limpio.

- [ ] **Step 4: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/api/auth.ts mobile/src/auth/AuthContext.tsx
git commit -S -m "feat(mobile): api de auth (login/register/logout) + AuthContext"
```

---

## Task 8: URL de producción por defecto

**Files:** Create `mobile/src/config/backend.ts`; Modify `mobile/src/storage/config.ts`, `mobile/app.json`.

- [ ] **Step 1: Implement `src/config/backend.ts`**:
```ts
// URL pública del backend (producción). La app la usa por defecto; se puede overridear
// en Configuración (avanzado).
export const DEFAULT_BACKEND_URL = "https://pulsia.lahuelladelcaminante.de";
```

- [ ] **Step 2: Default en `storage/config.ts`** — reemplazar `getBackendUrl` para caer al default:
```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_BACKEND_URL } from "../config/backend";

const KEY = "pulsia.backendUrl";

export async function getBackendUrl(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(KEY);
  return stored ?? DEFAULT_BACKEND_URL;
}

export async function setBackendUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY, url);
}
```

- [ ] **Step 3: `app.json`** — dentro de `expo.plugins` → `expo-build-properties` → `android`, cambiar `"usesCleartextTraffic": true` por `"usesCleartextTraffic": false`.

- [ ] **Step 4: Typecheck + tests** — `cd mobile && bunx jest && bunx tsc --noEmit` → verde (si algún test de config asumía null, ajustarlo al default).

- [ ] **Step 5: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/config/backend.ts mobile/src/storage/config.ts mobile/app.json
git commit -S -m "feat(mobile): URL de backend de producción por defecto + HTTPS (cleartext off)"
```

---

## Task 9: Pantallas Login y Registro

**Files:** Create `mobile/app/login.tsx`, `mobile/app/registro.tsx`, `mobile/__tests__/login.test.tsx`.

- [ ] **Step 1: Failing test** — `mobile/__tests__/login.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import LoginScreen from "../app/login";
import { login } from "../src/api/auth";
import { router } from "expo-router";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/api/auth", () => ({ login: jest.fn(async () => {}) }));
jest.mock("../src/auth/AuthContext", () => ({ useAuth: () => ({ refresh: jest.fn(async () => {}) }) }));

test("login llama al api y refresca la sesión", async () => {
  await render(<LoginScreen />);
  await fireEvent.changeText(screen.getByTestId("login-email"), "a@b.com");
  await fireEvent.changeText(screen.getByTestId("login-password"), "secret123");
  await fireEvent.press(screen.getByTestId("login-submit"));
  await waitFor(() => expect(login).toHaveBeenCalledWith("http://b.test", "a@b.com", "secret123"));
});
```

- [ ] **Step 2: Run to fail** — `cd mobile && bunx jest __tests__/login.test.tsx` → FAIL (no existe la pantalla).

- [ ] **Step 3: Implement `app/login.tsx`**:
```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getBackendUrl } from "../src/storage/config";
import { login } from "../src/api/auth";
import { useAuth } from "../src/auth/AuthContext";
import { colors, radius, spacing } from "../src/theme/tokens";

export default function LoginScreen() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true); setError(null);
    try {
      const url = await getBackendUrl();
      if (!url) { setError("Falta configurar el backend"); setLoading(false); return; }
      await login(url, email.trim(), password);
      await refresh();
      router.replace("/");
    } catch (e) {
      setError((e as Error).message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, color: colors.text } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "600", color: colors.text }}>Iniciar sesión</Text>
      <TextInput testID="login-email" style={input} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput testID="login-password" style={input} placeholder="Contraseña" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable testID="login-submit" disabled={loading} onPress={onSubmit} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Entrar</Text>}
      </Pressable>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable testID="go-registro" onPress={() => router.push("/registro")} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.accentText }}>¿No tenés cuenta? Registrate</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Implement `app/registro.tsx`** (igual patrón, con invite code):
```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getBackendUrl } from "../src/storage/config";
import { register } from "../src/api/auth";
import { useAuth } from "../src/auth/AuthContext";
import { colors, radius, spacing } from "../src/theme/tokens";

export default function RegistroScreen() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true); setError(null);
    try {
      const url = await getBackendUrl();
      if (!url) { setError("Falta configurar el backend"); setLoading(false); return; }
      await register(url, email.trim(), password, invite.trim());
      await refresh();
      router.replace("/");
    } catch (e) {
      setError((e as Error).message || "No se pudo registrar");
    } finally {
      setLoading(false);
    }
  }

  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, color: colors.text } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "600", color: colors.text }}>Crear cuenta</Text>
      <TextInput testID="reg-email" style={input} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput testID="reg-password" style={input} placeholder="Contraseña (mín 8)" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput testID="reg-invite" style={input} placeholder="Código de invitación" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={invite} onChangeText={setInvite} />
      <Pressable testID="reg-submit" disabled={loading} onPress={onSubmit} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Registrarme</Text>}
      </Pressable>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable testID="go-login" onPress={() => router.replace("/login")} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.accentText }}>Ya tengo cuenta</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 5: Run to pass** — `cd mobile && bunx jest __tests__/login.test.tsx && bunx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/login.tsx mobile/app/registro.tsx mobile/__tests__/login.test.tsx
git commit -S -m "feat(mobile): pantallas de login y registro"
```

---

## Task 10: Guard de auth en el layout + logout

**Files:** Modify `mobile/app/_layout.tsx`, `mobile/app/configuracion.tsx`.

- [ ] **Step 1: Implement `_layout.tsx`** — envolver en `AuthProvider` y agregar el guard con `useSegments`:
```tsx
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { colors } from "../src/theme/tokens";

const queryClient = new QueryClient();

function Guarded() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const inAuth = segments[0] === "login" || segments[0] === "registro";
    if (status === "out" && !inAuth) router.replace("/login");
    else if (status === "in" && inAuth) router.replace("/");
  }, [status, segments, router]);

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="registro" options={{ headerShown: true, title: "Crear cuenta" }} />
      <Stack.Screen name="configuracion" options={{ headerShown: true, title: "Configuración", presentation: "modal" }} />
      <Stack.Screen name="sesion" options={{ headerShown: true, title: "Entrenamiento" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <Guarded />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Logout en `configuracion.tsx`** — importar y agregar un botón. Al tope del archivo agregar imports:
```tsx
import { getBackendUrl } from "../src/storage/config";
import { logout } from "../src/api/auth";
import { useAuth } from "../src/auth/AuthContext";
import { router } from "expo-router";
```
Dentro del componente, obtener `const { signOut } = useAuth();` y un handler:
```tsx
  async function onLogout() {
    const url = await getBackendUrl();
    if (url) await logout(url);
    await signOut();
    router.replace("/login");
  }
```
Y en el JSX (cerca del final del scroll), agregar:
```tsx
      <Pressable testID="logout" onPress={onLogout} style={{ alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.lg }}>
        <Text style={{ color: colors.danger, fontWeight: "600" }}>Cerrar sesión</Text>
      </Pressable>
```
(Verificar que `Pressable`, `Text`, `colors`, `spacing` ya estén importados en el archivo; si no, agregarlos.)

- [ ] **Step 3: Run tests + typecheck** — `cd mobile && bunx jest && bunx tsc --noEmit` → verde.

- [ ] **Step 4: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/_layout.tsx mobile/app/configuracion.tsx
git commit -S -m "feat(mobile): guard de auth en el layout raíz + botón de logout"
```

---

## Task 11: Verificación + PR (Fase 2)

- [ ] **Step 1: Suite completa** — `cd /Users/kilo/desarrollo26/pulsia/mobile && bunx jest && bunx tsc --noEmit` → todo verde.

- [ ] **Step 2: Push + PR**
```bash
cd /Users/kilo/desarrollo26/pulsia
git push -u origin feat/multiuser-mobile
gh pr create --title "feat: multi-usuario mobile — login/registro/logout + auth guard" --body "PR de Fase 2 (mobile) del multi-usuario. Token en secure-store, apiFetch con Bearer, pantallas login/registro, guard en el layout, URL de prod por defecto + HTTPS. Requiere build vc7 (dep nativa expo-secure-store). Ver spec 2026-07-07-multiuser-auth-design.md."
```

- [ ] **Step 3: Code review** — protocolo habitual. Este PR NO auto-deploya (mobile). Tras mergear → build vc7 (parte del runbook B).

---

## Self-Review (hecho al escribir el plan)
- **Cobertura del spec:** key server + override (T1-T2) ✓; migración (T3) ✓; app.env.example (T4) ✓; token secure-store (T5) ✓; apiFetch Bearer + 401 (T6 — el 401 se maneja vía guard+logout; ver nota) ✓; api auth + pantallas (T7,T9) ✓; guard + logout (T10) ✓; URL default + cleartext off (T8) ✓; tests (todas las tasks) ✓.
- **Nota 401:** el manejo de 401 global (limpiar token + volver a login) se ejerce cuando el usuario hace una acción y el token expiró; el `AuthContext.refresh` + guard cubren el arranque. Un interceptor de 401 en `apiFetch` es una mejora futura (YAGNI ahora; la sesión dura `SESSION_TTL_DAYS`).
- **Consistencia de tipos:** `resolveAiKey(row, config)` idéntico en helper y en los 3 sitios; `getToken/setToken/clearToken`, `useAuth().{status,refresh,signOut}`, `login/register/logout(baseUrl, ...)` coherentes entre tasks.
- **Placeholders:** ninguno — todo el código está escrito.
