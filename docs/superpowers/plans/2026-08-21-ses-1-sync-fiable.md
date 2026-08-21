# SES-1 — Sincronización fiable de sesiones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los entrenos lleguen al backend de forma confiable (re-flush proactivo), que el estado de sync sea visible y reintentable, y que el botón "Listo" del resumen deje de quedar pegado a la barra del sistema.

**Architecture:** Móvil offline-first (Expo + expo-router + AsyncStorage). La cola local ya es durable; el problema es el flush fire-and-forget que solo corre al terminar otra sesión. Se agrega una taxonomía de errores tipada, un `syncPending` que no traga errores, un hook que re-sincroniza al abrir/enfocar la app, y estado visible en el resumen. Pieza chica de backend: log de `PUT /sessions`.

**Tech Stack:** TypeScript, React Native (Expo SDK 57), jest (`jest-expo`, correr `--runInBand`), `@testing-library/react-native`; backend Hono + Bun (`bun test`).

**Convenciones del repo (IMPORTANTE):**
- Tests móviles en `mobile/__tests__/`, NUNCA en `mobile/app/`. Correr: `cd mobile && npm test -- --runInBand`.
- `zod` NO resuelve desde `mobile/` → usar los schemas de `@pulsia/shared` (`WorkoutSessionSchema.safeParse`), nunca `import { z }`.
- Commits firmados `git commit -S`. Sin atribución a Claude/Anthropic.
- TDD con verificación por mutación: tras ver el test pasar, romper el código a propósito y confirmar que el test se queja; después revertir.
- Backend `bun test` desde la raíz o `cd backend && bun test`.

---

## File Structure

- **Create** `mobile/src/sync/errors.ts` — `SyncError` tipado (`kind`, `status?`, `userMessage`, `retryable`) + helper `syncErrorFromResponse`/`syncErrorFromThrown`.
- **Modify** `mobile/src/api/sessions.ts` — `putSession` mapea la respuesta/errores a `SyncError`.
- **Modify** `mobile/src/sync/syncSessions.ts` — `syncPending` devuelve `{ synced, remaining, lastError }`, sin `catch {}` mudo.
- **Create** `mobile/src/sync/useSyncPendingSessions.ts` — hook de re-flush (montaje + `AppState` → `active`).
- **Modify** `mobile/app/_layout.tsx` — montar el hook en `Guarded` cuando `status === "in"`.
- **Modify** `mobile/app/sesion.tsx` — estado de sync en `onFinish`/`saveFinishedNotes`, fila de estado + botón reintentar en el resumen, safe-area + botón "Listo" más grande.
- **Modify** `mobile/src/components/SessionSummary.tsx` — (solo si hace falta exponer un slot; ver Task 4, probablemente NO se toca — el estado va en `sesion.tsx`).
- **Modify** `backend/src/routes/sessions.ts` — log de `PUT /:id`.
- **Tests:** `mobile/__tests__/sync-errors.test.ts` (nuevo), `mobile/__tests__/sessions-api.test.ts` (nuevo o extender), `mobile/__tests__/sync-sessions.test.ts` (actualizar), `mobile/__tests__/useSyncPendingSessions.test.tsx` (nuevo), `mobile/__tests__/sesion.test.tsx` (extender), `backend/src/routes/sessions.test.ts` (extender).

---

## Task 1: `SyncError` tipado + helpers

**Files:**
- Create: `mobile/src/sync/errors.ts`
- Test: `mobile/__tests__/sync-errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/sync-errors.test.ts
import { SyncError, syncErrorFromResponse, syncErrorFromThrown } from "../src/sync/errors";

test("SyncError.retryable es true para network y server, false para auth/validation/conflict", () => {
  expect(new SyncError("network").retryable).toBe(true);
  expect(new SyncError("server", 500).retryable).toBe(true);
  expect(new SyncError("auth", 401).retryable).toBe(false);
  expect(new SyncError("validation", 400).retryable).toBe(false);
  expect(new SyncError("conflict", 409).retryable).toBe(false);
});

test("SyncError expone un userMessage en lenguaje simple por kind", () => {
  expect(new SyncError("network").userMessage).toMatch(/conexión/i);
  expect(new SyncError("auth", 401).userMessage).toMatch(/sesión|vencida/i);
  expect(new SyncError("validation", 400).userMessage).toMatch(/dato/i);
  expect(new SyncError("server", 500).userMessage).toMatch(/servidor/i);
});

test("syncErrorFromResponse mapea el status al kind correcto", () => {
  expect(syncErrorFromResponse({ status: 401 } as Response).kind).toBe("auth");
  expect(syncErrorFromResponse({ status: 400 } as Response).kind).toBe("validation");
  expect(syncErrorFromResponse({ status: 409 } as Response).kind).toBe("conflict");
  expect(syncErrorFromResponse({ status: 503 } as Response).kind).toBe("server");
  expect(syncErrorFromResponse({ status: 418 } as Response).kind).toBe("unknown");
});

test("syncErrorFromThrown trata cualquier excepción como network (red caída/abort)", () => {
  expect(syncErrorFromThrown(new Error("Aborted")).kind).toBe("network");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- --runInBand sync-errors`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/sync/errors.ts
