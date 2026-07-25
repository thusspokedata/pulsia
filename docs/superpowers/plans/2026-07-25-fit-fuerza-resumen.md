# El resumen del import de fuerza se ve completo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que un entrenamiento de fuerza importado del `.FIT` se vea completo en el `SessionSummary` (FC por serie, curva de FC, trabajo/descanso, detalle por serie, mapa corporal), poblando esos campos desde el `.FIT` al importar.

**Architecture:** El `.FIT` trae cada serie con `startTime`/`duration` y FC continua en `recordMesgs`. `parseFitStrength` expone el `startedAt` de cada serie; un helper `extractHrSamples` (refactor de `parseFit`) lee la FC; `fitStrengthToSession` puebla `startedAt`/`endedAt` reales por serie, `hrAvg`/`hrMax` por serie y `hrSeries` de la sesión. Backend puro, sin migración (los campos ya existen en `set_log`/`workout_session`), sin OTA (el móvil no cambia — reusa el `SessionSummary`).

**Tech Stack:** TypeScript, Hono, Bun, `@garmin/fitsdk`. Tests `bun test` (backend) + jest (mobile).

**Spec:** [`2026-07-25-fit-fuerza-resumen-design.md`](../specs/2026-07-25-fit-fuerza-resumen-design.md)

---

## Contexto (verificado)

**Causa raíz:** `fitStrengthToSession` puso `endedAt: null` en todas las series; `summarize` (`mobile/src/session/summary.ts:59`, `doneSetsOf`) **solo cuenta series con `endedAt != null`** → reps/volumen 0, detalle por serie vacío, trabajo/descanso mal. Más `hrAvg`/`hrMax`/`hrSeries` en null.

**Datos del `.FIT` (probados contra el archivo real del owner):** `setMesg.startTime` (Date absoluto) + `duration` (s); `recordMesgs` con `heartRate` + `timestamp`; la FC de una serie = promedio de los records en su intervalo (serie 1 → n=32, avg=90, máx=109).

**Convenciones (no negociables):** TDD + **verificación por mutación de cada test nuevo**; `git commit -S` sin atribución a Claude; `export PATH="$HOME/.bun/bin:$PATH"`; `bun test backend` y `bun test shared` desde la raíz; mobile `cd mobile && npm test -- --runInBand`. Fixtures **sintéticos** ([[nunca-datos-reales-en-el-repo]]).

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `backend/src/cardio/hrSamples.ts` | **Nuevo.** `extractHrSamples`, `downsampleHrSeries`, `hrForInterval` — helpers de FC. | Crear |
| `backend/src/cardio/parseFit.ts` | Usa `extractHrSamples` (sin cambio de comportamiento). | Modificar |
| `backend/src/cardio/parseFitStrength.ts` | Cada `FitStrengthSet` gana `startedAt`. | Modificar |
| `backend/src/cardio/fitStrengthToSession.ts` | Puebla timestamps reales + FC por serie + hrSeries (recibe `hrSamples`). | Modificar |
| `backend/src/routes/sessions.ts` | Extrae `hrSamples` y los pasa al transformador. | Modificar |
| `mobile/__tests__/*.ts(x)` | Test de la costura: `summarize` con la forma del import da valores llenos. | Crear/Modificar |

---

## Task 1: `extractHrSamples` + refactor de `parseFit`

**Files:** Create `backend/src/cardio/hrSamples.ts`, `backend/src/cardio/hrSamples.test.ts`; Modify `backend/src/cardio/parseFit.ts:126-130`.

- [ ] **Step 1: Test que falla**

Crear `backend/src/cardio/hrSamples.test.ts`:

```ts
import { test, expect } from "bun:test";
import { extractHrSamples } from "./hrSamples";

const rec = (tMs: number, hr: number | null) => ({ timestamp: new Date(tMs), heartRate: hr });

test("extractHrSamples toma los records con FC y timestamp, en epoch absoluto", () => {
  const messages = { recordMesgs: [rec(1000, 120), rec(2000, 130)] };
  expect(extractHrSamples(messages)).toEqual([{ tMs: 1000, bpm: 120 }, { tMs: 2000, bpm: 130 }]);
});

test("descarta records sin heartRate o sin timestamp válido", () => {
  const messages = { recordMesgs: [rec(1000, 120), rec(2000, null), { heartRate: 140 }] };
  expect(extractHrSamples(messages)).toEqual([{ tMs: 1000, bpm: 120 }]);
});

test("redondea la FC y tolera recordMesgs ausente", () => {
  expect(extractHrSamples({ recordMesgs: [rec(1000, 122.7)] })).toEqual([{ tMs: 1000, bpm: 123 }]);
  expect(extractHrSamples({})).toEqual([]);
});
```

