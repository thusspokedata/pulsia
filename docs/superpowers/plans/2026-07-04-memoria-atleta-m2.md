# Memoria del atleta · M2 — usar la memoria en la generación (backend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.
> **NOTA orquestador:** "IMPLEMENTÁ VOS, NO delegues ni spawnees subagentes". Verificar git/tests reales tras cada tarea.

**Goal:** La generación del plan **refresca la memoria del atleta (best-effort) y la incluye en el prompt**, además del resumen de las últimas 6 sesiones (C5·PR4). Si el refresh falla, la generación sigue con la memoria previa.

**Architecture:** Extraer la lógica de refresh (hoy inline en `POST /memory/refresh`) a un servicio `refreshAthleteMemory` (DRY), reusado por la ruta y por la generación. Threading de `memory?` por `buildGenerationPrompt → AiClient.generateProgram → generateProgramForProfile` (espeja lo hecho con `historySummary` en C5·PR4).

**Tech Stack:** Hono + Bun + Drizzle + Anthropic SDK. Tests `bun test` (fakes). Typecheck `npx tsc --noEmit`.

**Entorno:** `cd backend && bun test`. Commits firmados. Rama `feat/memoria-atleta-m2` (creada).

**Contexto (verificado):**
- `backend/src/routes/memory.ts` `POST /refresh`: lee settings (400 sin key), guard `deps.aiClient.updateMemory` (501), `getMemory` + `getRecentSessions(6)` + `buildTrainingHistorySummary` + `updateMemory` (502 on throw) + `upsertMemory`, responde `{ content }`.
- `backend/src/routes/programs.ts` `POST /generate`: ya hace `getRecentSessions` + `buildTrainingHistorySummary` + `generateProgramForProfile({ profile, apiKey, model, ai, historySummary })`.
- `generateProgramForProfile` (`ai/generate.ts`) y `AiClient.generateProgram` (`ai/client.ts`) y `buildGenerationPrompt` (`ai/prompt.ts`) aceptan `historySummary?` (patrón a espejar para `memory?`).
- `getMemory`/`upsertMemory` en `backend/src/memory/repository.ts`.

---

## Task 1: extraer servicio `refreshAthleteMemory` (DRY) + refactor de la ruta

**Files:**
- Create: `backend/src/memory/service.ts`, `backend/src/memory/service.test.ts`
- Modify: `backend/src/routes/memory.ts` (usar el servicio)

- [ ] **Step 1: Test que falla.** Crear `backend/src/memory/service.test.ts`:
```ts
import { test, expect } from "bun:test";
import { refreshAthleteMemory } from "./service";

function fakeDb(memory: string) {
  const upserts: any[] = [];
  return {
    _upserts: upserts,
    query: {
      athleteMemory: { findFirst: async () => ({ userId: "u", content: memory }) },
      workoutSession: { findMany: async () => [] },
    },
    insert: () => ({ values: (v: any) => ({ onConflictDoUpdate: async () => { upserts.push(v); } }) }),
  } as any;
}

test("refreshAthleteMemory llama updateMemory con la memoria previa y persiste el resultado", async () => {
  const db = fakeDb("memoria vieja");
  let seen: any = null;
  const ai: any = { updateMemory: async (input: any) => { seen = input; return "memoria nueva"; } };
  const out = await refreshAthleteMemory(db, ai, "u", "sk", "model");
  expect(out).toBe("memoria nueva");
  expect(seen.current).toBe("memoria vieja");
  expect(db._upserts[0].content).toBe("memoria nueva");
});

test("refreshAthleteMemory lanza si no hay updateMemory", async () => {
  const db = fakeDb("x");
  await expect(refreshAthleteMemory(db, {} as any, "u", "sk", "model")).rejects.toThrow();
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/memory/service.test.ts`

- [ ] **Step 3: Implementar** `backend/src/memory/service.ts`:
```ts
import type { Db } from "../db/client";
import type { AiClient } from "../ai/client";
import { getMemory, upsertMemory } from "./repository";
import { getRecentSessions } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";

// Actualiza la memoria del atleta desde las últimas 6 sesiones y la persiste. Devuelve la nueva memoria.
// Lanza si el AiClient no soporta updateMemory o si la llamada a la IA falla.
export async function refreshAthleteMemory(
  db: Db,
  ai: AiClient,
  userId: string,
  apiKey: string,
  model: string,
): Promise<string> {
  if (!ai.updateMemory) throw new Error("Actualización de memoria no disponible.");
  const current = await getMemory(db, userId);
  const recent = await getRecentSessions(db, userId, 6);
  const historySummary = buildTrainingHistorySummary(recent);
  const updated = await ai.updateMemory({ current, historySummary, apiKey, model });
  await upsertMemory(db, userId, updated);
  return updated;
}
```

- [ ] **Step 4: Refactor de la ruta.** En `backend/src/routes/memory.ts`, reemplazar el cuerpo del `try { ... }` que hace get/recent/summary/updateMemory/upsert por: `updated = await refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model);`. Mantener los guards previos (400 sin key, 501 sin `deps.aiClient.updateMemory`) y el `catch` → 502. Importar `refreshAthleteMemory` de `../memory/service` y quitar imports que queden sin uso (getMemory/getRecentSessions/buildTrainingHistorySummary si ya no se usan directamente; ojo: `getMemory` puede seguir usándose en `GET /`).

