# Persistir fuerza del `.FIT` como workout_session — Plan backend (PR1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que un entrenamiento de fuerza importado del `.FIT` se pueda guardar como `workout_session` (con sus ejercicios/series), entrando a 1RM/volumen/informe. Backend solo; no rompe el móvil actual.

**Architecture:** Se relajan `programId`/`weekNumber`/`dayLabel` de `workout_session` a nullable (migración + schema Zod). Una transformación pura convierte el `FitStrengthPreview` (parser ya existente) en un `WorkoutSession`, resolviendo el `catalogId` con `mapFitExercise`. Dos rutas nuevas bajo `/sessions` (preview + persistir desde `.FIT`) que NO tocan `/cardio/parse`, así el móvil viejo sigue guardando la fuerza como cardio hasta que se actualice (PR de móvil aparte).

**Tech Stack:** TypeScript, Hono, Bun, Drizzle, `@garmin/fitsdk`. Tests `bun test`.

**Spec:** [`2026-07-24-fit-fuerza-importar-design.md`](../specs/2026-07-24-fit-fuerza-importar-design.md)

---

## Contexto (verificado por auditoría)

- **Nada dereferencia `programId`** (no hay JOIN de `workout_session` con `programs`). `weekNumber` no se lee en código no-test. `dayLabel` se usa solo en `backend/src/ai/history.ts:29` (cosmético, en el prompt de generación).
- `computePerformanceTrends` (`shared/src/progress/trends.ts:23`) y el informe usan solo `startedAt`/`exercises`/`sets` — **program-independent**.
- Persistencia: `upsertSession(db, userId, s: WorkoutSession)` (`backend/src/sessions/repository.ts:47`), idempotente (delete+reinsert en transacción). Pasa los 3 campos; null pasa bien una vez el schema lo permita.
- El parser (`parseFitStrength`) y el mapeo (`mapFitExercise`) YA existen y están testeados. Falta el wiring.

**Convenciones (no negociables):** TDD + verificación por mutación de cada test nuevo; `git commit -S` sin atribución a Claude; `export PATH="$HOME/.bun/bin:$PATH"` antes de tests; `bun test backend` y `bun test shared` desde la raíz.

---

## Task 1: Relajar `workout_session` (schema DB + Zod + migración + fix cosmético)

**Files:** `backend/src/db/schema.ts:328-330`, `shared/src/schemas/session.ts:49-52`, `backend/src/ai/history.ts:29`, `shared/src/schemas/session.test.ts` (o donde vivan los tests del schema), migración generada.

- [ ] **Step 1: Test del schema (falla)**

En los tests de shared del schema de sesión (buscar el archivo que ya prueba `WorkoutSessionSchema`; si no hay, crear `shared/src/schemas/session.test.ts`):

```ts
import { test, expect } from "bun:test";
import { WorkoutSessionSchema } from "./session";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  location: "gym", startedAt: 1000, endedAt: null, totalDurationMs: null,
  exercises: [],
};

test("una sesión sin programa (import) es válida: programId/weekNumber/dayLabel null", () => {
  const r = WorkoutSessionSchema.safeParse({ ...base, programId: null, weekNumber: null, dayLabel: null });
  expect(r.success).toBe(true);
});

test("una sesión de programa sigue siendo válida", () => {
  const r = WorkoutSessionSchema.safeParse({
    ...base, programId: "22222222-2222-4222-8222-222222222222", weekNumber: 1, dayLabel: "Día 1",
  });
  expect(r.success).toBe(true);
});
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `bun test shared/src/schemas/session.test.ts`
Expected: FAIL — el primer test falla (hoy `programId` exige uuid, no acepta null).

- [ ] **Step 3: Relajar el Zod schema**

En `shared/src/schemas/session.ts:49-52`:

```ts
  programId: z.string().uuid().nullable(),
  weekNumber: z.number().int().min(1).nullable(),
  dayLabel: z.string().min(1).nullable(),
