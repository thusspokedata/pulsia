# Atribución trabajo/descanso con pausas mid-serie — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el tiempo de pausa que cae dentro de una serie deje de contarse como Trabajo — descontándolo de la duración de esa serie — y que el descanso por-fila también descuente las pausas.

**Architecture:** Los intervalos de pausa `{startedAt, endedAt}[]` pasan a ser la única fuente de verdad: se guardan en `PauseState` (AsyncStorage) y se adjuntan a la `WorkoutSession` en `finishSession`. `finishSession` resta a cada `set.durationMs` el solapamiento con las pausas y deriva el `totalDurationMs` de esos mismos intervalos. `summarize` resta el solapamiento con `session.pauseIntervals` al hueco de descanso por-fila. Toda la matemática vive en helpers puros (`overlapMs` en `engine.ts`; manipulación de intervalos en `pauseState.ts`), testeados con TDD + verificación por mutación.

**Tech Stack:** TypeScript, zod (esquemas en `@pulsia/shared`), React Native / Expo (mobile), jest (`jest-expo`) para mobile, `bun test` para shared.

## Convenciones del repo (leer antes de empezar)

- Correr tests de mobile: `cd mobile && npm test -- --runInBand <patrón>` (jest con `--runInBand`; el patrón matchea el nombre de archivo).
- Correr tests de shared: `cd shared && bun test src/<ruta>.test.ts`.
- **Verificación por mutación** (obligatoria para cada test nuevo, ~30 s c/u): tras ver el test en verde, romper a propósito la línea de producción que el test debería proteger (cambiar un `max`→`min`, un `-`→`+`, un `<`→`<=`), correr el test, **confirmar que se pone rojo**, y revertir la mutación. Un test que sigue verde con el código roto es un test falso; arreglarlo antes de seguir. (Ver `ONBOARDING.md` §0-HOY.)
- Commits **firmados**: `git commit -S`. Nunca agregar `Co-Authored-By: Claude`.
- Español en nombres de tests y comentarios (seguir el estilo de los archivos existentes).

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `shared/src/schemas/session.ts` | `PauseIntervalSchema` + `pauseIntervals?` en `WorkoutSessionSchema` | Modificar |
| `shared/src/schemas/session.test.ts` | Tests de parseo del esquema | Crear |
| `mobile/src/session/engine.ts` | `overlapMs` (puro) + `finishSession` corrige `durationMs` y deriva total | Modificar |
| `mobile/src/session/summary.ts` | Rest por-fila resta solape con `session.pauseIntervals` | Modificar |
| `mobile/src/storage/pauseState.ts` | `PauseState` con `intervals` + validador/migración + helpers puros | Modificar |
| `mobile/app/sesion.tsx` | Wiring: mantener intervalos, pausar/reanudar/terminar/restaurar | Modificar |
| `mobile/src/components/SessionIndicator.tsx` | Timer del banner: usar `totalPausedMs(intervals)` en vez de `pausedMs`/`pausedAt` | Modificar |
| `mobile/__tests__/session-engine.test.ts` | Tests de `overlapMs` y `finishSession` | Modificar |
| `mobile/__tests__/summary.test.ts` | Tests de rest por-fila con pausas | Modificar |
| `mobile/__tests__/pause-state-storage.test.ts` | Tests de `PauseState` + helpers | Modificar |
| `mobile/__tests__/sesion.test.tsx` | Mock de `pauseState` con los helpers reales | Modificar |
| `mobile/__tests__/session-indicator.test.tsx` | Mock con helper real + mockPauseState con `intervals` | Modificar |

---

### Task 1: Helper puro `overlapMs` en el motor

Solapamiento de dos ventanas de tiempo `[a0,a1]` y `[b0,b1]`, nunca negativo. Lo usan tanto `finishSession` como `summarize`.

