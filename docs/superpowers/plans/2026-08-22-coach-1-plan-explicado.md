# COACH-1 · Plan de trabajo explicado por la IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la capa de explicabilidad del plan: un objetivo de trabajo editable, el porqué (rationale) por día y global del programa y de la meta nutricional, y una vista global que hila todo.

**Architecture:** Tres fases. Fase 1 crea el "objetivo de trabajo" (tabla nueva `work_objective` + rutas + borrador IA + pantalla editable). Fase 2 agrega el rationale: función pura determinista para la meta nutricional (en `shared`) + rationale por día/global del programa emitido por la IA y persistido dentro del `Program` JSON. Fase 3 arma la vista global que compone las tres partes. Todo JS/backend (sin APK nativo; OTA al mergear móvil).

**Tech Stack:** Bun + Hono + Drizzle/Postgres (backend), Zod en `@pulsia/shared`, Expo/React Native + jest (mobile). Tests: `bun test` (raíz) y `npm test -- --runInBand` (mobile).

**Spec:** `docs/superpowers/specs/2026-08-22-coach-1-plan-explicado-design.md`

**Convenciones (recordatorio):** TDD con verificación por mutación de cada test nuevo; commits firmados `git commit -S` **sin** atribución a Claude; fixtures **sintéticos** (repo público); rama por fase → PR revisado → merge squash. Correr desde el worktree.

---

## File Structure

**Fase 1 — Objetivo de trabajo**
- Create `backend/src/objective/repository.ts` — get/upsert del blob por usuario.
- Create `backend/src/ai/objective.ts` — prompt `buildWorkObjectiveDraftPrompt`.
- Create `backend/src/routes/objective.ts` — `GET`/`PUT`/`POST /draft`.
- Modify `backend/src/db/schema.ts` — tabla `work_objective`.
- Create `backend/drizzle/<NNNN>_work_objective.sql` — migración (número lo asigna `drizzle-kit`).
- Modify `backend/src/ai/client.ts` — método opcional `draftWorkObjective` en `AiClient` + `AnthropicAiClient`.
- Modify `backend/src/app.ts` — montar `/objective`.
- Create `mobile/src/api/objective.ts` — `getObjective`/`putObjective`/`draftObjective`.
- Create `mobile/app/objetivo-trabajo.tsx` — pantalla editable.
- Modify `mobile/app/(tabs)/perfil.tsx` — link a la pantalla.

**Fase 2 — Rationale**
- Modify `shared/src/schemas/program.ts` — `rationale` opcional en Workout/Program + `ProgramGenerationSchema` estricto.
- Create `shared/src/nutrition/goalRationale.ts` — función pura determinista.
- Modify `shared/src/index.ts` — export de `buildGoalRationale`.
- Modify `backend/src/ai/prompt.ts` — inyectar objetivo + regla que exige rationale.
- Modify `backend/src/ai/client.ts` — usar `ProgramGenerationSchema` en la generación completa.
- Modify `backend/src/ai/generate.ts` — pasar `workObjective` a través de `generateProgramForProfile`.
- Modify `backend/src/programs/generateJob.ts` — leer `getWorkObjective` y pasarlo.
- Modify `mobile/app/nutricion/objetivo.tsx` — mostrar el porqué de la meta (colapsable).

**Fase 3 — Vista global**
- Create `mobile/app/plan-trabajo.tsx` — compone objetivo + meta+porqué + programa+rationale.
- Modify `mobile/app/(tabs)/perfil.tsx` — link a "Plan de trabajo".
- Modify `mobile/src/api/programs.ts` (o el módulo que cargue el último programa) — reusar carga existente si ya expone el `Program`.

---

# FASE 1 — Objetivo de trabajo