```

- [ ] **Step 4: Correr, verificar que pasa**

Run: `bun test shared/src/schemas/session.test.ts` → PASS (ambos).

- [ ] **Step 5: Relajar la columna en la DB**

En `backend/src/db/schema.ts:328-330`, quitar `.notNull()`:

```ts
  programId: uuid("program_id").references(() => programs.id),
  weekNumber: integer("week_number"),
  dayLabel: text("day_label"),
```

- [ ] **Step 6: Generar la migración**

Run: `cd backend && bun run db:generate`
Expected: crea un `.sql` nuevo en `backend/drizzle/` con `ALTER TABLE "workout_session" ALTER COLUMN ... DROP NOT NULL` para las 3 columnas. **Verificar el SQL generado**: debe ser solo los 3 `DROP NOT NULL`, nada más. Si drizzle pide interacción, usar el flag no-interactivo del script existente.

- [ ] **Step 7: Fix cosmético en `history.ts`**

`backend/src/ai/history.ts:29` renderiza `s.dayLabel` en el prompt. Con null mostraría "null". Cambiar a un fallback:

```ts
    `${fmtDate(s.startedAt)} — ${s.dayLabel ?? "Entreno"} (${s.location})`,
```

(Ajustar a la sintaxis exacta de la línea; si hay test de `buildTrainingHistorySummary`, agregar un caso con `dayLabel: null` que verifique que aparece "Entreno" y no "null".)

- [ ] **Step 8: Suite + tsc + commit**

```bash
bun test shared backend && (cd backend && bunx tsc --noEmit)
git add shared/src/schemas/session.ts backend/src/db/schema.ts backend/drizzle backend/src/ai/history.ts shared/src/schemas/session.test.ts backend/src/ai/history.test.ts
git commit -S -m "feat(entrenamiento): workout_session admite sesiones sin programa (import .FIT)"
```

Verificación por mutación del test del schema: revertir un `.nullable()` → el test "sin programa" debe fallar.

---

## Task 2: `fitStrengthToSession` — transformar el preview en WorkoutSession

**Files:** Create `backend/src/cardio/fitStrengthToSession.ts`, `backend/src/cardio/fitStrengthToSession.test.ts`.

Convierte un `FitStrengthPreview` (de `parseFitStrength`) + metadata en un `WorkoutSession` persistible. Resuelve `catalogId` con `mapFitExercise`; los no mapeados usan `fit:<category>` como id sintético (no vacío, requerido por `SessionExerciseSchema`).

- [ ] **Step 1: Test (falla)**

```ts
import { test, expect } from "bun:test";
import { fitStrengthToSession } from "./fitStrengthToSession";
import type { FitStrengthPreview } from "./parseFitStrength";

const preview: FitStrengthPreview = {
  workoutName: "Push A",
  exercises: [
    { category: "shoulderPress", exerciseNameIndex: 8, displayName: "Dumbbell Push Press",
      sets: [ { reps: 8, weightKg: 20, durationMs: 30000 }, { reps: 8, weightKg: 22, durationMs: 28000 } ] },
    { category: "plank", exerciseNameIndex: 43, displayName: "Plank",
      sets: [ { reps: null, weightKg: null, durationMs: 60000 } ] }, // isométrico
  ],
  totalSets: 3, totalReps: 16, totalVolumeKg: 336,
};

const meta = { id: "33333333-3333-4333-8333-333333333333", startedAt: 1000, endedAt: 5000, totalDurationMs: 4000, location: "home" as const };

test("arma una WorkoutSession sin programa desde el preview", () => {
  const s = fitStrengthToSession(preview, meta);
  expect(s.programId).toBeNull();
  expect(s.weekNumber).toBeNull();
  expect(s.dayLabel).toBe("Push A"); // el workoutName pasa a dayLabel
  expect(s.id).toBe(meta.id);
  expect(s.location).toBe("home");
  expect(s.exercises).toHaveLength(2);
});