**Files:**
- Modify: `mobile/src/session/engine.ts`
- Test: `mobile/__tests__/session-engine.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `mobile/__tests__/session-engine.test.ts`. Primero, agregar `overlapMs` al import de la línea 1:

```ts
import { startSession, tapRep, adjustReps, endSet, editSet, skipExercise, finishSession, discardOpenSets, closeOpenSets, setNotes, substituteExercise, substituteInProgram, overlapMs } from "../src/session/engine";
```

Tests nuevos (al final del archivo):

```ts
describe("overlapMs", () => {
  test("sin solape devuelve 0", () => {
    expect(overlapMs(0, 100, 200, 300)).toBe(0);
    expect(overlapMs(200, 300, 0, 100)).toBe(0);
  });
  test("solape parcial por la derecha", () => {
    expect(overlapMs(0, 100, 80, 300)).toBe(20);
  });
  test("solape parcial por la izquierda", () => {
    expect(overlapMs(80, 300, 0, 100)).toBe(20);
  });
  test("contención total: la ventana b está dentro de a", () => {
    expect(overlapMs(0, 100, 30, 60)).toBe(30);
  });
  test("contención total: la ventana a está dentro de b", () => {
    expect(overlapMs(30, 60, 0, 100)).toBe(30);
  });
  test("ventanas idénticas", () => {
    expect(overlapMs(10, 50, 10, 50)).toBe(40);
  });
  test("toque en el borde da 0 (no negativo)", () => {
    expect(overlapMs(0, 100, 100, 200)).toBe(0);
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd mobile && npm test -- --runInBand session-engine`
Expected: FAIL — `overlapMs is not a function` (no exportado aún).

- [ ] **Step 3: Implementar `overlapMs`**

Agregar en `mobile/src/session/engine.ts` (arriba de `finishSession`, junto a los otros helpers):

```ts
// Milisegundos de solapamiento entre dos ventanas de tiempo [a0,a1] y [b0,b1]. Nunca negativo.
export function overlapMs(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd mobile && npm test -- --runInBand session-engine`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: Verificación por mutación**

Cambiar `Math.max(0, ...)` por `Math.min(0, ...)` en `overlapMs`, correr `cd mobile && npm test -- --runInBand session-engine`, confirmar que "toque en el borde da 0" y "sin solape" se ponen **rojos**. Revertir. Repetir cambiando `Math.min(a1, b1)` por `Math.max(a1, b1)`: confirmar rojo en "solape parcial". Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/session/engine.ts mobile/__tests__/session-engine.test.ts
git commit -S -m "feat(sesión): helper puro overlapMs para solapamiento de ventanas"
```

---

### Task 2: Esquema `pauseIntervals` en la sesión (shared)

**Files:**
- Modify: `shared/src/schemas/session.ts`
- Test: `shared/src/schemas/session.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `shared/src/schemas/session.test.ts`:

```ts
import { test, expect } from "bun:test";
import { WorkoutSessionSchema, PauseIntervalSchema } from "./session";

const baseSession = {
  id: "11111111-1111-4111-8111-111111111111",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1,
  dayLabel: "Día 1",
  location: "gym" as const,
  startedAt: 1000,
  endedAt: 2000,
  totalDurationMs: 1000,
  notes: "",
  exercises: [],
};

test("PauseIntervalSchema valida un intervalo cerrado", () => {
  expect(PauseIntervalSchema.parse({ startedAt: 100, endedAt: 200 })).toEqual({ startedAt: 100, endedAt: 200 });
});

test("una sesión sin pauseIntervals sigue siendo válida (retrocompat)", () => {
  const parsed = WorkoutSessionSchema.parse(baseSession);
  expect(parsed.pauseIntervals).toBeUndefined();
});

test("una sesión con pauseIntervals los conserva", () => {
  const parsed = WorkoutSessionSchema.parse({ ...baseSession, pauseIntervals: [{ startedAt: 100, endedAt: 200 }] });
  expect(parsed.pauseIntervals).toEqual([{ startedAt: 100, endedAt: 200 }]);
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd shared && bun test src/schemas/session.test.ts`
Expected: FAIL — `PauseIntervalSchema` no existe / `pauseIntervals` se descarta (queda `undefined` en el tercer test).

- [ ] **Step 3: Implementar el esquema**

En `shared/src/schemas/session.ts`, agregar antes de `WorkoutSessionSchema`:

```ts
// Intervalo de pausa (epoch ms). En la sesión persistida siempre está cerrado.
export const PauseIntervalSchema = z.object({
  startedAt: z.number().int(),
  endedAt: z.number().int(),
});
```

Agregar el campo dentro de `WorkoutSessionSchema` (después de `hrSeries`):

```ts
  hrSeries: z.array(HrSeriesPointSchema).optional(),
  pauseIntervals: z.array(PauseIntervalSchema).optional(),
});
```

Agregar el export de tipo junto a los demás:

```ts
export type PauseInterval = z.infer<typeof PauseIntervalSchema>;
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd shared && bun test src/schemas/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Cambiar `z.number().int()` de `endedAt` por `z.string()` en `PauseIntervalSchema`; correr el test; confirmar que "PauseIntervalSchema valida un intervalo cerrado" se pone **rojo**. Revertir.

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas/session.ts shared/src/schemas/session.test.ts
git commit -S -m "feat(shared): pauseIntervals opcional en el esquema de sesión"
```

---

### Task 3: `finishSession` corrige `durationMs` y deriva el total desde los intervalos

Cambia la firma de `finishSession` de `{ nowMs; pausedMs? }` a `{ nowMs; pauseIntervals? }`. Resta a cada serie el solape con las pausas y deriva `totalDurationMs` de los mismos intervalos.

**Files:**
- Modify: `mobile/src/session/engine.ts:134-138`
- Test: `mobile/__tests__/session-engine.test.ts:137-163` (reemplazar los 4 tests de `pausedMs`) + tests nuevos

- [ ] **Step 1: Reescribir los tests de total y agregar los de atribución**

En `mobile/__tests__/session-engine.test.ts`, **reemplazar** los tests de las líneas 137-163 (los cuatro `finishSession ... pausedMs ...`) por:

```ts
test("finishSession setea endedAt y totalDurationMs", () => {
  let s = start();
  s = finishSession(s, { nowMs: 3601000 });
  expect(s.endedAt).toBe(3601000);
  expect(s.totalDurationMs).toBe(3600000);
});

test("finishSession resta del total el tiempo de las pausas", () => {
  let s = start(); // startedAt = 1000
  s = finishSession(s, { nowMs: 3601000, pauseIntervals: [{ startedAt: 1000000, endedAt: 1600000 }] });
  expect(s.totalDurationMs).toBe(3000000); // 3600000 - 600000
  expect(s.pauseIntervals).toEqual([{ startedAt: 1000000, endedAt: 1600000 }]);
});

test("finishSession sin pauseIntervals se comporta igual que antes (retrocompat)", () => {
  const a = finishSession(start(), { nowMs: 3601000 });
  const b = finishSession(start(), { nowMs: 3601000, pauseIntervals: [] });
  expect(a.totalDurationMs).toBe(3600000);
  expect(b.totalDurationMs).toBe(3600000);
  expect(a.pauseIntervals).toBeUndefined();
  expect(b.pauseIntervals).toBeUndefined();
});

test("finishSession nunca deja totalDurationMs negativo", () => {
  let s = start(); // startedAt = 1000
  s = finishSession(s, { nowMs: 2000, pauseIntervals: [{ startedAt: 1000, endedAt: 999999 }] });
  expect(s.totalDurationMs).toBe(0);
});

test("finishSession: pausa MID-SERIE descuenta el tiempo de esa serie (no cuenta como trabajo)", () => {
  // Serie: [2000, 12000] = 10 s brutos. Pausa [5000, 8000] = 3 s dentro de la serie.
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 3000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 12000 });
  s = finishSession(s, { nowMs: 13000, pauseIntervals: [{ startedAt: 5000, endedAt: 8000 }] });
  const set = s.exercises[0].sets[0];
  expect(set.durationMs).toBe(7000); // 10000 - 3000
});

test("finishSession: pausa MID-DESCANSO no toca la duración de las series", () => {
  // Serie: [2000, 5000] = 3 s. Pausa [7000, 9000] cae DESPUÉS de la serie (descanso).
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 3000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000 });
  s = finishSession(s, { nowMs: 12000, pauseIntervals: [{ startedAt: 7000, endedAt: 9000 }] });
  expect(s.exercises[0].sets[0].durationMs).toBe(3000); // intacta
  expect(s.totalDurationMs).toBe(11000 - 2000); // (12000-1000) - 2000 pausa
});

test("finishSession: pausa que excede la serie clampea la duración a 0", () => {
  // Serie: [2000, 5000] = 3 s. Pausa [1000, 9000] cubre toda la serie.
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 3000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000 });
  s = finishSession(s, { nowMs: 12000, pauseIntervals: [{ startedAt: 1000, endedAt: 9000 }] });
  expect(s.exercises[0].sets[0].durationMs).toBe(0);
});