- [ ] **Step 2: Correr, verificar que falla** — `bun test backend/src/cardio/hrSamples.test.ts` → módulo inexistente.

- [ ] **Step 3: Implementar `extractHrSamples`**

Crear `backend/src/cardio/hrSamples.ts`:

```ts
// FC extraída de los recordMesgs de un .FIT, en epoch ms ABSOLUTO. Compartido por el parser de
// cardio (hrSeries relativa) y por el import de fuerza (FC por serie con timestamps absolutos +
// hrSeries de la sesión). Vivir en un solo lugar evita que las dos extracciones diverjan.
export interface HrSample { tMs: number; bpm: number }

export function extractHrSamples(messages: any): HrSample[] {
  const records = (messages.recordMesgs ?? []) as Array<Record<string, unknown>>;
  return records
    .filter((r) => typeof r.heartRate === "number" && r.timestamp instanceof Date)
    .map((r) => ({ tMs: (r.timestamp as Date).getTime(), bpm: Math.round(r.heartRate as number) }));
}
```

- [ ] **Step 4: Correr, verificar que pasa.**

- [ ] **Step 5: Refactorizar `parseFit` para usar el helper (sin cambio de comportamiento)**

En `backend/src/cardio/parseFit.ts`, reemplazar el bloque de `hrSeries` (líneas ~126-130):

```ts
  const hrSeries = extractHrSamples(messages)
    .filter((s) => s.tMs >= startedAt)
    .map((s) => ({ t: s.tMs - startedAt, bpm: s.bpm }));
```

Agregar el import: `import { extractHrSamples } from "./hrSamples";`. La variable `records` sigue usándose para `buildSamples`, no la borres.

- [ ] **Step 6: Correr TODA la suite de cardio para confirmar que el refactor no cambió nada**

Run: `bun test backend/src/cardio/`
Expected: todo verde (los tests existentes de `parseFit` con `hrSeries` siguen pasando — es la garantía de que el refactor es equivalente).

- [ ] **Step 7: Verificación por mutación**
1. En `extractHrSamples`, quitar el filtro de `heartRate` → falla "descarta records sin heartRate".
2. Cambiar `Math.round` por nada (dejar `r.heartRate`) → falla "redondea la FC".

- [ ] **Step 8: Commit**

```bash
git add backend/src/cardio/hrSamples.ts backend/src/cardio/hrSamples.test.ts backend/src/cardio/parseFit.ts
git commit -S -m "refactor(entrenamiento): extractHrSamples compartido para la FC del .FIT"
```

---

## Task 2: `parseFitStrength` — `startedAt` por serie

**Files:** Modify `backend/src/cardio/parseFitStrength.ts`; Modify `backend/src/cardio/parseFitStrength.test.ts`.

- [ ] **Step 1: Test que falla**

En `parseFitStrength.test.ts`, agregar (el fixture `fixture()` ya existe; las setMesgs necesitan un `startTime`):

```ts
test("cada serie expone su startedAt (epoch ms) desde el startTime del setMesg", () => {
  const p = parseFitStrength({
    exerciseTitleMesgs: [{ messageIndex: 0, exerciseCategory: "curl", exerciseName: 0, wktStepName: "Curl" }],
    setMesgs: [
      { setType: "active", category: ["curl"], categorySubtype: [0], repetitions: 10, weight: 15, duration: 30, startTime: new Date(1000) },
      { setType: "active", category: ["curl"], categorySubtype: [0], repetitions: 8, weight: 15, duration: 25, startTime: new Date(120000) },
    ],
    workoutMesgs: [],
  });
  expect(p.exercises[0].sets[0].startedAt).toBe(1000);
  expect(p.exercises[0].sets[1].startedAt).toBe(120000);
});
```

