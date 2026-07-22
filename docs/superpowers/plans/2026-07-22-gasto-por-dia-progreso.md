# El cardio entra a Progreso: de minutos a gasto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las actividades de cardio (manuales e importadas del `.FIT`) entren a "Días entrenados" y "Tiempo por día" del tab Progreso, cambiando la métrica de minutos a gasto calórico.

**Architecture:** Una función pura nueva (`mobile/src/session/dailyBurn.ts`) agrupa sesiones de fuerza + actividades de cardio por día local y calcula el gasto con los mismos primitivos que `dayExerciseBurn`, garantizando que Progreso y Nutrición nunca discrepen. El heatmap y las barras pasan a consumir ese mapa. Aparte, se corrige en `shared/` un doble conteo del BMR en las kcal que reporta el reloj.

**Tech Stack:** TypeScript, React Native (Expo), `bun test` (shared), jest (`jest-expo`, mobile), react-native-svg.

**Spec:** [`docs/superpowers/specs/2026-07-22-gasto-por-dia-progreso-design.md`](../specs/2026-07-22-gasto-por-dia-progreso-design.md)

---

## Contexto que el implementador necesita

**Convenciones de este repo (no negociables):**

- **TDD estricto**, y **verificación por mutación de cada test nuevo**: después de que un test pase, rompé a propósito el código que prueba y confirmá que el test se pone en rojo. Si sigue verde, el test no prueba lo que dice. Esta regla existe porque este repo acumuló múltiples tests falsos, **varios nacidos en planes como este**. No la saltees.
- **Commits firmados**: `git commit -S`. **Nunca** agregar `Co-Authored-By` ni atribución a Claude/Anthropic.
- Tests de mobile: `cd mobile && npm test -- --runInBand` (en paralelo dan timeouts flaky). Tests en `mobile/__tests__/`, **nunca** en `mobile/app/`.
- Tests de shared: `bun test shared` desde la raíz.
- `zod` no resuelve desde `mobile/` — usar los tipos de `@pulsia/shared`.

**Comandos de verificación:**

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun test shared backend          # desde la raíz
cd mobile && npm test -- --runInBand
cd mobile && npx tsc --noEmit
```

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `shared/src/nutrition/exerciseBurn.ts` | Gasto de ejercicio (fuente única). Se corrige el doble conteo del BMR. | Modificar |
| `shared/src/nutrition/exerciseBurn.test.ts` | Un test existente codifica el bug y debe actualizarse. | Modificar |
| `mobile/src/session/dailyBurn.ts` | **Nuevo.** Agrupa fuerza + cardio por día local → gasto y desglose. | Crear |
| `mobile/src/session/burnThresholds.ts` | **Nuevo.** Cuartiles del historial → cortes de nivel, con fallback fijo. | Crear |
| `mobile/src/session/heatmap.ts` | Grilla anual. Pasa a consumir el mapa de gasto. | Modificar |
| `mobile/src/session/weeklyBars.ts` | Barras de 4 semanas. Pasa a kcal. | Modificar |
| `mobile/src/components/YearHeatmap.tsx` | Grilla + selección de celda con desglose. | Modificar |
| `mobile/app/(tabs)/progreso.tsx` | Wiring: carga cardio + perfil, títulos, estado sin perfil. | Modificar |

---

## Task 1: Verificar si las kcal del reloj son brutas (GATE — bloquea la Task 2)

**Este task no escribe código.** Es un gate de decisión: la Task 2 corrige un doble conteo del BMR
**asumiendo** que el `total_calories` de Garmin es bruto (incluye el metabolismo basal del rato).
**Si esa hipótesis es falsa, la Task 2 introduce un bug nuevo** en la dirección contraria
(subcontaría el gasto). Verificar antes cuesta minutos; equivocarse cuesta un PR de revert.

- [ ] **Step 1: Traer una actividad `.FIT` real de prod**

La DB corre en la Pi. Consulta de **solo lectura**:

```bash
ssh nextcloud "docker exec -i deploy-db-1 psql -U pulsia -d pulsia -c \
\"SELECT id, type, duration_ms, avg_hr, kcal, kcal_source \
FROM cardio_activity WHERE kcal_source = 'device' AND avg_hr IS NOT NULL \
ORDER BY started_at DESC LIMIT 5;\""
```

Si el nombre del contenedor o del rol no matchea, listarlos con
`ssh nextcloud "docker ps --format '{{.Names}}'"` y ajustar.

- [ ] **Step 2: Calcular el estimado Keytel de esa misma actividad**

Con los valores de la fila (`duration_ms`, `avg_hr`) y el perfil del owner (peso, edad, sexo),
calcular el **bruto** que da la fórmula Keytel — la misma de
[`exerciseBurn.ts:29`](../../../shared/src/nutrition/exerciseBurn.ts):

```
kcal/min (male) = (-55.0969 + 0.6309*hr + 0.1988*peso + 0.2017*edad) / 4.184
bruto = kcal/min * minutos
```

- [ ] **Step 3: Decidir**

Comparar `kcal` (del reloj) contra el bruto calculado:

| Resultado | Interpretación | Acción |
|---|---|---|
| Reloj ≈ bruto (±15 %) | El reloj manda **bruto** → confirma la hipótesis | **Hacer la Task 2** |
| Reloj ≈ bruto − BMR·min | El reloj ya manda **neto** | **SALTEAR la Task 2.** Registrar el hallazgo en el spec y seguir en la Task 3 |
| Diferencia muy grande e inexplicable | No concluyente | **Parar y consultar al owner.** No adivinar |

- [ ] **Step 4: Registrar el resultado**

Anotar en el spec (§B.2) qué se midió y qué se concluyó, con los números concretos. Commitear:

```bash
git add docs/superpowers/specs/2026-07-22-gasto-por-dia-progreso-design.md
git commit -S -m "docs(progreso): resultado de la verificación de kcal del reloj"
```

---

## Task 2: `estimateCardioBurn` resta el BMR a las kcal del reloj

**Solo si la Task 1 confirmó que el reloj manda bruto.**

**Files:**
- Modify: `shared/src/nutrition/exerciseBurn.ts:68-71`
- Test: `shared/src/nutrition/exerciseBurn.test.ts`

⚠️ **Este cambio altera los números de Nutrición del owner** (baja su restante de kcal y su meta de
carbos en los días que importa del reloj). Es intencional y está aprobado. No lo "suavices".

- [ ] **Step 1: Actualizar el test existente que codifica el bug**

[`exerciseBurn.test.ts:68-74`](../../../shared/src/nutrition/exerciseBurn.test.ts) hoy afirma que
las kcal del reloj se usan tal cual **incluso con `bmr` presente**. Ese test **debe cambiar**: es la
aserción que fija el comportamiento viejo. Reemplazarlo entero por:

```ts
test("cardio con kcal del reloj: se resta el BMR del intervalo (el reloj reporta bruto)", () => {
  // 140 kcal del reloj, 60 min, bmr 1718 → basal del rato = (1718/1440)*60 = 71.58
  // neto = 140 - 71.58 = 68.42 → 68
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: 105, kcal: 140 },
    { weightKg: 80, age: 40, sex: "male", bmr: 1718 },
  );
  expect(r).toEqual({ kcal: 68, method: "device" });
});