test("finishSession: la serie abierta (endedAt null) no se toca", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 3000 }); // serie abierta
  s = finishSession(s, { nowMs: 12000, pauseIntervals: [{ startedAt: 5000, endedAt: 8000 }] });
  const set = s.exercises[0].sets[0];
  expect(set.endedAt).toBeNull();
  expect(set.durationMs).toBeNull();
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd mobile && npm test -- --runInBand session-engine`
Expected: FAIL — la firma vieja usa `pausedMs`; `durationMs` no se corrige; `pauseIntervals` no está en el resultado.

- [ ] **Step 3: Reescribir `finishSession`**

Reemplazar `finishSession` (líneas 134-138 de `mobile/src/session/engine.ts`) por:

```ts
export function finishSession(
  session: WorkoutSession,
  args: { nowMs: number; pauseIntervals?: { startedAt: number; endedAt: number | null }[] },
): WorkoutSession {
  const nowMs = args.nowMs;
  // Normalizar: cerrar el intervalo abierto en `now`. Los intervalos son la fuente del total y
  // de la corrección por-serie, así que ambos quedan consistentes por construcción.
  const ivs = (args.pauseIntervals ?? []).map((iv) => ({ startedAt: iv.startedAt, endedAt: iv.endedAt ?? nowMs }));

  // Total: descontar el tiempo de pausa que cae dentro de la ventana de la sesión. Nunca negativo.
  const totalPaused = ivs.reduce((acc, iv) => acc + overlapMs(session.startedAt, nowMs, iv.startedAt, iv.endedAt), 0);
  const total = Math.max(0, nowMs - session.startedAt - totalPaused);

  // Por serie terminada: restar el solape de las pausas con [startedAt, endedAt] de esa serie, para
  // que el tiempo de pausa mid-serie no se cuente como trabajo.
  const exercises = session.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) => {
      if (s.endedAt == null || s.durationMs == null) return s;
      const paused = ivs.reduce((acc, iv) => acc + overlapMs(s.startedAt, s.endedAt as number, iv.startedAt, iv.endedAt), 0);
      return { ...s, durationMs: Math.max(0, s.durationMs - paused) };
    }),
  }));

  const base = { ...session, exercises, endedAt: nowMs, totalDurationMs: total };
  return ivs.length > 0 ? { ...base, pauseIntervals: ivs } : base;
}
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd mobile && npm test -- --runInBand session-engine`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

1. En la corrección por-serie, cambiar `s.durationMs - paused` por `s.durationMs + paused`; correr; confirmar que "pausa MID-SERIE descuenta..." se pone **rojo**. Revertir.
2. Cambiar `Math.max(0, s.durationMs - paused)` por `s.durationMs - paused` (sin clamp); confirmar que "pausa que excede la serie clampea la duración a 0" se pone **rojo**. Revertir.
3. En el total, cambiar `- totalPaused` por `+ totalPaused`; confirmar que "resta del total el tiempo de las pausas" se pone **rojo**. Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/session/engine.ts mobile/__tests__/session-engine.test.ts
git commit -S -m "fix(sesión): descontar la pausa mid-serie de la duración de la serie"
```