- [ ] **Step 2: Correr, verificar que falla** (`startedAt` es `undefined`).

- [ ] **Step 3: Implementar**

En `parseFitStrength.ts`, agregar `startedAt` a la interfaz `FitStrengthSet`:

```ts
export interface FitStrengthSet {
  startedAt: number; // epoch ms del inicio de la serie (setMesg.startTime); 0 si el .FIT no lo trae
  reps: number | null;
  weightKg: number | null;
  durationMs: number;
}
```

Y poblarlo en el `push` del loop de sets:

```ts
    const startTime = s.startTime instanceof Date ? s.startTime.getTime() : numOrNull(s.startTime);
    ex.sets.push({
      startedAt: startTime ?? 0,
      reps: numOrNull(s.repetitions),
      weightKg: numOrNull(s.weight),
      durationMs: Math.round((numOrNull(s.duration) ?? 0) * 1000),
    });
```

- [ ] **Step 4: Correr, verificar que pasa** (el nuevo + los existentes de `parseFitStrength`).

- [ ] **Step 5: Verificación por mutación** — hardcodear `startedAt: 0` → el test nuevo debe fallar.

- [ ] **Step 6: Commit**

```bash
git add backend/src/cardio/parseFitStrength.ts backend/src/cardio/parseFitStrength.test.ts
git commit -S -m "feat(entrenamiento): parseFitStrength expone el startedAt de cada serie"
```

---

## Task 3: `hrForInterval` + `downsampleHrSeries` (helpers de FC)

**Files:** Modify `backend/src/cardio/hrSamples.ts`, `backend/src/cardio/hrSamples.test.ts`.

- [ ] **Step 1: Tests que fallan**

Agregar a `hrSamples.test.ts`:

```ts
import { hrForInterval, downsampleHrSeries } from "./hrSamples";

test("hrForInterval promedia y saca el máximo de los samples del intervalo [start,end]", () => {
  const s = [{ tMs: 100, bpm: 100 }, { tMs: 200, bpm: 120 }, { tMs: 300, bpm: 140 }, { tMs: 999, bpm: 200 }];
  // intervalo [100,300]: 100,120,140 → avg 120, max 140. El de 999 queda afuera.
  expect(hrForInterval(s, 100, 300)).toEqual({ avg: 120, max: 140 });
});

test("hrForInterval sin samples en el intervalo da null/null", () => {
  expect(hrForInterval([{ tMs: 100, bpm: 100 }], 500, 600)).toEqual({ avg: null, max: null });
});

test("downsampleHrSeries agrupa en buckets, promedia y hace t relativo al inicio de la sesión", () => {
  // startedAt 1000, bucket 5000ms. Sample a 1000 (t=0, bucket 0), 4000 (t=3000, bucket 0), 7000 (t=6000, bucket 5000).
  const s = [{ tMs: 1000, bpm: 100 }, { tMs: 4000, bpm: 120 }, { tMs: 7000, bpm: 150 }];
  expect(downsampleHrSeries(s, 1000, 5000)).toEqual([{ t: 0, bpm: 110 }, { t: 5000, bpm: 150 }]);
});

test("downsampleHrSeries descarta samples anteriores al inicio (t<0)", () => {
  expect(downsampleHrSeries([{ tMs: 500, bpm: 100 }, { tMs: 1000, bpm: 130 }], 1000, 5000)).toEqual([{ t: 0, bpm: 130 }]);
});
```

- [ ] **Step 2: Correr, verificar que fallan.**

- [ ] **Step 3: Implementar (agregar a `hrSamples.ts`)**

