# Memoria del atleta · M1 — store + lectura + actualización por IA (backend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.
> **NOTA orquestador:** pasar a cada implementador "IMPLEMENTÁ VOS, NO delegues ni spawnees subagentes". Verificar git/tests reales tras cada tarea.

**Goal:** Backend de la memoria del atleta: tabla `athlete_memory` (una fila por usuario), lectura (`GET /memory`), y actualización por IA a partir de las sesiones recientes (`POST /memory/refresh`).

**Architecture:** Espeja `settings`/`profiles` (single-row per user, `onConflictDoUpdate`). La actualización usa un método OPCIONAL `updateMemory?` en `AiClient` (opcional para no romper los ~8 fakes inline existentes) + un prompt puro; reusa `buildTrainingHistorySummary` (C5·PR4) y `getRecentSessions`.

**Tech Stack:** Hono + Bun + Drizzle + Anthropic SDK. Tests `bun test` (fake db/aiClient, sin Postgres). Typecheck `npx tsc --noEmit`.

**Entorno:** `cd backend && bun test`. Commits firmados `git commit -S`, sin atribución a Claude. Rama `feat/memoria-atleta-m1` (ya creada).

**Contexto (verificado):**
- `db = drizzle(sql, { schema })` con `import * as schema` → tablas nuevas exportadas quedan en `db.query.X`.
- Upsert per-usuario: `.insert(T).values({...}).onConflictDoUpdate({ target: T.userId, set: {...} })` (ver `settings.ts:22`, `profiles.ts:22`).
- `AiClient` (`backend/src/ai/client.ts`): interfaz con `generateProgram`; impl `AnthropicAiClient` usa `new Anthropic({ apiKey })` + `client.messages.create(...)`.
- `getRecentSessions(db, userId, 6)` (`backend/src/sessions/repository.ts`) y `buildTrainingHistorySummary(sessions)` (`backend/src/ai/history.ts`) ya existen.
- Rutas se montan en `backend/src/app.ts` con `app.route("/x", xRoutes(deps))` tras el middleware que setea `userId` (`c.get("userId")`).

---

## Task 1: tabla `athlete_memory` + migración + repository

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/memory/repository.ts`, `backend/src/memory/repository.test.ts`
- Create (generado): `backend/drizzle/000X_*.sql` (+ meta)

- [ ] **Step 1: Test que falla.** Crear `backend/src/memory/repository.test.ts`:
```ts
import { test, expect } from "bun:test";
import { getMemory, upsertMemory } from "./repository";
import { athleteMemory } from "../db/schema";

function fakeDb() {
  let stored: any = null;
  return {
    _get: () => stored,
    query: { athleteMemory: { findFirst: async () => stored } },
    insert: (_t: any) => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { stored = { ...(stored ?? { userId: v.userId }), ...v, ...set }; },
      }),
    }),
  } as any;
}

test("getMemory devuelve '' si no hay fila", async () => {
  expect(await getMemory(fakeDb(), "u")).toBe("");
});