---

### Task 4: `summarize` descuenta las pausas del rest por-fila

**Files:**
- Modify: `mobile/src/session/summary.ts:1` (import) y `:168-183` (perSet)
- Test: `mobile/__tests__/summary.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `mobile/__tests__/summary.test.ts` (usa los helpers `setLog`, `exercise`, `session` ya definidos ahí). Si `overlapMs`/timestamps ya calzan, el hueco entre serie 1 (termina en 5000) y serie 2 (empieza en 20000) es 15000; con una pausa [8000, 11000] (3 s) el rest por-fila debe ser 12000:

```ts
test("perSet: el rest por-fila descuenta el solape con las pausas", () => {
  const s = session({
    startedAt: 0,
    endedAt: 30000,
    totalDurationMs: 27000,
    pauseIntervals: [{ startedAt: 8000, endedAt: 11000 }],
    exercises: [
      exercise({
        catalogId: "barbell_bench_press",
        garminName: "Barbell Bench Press",
        order: 0,
        sets: [
          setLog({ setNumber: 1, startedAt: 2000, endedAt: 5000, durationMs: 3000, reps: 8 }),
          setLog({ setNumber: 2, startedAt: 20000, endedAt: 23000, durationMs: 3000, reps: 8 }),
        ],
      }),
    ],
  });
  const sum = summarize(s);
  expect(sum.perSet[0].restMs).toBe(12000); // 15000 - 3000
  expect(sum.perSet[1].restMs).toBeNull(); // última
});

test("perSet: sin pauseIntervals el rest por-fila es el hueco crudo (retrocompat)", () => {
  const s = session({
    startedAt: 0,
    endedAt: 30000,
    totalDurationMs: 30000,
    exercises: [
      exercise({
        catalogId: "barbell_bench_press",
        garminName: "Barbell Bench Press",
        order: 0,
        sets: [
          setLog({ setNumber: 1, startedAt: 2000, endedAt: 5000, durationMs: 3000, reps: 8 }),
          setLog({ setNumber: 2, startedAt: 20000, endedAt: 23000, durationMs: 3000, reps: 8 }),
        ],
      }),
    ],
  });
  expect(summarize(s).perSet[0].restMs).toBe(15000);
});
```

> Nota: si el helper `session(...)` de este archivo no acepta `pauseIntervals`, pasarlo igual — el tipo `Partial<WorkoutSession>` ya lo admite tras la Task 2. Verificar el spread del helper (`session.test.ts` línea ~del `function session`).

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd mobile && npm test -- --runInBand summary`
Expected: FAIL — `perSet[0].restMs` es 15000 (no descuenta la pausa).