```ts
// FC media/máx de las series: promedio y máximo de los samples cuyo timestamp cae en [start,end].
export function hrForInterval(samples: HrSample[], start: number, end: number): { avg: number | null; max: number | null } {
  const bpms = samples.filter((s) => s.tMs >= start && s.tMs <= end).map((s) => s.bpm);
  if (bpms.length === 0) return { avg: null, max: null };
  return { avg: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length), max: Math.max(...bpms) };
}

// Curva de FC de la sesión: t relativo al inicio, en buckets de `bucketMs` (promedio por bucket).
// Misma resolución que las sesiones de la app; evita inflar el jsonb con un punto por segundo.
export function downsampleHrSeries(samples: HrSample[], sessionStartedAt: number, bucketMs = 5000): { t: number; bpm: number }[] {
  const byBucket = new Map<number, { sum: number; n: number }>();
  for (const s of samples) {
    const t = s.tMs - sessionStartedAt;
    if (t < 0) continue;
    const bucket = Math.floor(t / bucketMs) * bucketMs;
    const acc = byBucket.get(bucket) ?? { sum: 0, n: 0 };
    acc.sum += s.bpm;
    acc.n += 1;
    byBucket.set(bucket, acc);
  }
  return [...byBucket.entries()].sort((a, b) => a[0] - b[0]).map(([t, { sum, n }]) => ({ t, bpm: Math.round(sum / n) }));
}
```

- [ ] **Step 4: Correr, verificar que pasan.**

- [ ] **Step 5: Verificación por mutación**
1. En `hrForInterval`, `s.tMs <= end` → `s.tMs < end` no discrimina bien; mejor: cambiar el filtro a `>= start` solo (sin end) → el test del intervalo debe fallar (entraría el 200 de 999).
2. En `downsampleHrSeries`, quitar `if (t < 0) continue` → falla "descarta samples anteriores".
3. Cambiar `Math.floor(t / bucketMs) * bucketMs` por `t` → falla el test de buckets.

- [ ] **Step 6: Commit**

```bash
git add backend/src/cardio/hrSamples.ts backend/src/cardio/hrSamples.test.ts
git commit -S -m "feat(entrenamiento): helpers de FC por intervalo y curva downsampleada"
```

---

## Task 4: `fitStrengthToSession` puebla timestamps reales + FC

**Files:** Modify `backend/src/cardio/fitStrengthToSession.ts`, `backend/src/cardio/fitStrengthToSession.test.ts`.

- [ ] **Step 1: Tests que fallan**

En `fitStrengthToSession.test.ts` — el `preview` de prueba ahora necesita `startedAt` en cada set (lo agregó la Task 2). Actualizar el `preview` existente para incluir `startedAt` en sus sets (definilo como `previewConStartedAt`), y agregar. Los `hrSamples` se construyen a mano y se pasan directo al transformador (no se importa `extractHrSamples` acá):

```ts
const hrSamples = [
  { tMs: 1000, bpm: 100 }, { tMs: 1015, bpm: 110 }, // dentro de la serie 1 [1000, 1000+30000]
  { tMs: 200000, bpm: 150 }, // fuera de toda serie
];

test("las series tienen startedAt/endedAt reales y quedan 'terminadas' (endedAt != null)", () => {
  const s = fitStrengthToSession(previewConStartedAt, meta, hrSamples);
  const set0 = s.exercises[0].sets[0];
  expect(set0.startedAt).toBe(previewConStartedAt.exercises[0].sets[0].startedAt);
  expect(set0.endedAt).toBe(set0.startedAt + set0.durationMs);
  expect(set0.endedAt).not.toBeNull(); // la corrección de la causa raíz
});

test("hrAvg/hrMax por serie salen de los samples de su intervalo", () => {
  const s = fitStrengthToSession(previewConStartedAt, meta, hrSamples);
  const set0 = s.exercises[0].sets[0]; // serie 1: startedAt 1000, dur 30000 → [1000,31000], samples 100 y 110
  expect(set0.hrAvg).toBe(105);
  expect(set0.hrMax).toBe(110);
});

test("sin hrSamples, hrAvg/hrMax son null y hrSeries se omite (import sin banda)", () => {
  const s = fitStrengthToSession(previewConStartedAt, meta, []);
  expect(s.exercises[0].sets[0].hrAvg).toBeNull();
  expect(s.hrSeries).toBeUndefined();
});

test("hrSeries se puebla (downsampleada, relativa a startedAt de la sesión)", () => {
  const s = fitStrengthToSession(previewConStartedAt, { ...meta, startedAt: 1000 }, hrSamples);
  expect(s.hrSeries).toBeDefined();
  expect(s.hrSeries!.length).toBeGreaterThan(0);
  expect(s.hrSeries![0].t).toBe(0); // el primer bucket relativo al inicio
});
```

