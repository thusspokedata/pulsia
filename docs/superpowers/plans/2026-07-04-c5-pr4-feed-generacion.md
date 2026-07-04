# C5 · PR4 — Feed a la generación IA (notas + rendimiento + sustituciones → prompt) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.
> **NOTA orquestador:** pasar a cada implementador "IMPLEMENTÁ VOS, NO delegues ni spawnees subagentes". Verificar git/tests reales tras cada tarea.

**Goal:** Que la generación del próximo plan mire las últimas ~6 sesiones del atleta: rendimiento real (pesos/reps/RPE, % cumplimiento), notas de sesión, notas por-ejercicio y sustituciones — inyectado en el prompt de Claude. Backward-compatible: sin historial, el prompt queda idéntico.

**Architecture:** Backend-only. Nueva función pura `buildTrainingHistorySummary(sessions)`; nueva query `getRecentSessions(db, userId, limit)`; se pasa un `historySummary?: string` por la cadena `route → generateProgramForProfile → AiClient.generateProgram → buildGenerationPrompt`.

**Tech Stack:** Hono + Bun + Drizzle + Anthropic SDK. Tests `bun test` (fake db, sin Postgres).

**Entorno:** backend tests `cd backend && bun test`. Commits firmados `git commit -S`, sin atribución a Claude. Rama `feat/c5-generacion-feed` (ya creada).

**Contexto de código (verificado):**
- `backend/src/ai/prompt.ts` — `buildGenerationPrompt(profile): string` arma el prompt (termina con "Devolvé el resultado llamando a la herramienta provista.").
- `backend/src/ai/client.ts` — `AiClient.generateProgram({ profile, apiKey, model }): Promise<Program>`; el impl usa `buildGenerationPrompt(profile)` en `messages`.
- `backend/src/ai/generate.ts` — `generateProgramForProfile({ profile, apiKey, model, ai }): Promise<Program>` (loop de reintento por catálogo); llama `ai.generateProgram({ profile, apiKey, model })`.
- `backend/src/routes/programs.ts` — `POST /generate`: `userId = c.get("userId")`; llama `generateProgramForProfile({ profile: parsed.data, apiKey, model, ai: deps.aiClient })`. `deps.db` disponible.
- `backend/src/sessions/repository.ts` — patrón de query: `db.query.workoutSession.findFirst({ where, with: { exercises: { orderBy, with: { sets: { orderBy } } } } })` + `rowsToSession(row)`. `Db` type de `../db/client`. `WorkoutSession.exercises[].{catalogId, note, substitutedFromId, planned, skipped, sets[]}`; sets tienen `{reps, weightKg, rpe, endedAt, ...}`.

---

## Task 1: `buildTrainingHistorySummary` (pura)

**Files:**
- Create: `backend/src/ai/history.ts`
- Test: `backend/src/ai/history.test.ts`

- [ ] **Step 1: Test que falla.** Crear `backend/src/ai/history.test.ts`:
```ts
import { test, expect } from "bun:test";
import { buildTrainingHistorySummary } from "./history";
import type { WorkoutSession } from "@pulsia/shared";

function sess(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "11111111-1111-4111-8111-111111111111", programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1, dayLabel: "Día 1: Pecho", location: "gym",
    startedAt: 1782900000000, endedAt: 1782903600000, totalDurationMs: 3600000, notes: "",
    exercises: [{
      catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", order: 0,
      planned: { sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 },
      skipped: false, note: "", substitutedFromId: null,
      sets: [
        { setNumber: 1, reps: 10, weightKg: 40, rpe: 8, startedAt: 1, endedAt: 2, durationMs: 1, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false },
        { setNumber: 2, reps: 8, weightKg: 42, rpe: 9, startedAt: 3, endedAt: 4, durationMs: 1, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false },
      ],
    }],
    ...over,
  } as WorkoutSession;
}

test("vacío → cadena vacía", () => {
  expect(buildTrainingHistorySummary([])).toBe("");
});

test("incluye día, sets logrados (peso×reps@RPE) y la nota de sesión", () => {
  const out = buildTrainingHistorySummary([sess({ notes: "me sentí fuerte" })]);
  expect(out).toContain("Día 1: Pecho");
  expect(out).toContain("40×10@8");
  expect(out).toContain("42×8@9");
  expect(out).toContain("me sentí fuerte");
});

test("incluye sustituciones y notas por-ejercicio", () => {
  const s = sess();
  s.exercises[0] = { ...s.exercises[0], catalogId: "dumbbell_row", substitutedFromId: "band_assisted_pull_up", note: "no tengo barra" };
  const out = buildTrainingHistorySummary([s]);
  expect(out).toContain("band_assisted_pull_up");
  expect(out).toContain("dumbbell_row");
  expect(out).toContain("no tengo barra");
});

test("sets con weightKg/rpe null no rompen", () => {
  const s = sess();
  s.exercises[0].sets[0] = { ...s.exercises[0].sets[0], weightKg: null, rpe: null };
  const out = buildTrainingHistorySummary([s]);
  expect(typeof out).toBe("string");
  expect(out.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/ai/history.test.ts`