test("resuelve el catalogId con mapFitExercise; el mapeado usa el id real", () => {
  const s = fitStrengthToSession(preview, meta);
  // shoulderPress#8 → dumbbell_push_press (está en el catálogo)
  expect(s.exercises[0].catalogId).toBe("dumbbell_push_press");
  expect(s.exercises[0].garminName).toBe("Dumbbell Push Press");
});

test("un ejercicio no mapeable usa fit:<category> como id sintético", () => {
  const p2: FitStrengthPreview = {
    workoutName: null, totalSets: 1, totalReps: 10, totalVolumeKg: 150,
    exercises: [{ category: "noSuch", exerciseNameIndex: 99999, displayName: null,
      sets: [{ reps: 10, weightKg: 15, durationMs: 20000 }] }],
  };
  const s = fitStrengthToSession(p2, meta);
  expect(s.exercises[0].catalogId).toBe("fit:noSuch");
  expect(s.exercises[0].garminName).toBe("noSuch"); // sin displayName, cae al category
  expect(s.dayLabel).toBe("Entreno importado"); // sin workoutName, fallback
});

test("los isométricos van con reps 0 (SetLogSchema exige reps>=0, no null)", () => {
  const s = fitStrengthToSession(preview, meta);
  const plankSet = s.exercises[1].sets[0];
  expect(plankSet.reps).toBe(0);
  expect(plankSet.weightKg).toBeNull();
  expect(plankSet.durationMs).toBe(60000);
});

test("el resultado valida contra WorkoutSessionSchema", () => {
  const { WorkoutSessionSchema } = require("@pulsia/shared");
  expect(WorkoutSessionSchema.safeParse(fitStrengthToSession(preview, meta)).success).toBe(true);
});
```

- [ ] **Step 2: Correr, verificar que falla** (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
import type { WorkoutSession } from "@pulsia/shared";
import type { FitStrengthPreview } from "./parseFitStrength";
import { mapFitExercise } from "./fitExerciseMap";

export interface FitSessionMeta {
  id: string;
  startedAt: number;
  endedAt: number | null;
  totalDurationMs: number | null;
  location: "gym" | "home";
}

// Transforma el preview de fuerza del .FIT en una WorkoutSession sin programa. El catalogId se
// resuelve contra el catálogo (mapFitExercise); los ejercicios que no están usan `fit:<category>`
// para no violar el `min(1)` de SessionExerciseSchema y quedar como su propio grupo en las
// tendencias. Los isométricos (reps null) van con reps 0: SetLogSchema no admite null, y un plank
// no aporta a 1RM/volumen igual (isWorkingSet exige reps>0).
export function fitStrengthToSession(preview: FitStrengthPreview, meta: FitSessionMeta): WorkoutSession {
  return {
    id: meta.id,
    programId: null,
    weekNumber: null,
    dayLabel: preview.workoutName ?? "Entreno importado",
    location: meta.location,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    totalDurationMs: meta.totalDurationMs,
    notes: "",
    exercises: preview.exercises.map((ex, i) => {
      const catalogId = mapFitExercise(ex.category, ex.exerciseNameIndex) ?? `fit:${ex.category}`;
      return {
        catalogId,
        garminName: ex.displayName ?? ex.category,
        order: i,
        planned: { sets: ex.sets.length, reps: "", targetLoad: "", restSeconds: 0 },
        skipped: false,
        note: "",
        substitutedFromId: null,
        sets: ex.sets.map((set, j) => ({
          setNumber: j + 1,
          reps: set.reps ?? 0,
          weightKg: set.weightKg,
          rpe: null,
          startedAt: meta.startedAt,
          endedAt: null,
          durationMs: set.durationMs,
          repTimestamps: [],
          hrAvg: null,
          hrMax: null,
          skipped: false,
        })),
      };
    }),
  };
}
```

- [ ] **Step 4: Correr, verificar que pasa** (5 tests).

