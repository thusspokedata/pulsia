# Generación asíncrona — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que generar un programa no dependa de una conexión larga: el POST devuelve un `jobId`, el server genera en background, la app pollea. Elimina el 499 en móvil.

**Architecture:** Tabla `generation_jobs` (pending/done/error). `POST /programs/generate-async` crea el job + dispara `runGenerationJob` en background (floating promise) + responde `{ jobId }`. `GET /programs/generate-async/:jobId` devuelve el estado (+ el programa cuando `done`). Mobile: `generando.tsx` pollea cada 3s. El `POST /programs/generate` sync se mantiene (back-compat). Ver spec `docs/superpowers/specs/2026-07-09-async-generation-design.md`.

**Tech Stack:** Bun + Hono + Drizzle (backend, `bun:test`); Expo + expo-router + jest (mobile, JS-only → OTA).

---

## File Structure
**PR-A backend (`feat/async-generation-backend`):**
- Modify: `backend/src/db/schema.ts` — tabla `generationJobs`.
- Create: `backend/drizzle/0006_*.sql` — migración (generada con `db:generate`).
- Create: `backend/src/programs/generateJob.ts` — `runGenerationJob(...)`.
- Create: `backend/src/programs/generateJob.test.ts`.
- Modify: `backend/src/routes/programs.ts` — endpoints `generate-async` (POST + GET).
- Modify: `backend/src/routes/programs.test.ts` — tests de los endpoints.

**PR-B mobile (`feat/async-generation-mobile`, off main tras mergear PR-A):**
- Modify: `mobile/src/api/programs.ts` — `startGeneration` + `getGenerationStatus`.
- Modify: `mobile/app/generando.tsx` — polling.
- Modify: `mobile/__tests__/...` — tests.

---

# PR-A — Backend

## Task 1: Tabla `generation_jobs` + migración

**Files:** Modify `backend/src/db/schema.ts`; Create `backend/drizzle/0006_*.sql`.

- [ ] **Step 1: Agregar la tabla** — En `backend/src/db/schema.ts`, después de la tabla `programs` (o al final), agregar:
```ts
export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  status: text("status").notNull(), // 'pending' | 'done' | 'error'
  programId: uuid("program_id").references(() => programs.id),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```
(Verificá que `pgTable, uuid, text, timestamp` ya estén importados arriba — lo están.)

- [ ] **Step 2: Generar la migración** — `cd backend && bun run db:generate`. Debe crear `backend/drizzle/0006_*.sql` con el `CREATE TABLE generation_jobs`. Verificá el contenido con `cat backend/drizzle/0006_*.sql` (debe tener el CREATE TABLE + las FKs a users/programs). NO necesita conexión a DB.

- [ ] **Step 3: Typecheck** — `cd backend && bunx tsc --noEmit` → limpio.

- [ ] **Step 4: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/db/schema.ts backend/drizzle/
git commit -S -m "feat(backend): tabla generation_jobs + migración (generación async)"
```

## Task 2: `runGenerationJob`

**Files:** Create `backend/src/programs/generateJob.ts`, `backend/src/programs/generateJob.test.ts`.

- [ ] **Step 1: Failing test** — `backend/src/programs/generateJob.test.ts`:
```ts
import { test, expect } from "bun:test";
import { runGenerationJob } from "./generateJob";