export type SyncErrorKind =
  | "network" | "auth" | "validation" | "conflict" | "server" | "unknown";

const MESSAGES: Record<SyncErrorKind, string> = {
  network: "Sin conexión",
  auth: "Sesión vencida",
  validation: "Datos inválidos",
  conflict: "Conflicto de datos",
  server: "Error del servidor",
  unknown: "No se pudo sincronizar",
};

const RETRYABLE: Record<SyncErrorKind, boolean> = {
  network: true, server: true,
  auth: false, validation: false, conflict: false, unknown: false,
};

export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  readonly status?: number;
  readonly userMessage: string;
  readonly retryable: boolean;
  constructor(kind: SyncErrorKind, status?: number) {
    super(`${kind}${status ? ` (${status})` : ""}`);
    this.name = "SyncError";
    this.kind = kind;
    this.status = status;
    this.userMessage = MESSAGES[kind];
    this.retryable = RETRYABLE[kind];
  }
}

export function syncErrorFromResponse(res: Pick<Response, "status">): SyncError {
  const s = res.status;
  if (s === 401 || s === 403) return new SyncError("auth", s);
  if (s === 400 || s === 422) return new SyncError("validation", s);
  if (s === 409) return new SyncError("conflict", s);
  if (s >= 500) return new SyncError("server", s);
  return new SyncError("unknown", s);
}

export function syncErrorFromThrown(_e: unknown): SyncError {
  // Un throw de fetch (abort/timeout/red caída) no trae status → red.
  return new SyncError("network");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- --runInBand sync-errors`
Expected: PASS (4 tests).

- [ ] **Step 5: Mutation check**

Cambiar `RETRYABLE.auth` a `true` → el primer test debe fallar. Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/sync/errors.ts mobile/__tests__/sync-errors.test.ts
git commit -S -m "feat(ses-1): SyncError tipado con kind/retryable/userMessage"
```

---

## Task 2: `putSession` mapea a `SyncError`

**Files:**
- Modify: `mobile/src/api/sessions.ts:6-12`
- Test: `mobile/__tests__/sessions-api.test.ts` (nuevo)

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/sessions-api.test.ts
import { putSession } from "../src/api/sessions";
import { SyncError } from "../src/sync/errors";
import type { WorkoutSession } from "@pulsia/shared";

const URL = "http://backend.test";
const sess = { id: "11111111-1111-4111-8111-111111111111", programId: null, weekNumber: 1,
  dayLabel: "Día 1", location: "gym", startedAt: 1000, endedAt: 2000, totalDurationMs: 1000,
  notes: "", exercises: [] } as unknown as WorkoutSession;

afterEach(() => { (global.fetch as any) = undefined; });

test("putSession resuelve en 200", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
  await expect(putSession(URL, sess)).resolves.toBeUndefined();
});

test("putSession tira SyncError('validation') en 400", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as any;
  await expect(putSession(URL, sess)).rejects.toMatchObject({ kind: "validation", retryable: false });
});

test("putSession tira SyncError('network') si fetch explota", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("Network request failed")) as any;
  await expect(putSession(URL, sess)).rejects.toMatchObject({ kind: "network", retryable: true });
});
```

> Nota: `apiFetch` en 401 llama `clearToken()`/`notifyUnauthorized()` (que tocan storage/estado). El test de arriba usa 200/400/throw a propósito para no depender de ese efecto; el mapeo de 401→auth ya está cubierto en Task 1 vía `syncErrorFromResponse`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- --runInBand sessions-api`
Expected: FAIL — hoy `putSession` tira `Error` genérico, no `SyncError` con `kind`.