- [ ] **Step 5: Verificación por mutación**
1. `?? \`fit:${ex.category}\`` → `?? ""` → el test "valida contra WorkoutSessionSchema" debe fallar (catalogId vacío viola min(1)).
2. `set.reps ?? 0` → `set.reps as any` → el test de isométricos debe fallar (null en vez de 0) y/o el de validación.
3. `preview.workoutName ?? "Entreno importado"` → sin el `??` → el test "no mapeable" (workoutName null) debe fallar.

- [ ] **Step 6: Commit**

```bash
git add backend/src/cardio/fitStrengthToSession.ts backend/src/cardio/fitStrengthToSession.test.ts
git commit -S -m "feat(entrenamiento): transforma el preview de fuerza del .FIT en WorkoutSession"
```

---

## Task 3: Rutas `/sessions/from-fit/preview` y `/sessions/from-fit`

**Files:** `backend/src/routes/sessions.ts`, `backend/src/routes/sessions.test.ts` (o donde estén los tests de la ruta).

Dos rutas bajo `/sessions` (ya montado con `auth`). Comparten un helper que decodifica el `.FIT` y exige `subSport === "strengthTraining"` (si no, 422).

- [ ] **Step 1: Tests (fallan)**

Necesitan un `.FIT` de fuerza sintético en base64. **Reusar `buildFitFixture`** de `backend/src/cardio/fitFixture.ts` extendiéndolo para emitir `setMesgs` + `exerciseTitleMesgs` + `subSport: "strengthTraining"` (ver Step 3a). Los tests montan la app de test como los demás de `sessions.test.ts` (seguir el patrón del archivo: helper de request autenticado).

```ts
// preview
test("POST /sessions/from-fit/preview devuelve los ejercicios y series de un .FIT de fuerza", async () => {
  const b64 = strengthFitFixtureBase64(); // helper del fixture sintético
  const res = await authed.post("/sessions/from-fit/preview", { fitBase64: b64 });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.workoutName).toBeDefined();
  expect(body.exercises.length).toBeGreaterThan(0);
  expect(body.exercises[0].catalogId).toBeDefined(); // ya resuelto server-side
});

test("POST /sessions/from-fit/preview con un .FIT de CARDIO da 422", async () => {
  const b64 = cardioFitFixtureBase64(); // el fixture de cardio que ya existe
  const res = await authed.post("/sessions/from-fit/preview", { fitBase64: b64 });
  expect(res.status).toBe(422);
});

// persist
test("POST /sessions/from-fit persiste el entrenamiento y queda listable", async () => {
  const b64 = strengthFitFixtureBase64();
  const id = "44444444-4444-4444-8444-444444444444";
  const res = await authed.post("/sessions/from-fit", { fitBase64: b64, id, location: "home" });
  expect(res.status).toBe(200);
  // aparece en GET /sessions del usuario
  const list = await (await authed.get("/sessions")).json();
  expect(list.some((s: any) => s.id === id)).toBe(true);
});

test("re-POST del mismo id es idempotente (no duplica)", async () => {
  const b64 = strengthFitFixtureBase64();
  const id = "55555555-5555-4555-8555-555555555555";
  await authed.post("/sessions/from-fit", { fitBase64: b64, id, location: "gym" });
  const res2 = await authed.post("/sessions/from-fit", { fitBase64: b64, id, location: "gym" });
  expect(res2.status).toBe(200);
  const list = await (await authed.get("/sessions")).json();
  expect(list.filter((s: any) => s.id === id)).toHaveLength(1);
});
```

- [ ] **Step 2: Correr, verificar que fallan.**

- [ ] **Step 3a: Extender el fixture sintético**

En `backend/src/cardio/fitFixture.ts`, agregar soporte para emitir un `.FIT` de fuerza: `subSport: "strengthTraining"`, un par de `exerciseTitleMesgs` y `setMesgs` (activas + rest) con `category`/`categorySubtype`/`repetitions`/`weight`. Exportar un helper o un opts flag (`strength?: {...}`). **Valores sintéticos**, nunca datos reales. Verificar que al decodificarlo, `parseFitStrength` extrae lo esperado (un test del fixture, como el `fitFixture.test.ts` existente).