**Nota:** definir `previewConStartedAt` reusando el `preview` existente con `startedAt` agregado a cada set (ej. serie 1 `startedAt: 1000, durationMs: 30000`; serie 2 `startedAt: 100000, durationMs: 28000`). El `meta` existente sirve.

- [ ] **Step 2: Correr, verificar que fallan.**

- [ ] **Step 3: Implementar**

En `fitStrengthToSession.ts`, cambiar la firma e importar los helpers:

```ts
import { hrForInterval, downsampleHrSeries, type HrSample } from "./hrSamples";
```

```ts
export function fitStrengthToSession(preview: FitStrengthPreview, meta: FitSessionMeta, hrSamples: HrSample[] = []): WorkoutSession {
```

Reemplazar el `sets: ex.sets.map(...)` por (usando el `startedAt` real de cada serie y la FC del intervalo):

```ts
        sets: ex.sets.map((set, j) => {
          const startedAt = set.startedAt || meta.startedAt;
          const endedAt = startedAt + set.durationMs;
          const { avg, max } = hrForInterval(hrSamples, startedAt, endedAt);
          return {
            setNumber: j + 1,
            reps: set.reps ?? 0,
            weightKg: set.weightKg,
            rpe: null,
            startedAt,
            endedAt,
            durationMs: set.durationMs,
            repTimestamps: [],
            hrAvg: avg,
            hrMax: max,
            skipped: false,
          };
        }),
```

Y agregar `hrSeries` al objeto devuelto (junto a `notes`/`exercises`). El `WorkoutSessionSchema.hrSeries` es `optional`, así que se omite si está vacío:

```ts
  const hrSeries = downsampleHrSeries(hrSamples, meta.startedAt);
  return {
    id: meta.id,
    // ... resto igual ...
    notes: "",
    ...(hrSeries.length > 0 ? { hrSeries } : {}),
    exercises: preview.exercises.map((ex, i) => { /* ... */ }),
  };
```

- [ ] **Step 4: Correr, verificar que pasan** (los nuevos + los existentes de `fitStrengthToSession`, que ya validan contra `WorkoutSessionSchema`).

- [ ] **Step 5: Verificación por mutación**
1. Volver `endedAt` a `null` → falla "endedAt != null".
2. Pasar el intervalo equivocado a `hrForInterval` (ej. `[startedAt, startedAt]`) → falla "hrAvg/hrMax por serie".
3. Quitar el `...(hrSeries.length > 0 ...)` (siempre incluir) → falla "sin hrSamples hrSeries se omite".

- [ ] **Step 6: Commit**

```bash
git add backend/src/cardio/fitStrengthToSession.ts backend/src/cardio/fitStrengthToSession.test.ts
git commit -S -m "feat(entrenamiento): el import de fuerza puebla timestamps y FC por serie"
```

---

## Task 5: La ruta `/sessions/from-fit` pasa la FC al transformador

**Files:** Modify `backend/src/routes/sessions.ts`, `backend/src/routes/sessions.test.ts`.

- [ ] **Step 1: Test que falla**

En `sessions.test.ts` — extender el fixture de fuerza para incluir FC. El helper `buildStrengthFitBase64` (en `fitFixture.ts`) hoy no emite `recordMesgs` de FC. **Extenderlo** para aceptar records de FC (o agregar un `buildStrengthFitWithHrBase64`). Luego:

```ts
test("POST /sessions/from-fit guarda las series con FC y la sesión con hrSeries", async () => {
  const db = fakeDb();
  const app = createApp(deps(db) as any);
  const res = await postJson(app, "/sessions/from-fit", { fitBase64: buildStrengthFitWithHrBase64(), id: FIT_SID2, location: "gym" });
  expect(res.status).toBe(200);
  // el insert de workout_session lleva hrSeries; los set_log llevan hrAvg (verificar en db._inserts)
  const wsInsert = db._inserts.find((i: any) => i.table === workoutSession);
  expect(wsInsert.rows[0].hrSeries).toBeDefined();
  const setInserts = db._inserts.filter((i: any) => i.table === setLog);
  expect(setInserts.some((i: any) => i.rows[0].hrAvg != null)).toBe(true);
});
```