- [ ] **Step 3: Implementar la corrección en `summarize`**

En `mobile/src/session/summary.ts`, línea 1, importar `overlapMs`:

```ts
import { overlapMs } from "./engine";
```

Reemplazar el bloque `perSet` (líneas 168-183) por:

```ts
  // perSet: rest = próxima.startedAt - esta.endedAt (>= 0), menos el solape con las pausas; null en la última.
  const pauseIvs = session.pauseIntervals ?? [];
  const perSet: SetRow[] = flat.map(({ set, garminName }, i) => {
    const next = flat[i + 1];
    let restMsRow: number | null = null;
    if (next != null && set.endedAt != null) {
      const paused = pauseIvs.reduce(
        (acc, iv) => acc + overlapMs(set.endedAt as number, next.set.startedAt, iv.startedAt, iv.endedAt),
        0,
      );
      restMsRow = Math.max(0, next.set.startedAt - set.endedAt - paused);
    }
    const volumeKg = set.weightKg != null ? set.reps * set.weightKg : null;
    return {
      setNumber: set.setNumber,
      exerciseName: garminName,
      durationMs: set.durationMs,
      restMs: restMsRow,
      reps: set.reps,
      weightKg: set.weightKg,
      volumeKg,
    };
  });
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd mobile && npm test -- --runInBand summary`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Cambiar `- paused` por `+ paused` en `restMsRow`; correr; confirmar que "el rest por-fila descuenta el solape con las pausas" se pone **rojo**. Revertir. Luego cambiar `Math.max(0, ...)` por el valor sin `Math.max`; confirmar que ningún test protege el clamp aquí — si querés cubrirlo, agregá un caso con pausa mayor al hueco (opcional). Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/session/summary.ts mobile/__tests__/summary.test.ts
git commit -S -m "fix(sesión): descontar las pausas del rest por-fila en el resumen"
```

---

### Task 5: `PauseState` con intervalos + helpers puros + migración

**Files:**
- Modify: `mobile/src/storage/pauseState.ts`
- Test: `mobile/__tests__/pause-state-storage.test.ts`

- [ ] **Step 1: Reescribir los tests de storage y agregar los de helpers**

Reemplazar **todo** `mobile/__tests__/pause-state-storage.test.ts` por:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getPauseState, setPauseState, clearPauseState,
  isPaused, startPause, endPause, totalPausedMs,
} from "../src/storage/pauseState";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("sin nada guardado devuelve null", async () => {
  expect(await getPauseState()).toBeNull();
});

test("guarda y recupera el estado con intervalos", async () => {
  await setPauseState({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: 200 }] });
  expect(await getPauseState()).toEqual({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: 200 }] });
});

test("guarda y recupera un intervalo abierto (pausa en curso)", async () => {
  await setPauseState({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: null }] });
  expect(await getPauseState()).toEqual({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: null }] });
});

test("clear borra el estado guardado", async () => {
  await setPauseState({ sessionId: "s1", intervals: [] });
  await clearPauseState();
  expect(await getPauseState()).toBeNull();
});

test("get devuelve null si el JSON es inválido", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", "{no es json");
  expect(await getPauseState()).toBeNull();
});

test("get devuelve null si el JSON no tiene la forma esperada", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", JSON.stringify({ sessionId: 1, intervals: "x" }));
  expect(await getPauseState()).toBeNull();
});

test("migra el formato viejo con pausa en curso a un intervalo abierto", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", JSON.stringify({ sessionId: "s1", pausedMs: 5000, pausedAt: 1_000_000 }));
  expect(await getPauseState()).toEqual({ sessionId: "s1", intervals: [{ startedAt: 1_000_000, endedAt: null }] });
});

test("migra el formato viejo sin pausa en curso a intervalos vacíos", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", JSON.stringify({ sessionId: "s1", pausedMs: 5000, pausedAt: null }));
  expect(await getPauseState()).toEqual({ sessionId: "s1", intervals: [] });
});

describe("helpers de intervalos", () => {
  test("isPaused: true solo si el último está abierto", () => {
    expect(isPaused([])).toBe(false);
    expect(isPaused([{ startedAt: 100, endedAt: 200 }])).toBe(false);
    expect(isPaused([{ startedAt: 100, endedAt: null }])).toBe(true);
  });
  test("startPause agrega un intervalo abierto", () => {
    expect(startPause([], 500)).toEqual([{ startedAt: 500, endedAt: null }]);
  });
  test("startPause es no-op si ya está pausado", () => {
    const ivs = [{ startedAt: 100, endedAt: null }];
    expect(startPause(ivs, 500)).toEqual(ivs);
  });
  test("endPause cierra el intervalo abierto", () => {
    expect(endPause([{ startedAt: 100, endedAt: null }], 700)).toEqual([{ startedAt: 100, endedAt: 700 }]);
  });
  test("endPause es no-op si no hay intervalo abierto", () => {
    const ivs = [{ startedAt: 100, endedAt: 200 }];
    expect(endPause(ivs, 700)).toEqual(ivs);
  });
  test("totalPausedMs suma cerrados + abierto hasta now", () => {
    expect(totalPausedMs([{ startedAt: 100, endedAt: 300 }, { startedAt: 500, endedAt: null }], 900)).toBe(600); // 200 + 400
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd mobile && npm test -- --runInBand pause-state-storage`
Expected: FAIL — la forma vieja de `PauseState`, sin `intervals` ni helpers.