- [ ] **Step 3b: Implementar las rutas**

En `backend/src/routes/sessions.ts`, agregar el helper de decode + las 2 rutas (antes de `/:id` si hubiera captura de param; `/sessions/from-fit` no colisiona con `/:id` porque es literal, pero registrar los literales primero por las dudas):

```ts
import { Decoder, Stream } from "@garmin/fitsdk";
import { parseFitStrength } from "../cardio/parseFitStrength";
import { mapFitExercise } from "../cardio/fitExerciseMap";
import { fitStrengthToSession } from "../cardio/fitStrengthToSession";

const MAX_FIT_B64 = 7_000_000; // ~5 MB, igual que /cardio/parse

// Decodifica y exige que sea un entrenamiento de fuerza. Devuelve los messages + el startedAt.
function decodeStrengthFit(fitBase64: string): { messages: any; startedAt: number } {
  const buf = Buffer.from(fitBase64, "base64");
  const decoder = new Decoder(Stream.fromByteArray(buf));
  if (!decoder.isFIT()) throw new Error("no-fit");
  const { messages } = decoder.read({
    includeUnknownData: true, applyScaleAndOffset: true, expandSubFields: true,
    convertTypesToStrings: true, convertDateTimesToDates: true,
  });
  const session = messages.sessionMesgs?.[0];
  if (session?.subSport !== "strengthTraining") throw new Error("not-strength");
  const startedAt = session.startTime instanceof Date ? session.startTime.getTime() : Number(session.startTime);
  return { messages, startedAt };
}

// Enriquece el preview con el catalogId por ejercicio (resuelto server-side).
function strengthPreviewWithCatalog(messages: any) {
  const p = parseFitStrength(messages);
  return {
    ...p,
    exercises: p.exercises.map((ex) => ({
      ...ex,
      catalogId: mapFitExercise(ex.category, ex.exerciseNameIndex) ?? `fit:${ex.category}`,
    })),
  };
}

r.post("/from-fit/preview", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.fitBase64 !== "string" || body.fitBase64.length > MAX_FIT_B64)
    return c.json({ error: "Archivo inválido" }, 400);
  try {
    const { messages } = decodeStrengthFit(body.fitBase64);
    return c.json(strengthPreviewWithCatalog(messages));
  } catch (e) {
    if ((e as Error).message === "not-strength") return c.json({ error: "El .FIT no es un entrenamiento de fuerza" }, 422);
    return c.json({ error: "No se pudo leer el .FIT" }, 400);
  }
});

r.post("/from-fit", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.fitBase64 !== "string" || body.fitBase64.length > MAX_FIT_B64)
    return c.json({ error: "Archivo inválido" }, 400);
  const id = typeof body.id === "string" ? body.id : null;
  const location = body.location === "home" ? "home" : "gym";
  if (!id) return c.json({ error: "Falta el id" }, 400);
  try {
    const { messages, startedAt } = decodeStrengthFit(body.fitBase64);
    const session = messages.sessionMesgs?.[0];
    const durationSec = typeof session.totalTimerTime === "number" ? session.totalTimerTime
      : typeof session.totalElapsedTime === "number" ? session.totalElapsedTime : null;
    const totalDurationMs = durationSec != null ? Math.round(durationSec * 1000) : null;
    const preview = parseFitStrength(messages);
    const ws = fitStrengthToSession(preview, {
      id, startedAt, endedAt: totalDurationMs != null ? startedAt + totalDurationMs : null,
      totalDurationMs, location,
    });
    // pre-check de dueño, igual que PUT /sessions
    const owner = await getSessionOwnerId(db, id);
    if (owner != null && owner !== userId) return c.json({ error: "conflict" }, 409);
    await upsertSession(db, userId, ws);
    return c.json({ id });
  } catch (e) {
    if ((e as Error).message === "not-strength") return c.json({ error: "El .FIT no es un entrenamiento de fuerza" }, 422);
    return c.json({ error: "No se pudo importar el .FIT" }, 400);
  }
});
```