const profile: any = { experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45, gymEquipment: ["barbell"], homeEquipment: ["bodyweight"], limitations: [] };
const program = { name: "Plan", weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "D1", location: "gym", focus: "chest", exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" }] }] }] };

// fakeDb que registra el update del job y sirve datos mínimos.
function fakeDb() {
  const updates: any[] = [];
  const inserted = [{ id: "prog-1" }];
  return {
    _updates: updates,
    query: { workoutSession: { findMany: async () => [] }, athleteMemory: { findFirst: async () => null } },
    insert: () => ({ values: () => ({ returning: async () => inserted, onConflictDoUpdate: async () => {} }) }),
    update: () => ({ set: (v: any) => ({ where: async () => { updates.push(v); } }) }),
  } as any;
}
const deps = (ai: any) => ({ db: fakeDb(), config: { encryptionKey: "a".repeat(64), defaultModel: "m" }, aiClient: ai } as any);

test("éxito: marca el job done con el programId", async () => {
  const d = deps({ generateProgram: async () => program, updateMemory: async () => "m2" });
  await runGenerationJob(d, "job-1", "u1", profile, "sk", "m");
  expect(d.db._updates.some((u: any) => u.status === "done" && u.programId === "prog-1")).toBe(true);
});

test("error de IA: marca el job error", async () => {
  const d = deps({ generateProgram: async () => { throw new Error("IA caída"); }, updateMemory: async () => "m2" });
  await runGenerationJob(d, "job-1", "u1", profile, "sk", "m");
  expect(d.db._updates.some((u: any) => u.status === "error" && typeof u.error === "string")).toBe(true);
});
```

- [ ] **Step 2: Run to fail** — `cd backend && bun test src/programs/generateJob.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implement** — `backend/src/programs/generateJob.ts`:
```ts
import { eq } from "drizzle-orm";
import type { TrainingProfile } from "@pulsia/shared";
import { programs, generationJobs } from "../db/schema";
import { getRecentSessions } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";
import { getMemory } from "../memory/repository";
import { refreshAthleteMemory } from "../memory/service";
import { generateProgramForProfile } from "../ai/generate";
import type { AppDeps } from "../app";

// Corre la generación (una llamada a la IA), guarda el programa y actualiza el job.
// Pensado para correr en background (floating promise): NUNCA throwea (captura todo y marca el job).
export async function runGenerationJob(
  deps: AppDeps,
  jobId: string,
  userId: string,
  profile: TrainingProfile,
  apiKey: string,
  model: string,
): Promise<void> {
  try {
    const recent = await getRecentSessions(deps.db, userId, 6);
    const historySummary = buildTrainingHistorySummary(recent);
    const memory = await getMemory(deps.db, userId);
    const program = await generateProgramForProfile({ profile, apiKey, model, ai: deps.aiClient, historySummary, memory });
    const inserted = await deps.db
      .insert(programs)
      .values({ userId, name: program.name, data: program, profileSnapshot: profile })
      .returning();
    await deps.db.update(generationJobs).set({ status: "done", programId: inserted[0].id }).where(eq(generationJobs.id, jobId));
    // Refresh de memoria en background para las próximas generaciones (best-effort).
    void refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model, { current: memory, historySummary })
      .catch((e) => console.warn("refresh de memoria (bg) falló:", (e as Error).message));
  } catch (e) {
    await deps.db
      .update(generationJobs)
      .set({ status: "error", error: (e as Error).message })
      .where(eq(generationJobs.id, jobId))
      .catch((err) => console.warn("no se pudo marcar el job como error:", (err as Error).message));
  }
}
```

- [ ] **Step 4: Run to pass** — `cd backend && bun test src/programs/generateJob.test.ts && bunx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/programs/generateJob.ts backend/src/programs/generateJob.test.ts
git commit -S -m "feat(backend): runGenerationJob (genera en background y actualiza el job)"
```

## Task 3: Endpoints `generate-async` (POST + GET)

**Files:** Modify `backend/src/routes/programs.ts`, `backend/src/routes/programs.test.ts`.

- [ ] **Step 1: Failing test** — En `backend/src/routes/programs.test.ts`, agregar (el `fakeDb` existente debe soportar `generationJobs`; ajustalo si hace falta para que `insert(...).returning()` devuelva `[{ id: "job-1", ... }]` y `query.generationJobs.findFirst` devuelva un job):
```ts
test("POST /programs/generate-async devuelve un jobId y crea el job", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-async", { method: "POST", headers: authHeaders, body: JSON.stringify(validProfileBody) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(typeof body.jobId).toBe("string");
});

test("POST /programs/generate-async sin key (ni user ni server) → 400", async () => {
  const db = fakeDb(false);
  const app = createApp(deps(db) as any); // deps sin defaultAiApiKey
  const res = await app.request("/programs/generate-async", { method: "POST", headers: authHeaders, body: JSON.stringify(validProfileBody) });
  expect(res.status).toBe(400);
});
```
(Nota: puede que necesites extender el `fakeDb` de programs.test.ts para `query.generationJobs.findFirst` y para que `insert` sobre generationJobs devuelva un id. Seguí el patrón del fake existente; si el `insert` es genérico —no discrimina tabla— ya devuelve `[{...id}]` y alcanza.)

- [ ] **Step 2: Run to fail** — `cd backend && bun test src/routes/programs.test.ts` → FAIL (endpoint no existe → 404).

- [ ] **Step 3: Implement** — En `backend/src/routes/programs.ts`:
  (a) Imports: agregar `import { runGenerationJob } from "../programs/generateJob";`, `import { and } from "drizzle-orm";` (si no está; ya está `eq`), y agregar `generationJobs` al import de `../db/schema` (junto a `programs, settings`).
  (b) Agregar los handlers (después del handler `/generate`, antes de `/generate-oneoff` o al final, da igual):
```ts
  r.post("/generate-async", async (c) => {
    const userId = c.get("userId");
    const parsed = TrainingProfileSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA configurada. Cargala en Configuración." }, 400);
    const model = row?.aiModel ?? deps.config.defaultModel;
    const [job] = await deps.db.insert(generationJobs).values({ userId, status: "pending" }).returning();
    // La generación corre DESPUÉS de responder (floating promise): la conexión con el cliente es corta.
    void runGenerationJob(deps, job.id, userId, parsed.data, apiKey, model);
    return c.json({ jobId: job.id });
  });

  r.get("/generate-async/:jobId", async (c) => {
    const userId = c.get("userId");
    const jobId = c.req.param("jobId");
    const job = await deps.db.query.generationJobs.findFirst({ where: and(eq(generationJobs.id, jobId), eq(generationJobs.userId, userId)) });
    if (!job) return c.json({ error: "job no encontrado" }, 404);
    if (job.status === "done" && job.programId) {
      const prog = await deps.db.query.programs.findFirst({ where: and(eq(programs.id, job.programId), eq(programs.userId, userId)) });
      return c.json({ status: "done", programId: job.programId, program: prog?.data });
    }
    return c.json({ status: job.status, error: job.error ?? undefined });
  });
```

- [ ] **Step 4: Run to pass** — `cd backend && bun test && bunx tsc --noEmit` → PASS (toda la suite). Si algún test viejo rompe por el fake de generationJobs, ajustá el fake.

- [ ] **Step 5: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/routes/programs.ts backend/src/routes/programs.test.ts
git commit -S -m "feat(backend): endpoints generate-async (POST job + GET status)"
```

## Task 4: Verificación + PR (backend)
- [ ] `cd /Users/kilo/desarrollo26/pulsia/backend && bun test && bunx tsc --noEmit && cd ../shared && bun test` → verde.
- [ ] `git push -u origin feat/async-generation-backend` + `gh pr create --title "feat: generación asíncrona — backend (job + endpoints)" --body "Ver spec 2026-07-09-async-generation-design.md. Tabla generation_jobs + POST/GET generate-async. El sync /generate se mantiene."`
- [ ] Code review (protocolo). Tras mergear, verificar el deploy en la Pi (health) y que la migración corrió (`generation_jobs` existe).

---

# PR-B — Mobile (JS-only → OTA)

## Task 5: `startGeneration` + `getGenerationStatus`

**Files:** Modify `mobile/src/api/programs.ts`.

- [ ] **Step 1: Implement** — En `mobile/src/api/programs.ts`, agregar (reusando `apiFetch`, `GenerationError`, `ProgramSchema`, `Program`, `TrainingProfile` ya importados; verificá los códigos válidos de `GenerationError` en el archivo y usá los mismos: noApiKey/aiError/network/invalid/timeout):
```ts
export async function startGeneration(baseUrl: string, profile: TrainingProfile): Promise<{ jobId: string }> {
  const res = await apiFetch(baseUrl, "/programs/generate-async", { method: "POST", body: JSON.stringify(profile) });
  if (res.status === 400) throw new GenerationError("noApiKey", "No hay API key de IA configurada.");
  if (!res.ok) throw new GenerationError("aiError", "No se pudo iniciar la generación. Reintentá.");
  const data = await res.json().catch(() => null);
  if (!data?.jobId) throw new GenerationError("invalid", "El backend devolvió una respuesta inválida.");
  return { jobId: data.jobId };
}

export type GenerationStatus =
  | { status: "pending" }
  | { status: "done"; programId: string; program: Program }
  | { status: "error"; error?: string };

export async function getGenerationStatus(baseUrl: string, jobId: string): Promise<GenerationStatus> {
  const res = await apiFetch(baseUrl, `/programs/generate-async/${jobId}`);
  if (!res.ok) throw new GenerationError("network", "No se pudo consultar el estado de la generación.");
  const data = await res.json().catch(() => null);
  if (data?.status === "done") {
    const parsed = ProgramSchema.safeParse(data.program);
    if (!parsed.success) throw new GenerationError("invalid", "El programa recibido es inválido.");
    return { status: "done", programId: data.programId, program: parsed.data };
  }
  if (data?.status === "error") return { status: "error", error: data.error };
  return { status: "pending" };
}
```

- [ ] **Step 2: Typecheck** — `cd mobile && bunx tsc --noEmit` → limpio.

- [ ] **Step 3: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/api/programs.ts
git commit -S -m "feat(mobile): startGeneration + getGenerationStatus (generación async)"
```

## Task 6: Polling en `generando.tsx`

**Files:** Modify `mobile/app/generando.tsx`, `mobile/__tests__/generando.test.tsx` (crear si no existe).

- [ ] **Step 1: Failing test** — `mobile/__tests__/generando.test.tsx` (mockea start → jobId, y status → pending una vez, luego done):
```tsx
import { render, waitFor } from "@testing-library/react-native";
import GenerandoScreen from "../app/generando";
import { startGeneration, getGenerationStatus } from "../src/api/programs";
import { setStoredProgram } from "../src/storage/program";
import { router } from "expo-router";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/storage/profile", () => ({ getProfile: async () => ({ experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45, gymEquipment: ["barbell"], homeEquipment: ["bodyweight"], limitations: [] }) }));
jest.mock("../src/storage/program", () => ({ setStoredProgram: jest.fn() }));
jest.mock("../src/storage/programId", () => ({ setStoredProgramId: jest.fn() }));
const prog = { name: "Plan", weeks: [] };
jest.mock("../src/api/programs", () => ({
  GenerationError: class extends Error { code: string; constructor(code: string, m: string){ super(m); this.code = code; } },
  startGeneration: jest.fn(async () => ({ jobId: "job-1" })),
  getGenerationStatus: jest.fn(),
}));

test("startea, pollea hasta done y guarda + navega", async () => {
  (getGenerationStatus as jest.Mock).mockResolvedValueOnce({ status: "pending" }).mockResolvedValue({ status: "done", programId: "p1", program: prog });
  render(<GenerandoScreen />);
  await waitFor(() => expect(startGeneration).toHaveBeenCalled());
  await waitFor(() => expect(setStoredProgram).toHaveBeenCalledWith(prog), { timeout: 10000 });
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
});
```

- [ ] **Step 2: Run to fail** — `cd mobile && bunx jest __tests__/generando.test.tsx` → FAIL (usa `generateProgram`, no el polling).

- [ ] **Step 3: Implement** — En `mobile/app/generando.tsx`, cambiar el import `generateProgram` por `startGeneration, getGenerationStatus` (mantener `GenerationError`), y reemplazar el cuerpo del `try` en `run()` por el polling:
```tsx
    try {
      const { jobId } = await startGeneration(url, profile);
      const deadline = Date.now() + 5 * 60 * 1000;
      // Poll corto cada 3s: la conexión con el server es breve (sin request larga → sin 499).
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!mounted.current) return;
        const st = await getGenerationStatus(url, jobId);
        if (!mounted.current) return;
        if (st.status === "done") {
          await setStoredProgram(st.program);
          await setStoredProgramId(st.programId);
          if (!mounted.current) return;
          router.replace("/");
          return;
        }
        if (st.status === "error") {
          throw new GenerationError("aiError", st.error || "La IA no pudo generar el programa. Reintentá.");
        }
      }
      throw new GenerationError("timeout", "La generación tardó demasiado. Reintentá.");
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof GenerationError && e.code === "noApiKey") {
        setError({ message: e.message, button: "Cargá tu API key en Configuración", onPress: () => router.replace("/configuracion") });
      } else {
        const message = e instanceof GenerationError ? e.message : "Error inesperado.";
        setError({ message, button: "Reintentar", onPress: () => run() });
      }
    }
```
(Actualizá el texto de la pantalla "Esto puede tardar hasta un minuto." si querés; opcional.)

- [ ] **Step 4: Run to pass** — `cd mobile && bunx jest __tests__/generando.test.tsx && bunx jest && bunx tsc --noEmit` → PASS (suite completa verde). Si algún test viejo mockeaba `generateProgram` desde generando, ajustar.

- [ ] **Step 5: Commit**
```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/generando.tsx mobile/__tests__/generando.test.tsx
git commit -S -m "feat(mobile): generación async con polling en generando.tsx"
```

## Task 7: Verificación + PR (mobile)
- [ ] `cd mobile && bunx jest && bunx tsc --noEmit` → verde.
- [ ] `git push -u origin feat/async-generation-mobile` + `gh pr create --title "feat: generación asíncrona — mobile (polling, JS-only → OTA)"`.
- [ ] Code review. Tras mergear → **publicar OTA** (`cd mobile && bunx --bun eas-cli update --branch preview --environment preview --message "async generation" --non-interactive`). No requiere build nuevo.

---

## Self-Review
- Cobertura del spec: tabla+migración (T1) ✓; runGenerationJob (T2) ✓; endpoints POST/GET (T3) ✓; sync /generate intacto (no se toca) ✓; mobile start/status (T5) + polling (T6) ✓; OTA (T7) ✓.
- Consistencia: `runGenerationJob(deps, jobId, userId, profile, apiKey, model)` idéntico en impl y route; `{ jobId }` del POST → `getGenerationStatus` → `{ status, programId, program }` consumido por generando.tsx.
- Placeholders: ninguno.
- Riesgo: los tests de route pueden requerir extender el `fakeDb` para `generationJobs` (findFirst) — anotado en T3.