**Nota sobre el fixture:** `fitFixture.ts` emite mensajes con el `Encoder`. Agregar `recordMesgs` de FC: `writeMesg({ mesgNum: Profile.MesgNum.RECORD, timestamp: new Date(t), heartRate: bpm })` para timestamps DENTRO del intervalo de las series (usar el `startTimeMs` del fixture + offsets). Verificar decodificando que `extractHrSamples` los ve.

- [ ] **Step 2: Correr, verificar que falla** (hoy la ruta no pasa hrSamples → hrSeries undefined, hrAvg null).

- [ ] **Step 3: Implementar**

En `routes/sessions.ts`, en el handler de `POST /sessions/from-fit`, tras `decodeStrengthFit` y antes de `fitStrengthToSession`:

```ts
import { extractHrSamples } from "../cardio/hrSamples";
```

```ts
      const hrSamples = extractHrSamples(messages);
      const ws = fitStrengthToSession(parseFitStrength(messages), {
        id: body.id, startedAt,
        endedAt: totalDurationMs != null ? startedAt + totalDurationMs : null,
        totalDurationMs, location,
      }, hrSamples);
```

- [ ] **Step 4: Correr, verificar que pasa.**

- [ ] **Step 5: Verificación por mutación** — pasar `[]` en vez de `hrSamples` a `fitStrengthToSession` → el test debe fallar (hrSeries undefined, hrAvg null).

- [ ] **Step 6: Suite backend + tsc + commit**

```bash
bun test shared backend && (cd backend && bunx tsc --noEmit)
git add backend/src/routes/sessions.ts backend/src/routes/sessions.test.ts backend/src/cardio/fitFixture.ts
git commit -S -m "feat(entrenamiento): la ruta de import de fuerza extrae y persiste la FC"
```

---

## Task 6: Test de la costura — `summarize` con la forma del import

**Files:** Create/Modify `mobile/__tests__/session-summary.test.tsx` (o el archivo de tests de `summarize`).

`summarize` (`mobile/src/session/summary.ts:62`) es la función que consume el `WorkoutSession`. Este test garantiza que un `WorkoutSession` **con la forma que produce el import** (endedAt poblado, hrAvg/hrMax, hrSeries) da un resumen **lleno** — no solo que las piezas del backend andan.

- [ ] **Step 1: Test**

En el archivo de tests de `summarize` (mirar el existente; si no hay, crear `mobile/__tests__/import-summary.test.ts`):

```ts
import { summarize } from "../src/session/summary";
import type { WorkoutSession } from "@pulsia/shared";

// Un WorkoutSession con la MISMA forma que produce fitStrengthToSession para un import:
// programId/dayLabel nullable, series con endedAt = startedAt + durationMs, hrAvg/hrMax por serie, hrSeries.
const imported: WorkoutSession = {
  id: "11111111-1111-4111-8111-111111111111",
  programId: null, weekNumber: null, dayLabel: "Push A", location: "home",
  startedAt: 1000, endedAt: 1000 + 120000, totalDurationMs: 120000, notes: "",
  hrSeries: [{ t: 0, bpm: 100 }, { t: 5000, bpm: 120 }],
  exercises: [{
    catalogId: "dumbbell_push_press", garminName: "Dumbbell Push Press", order: 0,
    planned: { sets: 2, reps: "", targetLoad: "", restSeconds: 0 }, skipped: false, note: "", substitutedFromId: null,
    sets: [
      { setNumber: 1, reps: 8, weightKg: 20, rpe: null, startedAt: 1000, endedAt: 31000, durationMs: 30000, repTimestamps: [], hrAvg: 100, hrMax: 110, skipped: false },
      { setNumber: 2, reps: 8, weightKg: 22, rpe: null, startedAt: 61000, endedAt: 89000, durationMs: 28000, repTimestamps: [], hrAvg: 130, hrMax: 140, skipped: false },
    ],
  }],
};

test("summarize de un import da reps, volumen, trabajo/descanso, FC y mapa NO vacíos (la costura)", () => {
  const s = summarize(imported);
  expect(s.totalReps).toBe(16);                  // 8 + 8, no 0
  expect(s.totalVolumeKg).toBe(8 * 20 + 8 * 22); // 336, no 0
  expect(s.workMs).toBe(58000);                  // 30000 + 28000
  expect(s.restMs).toBeGreaterThan(0);           // descanso = total 120000 − work 58000
  expect(s.avgHr).not.toBeNull();                // FC media de la sesión
  expect(s.perSet.length).toBe(2);               // el detalle por serie no está vacío
  expect(s.primaryMuscles.length).toBeGreaterThan(0); // el mapa corporal se pinta (catalogId real → MUSCLE_MAP)
});
```