Ajustar imports (`db`, `getSessionOwnerId`, `upsertSession`, `r`) a como están en el archivo. Reusar lo que `PUT /sessions` ya importa.

- [ ] **Step 4: Correr, verificar que pasan.**

- [ ] **Step 5: Verificación por mutación**
1. Cambiar `session?.subSport !== "strengthTraining"` por `!== "xxx"` → el test "cardio da 422" debe fallar (dejaría pasar el cardio).
2. Quitar el pre-check de dueño / usar un userId fijo → si hay test de scoping, debe fallar (si no, agregar uno: otro usuario no ve la sesión).
3. En `strengthPreviewWithCatalog`, `?? \`fit:...\`` → `?? undefined` → el test del preview (catalogId defined) debe fallar.

- [ ] **Step 6: Suite completa + tsc + commit**

```bash
bun test shared backend && (cd backend && bunx tsc --noEmit)
git add backend/src/routes/sessions.ts backend/src/routes/sessions.test.ts backend/src/cardio/fitFixture.ts backend/src/cardio/fitFixture.test.ts
git commit -S -m "feat(entrenamiento): rutas para importar un entrenamiento de fuerza del .FIT"
```

---

## Task 4: PR

- [ ] **Step 1: Push + PR**

```bash
git push -u origin feat/fit-fuerza-parser
gh pr create --title "feat(entrenamiento): importar entrenamientos de fuerza del .FIT (backend)" --body "$(cat <<'EOF'
## Qué

Backend para importar un entrenamiento de FUERZA del `.FIT` como `workout_session` (con ejercicios/series), en vez de perderlo como cardio "otro". Entra a 1RM/volumen/informe automáticamente.

Parte del roadmap de importar fuerza (Pieza 1). El parser (`parseFitStrength`) y el mapeo (`mapFitExercise`) ya estaban; esto agrega la persistencia.

## Cómo

- Relaja `programId`/`weekNumber`/`dayLabel` de `workout_session` a **nullable** (un entrenamiento importado no cuelga de un programa nuestro). Auditoría: nada dereferencia esos campos; `computePerformanceTrends` y el informe son program-independent. Migración `DROP NOT NULL`.
- `fitStrengthToSession` transforma el preview en `WorkoutSession`, resolviendo `catalogId` con el catálogo (los no mapeados usan `fit:<category>`).
- Rutas nuevas `POST /sessions/from-fit/preview` (muestra) y `POST /sessions/from-fit` (persiste, idempotente por id). **No tocan `/cardio/parse`** → el móvil actual sigue funcionando.

## Alcance

Backend solo. La UI de import de fuerza en el móvil es un PR aparte (OTA). Dedupe con sesiones registradas a mano en la app: pendiente (hoy el owner carga en Garmin y entrena con el reloj).

Spec: `docs/superpowers/specs/2026-07-24-fit-fuerza-importar-design.md`
EOF
)"
gh pr comment --body "@claude review"
```

⚠️ El `@claude review` es estático (no corre Bash); su LGTM no reemplaza la suite.

---

## Notas para quien ejecute

- **Verificá el SQL de la migración** antes de commitear: solo 3 `DROP NOT NULL`, nada más. Si drizzle arrastra otra cosa, pará.
- **Fixtures sintéticos siempre** — nunca el `.FIT` real del owner ([[nunca-datos-reales-en-el-repo]]).
- Este plan puede tener errores (los últimos los tuvieron). Si un test pasa con la feature borrada, arreglá el test y avisá.
- **Post-merge:** auto-deploya a la Pi + auto-migra. Verificar `/health`. Sin OTA (backend puro).