- [ ] **Step 3: Implementar `backend/src/ai/history.ts`:**
```ts
import type { WorkoutSession, SessionExercise } from "@pulsia/shared";

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function fmtSet(s: SessionExercise["sets"][number]): string {
  const w = s.weightKg == null ? "—" : String(s.weightKg);
  const rpe = s.rpe == null ? "" : `@${s.rpe}`;
  return `${w}×${s.reps}${rpe}`;
}

function exerciseLine(ex: SessionExercise): string {
  const done = ex.sets.filter((s) => s.endedAt != null);
  const target = ex.planned.sets;
  const pct = target > 0 ? Math.round((done.length / target) * 100) : 0;
  const setsStr = done.length ? done.map(fmtSet).join(", ") : "sin series";
  const parts = [`  - ${ex.garminName} (${done.length}/${target} series, ${pct}%): ${setsStr}`];
  if (ex.substitutedFromId) parts.push(`    (cambió ${ex.substitutedFromId} por ${ex.catalogId})`);
  const note = ex.note?.trim();
  if (note) parts.push(`    nota: ${note.slice(0, 300)}`);
  return parts.join("\n");
}

// Resumen compacto de las sesiones recientes (más reciente primero) para el prompt de generación.
// Sin sesiones → "" (el prompt queda intacto).
export function buildTrainingHistorySummary(sessions: WorkoutSession[]): string {
  if (sessions.length === 0) return "";
  return sessions
    .map((s) => {
      const head = `${fmtDate(s.startedAt)} — ${s.dayLabel} (${s.location})`;
      const exLines = s.exercises.map(exerciseLine).join("\n");
      const sNote = s.notes?.trim();
      const noteLine = sNote ? `  nota de sesión: ${sNote.slice(0, 300)}` : "";
      return [head, exLines, noteLine].filter(Boolean).join("\n");
    })
    .join("\n\n");
}
```

- [ ] **Step 4: Correr, confirmar PASS.** `cd backend && bun test src/ai/history.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add backend/src/ai/history.ts backend/src/ai/history.test.ts
git commit -S -m "feat(backend): buildTrainingHistorySummary (resumen de sesiones para la generación)"
```

---

## Task 2: `getRecentSessions` (repository)

**Files:**
- Modify: `backend/src/sessions/repository.ts`
- Test: `backend/src/sessions/repository.test.ts`

- [ ] **Step 1: Test que falla.** En `backend/src/sessions/repository.test.ts`, agregar un test que verifique que `getRecentSessions` mapea filas a `WorkoutSession[]` vía `rowsToSession`, usando un fake `db.query.workoutSession.findMany`. Leer el archivo primero para ver cómo mockean `db` los tests existentes; modelar el fake así:
```ts
test("getRecentSessions mapea filas a WorkoutSession[] (limit)", async () => {
  const rows = [nestedRow]; // reusar el nestedRow del test de rowsToSession
  const db: any = { query: { workoutSession: { findMany: async (_args: any) => rows } } };
  const out = await getRecentSessions(db, "u", 6);
  expect(out).toHaveLength(1);
  expect(out[0].exercises[0].order).toBe(0);
});
```
(Importar `getRecentSessions` en el test.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/sessions/repository.test.ts`

- [ ] **Step 3: Implementar en `backend/src/sessions/repository.ts`** (junto a `getSession`):
```ts
export async function getRecentSessions(db: Db, userId: string, limit = 6): Promise<WorkoutSession[]> {
  const rows = await db.query.workoutSession.findMany({
    where: eq(workoutSession.userId, userId),
    orderBy: (w, { desc }) => [desc(w.startedAt)],
    limit,
    with: { exercises: { orderBy: (e, { asc }) => [asc(e.orderIndex)], with: { sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] } } } },
  });
  return rows.map(rowsToSession);
}
```
(`eq` y `workoutSession` ya están importados en el archivo.)

- [ ] **Step 4: Correr, confirmar PASS + suite backend.** `cd backend && bun test`

- [ ] **Step 5: Commit.**
```bash
git add backend/src/sessions/repository.ts backend/src/sessions/repository.test.ts
git commit -S -m "feat(backend): getRecentSessions (últimas N sesiones del usuario)"
```

---

## Task 3: Pasar `historySummary` por la cadena de generación

**Files:**
- Modify: `backend/src/ai/prompt.ts`, `backend/src/ai/client.ts`, `backend/src/ai/generate.ts`
- Test: `backend/src/ai/prompt.test.ts`, `backend/src/ai/generate.test.ts`

- [ ] **Step 1: Test que falla (prompt).** En `backend/src/ai/prompt.test.ts` agregar:
```ts
test("incluye el bloque de historial cuando se pasa historySummary", () => {
  const p = buildGenerationPrompt(profile, "2026-07-01 — Día 1 (gym)\n  - Bench: 40×10@8");
  expect(p).toContain("Historial reciente");
  expect(p).toContain("40×10@8");
});
test("sin historySummary el prompt no incluye el bloque", () => {
  const p = buildGenerationPrompt(profile);
  expect(p).not.toContain("Historial reciente");
});
```
(Reusar el `profile` fixture del archivo.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/ai/prompt.test.ts`