## Task 1.1: Tabla `work_objective` (schema + migración)

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/<generado>_work_objective.sql`

- [ ] **Step 1: Agregar la tabla al schema Drizzle**

En `backend/src/db/schema.ts`, junto a `athleteMemory` (que es el patrón espejo), agregar:

```ts
export const workObjective = pgTable("work_objective", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").default("").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Generar la migración**

Run: `cd backend && bun run db:generate` (drizzle-kit; usa el nombre real del script de `package.json`, p.ej. `drizzle-kit generate`).
Expected: crea `backend/drizzle/<NNNN>_*.sql` con `CREATE TABLE "work_objective"`.

- [ ] **Step 3: Verificar el SQL generado**

Abrir el `.sql` nuevo y confirmar `CREATE TABLE "work_objective"` con `user_id` PK, FK a `users(id)` `ON DELETE CASCADE`, `content` NOT NULL DEFAULT '', `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle
git commit -S -m "feat(coach-1): tabla work_objective (objetivo de trabajo por usuario)"
```

## Task 1.2: Repositorio del objetivo

**Files:**
- Create: `backend/src/objective/repository.ts`
- Test: `backend/src/objective/repository.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/objective/repository.test.ts
import { test, expect } from "bun:test";
import { getWorkObjective, upsertWorkObjective } from "./repository";

function fakeDb(initial: string | null) {
  let row = initial == null ? null : { userId: "u1", content: initial };
  return {
    _get: () => row,
    query: { workObjective: { findFirst: async () => row } },
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { row = { userId: v.userId, content: set.content }; },
      }),
    }),
  } as any;
}

test("getWorkObjective devuelve '' cuando no hay fila", async () => {
  expect(await getWorkObjective(fakeDb(null), "u1")).toBe("");
});

test("getWorkObjective devuelve el contenido guardado", async () => {
  expect(await getWorkObjective(fakeDb("bajar grasa manteniendo fuerza"), "u1")).toBe("bajar grasa manteniendo fuerza");
});

test("upsertWorkObjective persiste el contenido", async () => {
  const db = fakeDb(null);
  await upsertWorkObjective(db, "u1", "recomposición 12 semanas");
  expect(db._get().content).toBe("recomposición 12 semanas");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && bun test src/objective/repository.test.ts`
Expected: FAIL (`Cannot find module './repository'`).

- [ ] **Step 3: Implementar el repositorio**

```ts
// backend/src/objective/repository.ts
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { workObjective } from "../db/schema";

// Cota defensiva contra crecimiento accidental (el objetivo es prosa corta, 2-4 frases).
export const MAX_OBJECTIVE_CHARS = 2000;

export async function getWorkObjective(db: Db, userId: string): Promise<string> {
  const row = await db.query.workObjective.findFirst({ where: eq(workObjective.userId, userId) });
  return row?.content ?? "";
}

export async function upsertWorkObjective(db: Db, userId: string, content: string): Promise<void> {
  const capped = content.length > MAX_OBJECTIVE_CHARS ? content.slice(0, MAX_OBJECTIVE_CHARS) : content;
  await db
    .insert(workObjective)
    .values({ userId, content: capped })
    .onConflictDoUpdate({ target: workObjective.userId, set: { content: capped, updatedAt: new Date() } });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && bun test src/objective/repository.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificación por mutación**

Cambiar `?? ""` por `?? "X"` en `getWorkObjective` → el primer test debe fallar. Revertir.

- [ ] **Step 6: Commit**

```bash
git add backend/src/objective
git commit -S -m "feat(coach-1): repositorio del objetivo de trabajo"
```

## Task 1.3: Prompt del borrador (IA)

**Files:**
- Create: `backend/src/ai/objective.ts`
- Test: `backend/src/ai/objective.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/ai/objective.test.ts
import { test, expect } from "bun:test";
import { buildWorkObjectiveDraftPrompt } from "./objective";

const profile = {
  experience: "intermediate", goal: "recomposition", daysPerWeek: 4, sessionMinutes: 60,
  gymEquipment: [], homeEquipment: [], limitations: [],
} as any;

test("incluye objetivo de entrenamiento, nutricional y memoria", () => {
  const p = buildWorkObjectiveDraftPrompt({
    profile, memory: "no tiene barra; molestia en hombro",
    nutritionObjective: "lose",
  });
  expect(p).toContain("recomposition");
  expect(p).toContain("lose");
  expect(p).toContain("molestia en hombro");
});

test("memoria vacía no rompe", () => {
  const p = buildWorkObjectiveDraftPrompt({ profile, memory: "", nutritionObjective: "maintain" });
  expect(typeof p).toBe("string");
  expect(p.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && bun test src/ai/objective.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar el prompt**

```ts
// backend/src/ai/objective.ts
import { GOAL_ES } from "./prompt";
import type { TrainingProfile } from "@pulsia/shared";

const NUTRITION_ES: Record<string, string> = {
  lose: "bajar de peso / grasa", maintain: "mantener el peso", gain: "subir de peso / masa",
};

// Redacta el prompt para que la IA proponga un "objetivo de trabajo" (el norte) de la persona.
// Es un BORRADOR: el usuario lo edita/confirma. No debe inventar datos que no estén acá.
export function buildWorkObjectiveDraftPrompt(input: {
  profile: TrainingProfile;
  memory: string;
  nutritionObjective: string;
}): string {
  const { profile, memory, nutritionObjective } = input;
  return [
    "Sos un coach. Redactá el OBJETIVO DE TRABAJO (el norte) de esta persona: qué buscamos lograr y",
    "el enfoque general, en 2-4 frases claras en español. Es un borrador que la persona va a editar.",
    "No inventes datos que no estén acá.",
    "",
    `Objetivo de entrenamiento: ${profile.goal}${GOAL_ES[profile.goal] ? ` (${GOAL_ES[profile.goal]})` : ""}`,
    `Objetivo nutricional: ${nutritionObjective}${NUTRITION_ES[nutritionObjective] ? ` (${NUTRITION_ES[nutritionObjective]})` : ""}`,
    `Experiencia: ${profile.experience}`,
    `Días por semana: ${profile.daysPerWeek} · Minutos por sesión: ${profile.sessionMinutes}`,
    `Limitaciones: ${profile.limitations.join("; ") || "ninguna"}`,
    "",
    "Lo que la IA sabe de la persona (memoria):",
    memory.trim() || "(sin memoria todavía)",
    "",
    "Escribí SOLO el objetivo de trabajo, en texto plano, sin preámbulos.",
  ].join("\n");
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && bun test src/ai/objective.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verificación por mutación**

Quitar la línea del `nutritionObjective` del array → el primer test falla (`toContain("lose")`). Revertir.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/objective.ts backend/src/ai/objective.test.ts
git commit -S -m "feat(coach-1): prompt del borrador de objetivo de trabajo"
```

## Task 1.4: `draftWorkObjective` en el AiClient

**Files:**
- Modify: `backend/src/ai/client.ts`

- [ ] **Step 1: Agregar el método a la interfaz `AiClient`**

En `backend/src/ai/client.ts`, dentro de `export interface AiClient`, después de `updateMemory?`, agregar:

```ts
  draftWorkObjective?(input: {
    profile: TrainingProfile;
    memory: string;
    nutritionObjective: string;
    apiKey: string;
    model: string;
  }): Promise<string>;
```

- [ ] **Step 2: Importar el prompt**

En el bloque de imports de `client.ts`, junto a `buildMemoryUpdatePrompt`:

```ts
import { buildWorkObjectiveDraftPrompt } from "./objective";
```

- [ ] **Step 3: Implementar en `AnthropicAiClient`**

Después del método `updateMemory` de la clase `AnthropicAiClient`, agregar (mismo patrón que `updateMemory` — respuesta de texto libre):

```ts
  async draftWorkObjective({ profile, memory, nutritionObjective, apiKey, model }: {
    profile: TrainingProfile;
    memory: string;
    nutritionObjective: string;
    apiKey: string;
    model: string;
  }): Promise<string> {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: buildWorkObjectiveDraftPrompt({ profile, memory, nutritionObjective }) }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : "";
  }
```

- [ ] **Step 4: Verificar que compila**

Run: `cd backend && bunx tsc --noEmit` (o el script `typecheck` del repo).
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/client.ts
git commit -S -m "feat(coach-1): AiClient.draftWorkObjective"
```

## Task 1.5: Rutas `/objective`

**Files:**
- Create: `backend/src/routes/objective.ts`
- Test: `backend/src/routes/objective.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Escribir el test que falla** (modela el harness de `routes/memory.test.ts`)

```ts
// backend/src/routes/objective.test.ts
import { test, expect } from "bun:test";
import { createApp } from "../app";
import { encryptSecret } from "../crypto/secrets";

const KEY = "a".repeat(64);

function fakeDb(opts: { objective?: string | null; withKey?: boolean } = {}) {
  const { objective = null, withKey = true } = opts;
  let row = objective == null ? null : { userId: "u1", content: objective };
  return {
    _get: () => row,
    query: {
      settings: {
        findFirst: async () => withKey
          ? { aiApiKeyEncrypted: encryptSecret("sk-ant-real", KEY), aiModel: "claude-sonnet-4-6" }
          : null,
      },
      sessions: { findFirst: async () => ({ token: "t", userId: "u1", expiresAt: new Date(Date.now() + 1e9) }) },
      workObjective: { findFirst: async () => row },
      profiles: { findFirst: async () => ({ userId: "u1", data: { goal: "recomposition", experience: "intermediate", daysPerWeek: 4, sessionMinutes: 60, gymEquipment: [], homeEquipment: [], limitations: [] } }) },
      nutritionGoal: { findFirst: async () => ({ objective: "lose", rateKgPerWeek: 0.25, manualKcal: null }) },
    },
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async ({ set }: any) => { row = { userId: v.userId, content: set.content }; } }) }),
  } as any;
}

function deps(db: any, ai: any) {
  return { db, config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4, singleUserMode: false }, aiClient: ai } as any;
}
const authHeader = { Authorization: "Bearer t" };

test("GET /objective devuelve el contenido", async () => {
  const app = createApp(deps(fakeDb({ objective: "mi norte" }), { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective", { headers: authHeader });
  expect(res.status).toBe(200);
  expect((await res.json()).content).toBe("mi norte");
});

test("PUT /objective persiste lo editado", async () => {
  const db = fakeDb({ objective: "" });
  const app = createApp(deps(db, { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective", { method: "PUT", headers: { ...authHeader, "content-type": "application/json" }, body: JSON.stringify({ content: "editado" }) });
  expect(res.status).toBe(200);
  expect(db._get().content).toBe("editado");
});

test("POST /objective/draft llama a la IA y NO persiste", async () => {
  const db = fakeDb({ objective: "" });
  const ai = { generateProgram: async () => ({ name: "x", weeks: [] }), draftWorkObjective: async () => "borrador IA" };
  const app = createApp(deps(db, ai));
  const res = await app.request("/objective/draft", { method: "POST", headers: authHeader });
  expect(res.status).toBe(200);
  expect((await res.json()).content).toBe("borrador IA");
  expect(db._get().content).toBe(""); // draft no persiste
});

test("POST /objective/draft → 501 si el cliente no soporta el método", async () => {
  const app = createApp(deps(fakeDb({ objective: "" }), { generateProgram: async () => ({ name: "x", weeks: [] }) }));
  const res = await app.request("/objective/draft", { method: "POST", headers: authHeader });
  expect(res.status).toBe(501);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && bun test src/routes/objective.test.ts`
Expected: FAIL (módulo `../routes/objective` inexistente / 404).

- [ ] **Step 3: Implementar la ruta**

```ts
// backend/src/routes/objective.ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getWorkObjective, upsertWorkObjective } from "../objective/repository";
import { getMemory } from "../memory/repository";
import { resolveAiKey } from "../ai/resolveKey";
import { settings, profiles, nutritionGoal } from "../db/schema";
import type { AppDeps } from "../app";

export function objectiveRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.get("/", async (c) => {
    return c.json({ content: await getWorkObjective(deps.db, c.get("userId")) });
  });

  r.put("/", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const content = typeof body?.content === "string" ? body.content : "";
    await upsertWorkObjective(deps.db, userId, content);
    return c.json({ content: await getWorkObjective(deps.db, userId) });
  });

  r.post("/draft", async (c) => {
    const userId = c.get("userId");
    if (!deps.aiClient.draftWorkObjective) return c.json({ error: "Borrador de objetivo no disponible." }, 501);
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA configurada." }, 400);
    const model = row?.aiModel ?? deps.config.defaultModel;

    const profileRow = await deps.db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    if (!profileRow?.data) return c.json({ error: "Completá tu perfil primero." }, 400);
    const goalRow = await deps.db.query.nutritionGoal.findFirst({ where: eq(nutritionGoal.userId, userId) });
    const memory = await getMemory(deps.db, userId);

    let content: string;
    try {
      content = await deps.aiClient.draftWorkObjective({
        profile: profileRow.data,
        memory,
        nutritionObjective: goalRow?.objective ?? "maintain",
        apiKey,
        model,
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
    return c.json({ content });
  });

  return r;
}
```

- [ ] **Step 4: Montar la ruta en `app.ts`**

En `backend/src/app.ts`: agregar el import `import { objectiveRoutes } from "./routes/objective";` junto a los demás, y montar (dentro del bloque autenticado, junto a `app.route("/memory", ...)`):

```ts
  app.route("/objective", objectiveRoutes(deps));
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && bun test src/routes/objective.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Verificación por mutación**

En `POST /draft`, borrar la guarda `if (!deps.aiClient.draftWorkObjective) ... 501` → el 4º test falla. Revertir.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/objective.ts backend/src/routes/objective.test.ts backend/src/app.ts
git commit -S -m "feat(coach-1): rutas GET/PUT/POST-draft de /objective"
```

## Task 1.6: API móvil del objetivo

**Files:**
- Create: `mobile/src/api/objective.ts`

- [ ] **Step 1: Implementar el cliente** (espeja `mobile/src/api/memory.ts`)

```ts
// mobile/src/api/objective.ts
import { apiFetch } from "./client";

export async function getObjective(baseUrl: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/objective");
  if (!res.ok) throw new Error("No se pudo cargar el objetivo");
  return ((await res.json()) as { content: string }).content;
}

export async function putObjective(baseUrl: string, content: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/objective", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("No se pudo guardar el objetivo");
  return ((await res.json()) as { content: string }).content;
}

// El borrador dispara una llamada a la IA → timeout más generoso.
export async function draftObjective(baseUrl: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/objective/draft", { method: "POST", timeoutMs: 60000 });
  if (!res.ok) throw new Error("No se pudo sugerir el objetivo");
  return ((await res.json()) as { content: string }).content;
}
```

- [ ] **Step 2: Verificar que `apiFetch` acepta `headers`/`body`/`timeoutMs`**

Run: `grep -n "export async function apiFetch\|headers\|timeoutMs\|body" mobile/src/api/client.ts | head`
Expected: la firma soporta esas opciones (mismo uso que `putSession`/`refreshMemory`). Si `apiFetch` no acepta `headers`, seguir el patrón exacto que ya usa el PUT de sesiones.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/objective.ts
git commit -S -m "feat(coach-1): API móvil del objetivo de trabajo"
```

## Task 1.7: Pantalla editable del objetivo

**Files:**
- Create: `mobile/app/objetivo-trabajo.tsx`
- Modify: `mobile/app/(tabs)/perfil.tsx`
- Test: `mobile/__tests__/objetivo-trabajo.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// mobile/__tests__/objetivo-trabajo.test.tsx
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import ObjetivoTrabajoScreen from "../app/objetivo-trabajo";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://x" }));
const mockGet = jest.fn(async () => "mi norte");
const mockPut = jest.fn(async (_u: string, c: string) => c);
const mockDraft = jest.fn(async () => "borrador IA");
jest.mock("../src/api/objective", () => ({
  getObjective: (...a: any[]) => mockGet(...a),
  putObjective: (...a: any[]) => mockPut(...a),
  draftObjective: (...a: any[]) => mockDraft(...a),
}));

test("carga el objetivo y permite sugerir con IA", async () => {
  const { getByTestId, getByText } = render(<ObjetivoTrabajoScreen />);
  await waitFor(() => expect(getByTestId("objetivo-input").props.value).toBe("mi norte"));
  fireEvent.press(getByText(/Sugerir con IA/i));
  await waitFor(() => expect(getByTestId("objetivo-input").props.value).toBe("borrador IA"));
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && npm test -- --runInBand objetivo-trabajo`
Expected: FAIL (módulo de pantalla inexistente).

- [ ] **Step 3: Implementar la pantalla** (patrón de `mobile/app/memoria.tsx` + `TextInput` editable)

```tsx
// mobile/app/objetivo-trabajo.tsx
import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl } from "../src/storage/config";
import { getObjective, putObjective, draftObjective } from "../src/api/objective";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

export default function ObjetivoTrabajoScreen() {
  const screenPad = useScreenPadding(spacing.xl);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "draft">(null);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (!url) { setError("Configurá el backend"); setLoading(false); return; }
      try { setContent(await getObjective(url)); }
      catch { setError("No se pudo cargar el objetivo"); }
      finally { setLoading(false); }
    })();
  }, []);

  async function onDraft() {
    const url = baseUrl.current; if (!url) return;
    setBusy("draft"); setError(null);
    try { setContent(await draftObjective(url)); }
    catch { setError("No se pudo sugerir el objetivo"); }
    finally { setBusy(null); }
  }
  async function onSave() {
    const url = baseUrl.current; if (!url) return;
    setBusy("save"); setError(null);
    try { setContent(await putObjective(url, content)); }
    catch { setError("No se pudo guardar el objetivo"); }
    finally { setBusy(null); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Objetivo de trabajo</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>El norte contra el que se justifica todo el plan. Editalo cuando quieras.</Text>
      {error && <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <TextInput
          testID="objetivo-input"
          value={content}
          onChangeText={setContent}
          multiline
          placeholder="Ej: recomposición en 12 semanas, priorizar fuerza en tren superior…"
          placeholderTextColor={colors.textMuted}
          style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 14, minHeight: 140, textAlignVertical: "top" }}
        />
      )}
      <Pressable testID="objetivo-sugerir" onPress={onDraft} disabled={busy != null || loading || !baseUrl.current}
        style={{ borderColor: colors.accent, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: busy || !baseUrl.current ? 0.6 : 1 }}>
        <Text style={{ color: colors.accentText, fontWeight: "600" }}>{busy === "draft" ? "Sugiriendo…" : "Sugerir con IA"}</Text>
      </Pressable>
      <Pressable testID="objetivo-guardar" onPress={onSave} disabled={busy != null || loading || !baseUrl.current}
        style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: busy || !baseUrl.current ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>{busy === "save" ? "Guardando…" : "Guardar"}</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand objetivo-trabajo`
Expected: PASS.

- [ ] **Step 5: Agregar el link en el perfil**

En `mobile/app/(tabs)/perfil.tsx`, junto al `Pressable` con `testID="perfil-memoria-link"`, agregar debajo:

```tsx
      <Pressable
        testID="perfil-objetivo-link"
        onPress={() => router.push("/objetivo-trabajo")}
        style={{ alignItems: "center", paddingVertical: spacing.sm }}
      >
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>Objetivo de trabajo →</Text>
      </Pressable>
```

- [ ] **Step 6: Correr toda la suite móvil tocada**

Run: `cd mobile && npm test -- --runInBand objetivo-trabajo perfil`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/app/objetivo-trabajo.tsx mobile/app/\(tabs\)/perfil.tsx mobile/__tests__/objetivo-trabajo.test.tsx
git commit -S -m "feat(coach-1): pantalla editable del objetivo de trabajo + link"
```

## Task 1.8: Cierre Fase 1 (verificación + PR)

- [ ] **Step 1: Suite completa**

Run (raíz): `bun test shared backend` — Expected: PASS.
Run (mobile): `cd mobile && npm test -- --runInBand` — Expected: PASS.

- [ ] **Step 2: Abrir PR de la Fase 1**

```bash
git push -u origin HEAD
gh pr create --title "COACH-1 Fase 1: objetivo de trabajo (editable + borrador IA)" --body "Primera fase de COACH-1 (spec docs/superpowers/specs/2026-08-22-coach-1-plan-explicado-design.md). Tabla work_objective + rutas GET/PUT/POST-draft + pantalla editable. No requiere OTA nativo."
```

Luego disparar `@claude review` en el PR (flujo del proyecto). Mergear squash tras review sin threads abiertos. Publicar OTA al mergear (cambios de móvil JS-only, runtime `11`).

---

# FASE 2 — Rationale

## Task 2.1: Schema del programa con rationale

**Files:**
- Modify: `shared/src/schemas/program.ts`
- Test: `shared/src/schemas/program.test.ts` (crear si no existe)

- [ ] **Step 1: Escribir el test que falla**

```ts
// shared/src/schemas/program.test.ts
import { test, expect } from "bun:test";
import { ProgramSchema, ProgramGenerationSchema } from "./program";

const day = { dayLabel: "D1", location: "gym", targetMuscles: ["back"], exercises: [] };

test("ProgramSchema acepta programas viejos SIN rationale", () => {
  const r = ProgramSchema.safeParse({ name: "P", weeks: [{ weekNumber: 1, workouts: [day] }] });
  expect(r.success).toBe(true);
});

test("ProgramSchema acepta rationale opcional", () => {
  const r = ProgramSchema.safeParse({ name: "P", rationale: "porqué global", weeks: [{ weekNumber: 1, workouts: [{ ...day, rationale: "porqué del día" }] }] });
  expect(r.success).toBe(true);
});

test("ProgramGenerationSchema EXIGE rationale global y por día", () => {
  const sinRat = ProgramGenerationSchema.safeParse({ name: "P", weeks: [{ weekNumber: 1, workouts: [day] }] });
  expect(sinRat.success).toBe(false);
  const conRat = ProgramGenerationSchema.safeParse({ name: "P", rationale: "g", weeks: [{ weekNumber: 1, workouts: [{ ...day, rationale: "d" }] }] });
  expect(conRat.success).toBe(true);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd shared && bun test src/schemas/program.test.ts`
Expected: FAIL (`ProgramGenerationSchema` no existe).

- [ ] **Step 3: Extender el schema**

En `shared/src/schemas/program.ts`, agregar `rationale` opcional y el schema estricto de generación:

```ts
export const WorkoutSchema = z.object({
  dayLabel: z.string().min(1),
  location: z.enum(["gym", "home"]),
  targetMuscles: z.array(MuscleGroupSchema).min(1),
  exercises: z.array(ProgramExerciseSchema).max(12),
  // COACH-1: el porqué del día (opcional para que los programas viejos sigan parseando).
  rationale: z.string().optional(),
});

export const WeekSchema = z.object({
  weekNumber: z.number().int().min(1),
  workouts: z.array(WorkoutSchema),
});

export const ProgramSchema = z.object({
  name: z.string().min(1),
  weeks: z.array(WeekSchema).min(1).max(12),
  // COACH-1: el porqué global del programa (opcional; ver arriba).
  rationale: z.string().optional(),
});

// Variante ESTRICTA usada SOLO por la generación completa (no oneOff): fuerza a la IA a emitir el
// rationale global y el de cada día. El objeto resultante sigue siendo asignable a `Program`.
const StrictWorkoutSchema = WorkoutSchema.extend({ rationale: z.string().min(1) });
const StrictWeekSchema = WeekSchema.extend({ workouts: z.array(StrictWorkoutSchema) });
export const ProgramGenerationSchema = ProgramSchema.extend({
  rationale: z.string().min(1),
  weeks: z.array(StrictWeekSchema).min(1).max(12),
});
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd shared && bun test src/schemas/program.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificación por mutación**

Cambiar `rationale: z.string().min(1)` de `StrictWorkoutSchema` por `.optional()` → el 3er test falla. Revertir.

- [ ] **Step 6: Verificar que no rompe consumidores**

Run: `cd shared && bun test` y `cd .. && bun test backend`
Expected: PASS (los tests existentes de programa/generate siguen verdes; rationale es aditivo).

- [ ] **Step 7: Commit**

```bash
git add shared/src/schemas/program.ts shared/src/schemas/program.test.ts
git commit -S -m "feat(coach-1): rationale opcional en Program + ProgramGenerationSchema estricto"
```

## Task 2.2: Rationale determinista de la meta nutricional

**Files:**
- Create: `shared/src/nutrition/goalRationale.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/nutrition/goalRationale.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// shared/src/nutrition/goalRationale.test.ts
import { test, expect } from "bun:test";
import { computeNutritionGoal } from "./goal";
import { buildGoalRationale } from "./goalRationale";

const base = { sex: "male", age: 30, heightCm: 180, weightKg: 80, activityLevel: "moderate" } as const;

test("meta automática: explica TDEE, ajuste por objetivo y proteína", () => {
  const goal = computeNutritionGoal({ ...base, objective: "lose", rateKgPerWeek: 0.5 });
  if (goal.status !== "ok") throw new Error("esperaba ok");
  const { lines } = buildGoalRationale(goal, { ...base, objective: "lose", rateKgPerWeek: 0.5 });
  const text = lines.join("\n");
  expect(text).toContain(String(goal.tdee));      // menciona el TDEE calculado
  expect(text).toContain(String(goal.kcal));      // menciona la meta
  expect(text).toContain(String(goal.protein_g)); // proteína
  expect(text.toLowerCase()).toContain("déficit"); // objetivo lose
});

test("meta manual: NO inventa TDEE como origen de la meta", () => {
  const goal = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0, manualKcal: 2222 });
  if (goal.status !== "ok") throw new Error("esperaba ok");
  const { lines } = buildGoalRationale(goal, { ...base, objective: "maintain", rateKgPerWeek: 0, manualKcal: 2222 });
  const text = lines.join("\n").toLowerCase();
  expect(text).toContain("2222");
  expect(text).toContain("fijaste"); // el usuario fijó la meta
});