- [ ] **Step 5: Correr, confirmar PASS (service + memory route) + suite + typecheck.** `cd backend && bun test && npx tsc --noEmit`

- [ ] **Step 6: Commit.**
```bash
git add backend/src/memory/service.ts backend/src/memory/service.test.ts backend/src/routes/memory.ts
git commit -S -m "refactor(backend): extraer refreshAthleteMemory (servicio reutilizable)"
```

---

## Task 2: `memory?` en el prompt + threading (client/generate)

**Files:**
- Modify: `backend/src/ai/prompt.ts`, `backend/src/ai/client.ts`, `backend/src/ai/generate.ts`
- Test: `backend/src/ai/prompt.test.ts`

- [ ] **Step 1: Test que falla (prompt).** En `backend/src/ai/prompt.test.ts` agregar:
```ts
test("incluye el bloque de memoria cuando se pasa memory", () => {
  const p = buildGenerationPrompt(profile, undefined, "no tiene barra; press fuerte");
  expect(p).toContain("Memoria del atleta");
  expect(p).toContain("no tiene barra");
});
test("sin memory no incluye el bloque de memoria", () => {
  const p = buildGenerationPrompt(profile);
  expect(p).not.toContain("Memoria del atleta");
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/ai/prompt.test.ts`

- [ ] **Step 3: Implementar.** En `backend/src/ai/prompt.ts` cambiar la firma a
`buildGenerationPrompt(profile: TrainingProfile, historySummary?: string, memory?: string): string` y, en el array (antes de `"Devolvé el resultado llamando a la herramienta provista."`, junto al bloque de historial), agregar el bloque de memoria:
```ts
    ...(memory && memory.trim()
      ? [
          "",
          "Memoria del atleta (conocimiento acumulado — equipo que NO tiene, molestias/lesiones, preferencias, niveles y tendencias): usala para personalizar el plan.",
          memory,
        ]
      : []),
```

- [ ] **Step 4: Threading.**
  - `backend/src/ai/client.ts`: agregar `memory?: string` al input de `generateProgram` (interfaz + impl); en el impl usar `buildGenerationPrompt(profile, historySummary, memory)`.
  - `backend/src/ai/generate.ts`: agregar `memory?: string` al input de `generateProgramForProfile`; destructurar y pasar `ai.generateProgram({ profile, apiKey, model, historySummary, memory })`.

- [ ] **Step 5: Correr, confirmar PASS + typecheck.** `cd backend && bun test src/ai/ && npx tsc --noEmit`

- [ ] **Step 6: Commit.**
```bash
git add backend/src/ai/prompt.ts backend/src/ai/client.ts backend/src/ai/generate.ts backend/src/ai/prompt.test.ts
git commit -S -m "feat(backend): pasar la memoria del atleta por la cadena de generación"
```

---

## Task 3: wiring en `POST /generate` (refresh best-effort + usar la memoria)

**Files:**
- Modify: `backend/src/routes/programs.ts`
- Test: `backend/src/routes/programs.test.ts`

- [ ] **Step 1: Test que falla.** En `backend/src/routes/programs.test.ts`, extender el fake `db` para soportar `query.athleteMemory.findFirst` (devolver `{ content: "memoria previa" }`) y el `insert().values().onConflictDoUpdate()` (para el upsert del refresh). Hacer que el fake `aiClient` tenga `updateMemory` (devuelve `"memoria nueva"`) y que `generateProgram` capture su input (`lastAiInput`). Agregar test:
```ts
test("la generación refresca la memoria y la pasa al generador", async () => {
  // ...POST /generate con el harness existente...
  expect(lastAiInput.memory).toBe("memoria nueva");
});
```
(Adaptar al harness real; si `generateProgram` ya captura input en un test previo, reusarlo.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/routes/programs.test.ts`

- [ ] **Step 3: Implementar en `backend/src/routes/programs.ts`.** Importar `getMemory` de `../memory/repository` y `refreshAthleteMemory` de `../memory/service`. Después de armar `historySummary` y antes de `generateProgramForProfile`:
```ts
    let memory = await getMemory(deps.db, userId);
    try {
      memory = await refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model);
    } catch {
      // best-effort: si el refresh falla, seguimos con la memoria previa (no bloquea la generación)
    }
```
y pasar `memory` en la llamada:
```ts
    program = await generateProgramForProfile({ profile: parsed.data, apiKey, model, ai: deps.aiClient, historySummary, memory });
```

- [ ] **Step 4: Correr, confirmar PASS + suite completa + typecheck.** `cd backend && bun test && npx tsc --noEmit`

- [ ] **Step 5: Commit.**
```bash
git add backend/src/routes/programs.ts backend/src/routes/programs.test.ts
git commit -S -m "feat(backend): la generación refresca y usa la memoria del atleta (best-effort)"
```

---

## Cierre del PR (M2)
- `cd shared && bun test`, `cd backend && bun test && npx tsc --noEmit` — verde.
- Push + PR → review (timer + escalado a `@claude`) → aplicar hallazgos → merge (solo con comentarios corregidos).
- Sigue **M3** (mobile: pantalla "qué sabe la IA de mí" + botón actualizar).