- [ ] **Step 3: Implementar el prompt.** En `backend/src/ai/prompt.ts` cambiar la firma a `buildGenerationPrompt(profile: TrainingProfile, historySummary?: string): string` y, ANTES de la línea final `"Devolvé el resultado llamando a la herramienta provista."`, intercalar (solo si hay historial):
```ts
    ...(historySummary && historySummary.trim()
      ? [
          "",
          "Historial reciente del atleta (usalo para ajustar cargas, volumen y ejercicios; respetá las notas y sustituciones — el atleta NO puede hacer los ejercicios sustituidos):",
          historySummary,
        ]
      : []),
```
(Insertarlo como elementos del array que se `.join("\n")`, justo antes del string final.)

- [ ] **Step 4: Threading en client + generate.**
  - `backend/src/ai/client.ts`: en la interfaz `AiClient.generateProgram` y en el impl, agregar `historySummary?: string` al input; en `messages` usar `buildGenerationPrompt(profile, historySummary)`.
  - `backend/src/ai/generate.ts`: agregar `historySummary?: string` al input de `generateProgramForProfile` y pasarlo a `ai.generateProgram({ profile, apiKey, model, historySummary })`.

- [ ] **Step 5: Correr, confirmar PASS.** `cd backend && bun test src/ai/prompt.test.ts src/ai/generate.test.ts` (si `generate.test.ts` mockea `AiClient`, sigue compilando porque el campo es opcional; si algún test se rompe por la firma, ajustarlo mínimamente).

- [ ] **Step 6: Commit.**
```bash
git add backend/src/ai/prompt.ts backend/src/ai/client.ts backend/src/ai/generate.ts backend/src/ai/prompt.test.ts backend/src/ai/generate.test.ts
git commit -S -m "feat(backend): pasar historySummary por la cadena de generación (prompt/client/generate)"
```

---

## Task 4: Wiring en la ruta `POST /generate`

**Files:**
- Modify: `backend/src/routes/programs.ts`
- Test: `backend/src/routes/programs.test.ts`

- [ ] **Step 1: Test que falla.** Leer `backend/src/routes/programs.test.ts` para ver cómo mockea `deps` (`aiClient`, `db`). Agregar un test que verifique que, al generar, se obtienen las sesiones recientes y el `historySummary` se pasa al `aiClient`. Estrategia: espiar `aiClient.generateProgram` capturando su input, y hacer que `deps.db.query.workoutSession.findMany` devuelva una sesión; assert que el prompt/args reflejan el historial. Adaptar al harness del archivo (si el mock de `aiClient` no expone el input, extenderlo para capturarlo). Ejemplo de aserción:
```ts
// el fake aiClient guarda el último input:
expect(lastAiInput.historySummary).toContain("Día 1");
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/routes/programs.test.ts`

- [ ] **Step 3: Implementar en `backend/src/routes/programs.ts`.** Importar `getRecentSessions` de `../sessions/repository` y `buildTrainingHistorySummary` de `../ai/history`. Antes de llamar a `generateProgramForProfile`:
```ts
    const recent = await getRecentSessions(deps.db, userId, 6);
    const historySummary = buildTrainingHistorySummary(recent);
```
y pasar `historySummary` en la llamada:
```ts
    program = await generateProgramForProfile({ profile: parsed.data, apiKey, model, ai: deps.aiClient, historySummary });
```

- [ ] **Step 4: Correr, confirmar PASS + suite backend completa.** `cd backend && bun test`

- [ ] **Step 5: Commit.**
```bash
git add backend/src/routes/programs.ts backend/src/routes/programs.test.ts
git commit -S -m "feat(backend): la generación mira las últimas 6 sesiones (notas + rendimiento + sustituciones)"
```

---

## Cierre del PR
- `cd shared && bun test`, `cd backend && bun test` — verde. (No toca mobile.)
- Push + PR → review (timer + escalado a `@claude`) → aplicar hallazgos → merge con OK.
- **Deploy:** requiere redeploy del backend en la Pi para que aplique (la generación corre en el backend). Cierra la iniciativa C5 completa (PR1-4).