test("mantener: sin ajuste por objetivo", () => {
  const goal = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0 });
  if (goal.status !== "ok") throw new Error("esperaba ok");
  const text = buildGoalRationale(goal, { ...base, objective: "maintain", rateKgPerWeek: 0 }).lines.join("\n").toLowerCase();
  expect(text).toContain("mantener");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd shared && bun test src/nutrition/goalRationale.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar la función pura**

```ts
// shared/src/nutrition/goalRationale.ts
import type { NutritionGoalArgs, NutritionGoalResult } from "./goal";

type OkGoal = Extract<NutritionGoalResult, { status: "ok" }>;

// Explica, de forma determinista y coherente con el número, el porqué de la meta calórica/macros.
// NO usa IA: reconstruye el razonamiento desde la misma fórmula de computeNutritionGoal.
export function buildGoalRationale(goal: OkGoal, args: NutritionGoalArgs): { lines: string[] } {
  const lines: string[] = [];

  if (goal.source === "manual") {
    lines.push(`Vos fijaste la meta en ${goal.kcal} kcal (override manual).`);
    if (goal.tdee != null) lines.push(`A modo informativo, tu gasto estimado (TDEE) es ~${goal.tdee} kcal.`);
  } else {
    if (goal.bmr != null && goal.tdee != null) {
      lines.push(`Tu metabolismo basal (BMR, Mifflin-St Jeor) es ~${goal.bmr} kcal; con tu nivel de actividad tu gasto diario estimado (TDEE) es ~${goal.tdee} kcal.`);
    }
    if (args.objective === "lose") {
      lines.push(`Como el objetivo es bajar (${args.rateKgPerWeek} kg/sem), aplicamos un déficit sobre el TDEE → meta ${goal.kcal} kcal.`);
    } else if (args.objective === "gain") {
      lines.push(`Como el objetivo es subir (${args.rateKgPerWeek} kg/sem), aplicamos un superávit sobre el TDEE → meta ${goal.kcal} kcal.`);
    } else {
      lines.push(`Como el objetivo es mantener el peso, la meta iguala tu TDEE → ${goal.kcal} kcal.`);
    }
  }

  // Macros (misma lógica que goal.ts): proteína por peso corporal, grasa 27%, carbos por diferencia.
  const protPerKg = args.objective === "lose" ? 2.0 : 1.8;
  if (args.weightKg != null) {
    lines.push(`Proteína: ${goal.protein_g} g (~${protPerKg} g por kg de peso corporal).`);
  } else {
    lines.push(`Proteína: ${goal.protein_g} g (~25% de las calorías).`);
  }
  lines.push(`Grasa: ${goal.fat_g} g (~27% de las calorías). Carbohidratos: ${goal.carbs_g} g (el resto de la energía).`);

  return { lines };
}
```