test("upsertMemory guarda y getMemory lo devuelve", async () => {
  const db = fakeDb();
  await upsertMemory(db, "u", "no tiene barra; press fuerte");
  expect(db._get().content).toBe("no tiene barra; press fuerte");
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/memory/repository.test.ts`

- [ ] **Step 3: Tabla en el schema.** En `backend/src/db/schema.ts`, junto a `profiles` agregar:
```ts
export const athleteMemory = pgTable("athlete_memory", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  content: text("content").default("").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```
(`pgTable`, `uuid`, `text`, `timestamp`, `users` ya están importados/definidos en el archivo.)

- [ ] **Step 4: Repository.** Crear `backend/src/memory/repository.ts`:
```ts
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { athleteMemory } from "../db/schema";

export async function getMemory(db: Db, userId: string): Promise<string> {
  const row = await db.query.athleteMemory.findFirst({ where: eq(athleteMemory.userId, userId) });
  return row?.content ?? "";
}

export async function upsertMemory(db: Db, userId: string, content: string): Promise<void> {
  await db
    .insert(athleteMemory)
    .values({ userId, content })
    .onConflictDoUpdate({ target: athleteMemory.userId, set: { content, updatedAt: new Date() } });
}
```

- [ ] **Step 5: Correr, confirmar PASS.** `cd backend && bun test src/memory/repository.test.ts`

- [ ] **Step 6: Generar migración.** `cd backend && DATABASE_URL=postgres://u:u@localhost:5432/u npm run db:generate` (no conecta a DB). Debe crear `backend/drizzle/000X_*.sql` con `CREATE TABLE "athlete_memory" (...)`. Abrir y verificar. Si PIDE interacción o falla por DB → STOP y reportar BLOCKED (no fabricar meta a mano).

- [ ] **Step 7: Suite backend + commit.**
```bash
cd backend && bun test
git add backend/src/db/schema.ts backend/src/memory/ backend/drizzle/
git commit -S -m "feat(backend): tabla athlete_memory + repository (get/upsert)"
```

---

## Task 2: prompt de actualización + `updateMemory` en AiClient

**Files:**
- Create: `backend/src/ai/memory.ts`, `backend/src/ai/memory.test.ts`
- Modify: `backend/src/ai/client.ts` (interfaz `AiClient` + `AnthropicAiClient`)

- [ ] **Step 1: Test que falla (prompt puro).** Crear `backend/src/ai/memory.test.ts`:
```ts
import { test, expect } from "bun:test";
import { buildMemoryUpdatePrompt } from "./memory";

test("incluye la memoria previa y el historial", () => {
  const p = buildMemoryUpdatePrompt("no tiene barra", "2026-07-01 — Día 1 (gym)\n  - Bench: 40×10@8");
  expect(p).toContain("no tiene barra");
  expect(p).toContain("40×10@8");
  expect(p.toLowerCase()).toContain("memoria");
});

test("memoria previa vacía → indica (vacía) sin romper", () => {
  const p = buildMemoryUpdatePrompt("", "");
  expect(typeof p).toBe("string");
  expect(p.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/ai/memory.test.ts`

- [ ] **Step 3: Implementar el prompt.** Crear `backend/src/ai/memory.ts`:
```ts
export function buildMemoryUpdatePrompt(current: string, historySummary: string): string {
  return [
    "Sos el sistema de memoria de un entrenador de fuerza. Mantenés una memoria evolutiva y concisa del atleta.",
    "",
    "Memoria actual del atleta:",
    current.trim() || "(vacía)",
    "",
    "Sesiones recientes (rendimiento, notas, sustituciones):",
    historySummary.trim() || "(sin sesiones recientes)",
    "",
    "Actualizá la memoria: incorporá lo nuevo y durable (equipo que NO tiene, molestias/lesiones, preferencias, niveles de fuerza y tendencias, qué le funciona), mantené lo relevante previo, descartá lo efímero. Escribí SOLO la memoria actualizada, en texto plano, máximo ~1500 caracteres, sin preámbulos.",
  ].join("\n");
}
```

- [ ] **Step 4: Correr, confirmar PASS.** `cd backend && bun test src/ai/memory.test.ts`

- [ ] **Step 5: Agregar `updateMemory` OPCIONAL a AiClient.** En `backend/src/ai/client.ts`:
  - En la interfaz `AiClient`, agregar (opcional, para no romper los fakes existentes):
```ts
  updateMemory?(input: { current: string; historySummary: string; apiKey: string; model: string }): Promise<string>;
```
  - En `AnthropicAiClient`, implementar (respuesta de texto plano; importar `buildMemoryUpdatePrompt` de `./memory`):
```ts
  async updateMemory({ current, historySummary, apiKey, model }: { current: string; historySummary: string; apiKey: string; model: string }): Promise<string> {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: buildMemoryUpdatePrompt(current, historySummary) }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    return text || current;
  }
```

- [ ] **Step 6: Typecheck + suite + commit.**
```bash
cd backend && npx tsc --noEmit && bun test
git add backend/src/ai/memory.ts backend/src/ai/memory.test.ts backend/src/ai/client.ts
git commit -S -m "feat(backend): buildMemoryUpdatePrompt + AiClient.updateMemory (opcional)"
```

---

## Task 3: rutas `/memory` (GET + refresh) + montaje

**Files:**
- Create: `backend/src/routes/memory.ts`, `backend/src/routes/memory.test.ts`
- Modify: `backend/src/app.ts` (montar `/memory`)

- [ ] **Step 1: Test que falla.** Leer `backend/src/routes/programs.test.ts` para modelar el fake `deps` (db + aiClient) y `createApp`. Crear `backend/src/routes/memory.test.ts` con:
  - `GET /memory` devuelve `{ content }` (fake db con `query.athleteMemory.findFirst` → fila o null).
  - `POST /memory/refresh` obtiene sesiones recientes (fake `db.query.workoutSession.findMany` → una sesión), llama `aiClient.updateMemory` (fake que captura el input y devuelve una memoria nueva), persiste (fake insert/onConflictDoUpdate) y responde `{ content }` con la memoria nueva.
  Esqueleto de aserciones:
```ts
// GET
const res = await app.request("/memory");
expect(await res.json()).toEqual({ content: "algo" });
// refresh
const res2 = await app.request("/memory/refresh", { method: "POST" });
expect((await res2.json()).content).toBe("memoria nueva");
expect(lastUpdateInput.current).toBe("algo previo"); // recibió la memoria previa
expect(lastUpdateInput.historySummary).toContain("Día"); // y el historial
```
  (Adaptar el fake db para soportar `query.athleteMemory.findFirst`, `query.workoutSession.findMany`, e `insert().values().onConflictDoUpdate()`. El `userId` viene del middleware; usar el mismo patrón que programs.test para setearlo — o SINGLE_USER si el harness ya lo hace.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/routes/memory.test.ts`

- [ ] **Step 3: Implementar la ruta.** Crear `backend/src/routes/memory.ts`:
```ts
import { Hono } from "hono";
import { getMemory, upsertMemory } from "../memory/repository";
import { getRecentSessions } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";
import { decryptSecret } from "../crypto/secrets";
import { eq } from "drizzle-orm";
import { settings } from "../db/schema";
import type { AppDeps } from "../app";

export function memoryRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.get("/", async (c) => {
    const userId = c.get("userId");
    return c.json({ content: await getMemory(deps.db, userId) });
  });

  r.post("/refresh", async (c) => {
    const userId = c.get("userId");
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    if (!row?.aiApiKeyEncrypted) return c.json({ error: "No hay API key de IA configurada." }, 400);
    if (!deps.aiClient.updateMemory) return c.json({ error: "Actualización de memoria no disponible." }, 501);
    const apiKey = decryptSecret(row.aiApiKeyEncrypted, deps.config.encryptionKey);
    const model = row.aiModel ?? deps.config.defaultModel;

    const current = await getMemory(deps.db, userId);
    const recent = await getRecentSessions(deps.db, userId, 6);
    const historySummary = buildTrainingHistorySummary(recent);
    let updated: string;
    try {
      updated = await deps.aiClient.updateMemory({ current, historySummary, apiKey, model });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
    await upsertMemory(deps.db, userId, updated);
    return c.json({ content: updated });
  });

  return r;
}
```

- [ ] **Step 4: Montar en `app.ts`.** Agregar `import { memoryRoutes } from "./routes/memory";` y, junto a las otras `app.route(...)` (después de `/sessions`), `app.route("/memory", memoryRoutes(deps));`.

- [ ] **Step 5: Correr, confirmar PASS + typecheck + suite completa.** `cd backend && bun test && npx tsc --noEmit`

- [ ] **Step 6: Commit.**
```bash
git add backend/src/routes/memory.ts backend/src/routes/memory.test.ts backend/src/app.ts
git commit -S -m "feat(backend): rutas /memory (GET + POST /refresh)"
```

---

## Cierre del PR (M1)
- `cd shared && bun test`, `cd backend && bun test && npx tsc --noEmit` — verde.
- Push + PR → review (timer + escalado a `@claude`) → aplicar hallazgos → merge (respetar: solo mergear con los comentarios corregidos).
- Deploy Pi (migración + backend nuevo) queda para el usuario. Siguen M2 (usar la memoria en la generación) y M3 (UI mobile).