- [ ] **Step 3: Write minimal implementation**

Reemplazar el cuerpo de `putSession` en `mobile/src/api/sessions.ts`:

```ts
import { apiFetch } from "./client";
import type { WorkoutSession } from "@pulsia/shared";
import { SyncError, syncErrorFromResponse, syncErrorFromThrown } from "../sync/errors";

// Sube una sesión completa (upsert idempotente en el backend). El id de la sesión
// es la identidad canónica del sync. Tira SyncError (tipado) ante cualquier fallo.
export async function putSession(baseUrl: string, session: WorkoutSession): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch(baseUrl, `/sessions/${session.id}`, {
      method: "PUT",
      body: JSON.stringify(session),
    });
  } catch (e) {
    throw syncErrorFromThrown(e); // abort/timeout/red caída
  }
  if (!res.ok) throw syncErrorFromResponse(res);
}
```

(Dejar el resto del archivo — `previewFitStrength`, `getSessions`, etc. — intacto. Solo cambia `putSession` y se agrega el import.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- --runInBand sessions-api`
Expected: PASS (3 tests).

- [ ] **Step 5: Mutation check**

Cambiar `throw syncErrorFromResponse(res)` por `throw new Error("x")` → el test de 400 falla (no matchea `kind`). Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/api/sessions.ts mobile/__tests__/sessions-api.test.ts
git commit -S -m "feat(ses-1): putSession mapea la respuesta a SyncError tipado"
```

---

## Task 3: `syncPending` devuelve resultado estructurado (sin `catch {}` mudo)

**Files:**
- Modify: `mobile/src/sync/syncSessions.ts`
- Test: `mobile/__tests__/sync-sessions.test.ts` (actualizar)

- [ ] **Step 1: Update the existing test to the new shape (failing)**

Reemplazar el contenido de `mobile/__tests__/sync-sessions.test.ts` por:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { enqueueSession, getPendingSessions } from "../src/storage/pendingSessions";
import { syncPending } from "../src/sync/syncSessions";
import type { WorkoutSession } from "@pulsia/shared";

const URL = "http://backend.test";
const mk = (id: string) => ({
  id, programId: "22222222-2222-4222-8222-222222222222", weekNumber: 1, dayLabel: "Día 1",
  location: "gym", startedAt: 1000, endedAt: 2000, totalDurationMs: 1000, notes: "", exercises: [],
}) as WorkoutSession;

beforeEach(async () => { await AsyncStorage.clear(); });
afterEach(() => { (global.fetch as any) = undefined; });

test("syncPending sube cada pendiente y vacía la cola en éxito", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  await enqueueSession(mk("33333333-3333-4333-8333-333333333333"));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as any;
  const r = await syncPending(URL);
  expect(r.synced).toBe(2);
  expect(r.remaining).toBe(0);
  expect(r.lastError).toBeNull();
  expect((await getPendingSessions()).length).toBe(0);
});

test("syncPending deja en la cola las que fallan y reporta lastError (reintentable)", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
  const r = await syncPending(URL);
  expect(r.synced).toBe(0);
  expect(r.remaining).toBe(1);
  expect(r.lastError?.kind).toBe("server");
  expect(r.lastError?.retryable).toBe(true);
  expect((await getPendingSessions()).length).toBe(1);
});

test("un fallo de validación (terminal) NO descarta la sesión: queda en cola con lastError", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }) as any;
  const r = await syncPending(URL);
  expect(r.remaining).toBe(1);
  expect(r.lastError?.kind).toBe("validation");
  expect((await getPendingSessions()).length).toBe(1);
});