- [ ] **Step 4: Exportar desde el índice**

En `shared/src/index.ts`, junto al export de `./nutrition/goal`:

```ts
export * from "./nutrition/goalRationale";
```

Verificar el estilo de export existente (`grep -n "nutrition/goal" shared/src/index.ts`) y seguirlo.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd shared && bun test src/nutrition/goalRationale.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verificación por mutación**

En la rama `lose`, cambiar la palabra `déficit` por `ajuste` → el 1er test falla. Revertir.

- [ ] **Step 7: Commit**

```bash
git add shared/src/nutrition/goalRationale.ts shared/src/nutrition/goalRationale.test.ts shared/src/index.ts
git commit -S -m "feat(coach-1): buildGoalRationale (porqué determinista de la meta nutricional)"
```

## Task 2.3: Prompt del programa — inyectar objetivo + exigir rationale

**Files:**
- Modify: `backend/src/ai/prompt.ts`
- Modify: `backend/src/ai/prompt.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `backend/src/ai/prompt.test.ts`:

```ts
test("el prompt incluye el objetivo de trabajo cuando se pasa", () => {
  const p = buildGenerationPrompt(baseProfile, undefined, undefined, undefined, undefined, "recomposición en 12 semanas");
  expect(p).toContain("recomposición en 12 semanas");
  expect(p.toLowerCase()).toContain("rationale"); // pide justificación
});
```

(Reusar el `baseProfile` que ya exista en el archivo; si no, definir uno mínimo válido con `gymEquipment`/`homeEquipment`/`limitations` como arrays.)

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && bun test src/ai/prompt.test.ts`
Expected: FAIL (el 6º parámetro no existe / no aparece el texto).