test("cardio con kcal del reloj y SIN bmr: se usan tal cual", () => {
  // Sin perfil completo no hay BMR que restar; el dato del reloj pasa intacto.
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: 105, kcal: 140 },
    { weightKg: 80, age: 40, sex: "male", bmr: null },
  );
  expect(r).toEqual({ kcal: 140, method: "device" });
});

test("cardio del reloj: el neto nunca es negativo (clamp a 0)", () => {
  // Actividad larga y muy suave: 50 kcal en 120 min, basal del rato = 144 → -94, clampeado a 0.
  const r = estimateCardioBurn(
    { type: "walk", durationMs: 2 * HOUR, avgHr: 80, kcal: 50 },
    { weightKg: 80, age: 40, sex: "male", bmr: 1728 },
  );
  expect(r).toEqual({ kcal: 0, method: "device" });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `bun test shared/src/nutrition/exerciseBurn.test.ts`
Expected: FAIL — los tres nuevos fallan (el primero espera 68 y recibe 140, el tercero espera 0 y
recibe 50). El de "sin bmr" pasa desde ya, porque coincide con el comportamiento actual.

- [ ] **Step 3: Implementar**

Reemplazar `estimateCardioBurn` en [`exerciseBurn.ts:68`](../../../shared/src/nutrition/exerciseBurn.ts):

```ts
// El reloj le gana a la fórmula: mide con acelerómetro + FC + perfil. Pero reporta el gasto
// BRUTO del intervalo (incluye el metabolismo basal de ese rato), mientras que `burnFrom` deja
// la fuerza en NETO. Sin este ajuste las dos ramas no son comparables y el BMR de la actividad
// se cuenta dos veces: la meta diaria ya lo incluye por las 24 h.
export function estimateCardioBurn(a: CardioBurnInput, athlete: AthleteBurnArgs): CardioBurn {
  if (a.kcal != null) {
    const minutes = a.durationMs / 60000;
    const net = athlete.bmr != null ? a.kcal - (athlete.bmr / 1440) * minutes : a.kcal;
    // El schema garantiza kcal >= 0, pero la RESTA puede dar negativo (actividad larga y muy
    // suave). Sin el clamp, un día de cardio le restaría meta al usuario en vez de sumarle.
    return { kcal: Math.round(Math.max(0, net)), method: "device" };
  }
  return burnFrom({ durationMs: a.durationMs, avgHr: a.avgHr, met: MET_BY_CARDIO[a.type], ...athlete });
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `bun test shared`
Expected: PASS. El test `dayExerciseBurn suma sesiones de fuerza + actividades de cardio`
([línea 108](../../../shared/src/nutrition/exerciseBurn.test.ts)) usa `bmr: null`, así que **sigue
verde sin tocarlo** — es la confirmación de que el cambio solo afecta la rama con BMR.

- [ ] **Step 5: Verificación por mutación**

1. Borrar `- (athlete.bmr / 1440) * minutes` → el primer test debe fallar. Restaurar.
2. Borrar `Math.max(0, ...)` → el test del clamp debe fallar. Restaurar.
3. Cambiar `method: "device"` por `"met"` → los tres deben fallar (usan `toEqual` sobre el objeto
   entero, así que el `method` está cubierto).

Si alguna mutación deja todo verde, el test correspondiente no sirve: arreglalo antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/exerciseBurn.ts shared/src/nutrition/exerciseBurn.test.ts
git commit -S -m "fix(nutricion): las kcal del reloj se cuentan netas de BMR

El reloj reporta el gasto bruto del intervalo, mientras que la fuerza ya
salía neta. Mezclarlos contaba el metabolismo basal de la actividad dos
veces, inflando el restante de kcal y (desde #179) la meta de carbos."
```

---

## Task 3: `buildDailyBurn` — gasto y desglose por día

**Files:**
- Create: `mobile/src/session/dailyBurn.ts`
- Test: `mobile/__tests__/dailyBurn.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `mobile/__tests__/dailyBurn.test.ts`:

```ts
import { buildDailyBurn } from "../src/session/dailyBurn";
import { dayExerciseBurn } from "@pulsia/shared";

const HOUR = 3600_000;
const ATHLETE = { weightKg: 80, age: 40, sex: "male" as const, bmr: null };

function session(dateStr: string, mins: number, avgHr: number | null = null) {
  return { startedAt: new Date(dateStr).getTime(), totalDurationMs: mins * 60000, avgHr };
}
function cardio(dateStr: string, mins: number, kcal: number | null) {
  return {
    type: "walk" as const,
    startedAt: new Date(dateStr).getTime(),
    durationMs: mins * 60000,
    avgHr: null,
    kcal,
  };
}

test("un día con SOLO cardio produce una entrada con gasto", () => {
  // Este es el bug reportado por el usuario: hoy el cardio no existe para Progreso.
  const map = buildDailyBurn([], [cardio("2026-03-15T10:00:00", 60, 300)], ATHLETE);
  const day = map.get("2026-03-15");
  expect(day).toBeDefined();
  expect(day!.cardioKcal).toBe(300);
  expect(day!.strengthKcal).toBe(0);
  expect(day!.kcal).toBe(300);
});

test("un día con fuerza Y cardio suma las dos fuentes por separado", () => {
  // Valores DISTINTOS a propósito: con fuerza y cardio iguales, sumar dos veces la misma fuente
  // daría el mismo total y el test no discriminaría.
  const map = buildDailyBurn(
    [session("2026-03-15T08:00:00", 60)],            // MET 5 * 80 kg * 1h = 400
    [cardio("2026-03-15T18:00:00", 60, 300)],        // device: 300
    ATHLETE,
  );
  const day = map.get("2026-03-15")!;
  expect(day.strengthKcal).toBe(400);
  expect(day.cardioKcal).toBe(300);
  expect(day.kcal).toBe(700);
});

test("el total por día coincide EXACTAMENTE con dayExerciseBurn", () => {
  // Invariante anti-divergencia: si alguien toca una de las dos funciones y no la otra,
  // Progreso y Nutrición mostrarían cifras distintas para el mismo día.
  const sessions = [session("2026-03-15T08:00:00", 45, 130)];
  const activities = [cardio("2026-03-15T18:00:00", 90, 420)];
  const map = buildDailyBurn(sessions, activities, ATHLETE);
  const expected = dayExerciseBurn(
    sessions.map((s) => ({ totalDurationMs: s.totalDurationMs, avgHr: s.avgHr })),
    activities.map((a) => ({ type: a.type, durationMs: a.durationMs, avgHr: a.avgHr, kcal: a.kcal })),
    ATHLETE,
  );
  expect(map.get("2026-03-15")!.kcal).toBe(expected);
});

test("agrupa por día LOCAL y separa días distintos", () => {
  const map = buildDailyBurn(
    [],
    [cardio("2026-03-15T10:00:00", 60, 300), cardio("2026-03-16T10:00:00", 30, 150)],
    ATHLETE,
  );
  expect(map.get("2026-03-15")!.kcal).toBe(300);
  expect(map.get("2026-03-16")!.kcal).toBe(150);
  expect(map.size).toBe(2);
});

test("acumula los minutos de las dos fuentes", () => {
  const map = buildDailyBurn(
    [session("2026-03-15T08:00:00", 45)],
    [cardio("2026-03-15T18:00:00", 30, 150)],
    ATHLETE,
  );
  expect(map.get("2026-03-15")!.minutes).toBe(75);
});

test("sin perfil (sin peso) el gasto es 0 pero los minutos se conservan", () => {
  // La pantalla usa esto para distinguir 'no entrenó' de 'no puedo calcular el gasto'.
  const map = buildDailyBurn([session("2026-03-15T08:00:00", 45)], [], { bmr: null });
  const day = map.get("2026-03-15")!;
  expect(day.kcal).toBe(0);
  expect(day.minutes).toBe(45);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd mobile && npm test -- --runInBand dailyBurn`
Expected: FAIL — "Cannot find module '../src/session/dailyBurn'".

- [ ] **Step 3: Implementar**

Crear `mobile/src/session/dailyBurn.ts`:

```ts
// Gasto de ejercicio por día calendario (fecha LOCAL), sumando entrenamientos de fuerza y
// actividades de cardio. Alimenta el heatmap y las barras del tab Progreso.
//
// Usa los MISMOS primitivos que `dayExerciseBurn` (la fuente única del gasto que consume
// Nutrición) en vez de reimplementar la suma: dos funciones que suman gasto es cómo la pantalla
// y los informes terminan discrepando. El desglose fuerza/cardio se arma acá porque
// `dayExerciseBurn` solo devuelve el total.

import { estimateSessionBurn, estimateCardioBurn, type AthleteBurnArgs, type CardioType } from "@pulsia/shared";
import { dateKey } from "./dateKey";

export interface DayBurn {
  kcal: number;          // total del día = strengthKcal + cardioKcal
  strengthKcal: number;
  cardioKcal: number;
  minutes: number;       // tiempo total en movimiento, para el desglose al tocar una celda
}

export interface BurnSession {
  startedAt: number;
  totalDurationMs: number | null;
  avgHr: number | null;
}

export interface BurnActivity {
  type: CardioType;
  startedAt: number;
  durationMs: number;
  avgHr: number | null;
  kcal: number | null;
}

function emptyDay(): DayBurn {
  return { kcal: 0, strengthKcal: 0, cardioKcal: 0, minutes: 0 };
}

export function buildDailyBurn(
  sessions: BurnSession[],
  activities: BurnActivity[],
  athlete: AthleteBurnArgs,
): Map<string, DayBurn> {
  const byDate = new Map<string, DayBurn>();
  const dayFor = (ms: number): DayBurn => {
    const key = dateKey(ms);
    const existing = byDate.get(key);
    if (existing) return existing;
    const fresh = emptyDay();
    byDate.set(key, fresh);
    return fresh;
  };

  for (const s of sessions) {
    const day = dayFor(s.startedAt);
    const { kcal } = estimateSessionBurn({
      durationMs: s.totalDurationMs, avgHr: s.avgHr, ...athlete,
    });
    day.strengthKcal += kcal;
    day.kcal += kcal;
    day.minutes += (s.totalDurationMs ?? 0) / 60000;
  }

  for (const a of activities) {
    const day = dayFor(a.startedAt);
    const { kcal } = estimateCardioBurn(
      { type: a.type, durationMs: a.durationMs, avgHr: a.avgHr, kcal: a.kcal },
      athlete,
    );
    day.cardioKcal += kcal;
    day.kcal += kcal;
    day.minutes += a.durationMs / 60000;
  }

  for (const day of byDate.values()) day.minutes = Math.round(day.minutes);
  return byDate;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd mobile && npm test -- --runInBand dailyBurn`
Expected: PASS (6 tests).

- [ ] **Step 5: Verificación por mutación**

1. Borrar el bucle de `activities` → deben fallar "solo cardio", "fuerza Y cardio", el invariante
   y "acumula los minutos".
2. En el bucle de cardio, sumar a `day.strengthKcal` en vez de `day.cardioKcal` → debe fallar
   "fuerza Y cardio" (el total no cambia; **si no falla, el test está mirando solo el total** y hay
   que arreglarlo).
3. Cambiar `dateKey(ms)` por una constante `"x"` → debe fallar "agrupa por día LOCAL".

- [ ] **Step 6: Commit**

```bash
git add mobile/src/session/dailyBurn.ts mobile/__tests__/dailyBurn.test.ts
git commit -S -m "feat(progreso): gasto de ejercicio por día con fuerza y cardio"
```

---

## Task 4: `burnThresholds` — niveles por cuartil del historial

**Files:**
- Create: `mobile/src/session/burnThresholds.ts`
- Test: `mobile/__tests__/burnThresholds.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `mobile/__tests__/burnThresholds.test.ts`:

```ts
import { burnThresholds, FIXED_THRESHOLDS, MIN_DAYS_FOR_PERCENTILES } from "../src/session/burnThresholds";

test("con pocos días usa los umbrales fijos", () => {
  const few = [100, 200, 300];
  expect(burnThresholds(few)).toEqual(FIXED_THRESHOLDS);
});

test("justo por debajo del mínimo todavía usa los fijos", () => {
  const days = Array.from({ length: MIN_DAYS_FOR_PERCENTILES - 1 }, (_, i) => (i + 1) * 10);
  expect(burnThresholds(days)).toEqual(FIXED_THRESHOLDS);
});

test("alcanzado el mínimo usa cuartiles del historial", () => {
  // 20 días de 100..2000 → cuartiles en 500 / 1000 / 1500.
  const days = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
  const t = burnThresholds(days);
  expect(t).not.toEqual(FIXED_THRESHOLDS);
  expect(t).toEqual([500, 1000, 1500]);
});

test("ignora los días sin gasto al calcular los cuartiles", () => {
  // Los ceros son días sin entrenar: incluirlos correría los cuartiles hacia abajo y pintaría
  // de oscuro cualquier día con actividad.
  const days = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
  const withZeros = [...days, ...Array.from({ length: 100 }, () => 0)];
  expect(burnThresholds(withZeros)).toEqual(burnThresholds(days));
});

test("los umbrales salen ordenados de menor a mayor", () => {
  const days = Array.from({ length: 40 }, (_, i) => (i * 37) % 900);
  const [a, b, c] = burnThresholds(days);
  expect(a).toBeLessThanOrEqual(b);
  expect(b).toBeLessThanOrEqual(c);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd mobile && npm test -- --runInBand burnThresholds`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Crear `mobile/src/session/burnThresholds.ts`:

```ts
// Cortes de nivel del heatmap, en kcal. La escala es RELATIVA al propio historial del usuario
// (cuartiles), decisión del owner: un gasto "alto" depende de la persona.
//
// Se calculan sobre TODO el historial, nunca sobre el año mostrado. Con cuartiles por año, el
// mismo día cambiaría de color al cambiar de año en el selector y dos años dejarían de ser
// comparables — que es justamente para lo que existe un heatmap anual.

// Fallback con pocos datos: ~30 min de fuerza ≈ 200 kcal netas, ~1 h ≈ 400, día fuerte > 600.
export const FIXED_THRESHOLDS: [number, number, number] = [200, 400, 600];

// Por debajo de esto los cuartiles son inestables: un mes flojo pintaría días normales de oscuro.
export const MIN_DAYS_FOR_PERCENTILES = 20;

// Percentil por rango más cercano (nearest-rank): el índice es ceil(n * fraction) - 1.
// Con `Math.floor(n * fraction)` el corte se corre un puesto hacia arriba y deja de partir el
// historial en cuartos parejos (con 20 días daría 600/1100/1600 en vez de 500/1000/1500).
function quartile(sorted: number[], fraction: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[idx];
}

// `allDayKcal` = el gasto de CADA día con actividad, de todo el historial (los ceros se ignoran).
export function burnThresholds(allDayKcal: number[]): [number, number, number] {
  const active = allDayKcal.filter((k) => k > 0).sort((a, b) => a - b);
  if (active.length < MIN_DAYS_FOR_PERCENTILES) return FIXED_THRESHOLDS;
  return [quartile(active, 0.25), quartile(active, 0.5), quartile(active, 0.75)];
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd mobile && npm test -- --runInBand burnThresholds`
Expected: PASS (5 tests).

- [ ] **Step 5: Verificación por mutación**

1. Cambiar `active.length < MIN_DAYS_FOR_PERCENTILES` por `active.length < 0` → deben fallar los
   dos tests de fallback.
2. Borrar `.filter((k) => k > 0)` → debe fallar "ignora los días sin gasto".
3. Borrar `.sort(...)` → debe fallar "salen ordenados" (y probablemente el de cuartiles).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/session/burnThresholds.ts mobile/__tests__/burnThresholds.test.ts
git commit -S -m "feat(progreso): umbrales de nivel por cuartil del historial"
```

---

## Task 5: `heatmap.ts` consume el gasto

**Files:**
- Modify: `mobile/src/session/heatmap.ts`
- Test: `mobile/__tests__/heatmap.test.ts` (existente — hay que reescribir los casos de nivel)

⚠️ Los tests existentes de `heatmap.test.ts` asumen la escala de minutos (`level 2 // 31-60`).
**Van a romper y es correcto que rompan.** Adaptarlos, no borrarlos.

- [ ] **Step 1: Escribir los tests nuevos**

Reemplazar el contenido de `mobile/__tests__/heatmap.test.ts` por:

```ts
import { availableYears, buildYearHeatmap } from "../src/session/heatmap";
import type { DayBurn } from "../src/session/dailyBurn";

const T: [number, number, number] = [200, 400, 600];

function burnMap(entries: Record<string, number>): Map<string, DayBurn> {
  const m = new Map<string, DayBurn>();
  for (const [date, kcal] of Object.entries(entries)) {
    m.set(date, { kcal, strengthKcal: kcal, cardioKcal: 0, minutes: 0 });
  }
  return m;
}

test("un día cae en la celda correcta con el nivel correcto según su gasto", () => {
  const { weeks } = buildYearHeatmap(burnMap({ "2026-03-15": 350 }), T, 2026);
  const cell = weeks.flat().find((c) => c.date === "2026-03-15");
  expect(cell).toBeDefined();
  expect(cell!.kcal).toBe(350);
  expect(cell!.level).toBe(2); // > 200 y <= 400
  expect(cell!.inYear).toBe(true);
});

test("los cuatro niveles se asignan según los umbrales", () => {
  const { weeks } = buildYearHeatmap(
    burnMap({
      "2026-03-10": 150,  // <= 200 → 1
      "2026-03-11": 350,  // <= 400 → 2
      "2026-03-12": 550,  // <= 600 → 3
      "2026-03-13": 900,  // > 600  → 4
    }),
    T,
    2026,
  );
  const lvl = (d: string) => weeks.flat().find((c) => c.date === d)!.level;
  expect(lvl("2026-03-10")).toBe(1);
  expect(lvl("2026-03-11")).toBe(2);
  expect(lvl("2026-03-12")).toBe(3);
  expect(lvl("2026-03-13")).toBe(4);
});

test("un día sin gasto queda en nivel 0", () => {
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026);
  const cell = weeks.flat().find((c) => c.date === "2026-03-15")!;
  expect(cell.kcal).toBe(0);
  expect(cell.level).toBe(0);
});

test("los umbrales recibidos mandan: el MISMO día da el mismo nivel en años distintos", () => {
  // Blindaje de la decisión de diseño: los cuartiles se calculan sobre TODO el historial y se
  // pasan como input. Si alguien los recalculara adentro por año, este test se cae.
  const a = buildYearHeatmap(burnMap({ "2025-06-10": 350 }), T, 2025);
  const b = buildYearHeatmap(burnMap({ "2026-06-10": 350 }), T, 2026);
  const lvlA = a.weeks.flat().find((c) => c.date === "2025-06-10")!.level;
  const lvlB = b.weeks.flat().find((c) => c.date === "2026-06-10")!.level;
  expect(lvlA).toBe(lvlB);
});

test("availableYears incluye un año que SOLO tiene cardio", () => {
  // Sin esto, un año de solo caminatas existe en los datos pero es inalcanzable desde el selector.
  const years = availableYears(
    [{ startedAt: new Date("2026-03-15T10:00:00").getTime() }],
    [{ startedAt: new Date("2024-08-02T10:00:00").getTime() }],
  );
  expect(years).toEqual([2026, 2024]);
});

test("availableYears no duplica un año presente en las dos fuentes", () => {
  const years = availableYears(
    [{ startedAt: new Date("2026-03-15T10:00:00").getTime() }],
    [{ startedAt: new Date("2026-08-02T10:00:00").getTime() }],
  );
  expect(years).toEqual([2026]);
});

test("no se generan celdas futuras en el año en curso", () => {
  const now = new Date("2026-03-15T12:00:00").getTime();
  const { weeks } = buildYearHeatmap(burnMap({}), T, 2026, now);
  const future = weeks.flat().filter((c) => c.inYear && c.date > "2026-03-21");
  expect(future).toHaveLength(0);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd mobile && npm test -- --runInBand heatmap`
Expected: FAIL — la firma de `buildYearHeatmap` y `availableYears` no coincide.

- [ ] **Step 3: Implementar**

Reemplazar en `mobile/src/session/heatmap.ts` el encabezado, `HeatmapCell`, `levelFor`,
`availableYears` y la firma de `buildYearHeatmap`. **El resto del cuerpo (construcción de la
grilla, recorte de días futuros) queda igual** — solo cambia de dónde salen `kcal`/`minutes`:

```ts
// Heatmap anual estilo GitHub ("Días entrenados y gasto"). El color mide GASTO CALÓRICO del día
// (fuerza + cardio), no minutos: una caminata de 2 h y una sesión de pesas de 50 min ocupan
// tiempos muy distintos para esfuerzos parecidos. El gasto por día lo arma `dailyBurn.ts`.

import { dateKey } from "./dateKey";
import type { DayBurn } from "./dailyBurn";

export interface HeatmapCell {
  date: string; // YYYY-MM-DD (fecha local)
  kcal: number;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  inYear: boolean;
  future: boolean; // día posterior a hoy (no se muestra en el año en curso)
}

export interface YearHeatmap {
  weeks: HeatmapCell[][]; // columnas = semanas (domingo→sábado), filas = 7 días
}

// Los umbrales llegan como INPUT (calculados sobre todo el historial en `burnThresholds.ts`), no
// se derivan acá: calcularlos por año haría que el mismo día cambie de color según el año que
// estés mirando.
function levelFor(kcal: number, [t1, t2, t3]: [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (kcal <= 0) return 0;
  if (kcal <= t1) return 1;
  if (kcal <= t2) return 2;
  if (kcal <= t3) return 3;
  return 4;
}

// Años (desc, sin duplicados) con al menos una sesión de fuerza O una actividad de cardio.
export function availableYears(
  sessions: { startedAt: number }[],
  activities: { startedAt: number }[] = [],
): number[] {
  const years = new Set<number>();
  for (const s of sessions) years.add(new Date(s.startedAt).getFullYear());
  for (const a of activities) years.add(new Date(a.startedAt).getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}

export function buildYearHeatmap(
  burnByDate: Map<string, DayBurn>,
  thresholds: [number, number, number],
  year: number,
  nowMs?: number
): YearHeatmap {
```

Dentro del bucle de construcción, reemplazar el cálculo de la celda por:

```ts
      const inYear = cursor.getFullYear() === year;
      const key = dateKey(cursor.getTime());
      const day = inYear ? burnByDate.get(key) : undefined;
      const kcal = day?.kcal ?? 0;
      const future = todayKey != null && key > todayKey;
      week.push({
        date: key,
        kcal,
        minutes: day?.minutes ?? 0,
        level: levelFor(kcal, thresholds),
        inYear,
        future,
      });
```

**Y borrar** el bloque `const minutesByDate = new Map...` con su bucle sobre `sessions` (líneas
43-49 del archivo original): ese agrupamiento ahora lo hace `buildDailyBurn`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd mobile && npm test -- --runInBand heatmap`
Expected: PASS (7 tests).

- [ ] **Step 5: Verificación por mutación**

1. En `levelFor`, cambiar `kcal <= t1` por `kcal <= t2` → debe fallar "los cuatro niveles".
2. Borrar el segundo bucle de `availableYears` (el de `activities`) → debe fallar "año que SOLO
   tiene cardio".
3. Cambiar `kcal <= 0` por `kcal < 0` → debe fallar "día sin gasto queda en nivel 0".

- [ ] **Step 6: Commit**

```bash
git add mobile/src/session/heatmap.ts mobile/__tests__/heatmap.test.ts
git commit -S -m "feat(progreso): el heatmap colorea por gasto calórico"
```

---

## Task 6: `weeklyBars.ts` pasa a kcal

**Files:**
- Modify: `mobile/src/session/weeklyBars.ts`
- Test: `mobile/__tests__/weeklyBars.test.ts` (existente — adaptar)

- [ ] **Step 1: Escribir los tests**

Reemplazar el contenido de `mobile/__tests__/weeklyBars.test.ts` por:

```ts
import { buildDailyKcal } from "../src/session/weeklyBars";
import type { DayBurn } from "../src/session/dailyBurn";

function burnMap(entries: Record<string, number>): Map<string, DayBurn> {
  const m = new Map<string, DayBurn>();
  for (const [date, kcal] of Object.entries(entries)) {
    m.set(date, { kcal, strengthKcal: kcal, cardioKcal: 0, minutes: 0 });
  }
  return m;
}

const NOW = new Date("2026-03-15T12:00:00").getTime();

test("devuelve exactamente `days` entradas terminando en hoy", () => {
  const out = buildDailyKcal(burnMap({}), NOW, 28);
  expect(out).toHaveLength(28);
  expect(out[27].date).toBe("2026-03-15");
  expect(out[0].date).toBe("2026-02-16");
});

test("un día con gasto aparece con sus kcal", () => {
  const out = buildDailyKcal(burnMap({ "2026-03-14": 450 }), NOW, 28);
  expect(out.find((d) => d.date === "2026-03-14")!.kcal).toBe(450);
});

test("los días sin actividad van en 0, no se omiten", () => {
  // Las barras necesitan el eje completo: omitir días comprimiría el gráfico y mentiría
  // sobre la constancia.
  const out = buildDailyKcal(burnMap({ "2026-03-14": 450 }), NOW, 28);
  expect(out.filter((d) => d.kcal === 0)).toHaveLength(27);
});

test("un día fuera de la ventana no entra", () => {
  const out = buildDailyKcal(burnMap({ "2026-01-01": 900 }), NOW, 28);
  expect(out.some((d) => d.kcal === 900)).toBe(false);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd mobile && npm test -- --runInBand weeklyBars`
Expected: FAIL — `buildDailyKcal` no existe.

- [ ] **Step 3: Implementar**

Reemplazar el contenido de `mobile/src/session/weeklyBars.ts`:

```ts
// Barras de gasto calórico por día, últimas N semanas (default 4 = 28 días). El agrupamiento por
// día lo hace `dailyBurn.ts`; acá solo se recorta la ventana y se rellenan los días sin actividad.

import { dateKey } from "./dateKey";
import type { DayBurn } from "./dailyBurn";

export interface DailyKcal {
  date: string; // YYYY-MM-DD (fecha local)
  kcal: number;
}

// Recibe `nowMs` como input (no llama Date.now()) para que el resultado sea determinístico en
// tests. Devuelve exactamente `days` entradas, de la más vieja a la más nueva, terminando en el
// día de `nowMs`. Los días sin actividad van en 0 y NO se omiten: el eje tiene que estar completo.
export function buildDailyKcal(
  burnByDate: Map<string, DayBurn>,
  nowMs: number,
  days = 28
): DailyKcal[] {
  const today = new Date(nowMs);
  const result: DailyKcal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(d.getTime());
    result.push({ date: key, kcal: burnByDate.get(key)?.kcal ?? 0 });
  }
  return result;
}
```

- [ ] **Step 4: Adaptar `BarChart` al tipo nuevo**

Borrar `DailyMinutes` rompe el import de `BarChart`. Son cinco referencias, todas mecánicas, en
`mobile/src/components/BarChart.tsx`:

| Línea | Antes | Después |
|---|---|---|
| 4 | `import type { DailyMinutes } from "../session/weeklyBars";` | `import type { DailyKcal } from "../session/weeklyBars";` |
| 20 | `data: DailyMinutes[]` | `data: DailyKcal[]` |
| 27 | `data.map((d) => d.minutes)` | `data.map((d) => d.kcal)` |
| 37 | `` `Máx: ${Math.round(realMax)} min` `` | `` `Máx: ${Math.round(realMax)} kcal` `` |
| 49 | `(d.minutes / maxMinutes)` | `(d.kcal / maxKcal)` |
| 61 | `d.minutes > 0` | `d.kcal > 0` |

Renombrar también la variable local `maxMinutes` → `maxKcal` (líneas 28 y 49). **Renombrar el
campo, no agregar uno nuevo**: dejar `minutes` y `kcal` conviviendo permite que un call-site pase
uno y el gráfico lea el otro, y salga un gráfico vacío sin que nada falle.

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd mobile && npm test -- --runInBand weeklyBars barchart`
Expected: PASS. `barchart-helpers.test.ts` prueba `barCenterX`, que no toca el tipo — debe seguir
verde sin modificarlo. Si falla, tocaste de más.

- [ ] **Step 6: Verificación por mutación**

1. Cambiar `?? 0` por `?? 999` → deben fallar "días sin actividad van en 0" y "fuera de la ventana".
2. Cambiar `days - 1` por `days` → debe fallar el test de longitud/bordes.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/session/weeklyBars.ts mobile/__tests__/weeklyBars.test.ts mobile/src/components/BarChart.tsx
git commit -S -m "feat(progreso): las barras de 4 semanas muestran gasto"
```

---

## Task 7: `YearHeatmap` — tocar una celda muestra el desglose

**Files:**
- Modify: `mobile/src/components/YearHeatmap.tsx`
- Test: `mobile/__tests__/yearHeatmap.test.tsx` (crear)

**Decisión de diseño a respetar:** la grilla **no** distingue fuerza/cardio por color ni por
marcas. El color significa una sola cosa (gasto). El desglose aparece al tocar, debajo de la
grilla, **sin modal**.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `mobile/__tests__/yearHeatmap.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import { YearHeatmap } from "../src/components/YearHeatmap";
import type { DayBurn } from "../src/session/dailyBurn";

function burnMap(entries: Record<string, Partial<DayBurn>>): Map<string, DayBurn> {
  const m = new Map<string, DayBurn>();
  for (const [date, v] of Object.entries(entries)) {
    m.set(date, { kcal: 0, strengthKcal: 0, cardioKcal: 0, minutes: 0, ...v });
  }
  return m;
}

const T: [number, number, number] = [200, 400, 600];
const SESSIONS = [{ startedAt: new Date("2026-03-15T10:00:00").getTime() }];

test("tocar una celda con actividad muestra el desglose del día", async () => {
  const map = burnMap({
    "2026-03-15": { kcal: 700, strengthKcal: 400, cardioKcal: 300, minutes: 105 },
  });
  const r = await render(
    <YearHeatmap burnByDate={map} thresholds={T} sessions={SESSIONS} activities={[]}
      year={2026} onSelectYear={() => {}} />
  );
  await fireEvent.press(r.getByTestId("heatmap-cell-2026-03-15"));
  expect(r.getByText(/700 kcal/)).toBeTruthy();
  expect(r.getByText(/400/)).toBeTruthy();   // fuerza
  expect(r.getByText(/300/)).toBeTruthy();   // cardio
});

test("el desglose distingue fuerza de cardio con valores distintos", async () => {
  // Valores asimétricos a propósito: con 350/350 el test pasaría aunque el componente mostrara
  // dos veces la misma fuente.
  const map = burnMap({
    "2026-03-15": { kcal: 700, strengthKcal: 400, cardioKcal: 300, minutes: 105 },
  });
  const r = await render(
    <YearHeatmap burnByDate={map} thresholds={T} sessions={SESSIONS} activities={[]}
      year={2026} onSelectYear={() => {}} />
  );
  await fireEvent.press(r.getByTestId("heatmap-cell-2026-03-15"));
  expect(r.getByTestId("heatmap-detail-strength")).toHaveTextContent("400");
  expect(r.getByTestId("heatmap-detail-cardio")).toHaveTextContent("300");
});

test("tocar la misma celda de nuevo deselecciona", async () => {
  const map = burnMap({ "2026-03-15": { kcal: 700, strengthKcal: 700, minutes: 60 } });
  const r = await render(
    <YearHeatmap burnByDate={map} thresholds={T} sessions={SESSIONS} activities={[]}
      year={2026} onSelectYear={() => {}} />
  );
  const cell = r.getByTestId("heatmap-cell-2026-03-15");
  await fireEvent.press(cell);
  expect(r.queryByTestId("heatmap-detail")).toBeTruthy();
  await fireEvent.press(cell);
  expect(r.queryByTestId("heatmap-detail")).toBeNull();
});

test("sin ninguna selección no se muestra desglose", async () => {
  const map = burnMap({ "2026-03-15": { kcal: 700, strengthKcal: 700, minutes: 60 } });
  const r = await render(
    <YearHeatmap burnByDate={map} thresholds={T} sessions={SESSIONS} activities={[]}
      year={2026} onSelectYear={() => {}} />
  );
  expect(r.queryByTestId("heatmap-detail")).toBeNull();
});
```

⚠️ **`render()` y `fireEvent` devuelven Promise en este repo** — sin `await`, las queries quedan
`undefined` y los tests fallan de forma engañosa. Es un error que ya se cometió dos veces acá.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd mobile && npm test -- --runInBand yearHeatmap`
Expected: FAIL — props nuevas no existen, no hay `testID` de celda.

- [ ] **Step 3: Implementar**

En `mobile/src/components/YearHeatmap.tsx`:

**(a)** Cambiar imports y `Props`:

```tsx
import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { availableYears, buildYearHeatmap, type HeatmapCell } from "../session/heatmap";
import type { DayBurn } from "../session/dailyBurn";
import { colors, radius, spacing } from "../theme/tokens";

interface Props {
  burnByDate: Map<string, DayBurn>;
  thresholds: [number, number, number];
  sessions: { startedAt: number }[];
  activities: { startedAt: number }[];
  year: number;
  onSelectYear: (year: number) => void;
}
```

**(b)** Dentro del componente, reemplazar la primera línea y agregar el estado de selección:

```tsx
export function YearHeatmap({ burnByDate, thresholds, sessions, activities, year, onSelectYear }: Props) {
  const years = availableYears(sessions, activities);
  const [selected, setSelected] = useState<string | null>(null);
```

**(c)** Cambiar la llamada a `buildYearHeatmap`:

```tsx
  const { weeks } = buildYearHeatmap(burnByDate, thresholds, year, nowMs);
```

**(d)** Envolver cada `<Rect>` en un `<Pressable>` fuera del SVG no funciona: `Rect` acepta
`onPress` directamente en `react-native-svg`. Reemplazar el `<Rect>` por:

```tsx
              <Rect
                key={cell.date + row}
                testID={`heatmap-cell-${cell.date}`}
                x={col * STEP}
                y={row * STEP}
                width={CELL}
                height={CELL}
                rx={3}
                fill={cellColor(cell)}
                onPress={
                  cell.inYear && !cell.future
                    ? () => setSelected((s) => (s === cell.date ? null : cell.date))
                    : undefined
                }
              />
```

**(e)** Agregar el desglose **entre** el `ScrollView` de la grilla y la leyenda:

```tsx
      {selected != null && burnByDate.has(selected) ? (
        <View testID="heatmap-detail" style={{ gap: 2, paddingVertical: spacing.xs }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>
            {selected} · {burnByDate.get(selected)!.kcal} kcal
          </Text>
          <Text testID="heatmap-detail-strength" style={{ color: colors.textMuted, fontSize: 12 }}>
            Fuerza {burnByDate.get(selected)!.strengthKcal} kcal
          </Text>
          <Text testID="heatmap-detail-cardio" style={{ color: colors.textMuted, fontSize: 12 }}>
            Cardio {burnByDate.get(selected)!.cardioKcal} kcal
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {burnByDate.get(selected)!.minutes} min en movimiento
          </Text>
        </View>
      ) : null}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd mobile && npm test -- --runInBand yearHeatmap`
Expected: PASS (4 tests).

- [ ] **Step 5: Verificación por mutación**

1. Hacer que `onPress` siempre setee (sin el toggle `s === cell.date ? null`) → debe fallar
   "tocar la misma celda de nuevo deselecciona".
2. En el desglose, usar `strengthKcal` en las dos líneas → debe fallar "distingue fuerza de cardio".
3. Inicializar `selected` en `"2026-03-15"` → debe fallar "sin ninguna selección".

⚠️ Si la mutación (2) **no** rompe nada, es que el test está mirando solo texto suelto y no los
`testID`. Arreglalo antes de seguir — este repo ya tuvo tests que pasaban por el eco del literal.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/YearHeatmap.tsx mobile/__tests__/yearHeatmap.test.tsx
git commit -S -m "feat(progreso): tocar una celda del heatmap muestra el desglose del día"
```

---

## Task 8: Wiring en `progreso.tsx` + estado sin perfil + títulos

**Files:**
- Modify: `mobile/app/(tabs)/progreso.tsx`
- Test: `mobile/__tests__/progreso.test.tsx` (existente — agregar casos)

- [ ] **Step 1: Escribir los tests**

Agregar a `mobile/__tests__/progreso.test.tsx` (respetar los mocks que el archivo ya tiene; si
mockea `../src/api/sessions`, agregar mocks equivalentes para `../src/api/cardio`,
`../src/storage/profile` y `../src/api/nutrition`):

```tsx
test("sin peso en el perfil, las secciones de gasto explican qué falta", async () => {
  // Regresión: antes el heatmap funcionaba solo con duración. Al pasar a kcal, un usuario sin
  // perfil completo vería la grilla ENTERA vacía, que se lee como un bug de la app.
  mockGetProfile.mockResolvedValue({ age: 40, sex: "male" });   // sin weightKg
  mockGetLatestMetrics.mockResolvedValue({});                    // sin peso medido
  const r = await render(<ProgresoScreen />);
  expect(await r.findByText(/Completá tu peso y edad en el perfil/)).toBeTruthy();
  expect(r.queryByTestId("heatmap-cell-2026-03-15")).toBeNull();
});

test("con perfil completo se muestran las secciones de gasto", async () => {
  mockGetProfile.mockResolvedValue({ age: 40, sex: "male", weightKg: 80 });
  const r = await render(<ProgresoScreen />);
  expect(await r.findByText("Días entrenados y gasto")).toBeTruthy();
  expect(r.getByText("Gasto por día (4 sem)")).toBeTruthy();
  expect(r.queryByText(/Completá tu peso y edad en el perfil/)).toBeNull();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd mobile && npm test -- --runInBand progreso`
Expected: FAIL — los títulos viejos siguen ahí y no hay mensaje de perfil incompleto.

- [ ] **Step 3: Implementar**

**(a)** Imports nuevos:

```tsx
import { listCardio } from "../../src/api/cardio";
import { getProfile } from "../../src/storage/profile";
import { getNutritionGoal } from "../../src/api/nutrition";
import { computeNutritionGoal } from "@pulsia/shared";
import type { CardioActivity, TrainingProfile, NutritionGoalInput } from "@pulsia/shared";
import { buildDailyBurn } from "../../src/session/dailyBurn";
import { burnThresholds } from "../../src/session/burnThresholds";
import { buildDailyKcal } from "../../src/session/weeklyBars";
```

Y **borrar** el import de `buildDailyMinutes`.

**(b)** Estado nuevo, junto a `const [sessions, setSessions] = ...`:

```tsx
  const [activities, setActivities] = useState<CardioActivity[]>([]);
  const [burnProfile, setBurnProfile] = useState<TrainingProfile | null>(null);
  const [goalInput, setGoalInput] = useState<NutritionGoalInput | null>(null);
  const [burnWeightKg, setBurnWeightKg] = useState<number | undefined>(undefined);
```

**(c)** En la carga inicial, donde hoy se llama `getSessions`, agregar las tres fuentes. Seguir el
patrón de [`useNutritionDay.ts:43`](../../../mobile/src/nutrition/useNutritionDay.ts): peso del
perfil, pisado por la última medición del backend si existe.

```tsx
      const [ss, cardio, prof, gi] = await Promise.all([
        getSessions(url), listCardio(url), getProfile(), getNutritionGoal(url),
      ]);
      setSessions(ss); setActivities(cardio); setBurnProfile(prof); setGoalInput(gi);
      let w = prof?.weightKg;
      try { const l = await getLatestMetrics(url); if (l.weight_kg?.value != null) w = l.weight_kg.value; } catch { /* offline */ }
      setBurnWeightKg(w);
```

**(d)** Derivar el gasto, antes del `return`:

```tsx
  // Sin peso no hay gasto calculable: `estimateSessionBurn` devuelve 0 y la grilla saldría vacía.
  const canComputeBurn = burnWeightKg != null && burnProfile?.age != null;
  const burnGoal = goalInput
    ? computeNutritionGoal({
        sex: burnProfile?.sex, age: burnProfile?.age, heightCm: burnProfile?.heightCm,
        weightKg: burnWeightKg, activityLevel: burnProfile?.activityLevel,
        objective: goalInput.objective, rateKgPerWeek: goalInput.rateKgPerWeek,
        manualKcal: goalInput.manualKcal,
      })
    : null;
  const burnByDate = buildDailyBurn(sessions, activities, {
    weightKg: burnWeightKg, age: burnProfile?.age, sex: burnProfile?.sex,
    bmr: burnGoal?.status === "ok" ? burnGoal.bmr : null,
  });
  const thresholds = burnThresholds(Array.from(burnByDate.values(), (d) => d.kcal));
```

**(e)** Reemplazar las dos secciones:

```tsx
      <Section title="Días entrenados y gasto">
        {!canComputeBurn ? (
          <Pressable onPress={() => router.push("/perfil")}>
            <Text style={{ color: colors.textMuted }}>
              Completá tu peso y edad en el perfil para ver el gasto.
            </Text>
          </Pressable>
        ) : sessions.length === 0 && activities.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>Todavía no hay entrenamientos registrados.</Text>
        ) : (
          <YearHeatmap
            burnByDate={burnByDate}
            thresholds={thresholds}
            sessions={sessions}
            activities={activities}
            year={heatmapYear ?? new Date().getFullYear()}
            onSelectYear={setHeatmapYear}
          />
        )}
      </Section>

      <Section title="Gasto por día (4 sem)">
        {!canComputeBurn ? (
          <Text style={{ color: colors.textMuted }}>
            Completá tu peso y edad en el perfil para ver el gasto.
          </Text>
        ) : sessions.length === 0 && activities.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>Todavía no hay entrenamientos registrados.</Text>
        ) : (
          <BarChart data={buildDailyKcal(burnByDate, Date.now())} />
        )}
      </Section>
```

`BarChart` ya quedó adaptado a `DailyKcal` en la Task 6, así que acá no hay que tocarlo.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd mobile && npm test -- --runInBand progreso`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

1. Cambiar `canComputeBurn` a `true` fijo → debe fallar "sin peso en el perfil".
2. Pasar `[]` como `activities` a `buildDailyBurn` → **ningún test de esta task debería fallar**,
   pero sí los de `dailyBurn`. Confirmá que la cobertura del wiring vive en Task 3 y que el
   `listCardio` está efectivamente conectado (verificalo a ojo en el diff, no solo por tests).
3. Volver los títulos a los viejos → debe fallar "con perfil completo".

- [ ] **Step 6: Suite completa + tipos**

```bash
cd mobile && npm test -- --runInBand && npx tsc --noEmit
cd .. && bun test shared backend
```

Expected: todo verde. Si `tsc` marca usos viejos de `buildDailyMinutes` o de la firma vieja de
`availableYears`, arreglalos.

- [ ] **Step 7: Commit**

```bash
git add mobile/app/\(tabs\)/progreso.tsx mobile/__tests__/progreso.test.tsx
git commit -S -m "feat(progreso): el cardio entra al heatmap y a las barras de gasto"
```

---

## Task 9: PR

- [ ] **Step 1: Push y abrir el PR**

```bash
git push -u origin feat/gasto-por-dia-progreso
gh pr create --title "feat(progreso): el cardio entra a Días entrenados, con gasto calórico" --body "$(cat <<'EOF'
## Qué

Las secciones "Días entrenados" y "Tiempo por día" del tab Progreso se alimentaban **solo** de
`workout_session` (fuerza), así que las actividades de cardio —manuales o importadas del `.FIT`—
no aparecían. El Historial sí unía las dos fuentes, con lo que la misma caminata existía en una
pantalla y no en la otra.

Reportado por el owner.

## Cómo

- El color pasa de medir **minutos** a medir **gasto calórico**: con cardio incluido, 2 h de
  caminata suave ocupaban el nivel máximo de una escala calibrada para fuerza.
- El gasto se calcula con los mismos primitivos que `dayExerciseBurn`, con un test de invariante
  que falla si Progreso y Nutrición divergen.
- Niveles por **cuartil de todo el historial** (fallback fijo bajo 20 días registrados).
- Tocar una celda muestra el desglose fuerza/cardio del día.

## Cambio de comportamiento a revisar

`estimateCardioBurn` ahora resta el BMR a las kcal que reporta el reloj. El reloj informa el gasto
**bruto** del intervalo mientras que la fuerza ya salía **neta**; mezclarlos contaba el metabolismo
basal de la actividad dos veces. **Esto baja el restante de kcal y la meta de carbos** en los días
importados del `.FIT`. Es intencional y está aprobado por el owner.

## Riesgo conocido

Un usuario **sin peso/edad en el perfil** no puede ver gasto. En vez de una grilla vacía, las
secciones muestran un mensaje con acceso al perfil. Cubierto con test.

Spec: `docs/superpowers/specs/2026-07-22-gasto-por-dia-progreso-design.md`
EOF
)"
```

- [ ] **Step 2: Disparar el review**

```bash
gh pr comment --body "@claude review"
```

⚠️ **El `@claude review` es estático y no corre Bash.** Ya aprobó un PR de este repo con tres bugs
de runtime adentro. Su LGTM **no** reemplaza haber ejecutado la suite y las mutaciones.

---

## Notas de cierre para quien ejecute

- **Este plan puede tener errores.** Los últimos tres planes de este repo los tuvieron —
  incluyendo **aserciones falsas escritas en el plan y copiadas verbatim** por implementadores
  cuidadosos. Si un test de acá pasa con la feature borrada, el plan está mal: arreglá el test y
  dejá constancia. No asumas que porque está escrito, prueba algo.
- **Pieza C fuera de alcance:** `buildProgressSummary`
  ([`backend/src/ai/progress.ts`](../../../backend/src/ai/progress.ts)) sigue sin ver el cardio, así
  que **la IA no sabe que el usuario corrió** al generar programas ni al refrescar la memoria del
  atleta. Tiene spec propio pendiente.
- **Después del merge:** el backend no cambia (todo es móvil + shared), pero `shared` sí entra al
  bundle → **publicar el OTA** verificando que `eas update` reporte runtime android `784872cb…`.