test("mezcla: sube la buena, deja la mala", async () => {
  await enqueueSession(mk("11111111-1111-4111-8111-111111111111"));
  await enqueueSession(mk("33333333-3333-4333-8333-333333333333"));
  const okId = "/sessions/11111111-1111-4111-8111-111111111111";
  global.fetch = jest.fn().mockImplementation((url: string) =>
    Promise.resolve(url.endsWith(okId)
      ? { ok: true, status: 200, json: async () => ({}) }
      : { ok: false, status: 500, json: async () => ({}) })) as any;
  const r = await syncPending(URL);
  expect(r.synced).toBe(1);
  expect(r.remaining).toBe(1);
  expect((await getPendingSessions()).map((s) => s.id)).toEqual(["33333333-3333-4333-8333-333333333333"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- --runInBand sync-sessions`
Expected: FAIL — `syncPending` hoy devuelve un `number`, no `{ synced, remaining, lastError }`.

- [ ] **Step 3: Write minimal implementation**

Reemplazar `mobile/src/sync/syncSessions.ts` por:

```ts
import { putSession } from "../api/sessions";
import { getPendingSessions, removePendingSession } from "../storage/pendingSessions";
import { SyncError } from "./errors";

export interface SyncResult {
  synced: number;      // cuántas subieron y se sacaron de la cola
  remaining: number;   // cuántas quedaron pendientes tras el barrido
  lastError: SyncError | null; // el último error observado (para surfacear el motivo)
}

// Sube las sesiones pendientes. NUNCA descarta data: las que fallan quedan en la cola
// para el próximo flush (idempotente por id). Reporta el resultado en vez de tragarse el error.
export async function syncPending(baseUrl: string): Promise<SyncResult> {
  const pending = await getPendingSessions();
  let synced = 0;
  let lastError: SyncError | null = null;
  for (const session of pending) {
    try {
      await putSession(baseUrl, session);
      await removePendingSession(session.id);
      synced++;
    } catch (e) {
      lastError = e instanceof SyncError ? e : new SyncError("unknown");
      // queda en la cola; se reintenta en el próximo flush
    }
  }
  return { synced, remaining: pending.length - synced, lastError };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- --runInBand sync-sessions`
Expected: PASS (4 tests).

- [ ] **Step 5: Mutation check**

Cambiar `remaining: pending.length - synced` por `remaining: 0` → el test de fallo/mezcla falla. Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/sync/syncSessions.ts mobile/__tests__/sync-sessions.test.ts
git commit -S -m "feat(ses-1): syncPending devuelve resultado estructurado, sin catch mudo"
```

> Nota: `sesion.tsx` usa hoy `void syncPending(url)` (descarta el return), así que este cambio de firma no rompe compilación de los llamadores existentes; Task 4 aprovecha el nuevo return.

---

## Task 4: Re-flush proactivo — hook `useSyncPendingSessions`

**Files:**
- Create: `mobile/src/sync/useSyncPendingSessions.ts`
- Modify: `mobile/app/_layout.tsx`
- Test: `mobile/__tests__/useSyncPendingSessions.test.tsx` (nuevo)

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/__tests__/useSyncPendingSessions.test.tsx
import { render, act, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { AppState } from "react-native";

const mockSyncPending = jest.fn();
const mockGetBackendUrl = jest.fn();
jest.mock("../src/sync/syncSessions", () => ({ syncPending: (...a: any[]) => mockSyncPending(...a) }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: (...a: any[]) => mockGetBackendUrl(...a) }));

import { useSyncPendingSessions } from "../src/sync/useSyncPendingSessions";

function Harness({ enabled }: { enabled: boolean }) {
  useSyncPendingSessions(enabled);
  return <Text>ok</Text>;
}

beforeEach(() => {
  mockSyncPending.mockReset().mockResolvedValue({ synced: 0, remaining: 0, lastError: null });
  mockGetBackendUrl.mockReset().mockResolvedValue("http://backend.test");
});

test("dispara syncPending al montar cuando está habilitado y hay url", async () => {
  render(<Harness enabled={true} />);
  await waitFor(() => expect(mockSyncPending).toHaveBeenCalledWith("http://backend.test"));
});

test("NO dispara si está deshabilitado (no autenticado)", async () => {
  render(<Harness enabled={false} />);
  await act(async () => {}); // deja correr los efectos
  expect(mockSyncPending).not.toHaveBeenCalled();
});

test("vuelve a disparar cuando la app pasa a 'active'", async () => {
  const listeners: Array<(s: string) => void> = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_ev: any, cb: any) => {
    listeners.push(cb);
    return { remove: () => {} } as any;
  });
  render(<Harness enabled={true} />);
  await waitFor(() => expect(mockSyncPending).toHaveBeenCalledTimes(1));
  await act(async () => { listeners.forEach((cb) => cb("active")); });
  await waitFor(() => expect(mockSyncPending).toHaveBeenCalledTimes(2));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- --runInBand useSyncPendingSessions`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/sync/useSyncPendingSessions.ts
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { getBackendUrl } from "../storage/config";
import { syncPending } from "./syncSessions";

// Re-sincroniza la cola de sesiones pendientes de forma proactiva: al montar (app abierta)
// y cada vez que la app vuelve a primer plano. Es el arreglo del root cause de SES-1: sin esto,
// `syncPending` solo corría al terminar otra sesión, dejando entrenos encolados por días.
export function useSyncPendingSessions(enabled: boolean): void {
  const running = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function flush() {
      if (running.current) return; // no solapar dos flushes
      running.current = true;
      try {
        const url = await getBackendUrl();
        if (url && !cancelled) await syncPending(url);
      } catch {
        // best-effort: sin backend configurado o red caída → se reintenta al próximo foreground
      } finally {
        running.current = false;
      }
    }
    void flush(); // al montar
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") void flush();
    });
    return () => { cancelled = true; sub.remove(); };
  }, [enabled]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- --runInBand useSyncPendingSessions`
Expected: PASS (3 tests).

- [ ] **Step 5: Mount the hook in the layout**

En `mobile/app/_layout.tsx`, dentro de `Guarded()`, agregar el import y la llamada (el hook decide solo según `enabled`):

```ts
// junto a los otros imports:
import { useSyncPendingSessions } from "../src/sync/useSyncPendingSessions";
```

Y dentro de `Guarded`, después de `const router = useRouter();` (antes del primer `useEffect`):

```ts
  // Re-sincroniza sesiones pendientes al abrir/enfocar la app cuando hay sesión (SES-1).
  useSyncPendingSessions(status === "in");
```

- [ ] **Step 6: Run the full mobile suite (no rompe el layout)**

Run: `cd mobile && npm test -- --runInBand`
Expected: PASS (incluye los tests existentes del layout/guard, si los hay).

- [ ] **Step 7: Mutation check**

En el hook, cambiar `if (s === "active")` por `if (s === "background")` → el 3er test falla. Revertir.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/sync/useSyncPendingSessions.ts mobile/app/_layout.tsx mobile/__tests__/useSyncPendingSessions.test.tsx
git commit -S -m "feat(ses-1): re-flush proactivo de la cola al abrir/enfocar la app"
```

---

## Task 5: Estado de sync visible en el resumen + botón reintentar

**Files:**
- Modify: `mobile/app/sesion.tsx` (`onFinish:545`, `saveFinishedNotes:577`, bloque resumen `338-352`)
- Test: `mobile/__tests__/sesion.test.tsx` (extender)

**Contexto:** el bloque del resumen (`if (finishedSession)`) hoy renderiza `SessionSummary` + `NotesEditor` + botón "Listo". Se agrega una fila de estado arriba del botón y estado nuevo en el componente.

- [ ] **Step 1: Write the failing test**

Agregar a `mobile/__tests__/sesion.test.tsx` (revisar los mocks del archivo; ya mockea navegación/storage). Test nuevo que fuerza un finish con sync fallido y verifica el cartel + botón. Adaptar el arranque al patrón del archivo (usa `render(<Sesion/>)` con storage sembrado). Ejemplo del assert central:

```tsx
test("tras terminar, si el sync falla muestra 'Pendiente de sincronizar' y el botón reintentar", async () => {
  // fetch de PUT /sessions falla con 500 → SyncError('server')
  (global.fetch as any) = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  // ... (sembrar sesión activa + montar como en los otros tests del archivo) ...
  // terminar:
  fireEvent.press(screen.getByTestId("finish-session")); // usar el testID real del botón terminar
  await waitFor(() => expect(screen.getByText(/Pendiente de sincronizar/i)).toBeTruthy());
  expect(screen.getByTestId("retry-sync")).toBeTruthy();
});

test("tras terminar, si el sync anda muestra 'Guardado ✓'", async () => {
  (global.fetch as any) = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  // ... terminar ...
  await waitFor(() => expect(screen.getByText(/Guardado/i)).toBeTruthy());
});
```

> El agente que implemente debe alinear el arranque del test con los helpers existentes de `sesion.test.tsx` (cómo siembra la sesión activa y qué `testID` tiene el botón de terminar — buscar en el archivo). Si el botón de terminar no tiene `testID`, agregarle `testID="finish-session"` en `sesion.tsx` como parte de esta task.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: FAIL — no existe el texto "Pendiente de sincronizar" ni `testID="retry-sync"`.

- [ ] **Step 3: Write minimal implementation**

En `mobile/app/sesion.tsx`:

1. Imports:
```ts
import { syncPending, type SyncResult } from "../src/sync/syncSessions";
```

2. Estado nuevo (junto a `finishedSession`):
```ts
  const [syncState, setSyncState] = useState<"syncing" | "synced" | "pending">("syncing");
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
```

3. Helper para aplicar un `SyncResult` al estado:
```ts
  function applySyncResult(r: SyncResult) {
    if (!mounted.current) return;
    if (r.remaining === 0) { setSyncState("synced"); setSyncMsg(null); }
    else { setSyncState("pending"); setSyncMsg(r.lastError?.userMessage ?? "Pendiente"); }
  }
```

4. En `onFinish`, reemplazar el bloque fire-and-forget final:
```ts
    setSyncState("syncing");
    setSyncMsg(null);
    setFinishedSession(done);
    const url = await getBackendUrl();
    if (url) {
      try { applySyncResult(await syncPending(url)); }
      catch { if (mounted.current) { setSyncState("pending"); setSyncMsg("Sin conexión"); } }
    } else if (mounted.current) { setSyncState("pending"); setSyncMsg("Backend sin configurar"); }
```
(Es decir: se muestra el resumen al instante con "Sincronizando…", y el resultado del `syncPending` actualiza el cartel. Ya NO es `void` ciego.)

5. En `saveFinishedNotes`, reemplazar el `void syncPending(url)` por el mismo patrón:
```ts
    setSyncState("syncing");
    const url = await getBackendUrl();
    if (url) { try { applySyncResult(await syncPending(url)); } catch { if (mounted.current) { setSyncState("pending"); setSyncMsg("Sin conexión"); } } }
```

6. Handler de reintento:
```ts
  async function onRetrySync() {
    setSyncState("syncing"); setSyncMsg(null);
    const url = await getBackendUrl();
    if (!url) { if (mounted.current) { setSyncState("pending"); setSyncMsg("Backend sin configurar"); } return; }
    try { applySyncResult(await syncPending(url)); }
    catch { if (mounted.current) { setSyncState("pending"); setSyncMsg("Sin conexión"); } }
  }
```

7. En el bloque del resumen (`if (finishedSession)`), agregar la fila de estado ANTES del botón "Listo":
```tsx
        {syncState === "syncing" && (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Sincronizando…</Text>
        )}
        {syncState === "synced" && (
          <Text style={{ color: colors.text, fontSize: 13 }}>Guardado ✓</Text>
        )}
        {syncState === "pending" && (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.accentText, fontSize: 13 }}>
              Pendiente de sincronizar{syncMsg ? ` — ${syncMsg}` : ""}
            </Text>
            <Pressable
              testID="retry-sync"
              onPress={onRetrySync}
              style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.sm, alignItems: "center" }}
            >
              <Text style={{ color: colors.text }}>Reintentar sincronización</Text>
            </Pressable>
          </View>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: PASS.

- [ ] **Step 5: Mutation check**

Cambiar `r.remaining === 0` por `true` en `applySyncResult` → el test de "Pendiente" falla. Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(ses-1): estado de sync visible + reintentar en el resumen de sesión"
```

---

## Task 6: Botón "Listo" más clickeable + safe-area

**Files:**
- Modify: `mobile/app/sesion.tsx` (bloque resumen `338-352`)
- Test: manual/visual (safe-area no es unit-testeable de forma fiable); se cubre con un smoke test del render.

- [ ] **Step 1: Implementación**

En `sesion.tsx`:

1. Import (si no está ya):
```ts
import { useSafeAreaInsets } from "react-native-safe-area-context";
```

2. Dentro del componente (arriba, con los otros hooks):
```ts
  const insets = useSafeAreaInsets();
```

3. En el `ScrollView` del resumen, ajustar el `contentContainerStyle` para respetar el safe-area inferior:
```tsx
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
      >
```

4. Agrandar el botón "Listo" (target más grande, texto más visible):
```tsx
        <Pressable
          testID="summary-done"
          onPress={() => router.replace("/")}
          style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.md }}
        >
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>Listo</Text>
        </Pressable>
```

- [ ] **Step 2: Smoke test (el resumen sigue renderizando el botón)**

Si `sesion.test.tsx` no cubre ya que `summary-done` está presente tras terminar, agregar un assert mínimo en el test de "Guardado ✓" (Task 5):
```tsx
  expect(screen.getByTestId("summary-done")).toBeTruthy();
```

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "fix(ses-1): botón Listo con safe-area inferior y target más grande"
```

---

## Task 7: (Backend) Log de `PUT /sessions`

**Files:**
- Modify: `backend/src/routes/sessions.ts` (`r.put("/:id")`, líneas ~107-125)
- Test: `backend/src/routes/sessions.test.ts` (extender)

- [ ] **Step 1: Write the failing test**

Agregar a `backend/src/routes/sessions.test.ts`:

```ts
test("PUT /sessions loguea userId + id + status (200)", async () => {
  const logs: string[] = [];
  const spy = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  try {
    const app = createApp(deps(fakeDb(null, null, [])) as any);
    const res = await app.request(`/sessions/${SID}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validSession),
    });
    expect(res.status).toBe(200);
  } finally { console.log = spy; }
  const line = logs.find((l) => l.includes("PUT /sessions") && l.includes(SID));
  expect(line).toBeTruthy();
  expect(line).toContain("200");
  expect(line).toContain(SINGLE_USER_ID); // userId en single-user
});
```

> `SINGLE_USER_ID` ya está importado en el archivo. `deps(...)` es single-user, así que `c.get("userId")` = `SINGLE_USER_ID`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/routes/sessions.test.ts`
Expected: FAIL — no se emite ninguna línea de log.