- [ ] **Step 3: Extender `buildGenerationPrompt`**

En `backend/src/ai/prompt.ts`, agregar el parámetro `workObjective?: string` al final de la firma y, en el array del prompt:

1) Después del bloque de la regla 6 (`targetMuscles`), agregar una regla nueva:

```ts
    "7. Emití además, en lenguaje claro y conciso (español): un campo `rationale` a nivel del programa (por qué este plan sirve al objetivo del atleta) y un campo `rationale` por cada día (qué grupos entrena, por qué esos ejercicios/series, cómo se conecta con el objetivo). Máximo ~2 frases por rationale.",
```

2) Insertar el bloque del objetivo de trabajo (por ejemplo antes del bloque de `memory`):

```ts
    ...(workObjective && workObjective.trim()
      ? [
          "",
          "Objetivo de trabajo del atleta (el norte fijado por la persona): justificá cada día y el programa contra este objetivo.",
          workObjective,
        ]
      : []),
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && bun test src/ai/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Quitar el bloque del objetivo → el test nuevo falla. Revertir.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/prompt.ts backend/src/ai/prompt.test.ts
git commit -S -m "feat(coach-1): prompt inyecta objetivo de trabajo y exige rationale por día/global"
```

## Task 2.4: Generación usa el schema estricto + wiring del objetivo