- [ ] **Step 3: Reescribir `pauseState.ts`**

Reemplazar **todo** `mobile/src/storage/pauseState.ts` por:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.pauseState";

// Un intervalo de pausa; el último puede estar abierto (endedAt null = pausa en curso).
export interface PauseInterval {
  startedAt: number;
  endedAt: number | null;
}

// Estado de pausa de la sesión activa, persistido para sobrevivir un remontaje de la pantalla o un
// reinicio de la app. Los intervalos son la fuente de verdad: el total y la atribución por-serie se
// derivan de ellos (ver finishSession).
export interface PauseState {
  sessionId: string;
  intervals: PauseInterval[];
}

function isInterval(x: unknown): x is PauseInterval {
  return (
    x != null && typeof x === "object" &&
    typeof (x as PauseInterval).startedAt === "number" &&
    ((x as PauseInterval).endedAt === null || typeof (x as PauseInterval).endedAt === "number")
  );
}

// Devuelve el estado guardado, o null si no hay o el JSON es inválido. Migra el formato viejo
// ({ pausedMs, pausedAt }): una pausa en curso (pausedAt != null) se preserva como intervalo
// abierto; el pausedMs ya acumulado de una sesión en vuelo se pierde (limitación conocida,
// se auto-sana en la próxima sesión).
export async function getPauseState(): Promise<PauseState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    if (json == null || typeof json !== "object" || typeof json.sessionId !== "string") return null;
    if (Array.isArray(json.intervals)) {
      if (!json.intervals.every(isInterval)) return null;
      return { sessionId: json.sessionId, intervals: json.intervals };
    }
    // Migración del formato viejo.
    if (json.pausedAt === null || typeof json.pausedAt === "number") {
      const intervals = json.pausedAt != null ? [{ startedAt: json.pausedAt, endedAt: null }] : [];
      return { sessionId: json.sessionId, intervals };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setPauseState(s: PauseState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearPauseState(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// ---- Helpers puros de manipulación de intervalos ----

export function isPaused(intervals: PauseInterval[]): boolean {
  const last = intervals[intervals.length - 1];
  return last != null && last.endedAt == null;
}

export function startPause(intervals: PauseInterval[], now: number): PauseInterval[] {
  if (isPaused(intervals)) return intervals;
  return [...intervals, { startedAt: now, endedAt: null }];
}

export function endPause(intervals: PauseInterval[], now: number): PauseInterval[] {
  if (!isPaused(intervals)) return intervals;
  return intervals.map((iv, i) => (i === intervals.length - 1 ? { ...iv, endedAt: now } : iv));
}

export function totalPausedMs(intervals: PauseInterval[], now: number): number {
  return intervals.reduce((acc, iv) => acc + Math.max(0, (iv.endedAt ?? now) - iv.startedAt), 0);
}
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd mobile && npm test -- --runInBand pause-state-storage`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

1. En `isPaused`, cambiar `last.endedAt == null` por `last.endedAt != null`; confirmar rojo en "isPaused: true solo si el último está abierto". Revertir.
2. En `totalPausedMs`, cambiar `(iv.endedAt ?? now) - iv.startedAt` por `iv.startedAt - (iv.endedAt ?? now)`; confirmar rojo en "totalPausedMs suma...". Revertir.
3. En `getPauseState`, romper la migración (cambiar `json.pausedAt != null` por `json.pausedAt == null`); confirmar rojo en los dos tests de migración. Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/storage/pauseState.ts mobile/__tests__/pause-state-storage.test.ts
git commit -S -m "feat(sesión): PauseState con intervalos + helpers puros + migración"
```

---

### Task 6: Wiring en `sesion.tsx`

Cambiar el estado de pausa de refs de acumulado (`pausedMsRef`, `pauseStartedRef`) a un ref de intervalos, usando los helpers de la Task 5, y pasar `pauseIntervals` a `finishSession`.

**Files:**
- Modify: `mobile/app/sesion.tsx` (imports, refs, restauración ~168-179, `resumeIfPaused` ~431-444, `onPauseToggle` ~446-462, `onFinish` ~464-479)
- Modify: `mobile/__tests__/sesion.test.tsx:22-26` (mock con los helpers reales)

- [ ] **Step 1: Actualizar el mock de `pauseState` en el test**

En `mobile/__tests__/sesion.test.tsx`, reemplazar el `jest.mock` de las líneas 22-26 por uno que conserve los helpers reales (el mock reemplaza el módulo entero; sin esto, `startPause`/`endPause`/`isPaused`/`totalPausedMs` quedarían `undefined`):

```ts
jest.mock("../src/storage/pauseState", () => {
  const actual = jest.requireActual("../src/storage/pauseState");
  return {
    ...actual,
    getPauseState: async () => mockPauseState,
    setPauseState: async (s: any) => { mockPauseState = s; mockSetPause(s); },
    clearPauseState: async () => { mockPauseState = null; mockClearPause(); },
  };
});
```

- [ ] **Step 2: Correr los tests de `sesion` (baseline verde antes de tocar producción)**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: PASS (el mock nuevo no cambia comportamiento todavía).

- [ ] **Step 3: Reescribir el wiring en `sesion.tsx`**

3a. En el import de `pauseState` (línea ~13), agregar los helpers:

```ts
import { getPauseState, setPauseState, clearPauseState, startPause, endPause, isPaused, totalPausedMs, type PauseInterval } from "../src/storage/pauseState";
```

3b. Reemplazar los refs de las líneas 78-79:

```ts
  const intervalsRef = useRef<PauseInterval[]>([]); // intervalos de pausa (fuente de verdad)
```

3c. En la restauración (líneas 170-179), reemplazar el bloque `if (ps && ps.sessionId === active.id) { ... }` por:

```ts
          if (ps && ps.sessionId === active.id) {
            intervalsRef.current = ps.intervals;
            setPaused(isPaused(ps.intervals));
          }
```

3d. Reemplazar `resumeIfPaused` (líneas 431-444):

```ts
  function resumeIfPaused() {
    if (!paused) return;
    const now = Date.now();
    intervalsRef.current = endPause(intervalsRef.current, now);
    setPaused(false);
    // Retomar el descanso con lo que le quedaba (el contador estaba congelado).
    if (restRemainingRef.current != null) {
      restDoneRef.current = false; // permitir que la campana suene una vez al cruzar 0
      setRestUntil(now + restRemainingRef.current);
      restRemainingRef.current = null;
    }
    void setPauseState({ sessionId: sess.id, intervals: intervalsRef.current });
  }
```

3e. Reemplazar el bloque de pausa en `onPauseToggle` (líneas 451-461) — desde `// Pausar: ...` hasta el `void setPauseState(...)` final:

```ts
    // Pausar: abrir un intervalo nuevo.
    const now = Date.now();
    intervalsRef.current = startPause(intervalsRef.current, now);
    setPaused(true);
    // Congelar el descanso activo: guardar lo que resta y frenar el contador (así la campana
    // no dispara mientras está pausado).
    if (restUntil != null && restUntil > now) {
      restRemainingRef.current = restUntil - now;
      setRestUntil(null);
    }
    void setPauseState({ sessionId: sess.id, intervals: intervalsRef.current });
```

3f. En `onFinish` (líneas 472-479), reemplazar el cálculo de `pausedMs` y la llamada a `finishSession`:

```ts
    // Cerrar el intervalo abierto (si la sesión estaba pausada) en `now`, y usarlo como fuente.
    const pauseIntervals = endPause(intervalsRef.current, now);
    const s = closeOpenSets(sess, { activeOrder: current?.order ?? null, weightKg: parseNum(weight), rpe: parseNum(rpe), nowMs: now, hrAvg, hrMax });
    const fullLog = hr.getFullLog();
    const sWithHr = fullLog.length > 0 ? { ...s, hrSeries: buildHrSeries(fullLog, s.startedAt) } : s;
    const done = finishSession(sWithHr, { nowMs: now, pauseIntervals });
```

> Buscar cualquier otro uso de `pausedMsRef` / `pauseStartedRef` en el archivo (`grep -n pausedMsRef\\\|pauseStartedRef mobile/app/sesion.tsx`) y eliminarlo. Si el rótulo del botón o algún indicador mostraba tiempo pausado, derivarlo con `totalPausedMs(intervalsRef.current, Date.now())`.

- [ ] **Step 4: Typecheck + tests de `sesion`**

Run: `cd mobile && npx tsc --noEmit && npm test -- --runInBand sesion`
Expected: sin errores de tipos; PASS. Si algún test de pausa afirmaba sobre `pausedMs`/`pausedAt` en el `setPauseState` mockeado, actualizarlo para afirmar sobre `intervals`.

- [ ] **Step 5: Suite completa de mobile**

Run: `cd mobile && npm test -- --runInBand`
Expected: PASS (todos los archivos).

- [ ] **Step 6: Commit**

```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(sesión): registrar intervalos de pausa y pasarlos a finishSession"
```

---

### Task 7: Verificación final y suites cruzadas

- [ ] **Step 1: Suite de shared + backend (por si el tipo tocó algo)**

Run (desde la raíz): `bun test shared backend`
Expected: PASS. (El backend ignora `pauseIntervals`; solo verificamos que el tipo nuevo no rompa nada.)

- [ ] **Step 2: Suite completa de mobile**

Run: `cd mobile && npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 3: Typecheck de mobile**

Run: `cd mobile && npx tsc --noEmit`
Expected: sin errores.

---

### Task 8: Persistir `pauseIntervals` en el backend (ampliación de alcance)

Para que el rest por-fila corregido sobreviva al round-trip y el Historial muestre lo mismo que la pantalla de fin. Espeja el patrón de `hrSeries`.

**Files:**
- Modify: `backend/src/db/schema.ts` (columna `pause_intervals` en `workoutSession`, después de `hrSeries`)
- Modify: `backend/src/sessions/repository.ts` (`rowsToSession` + `upsertSession`)
- Test: `backend/src/sessions/repository.test.ts` (espejo de los tests de `hrSeries`)
- Generate: `backend/drizzle/00XX_*.sql` vía `drizzle-kit generate` (solo genera el SQL; NO aplicar contra ninguna DB)

Cambios:
- `schema.ts`: `pauseIntervals: jsonb("pause_intervals").$type<{ startedAt: number; endedAt: number }[]>(),` (nullable, igual que `hrSeries`).
- `rowsToSession`: `pauseIntervals: row.pauseIntervals ?? undefined,` (después de `hrSeries`).
- `upsertSession` insert: `pauseIntervals: s.pauseIntervals ?? null,` (después de `hrSeries`).
- Tests: espejar los 4 de `hrSeries` (rowsToSession undefined/present; upsert null/present).
- Migración: `cd backend && bun run db:generate` → verificar que el SQL SOLO agregue la columna `pause_intervals`. NO correr `db:migrate` (eso es deploy, fuera de alcance).

### Task 9: Renombrar el tipo de storage a `OpenPauseInterval`

Eliminar la colisión de nombre con el `PauseInterval` cerrado de `shared`.

**Files:**
- Modify: `mobile/src/storage/pauseState.ts` (renombrar `interface PauseInterval` → `OpenPauseInterval`; actualizar firmas de helpers y export)
- Modify: `mobile/app/sesion.tsx` (import `type PauseInterval` → `OpenPauseInterval`)

El `PauseInterval` de `shared/src/schemas/session.ts` (cerrado) NO se toca. Correr `cd mobile && npx tsc --noEmit` (limpio) + suite completa verde.

## Self-review (cobertura del spec)

- **Corrección canónica en `finishSession`** → Task 3. ✅
- **Modelo general de tiempo muerto (durationMs + rest por-fila)** → Task 3 (durationMs) + Task 4 (rest por-fila). ✅
- **Intervalos como única fuente; `pauseIntervals?` en la sesión** → Task 2 (esquema) + Task 3 (adjuntado). ✅
- **`PauseState` con intervalos + migración** → Task 5. ✅
- **Helpers puros testeables (`overlapMs`, intervalos)** → Task 1 + Task 5. ✅
- **Wiring UI sin regresiones** → Task 6. ✅
- **Casos borde** (sin pausas, pausa que excede, serie abierta, retrocompat) → Tasks 3/4/5. ✅
- **Fuera de alcance** (columna backend, migración histórica, UI del resumen) → no se toca. ✅

## Notas de integración (post-implementación)

- **OTA**: mobile es JS-only aquí (sin deps nuevas), así que tras mergear corresponde publicar el OTA verificando el runtime vc10 `784872cb…` (ver memoria `ota-always-publish` / `ota-fingerprint-gotcha`). Confirmar con el usuario antes de deployar.
- **PR**: rama nueva desde `main`, PR con CodeRabbit + disparar `@claude review` automáticamente al abrirlo.