- [ ] **Step 3: Write minimal implementation**

En `backend/src/routes/sessions.ts`, dentro de `r.put("/:id")`, loguear el status de salida en cada return relevante. Reescribir el handler para capturar el status:

```ts
  r.put("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const log = (status: number) => console.log(`PUT /sessions ${id} user=${userId} status=${status}`);
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      log(400);
      return c.json({ error: "JSON inválido" }, 400);
    }
    const parsed = WorkoutSessionSchema.safeParse(raw);
    if (!parsed.success) { log(400); return c.json({ error: parsed.error.issues }, 400); }
    if (parsed.data.id !== id) { log(400); return c.json({ error: "el id de la URL no coincide con el del body" }, 400); }
    const owner = await getSessionOwnerId(deps.db, id);
    if (owner && owner !== userId) { log(409); return c.json({ error: "esa sesión pertenece a otro usuario" }, 409); }
    await upsertSession(deps.db, userId, parsed.data);
    log(200);
    return c.json({ id }, 200);
  });
```

(Se movió `const userId = c.get("userId")` al principio para que el `log` lo tenga; el resto de la lógica no cambia.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/routes/sessions.test.ts`
Expected: PASS (incluye el test nuevo + los existentes).

- [ ] **Step 5: Mutation check**

Borrar el `log(200)` → el test nuevo falla. Revertir.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/sessions.ts backend/src/routes/sessions.test.ts
git commit -S -m "feat(ses-1): loguear PUT /sessions (userId+id+status) para diagnóstico"
```

---

## Cierre (tras todas las tasks)

- [ ] **Suite completa verde**

```bash
# raíz
bun test shared backend
# móvil
cd mobile && npm test -- --runInBand
```
Expected: todo PASS.

- [ ] **Typecheck móvil** (si el repo tiene el script):

```bash
cd mobile && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Abrir PR** `feat/ses-1-sync-fiable` → `main` y disparar `@claude review` automáticamente (memoria `auto-claude-review-on-pr`). NO mergear sin resolver los comentarios.

- [ ] **Confirmar deploy con el owner ANTES de mergear** (Task 7 toca backend → un merge a `main` auto-deploya a la Pi). El fix móvil (Tasks 1-6) llega por **OTA** a runtime `11` tras publicar `eas update` (memoria `ota-always-publish` + `ota-fingerprint-gotcha`: verificar el runtime en la salida).

## Self-review (hecho)

- **Cobertura del spec:** A→Task 1+2, B→Task 3, C→Task 4, D→Task 5, E→Task 6, F→Task 7. ✓
- **Placeholders:** el único punto abierto es alinear el arranque del test de `sesion.test.tsx` con los helpers del archivo (Task 5 Step 1) — es una instrucción concreta, no un placeholder de código.
- **Consistencia de tipos:** `SyncError.kind/retryable/userMessage`, `SyncResult { synced, remaining, lastError }`, `useSyncPendingSessions(enabled: boolean)` usados igual en todas las tasks. ✓