**Files:**
- Modify: `backend/src/ai/client.ts`
- Modify: `backend/src/ai/generate.ts`
- Modify: `backend/src/programs/generateJob.ts`
- Modify: `backend/src/ai/generate.test.ts`

- [ ] **Step 1: Escribir/ajustar el test de la costura**

En `backend/src/ai/generate.test.ts`, agregar un test que verifique que `generateProgramForProfile` pasa el `workObjective` al `ai.generateProgram` (usar un fake `ai` que capture el input):

```ts
test("generateProgramForProfile pasa el workObjective al cliente", async () => {
  let seen: any = null;
  const ai = {
    generateProgram: async (input: any) => { seen = input; return { name: "P", rationale: "g", weeks: [] }; },
  } as any;
  await generateProgramForProfile({ profile: baseProfile, apiKey: "k", model: "m", ai, workObjective: "mi norte" });
  expect(seen.workObjective).toBe("mi norte");
});
```

(Reusar el `baseProfile` del archivo. Un programa con `weeks: []` evita la Fase B.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && bun test src/ai/generate.test.ts`
Expected: FAIL (`workObjective` no se reenvía).

- [ ] **Step 3: Propagar `workObjective` en `generate.ts`**

En `backend/src/ai/generate.ts`, agregar `workObjective?: string` al input de `generateProgramForProfile`, desestructurarlo, y pasarlo en la llamada de Fase A:

```ts
    const candidate = await ai.generateProgram({ profile, apiKey, model, historySummary, memory, progressSummary, ecgSummary, workObjective, oneOff });
```

- [ ] **Step 4: Aceptar y usar `workObjective` en el `AiClient`**

En `backend/src/ai/client.ts`:
- Agregar `workObjective?: string;` al tipo del parámetro de `generateProgram` (en la interfaz `AiClient` **y** en la clase).
- En `AnthropicAiClient.generateProgram`, pasar `workObjective` a `buildGenerationPrompt` (6º arg) y elegir el schema estricto sólo para generación completa:

```ts
    const content = oneOff
      ? buildOneOffPrompt(profile, oneOff)
      : buildGenerationPrompt(profile, historySummary, memory, progressSummary, ecgSummary, workObjective);
    return callStructuredTool({
      client, model, maxTokens: 16000,
      schema: oneOff ? ProgramSchema : ProgramGenerationSchema,
      toolName: "return_program",
      description: "Devuelve el programa de entrenamiento generado (con rationale por día y global).",
      content,
      truncatedMsg: "La respuesta de la IA se truncó por max_tokens. Reducí el alcance del programa o subí max_tokens.",
      missingMsg: "La IA no devolvió un programa estructurado",
    });
```

- Agregar `ProgramGenerationSchema` al import desde `@pulsia/shared`.

- [ ] **Step 5: Leer el objetivo en el job y pasarlo**

En `backend/src/programs/generateJob.ts`:
- Import: `import { getWorkObjective } from "../objective/repository";`
- Antes de llamar a `generateProgramForProfile`, leer `const workObjective = await getWorkObjective(deps.db, userId);`
- Pasar `workObjective` en la llamada:

```ts
    const program = await generateProgramForProfile({ profile, apiKey, model, ai: deps.aiClient, historySummary, memory, progressSummary, ecgSummary, workObjective });
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd backend && bun test src/ai/generate.test.ts src/ai/client.test.ts`
Expected: PASS. Si `client.test.ts` mockeaba la respuesta sin rationale, actualizar ese fixture para incluir `rationale` (global + por día) — es la costura del schema estricto.

- [ ] **Step 7: Suite backend completa**

Run: `cd backend && bun test`
Expected: PASS. Ajustar cualquier fixture de generación completa que ahora deba traer `rationale`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/ai/client.ts backend/src/ai/generate.ts backend/src/programs/generateJob.ts backend/src/ai/generate.test.ts
git commit -S -m "feat(coach-1): generación exige rationale y recibe el objetivo de trabajo"
```

## Task 2.5: UI del porqué de la meta nutricional

**Files:**
- Modify: `mobile/app/nutricion/objetivo.tsx`
- Test: `mobile/__tests__/objetivo-nutricion-rationale.test.tsx` (o extender el test existente de esa pantalla)

- [ ] **Step 1: Inspeccionar la pantalla y cómo obtiene el goal**

Run: `grep -n "computeNutritionGoal\|goalResult\|loadDailyGoalContext\|NutritionGoalResult\|kcal" mobile/app/nutricion/objetivo.tsx | head`
Expected: identificar dónde ya se tiene el `goalResult` (status "ok") y los args (sex/age/height/weight/activity/objective/rate/manualKcal). Si la pantalla no computa el goal, usar `loadDailyGoalContext` de `mobile/src/nutrition/dailyGoal.ts`.

- [ ] **Step 2: Escribir el test que falla**

```tsx
// mobile/__tests__/objetivo-nutricion-rationale.test.tsx
import { render, waitFor } from "@testing-library/react-native";
import ObjetivoNutricionScreen from "../app/nutricion/objetivo";
// ...mocks de storage/config, api/nutrition, api/metrics, storage/profile según el patrón del test existente de la pantalla...

test("muestra el bloque '¿Por qué esta meta?' con el porqué determinista", async () => {
  const { getByText } = render(<ObjetivoNutricionScreen />);
  await waitFor(() => expect(getByText(/¿Por qué esta meta\?/i)).toBeTruthy());
});
```

(Copiar los mocks del test ya existente de `objetivo.tsx` si lo hay; si no, mockear `getBackendUrl`, `getNutritionGoal`, `getLatestMetrics`, `getProfile` para que `computeNutritionGoal` devuelva `status:"ok"`.)

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd mobile && npm test -- --runInBand objetivo-nutricion-rationale`
Expected: FAIL (el bloque no existe).

- [ ] **Step 4: Renderizar el rationale bajo la meta**

En `mobile/app/nutricion/objetivo.tsx`, cuando `goalResult?.status === "ok"`, agregar una sección colapsable que muestre `buildGoalRationale(goalResult, args).lines`:

```tsx
import { buildGoalRationale } from "@pulsia/shared";
// ...
{goalResult?.status === "ok" && (
  <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }}>
    <Text style={{ color: colors.text, fontWeight: "600" }}>¿Por qué esta meta?</Text>
    {buildGoalRationale(goalResult, {
      sex: profile?.sex, age: profile?.age, heightCm: profile?.heightCm, weightKg,
      activityLevel: profile?.activityLevel, objective, rateKgPerWeek, manualKcal,
    }).lines.map((l, i) => (
      <Text key={i} style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>• {l}</Text>
    ))}
  </View>
)}
```

Usar exactamente los mismos args que la pantalla ya pasa a `computeNutritionGoal` (peso resuelto por el último pesaje, no `profile.weightKg` a secas — ver `loadDailyGoalContext`).

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand objetivo-nutricion-rationale`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/nutricion/objetivo.tsx mobile/__tests__/objetivo-nutricion-rationale.test.tsx
git commit -S -m "feat(coach-1): porqué de la meta nutricional en la pantalla de objetivo"
```

## Task 2.6: Cierre Fase 2 (verificación + PR)

- [ ] **Step 1: Suite completa**

Run (raíz): `bun test shared backend` — Expected: PASS.
Run (mobile): `cd mobile && npm test -- --runInBand` — Expected: PASS.

- [ ] **Step 2: PR de la Fase 2**

```bash
git push -u origin HEAD
gh pr create --title "COACH-1 Fase 2: rationale del plan (meta nutricional determinista + programa IA)" --body "Segunda fase de COACH-1. buildGoalRationale (puro) + rationale por día/global del programa emitido por la IA (ProgramGenerationSchema) + objetivo inyectado al prompt. Spec en docs/superpowers/specs/2026-08-22-coach-1-plan-explicado-design.md."
```

`@claude review`, merge squash tras review, OTA al mergear (runtime `11`). El merge auto-deploya el backend a la Pi.

---

# FASE 3 — Vista global

## Task 3.1: Pantalla "Plan de trabajo"

**Files:**
- Create: `mobile/app/plan-trabajo.tsx`
- Modify: `mobile/app/(tabs)/perfil.tsx`
- Test: `mobile/__tests__/plan-trabajo.test.tsx`

- [ ] **Step 1: Localizar cómo se carga el último programa**

Run: `grep -rn "getLatestProgram\|/programs\b\|getProgram\|programs\"" mobile/src/api mobile/app | head`
Expected: identificar la función/endpoint que ya carga el `Program` vigente (el viewer del programa lo usa). Reusarla; NO crear un endpoint nuevo.

- [ ] **Step 2: Escribir el test que falla**

```tsx
// mobile/__tests__/plan-trabajo.test.tsx
import { render, waitFor } from "@testing-library/react-native";
import PlanTrabajoScreen from "../app/plan-trabajo";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://x" }));
jest.mock("../src/api/objective", () => ({ getObjective: async () => "mi norte", putObjective: async (_u:string,c:string)=>c, draftObjective: async () => "d" }));
// mock de la carga del programa vigente CON rationale:
jest.mock("../src/api/programs", () => ({ getLatestProgram: async () => ({ name: "P", rationale: "porqué global", weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "D1", location: "gym", targetMuscles: ["back"], exercises: [], rationale: "porqué del día" }] }] }) }));
// mocks del goal para el porqué nutricional (status ok) — reusar los del test de dailyGoal.