Nombres de campos confirmados en la interfaz `SessionSummary` (`summary.ts`): `totalReps`, `totalVolumeKg`, `workMs`, `restMs`, `avgHr`/`maxHr`, `perSet`, `primaryMuscles`/`secondaryMuscles`, `hrSeries`.

- [ ] **Step 2: Correr** — `cd mobile && npm test -- --runInBand import-summary`
Expected: PASS (summarize ya maneja esta forma; el test documenta la costura y prevendría una regresión).

- [ ] **Step 3: Verificación por mutación** — en el fixture, poner `endedAt: null` en los sets → los `expect` de reps/volumen/perSet deben caer a 0/vacío (confirma que es el `endedAt` lo que destraba el resumen, la causa raíz).

- [ ] **Step 4: Suite mobile + tsc + commit**

```bash
cd mobile && npm test -- --runInBand && npx tsc --noEmit
git add mobile/__tests__/
git commit -S -m "test(entrenamiento): summarize de un import da un resumen lleno (la costura)"
```

---

## Task 7: PR

- [ ] **Step 1: Push + PR**

```bash
git push -u origin feat/fit-fuerza-resumen
gh pr create --title "feat(entrenamiento): el resumen del import de fuerza se ve completo" --body "$(cat <<'EOF'
## Qué

Al tocar un entrenamiento de fuerza importado del `.FIT` en el Historial, el resumen se ve **igual** a una sesión de la app: FC por serie, curva de FC, trabajo/descanso, detalle por serie, mapa corporal.

## Causa raíz

`fitStrengthToSession` (#186) puso `endedAt: null` en las series, y `summarize` solo cuenta las terminadas (`endedAt != null`) → reps/volumen 0, detalle por serie vacío, FC vacía.

## Cómo

- `parseFitStrength` expone el `startedAt` real de cada serie (del `.FIT`).
- `extractHrSamples` (refactor de `parseFit`, DRY) lee la FC continua; `hrForInterval`/`downsampleHrSeries` derivan la FC por serie y la curva.
- `fitStrengthToSession` puebla `startedAt`/`endedAt` reales, `hrAvg`/`hrMax` por serie y `hrSeries`.
- La ruta `/sessions/from-fit` conecta.
- Test de la costura: `summarize` con la forma del import da un resumen lleno.

**Sin migración** (los campos ya existen), **sin OTA** (el móvil no cambia — reusa `SessionSummary`).

## Fuera de alcance (Pieza 2)

El extra que el reloj mide de más (kcal medidas, zonas de FC, cadencia) — necesita migración y sección nueva; requerirá re-importar (no se guarda el `.FIT` crudo).

Spec: `docs/superpowers/specs/2026-07-25-fit-fuerza-resumen-design.md`
EOF
)"
gh pr comment --body "@claude review"
gh pr comment --body "@coderabbitai review"
```

⚠️ El `@claude review` es estático (no corre Bash); su LGTM no reemplaza la suite.

---

## Notas para quien ejecute

- **El fixture de FC (Task 5) es el punto más delicado:** verificá decodificando que los `recordMesgs` que agregás al fixture caen DENTRO del intervalo de las series (mismo `startTimeMs` base), o `hrForInterval` no los verá y el test daría FC null. Confirmá con un `console.log` de `extractHrSamples(decoded)` si dudás.
- **Ajustá los nombres de campos de `SessionSummary`** (Task 6) a los reales de `summary.ts` — el plan usa nombres probables (`totalReps`, `workMs`, `perSet`), verificalos.
- Este plan puede tener errores. Si un test pasa con la feature borrada, arreglá el test y avisá.
- **Post-merge:** auto-deploya al backend. Verificar `/health`. Sin OTA. El owner puede re-importar un `.FIT` de fuerza y ver el resumen completo.