test("muestra objetivo, porqué del programa (global y por día)", async () => {
  const { getByText } = render(<PlanTrabajoScreen />);
  await waitFor(() => expect(getByText("porqué global")).toBeTruthy());
  expect(getByText("porqué del día")).toBeTruthy();
});

test("plan sin rationale → nota de regenerar", async () => {
  jest.resetModules();
  jest.doMock("../src/api/programs", () => ({ getLatestProgram: async () => ({ name: "P", weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "D1", location: "gym", targetMuscles: ["back"], exercises: [] }] }] }) }));
  const Screen = require("../app/plan-trabajo").default;
  const { getByText } = render(<Screen />);
  await waitFor(() => expect(getByText(/Regenerá el plan/i)).toBeTruthy());
});
```

(Ajustar el nombre del módulo/función del programa al real hallado en el Step 1.)

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd mobile && npm test -- --runInBand plan-trabajo`
Expected: FAIL (pantalla inexistente).

- [ ] **Step 4: Implementar la pantalla**

```tsx
// mobile/app/plan-trabajo.tsx
import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl } from "../src/storage/config";
import { getObjective, putObjective, draftObjective } from "../src/api/objective";
import { getLatestProgram } from "../src/api/programs"; // ← ajustar al módulo real (Step 1)
import { loadDailyGoalContext } from "../src/nutrition/dailyGoal";
import { buildGoalRationale } from "@pulsia/shared";
import type { Program } from "@pulsia/shared";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

export default function PlanTrabajoScreen() {
  const screenPad = useScreenPadding(spacing.xl);
  const [objective, setObjective] = useState("");
  const [program, setProgram] = useState<Program | null>(null);
  const [goalCtx, setGoalCtx] = useState<Awaited<ReturnType<typeof loadDailyGoalContext>> | null>(null);
  const [goalArgs, setGoalArgs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const baseUrl = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (!url) { setLoading(false); return; }
      try {
        const [obj, prog, ctx] = await Promise.all([
          getObjective(url).catch(() => ""),
          getLatestProgram(url).catch(() => null),
          loadDailyGoalContext(url).catch(() => null),
        ]);
        setObjective(obj); setProgram(prog); setGoalCtx(ctx);
        if (ctx?.profile) setGoalArgs({
          sex: ctx.profile.sex, age: ctx.profile.age, heightCm: ctx.profile.heightCm, weightKg: ctx.weightKg,
          activityLevel: ctx.profile.activityLevel,
        });
      } finally { setLoading(false); }
    })();
  }, []);

  const goal = goalCtx?.goalResult;
  const workouts = program?.weeks?.[0]?.workouts ?? [];
  const hasRationale = !!program?.rationale || workouts.some((w) => w.rationale);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
      <Text style={{ fontSize: 22, fontWeight: "500", color: colors.text }}>Plan de trabajo</Text>
      {loading ? <Text style={{ color: colors.textMuted }}>Cargando…</Text> : (
        <>
          {/* 1) Objetivo de trabajo (editable inline) */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Objetivo de trabajo</Text>
            <TextInput testID="plan-objetivo-input" value={objective} onChangeText={setObjective} multiline
              placeholder="Tu norte…" placeholderTextColor={colors.textMuted}
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text, minHeight: 90, textAlignVertical: "top" }} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable testID="plan-objetivo-sugerir" disabled={saving} onPress={async () => { const u = baseUrl.current; if (!u) return; setSaving(true); try { setObjective(await draftObjective(u)); } finally { setSaving(false); } }}
                style={{ flex: 1, borderColor: colors.accent, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
                <Text style={{ color: colors.accentText, fontWeight: "600" }}>Sugerir con IA</Text>
              </Pressable>
              <Pressable testID="plan-objetivo-guardar" disabled={saving} onPress={async () => { const u = baseUrl.current; if (!u) return; setSaving(true); try { setObjective(await putObjective(u, objective)); } finally { setSaving(false); } }}
                style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar</Text>
              </Pressable>
            </View>
          </View>

          {/* 2) Meta nutricional + porqué */}
          {goal?.status === "ok" && goalArgs && goalCtx && (
            <View style={{ gap: spacing.xs }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>Meta nutricional: {goal.kcal} kcal</Text>
              {buildGoalRationale(goal, { ...goalArgs, objective: goalCtx.goalResult && "objective" in (goalCtx as any) ? (goalCtx as any).objective : undefined, rateKgPerWeek: (goalCtx as any).rateKgPerWeek ?? 0, manualKcal: (goalCtx as any).manualKcal ?? null }).lines.map((l, i) => (
                <Text key={i} style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>• {l}</Text>
              ))}
            </View>
          )}

          {/* 3) Programa + porqué */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Programa actual</Text>
            {!program ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Todavía no hay un plan generado.</Text>
            ) : !hasRationale ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Regenerá el plan para ver el porqué de cada día.</Text>
            ) : (
              <>
                {program.rationale && <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>{program.rationale}</Text>}
                {workouts.map((w, i) => (
                  <View key={i} style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }}>
                    <Text style={{ color: colors.text, fontWeight: "600" }}>{w.dayLabel}</Text>
                    {w.rationale && <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>{w.rationale}</Text>}
                  </View>
                ))}
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}
```

> Nota para el implementador: si `loadDailyGoalContext` no expone `objective`/`rateKgPerWeek`/`manualKcal`, ampliar `DailyGoalContext` en `mobile/src/nutrition/dailyGoal.ts` para incluir el `goalInput` (esos tres campos ya se leen ahí desde `getNutritionGoal`), y usarlo acá — así el rationale de la meta usa los mismos args que el cálculo. Preferir eso a re-fetchear.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand plan-trabajo`
Expected: PASS (2 tests).

- [ ] **Step 6: Link desde el perfil**

En `mobile/app/(tabs)/perfil.tsx`, junto a los links existentes, agregar:

```tsx
      <Pressable
        testID="perfil-plan-trabajo-link"
        onPress={() => router.push("/plan-trabajo")}
        style={{ alignItems: "center", paddingVertical: spacing.sm }}
      >
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>Plan de trabajo (el porqué) →</Text>
      </Pressable>
```

- [ ] **Step 7: Suite móvil**

Run: `cd mobile && npm test -- --runInBand plan-trabajo perfil`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add mobile/app/plan-trabajo.tsx mobile/app/\(tabs\)/perfil.tsx mobile/__tests__/plan-trabajo.test.tsx mobile/src/nutrition/dailyGoal.ts
git commit -S -m "feat(coach-1): vista global 'Plan de trabajo' (objetivo + porqué de meta y programa)"
```

## Task 3.2: Cierre Fase 3 (verificación + PR)

- [ ] **Step 1: Suite completa**

Run (raíz): `bun test shared backend` — Expected: PASS.
Run (mobile): `cd mobile && npm test -- --runInBand` — Expected: PASS.

- [ ] **Step 2: PR de la Fase 3**

```bash
git push -u origin HEAD
gh pr create --title "COACH-1 Fase 3: vista global 'Plan de trabajo'" --body "Última fase de COACH-1. Pantalla que hila objetivo de trabajo + meta nutricional con su porqué + programa con rationale por día/global (degrada para planes viejos). Spec en docs/superpowers/specs/2026-08-22-coach-1-plan-explicado-design.md."
```

`@claude review`, merge squash tras review, OTA al mergear (runtime `11`).

- [ ] **Step 3: Mover la card de Kan a Hecho**

Mover la card `ed86iyqu4bkc` a la lista de terminadas del board (API REST de Kan, ver `~/.kan_token`).

---

## Notas finales

- **Sin APK nativo**: todo es JS/backend. Publicar **OTA** al mergear cada fase que toque móvil (verificar runtime `11` en la salida de `eas update`).
- **Fixtures sintéticos** siempre (repo público): nunca valores reales de salud del usuario.
- **Degradación de planes viejos**: por diseño no hay backfill; la vista global muestra la nota "Regenerá el plan…" hasta que el usuario genere uno nuevo (que ya trae rationale).
- **Costura clave a no olvidar**: el schema estricto (`ProgramGenerationSchema`) sólo aplica a la generación completa, no a oneOff/Fase B; un fixture de test de generación completa que no traiga `rationale` va a fallar el parse — eso es correcto (la costura), actualizarlo.
