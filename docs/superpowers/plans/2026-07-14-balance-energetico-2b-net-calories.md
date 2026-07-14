# Balance energético #2b — Net calories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Estimar las kcal quemadas en las sesiones de entrenamiento del día (Keytel con FC, fallback MET, gasto neto) y sumarlas al restante: `Restante = Meta − Comido + Ejercicio`.

**Architecture:** `shared` gana `estimateSessionBurn`/`sumDayExerciseBurn` (puras) y `computeNutritionGoal` devuelve `bmr`/`tdee` informativos también en el camino manual. El backend expone `avgHr` + fallback de duración en `listSessions` (sin migración). El móvil: `buildGoalView(goal, comido, exercise)` ajusta solo las kcal; el hook `useNutritionDay` trae las sesiones del día y computa el gasto.

**Tech Stack:** Bun monorepo (shared/backend `bun:test`, mobile jest). Reusa `dayBounds`, fixture `nestedRow` del test de sessions.

**Referencia:** spec `docs/superpowers/specs/2026-07-14-balance-energetico-2b-net-calories-design.md`.

## File structure

- `shared/src/nutrition/exerciseBurn.ts` (+test) — estimación pura del gasto.
- `shared/src/nutrition/goal.ts` (+test) — bmr/tdee informativos en camino manual.
- `shared/src/index.ts` — export del nuevo módulo.
- `backend/src/sessions/repository.ts` (+test) — `avgHr` + fallback duración en `listSessions`.
- `mobile/src/api/sessions.ts` — `avgHr` en `SessionListItem`.
- `mobile/src/nutrition/goalView.ts` (+test) — param `exercise`.
- `mobile/src/nutrition/useNutritionDay.ts` — sesiones del día + gasto.
- `mobile/app/(tabs)/nutricion.tsx` — indicador "🏋 +X kcal ejercicio".
- `mobile/app/nutricion/detalle.tsx` — línea Ejercicio + leyenda nueva.

---

### Task 1: Shared — `estimateSessionBurn` + `sumDayExerciseBurn`

**Files:**
- Create: `shared/src/nutrition/exerciseBurn.ts`
- Create: `shared/src/nutrition/exerciseBurn.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Test que falla**

Creá `shared/src/nutrition/exerciseBurn.test.ts`:
```ts
import { test, expect } from "bun:test";
import { estimateSessionBurn, sumDayExerciseBurn } from "./exerciseBurn";

const HOUR = 3600_000;

test("Keytel male, neto (resta el BMR de la duración)", () => {
  // kcal/min = (-55.0969 + 0.6309*140 + 0.1988*80 + 0.2017*40)/4.184 = 13.6714 → gross 60min = 820.28
  // neto con bmr 1718: 820.28 - (1718/1440)*60 = 820.28 - 71.58 = 748.70 → 749
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 140, weightKg: 80, age: 40, sex: "male", bmr: 1718 });
  expect(r.method).toBe("hr");
  expect(r.kcal).toBe(749);
});

test("Keytel female, bruto (sin bmr)", () => {
  // kcal/min = (-20.4022 + 0.4472*140 - 0.1263*65 + 0.074*30)/4.184 = 8.6559 → 60min = 519.35 → 519
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 140, weightKg: 65, age: 30, sex: "female", bmr: null });
  expect(r.kcal).toBe(519);
});

test("Keytel other = promedio de ambas fórmulas", () => {
  // male 13.6714, female(w80,age40) 8.3800 → avg 11.0257 → 60min = 661.54 → 662 (bruto)
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 140, weightKg: 80, age: 40, sex: "other" });
  expect(r.kcal).toBe(662);
});

test("MET fallback sin FC (5 MET) y neto", () => {
  // gross = 5*80*1h = 400 ; neto con bmr 1718: 400 - 71.58 = 328.42 → 328
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: null, weightKg: 80, age: 40, sex: "male", bmr: 1718 });
  expect(r.method).toBe("met");
  expect(r.kcal).toBe(328);
});

test("MET fallback también si hay FC pero falta la edad (Keytel necesita edad)", () => {
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 140, weightKg: 80, bmr: null });
  expect(r.method).toBe("met");
  expect(r.kcal).toBe(400);
});

test("sin duración o sin peso → 0/none", () => {
  expect(estimateSessionBurn({ durationMs: null, avgHr: 140, weightKg: 80, age: 40 })).toEqual({ kcal: 0, method: "none" });
  expect(estimateSessionBurn({ durationMs: 0, avgHr: 140, weightKg: 80, age: 40 })).toEqual({ kcal: 0, method: "none" });
  expect(estimateSessionBurn({ durationMs: HOUR, avgHr: 140, age: 40 })).toEqual({ kcal: 0, method: "none" });
});

test("FC muy baja no da negativo (clamp del kcal/min)", () => {
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: 40, weightKg: 60, age: 25, sex: "male", bmr: null });
  expect(r.kcal).toBeGreaterThanOrEqual(0);
});

test("neto no baja de 0 (gross < BMR de la duración)", () => {
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: null, weightKg: 40, age: 40, bmr: 20000 });
  expect(r.kcal).toBe(0);
});

test("sumDayExerciseBurn suma varias sesiones", () => {
  const athlete = { weightKg: 80, age: 40, sex: "male" as const, bmr: null };
  const total = sumDayExerciseBurn(
    [{ totalDurationMs: HOUR, avgHr: null }, { totalDurationMs: HOUR / 2, avgHr: null }],
    athlete,
  );
  expect(total).toBe(400 + 200);
});
```

- [ ] **Step 2: Verlo fallar**

Run: `cd shared && bun test src/nutrition/exerciseBurn.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

Creá `shared/src/nutrition/exerciseBurn.ts`:
```ts
import type { Sex } from "../schemas/profile";

const MET_STRENGTH = 5; // MET genérico de entrenamiento de fuerza (fallback sin FC)

export interface SessionBurnArgs {
  durationMs: number | null;
  avgHr: number | null;
  weightKg?: number;
  age?: number;
  sex?: Sex;
  bmr?: number | null; // si está, el gasto es NETO (se resta el BMR de la duración)
}
export interface SessionBurn { kcal: number; method: "hr" | "met" | "none" }

// Keytel et al. 2005: kcal/min desde FC + peso + edad, por sexo; "otro"/sin sexo → promedio.
const keytelPerMin = (hr: number, w: number, age: number, sex?: Sex): number => {
  const male = (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * age) / 4.184;
  const female = (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * age) / 4.184;
  const perMin = sex === "male" ? male : sex === "female" ? female : (male + female) / 2;
  return Math.max(0, perMin); // FC muy baja puede dar negativo
};

export function estimateSessionBurn(args: SessionBurnArgs): SessionBurn {
  const { durationMs, avgHr, weightKg, age, sex, bmr } = args;
  if (durationMs == null || durationMs <= 0 || weightKg == null) return { kcal: 0, method: "none" };
  const minutes = durationMs / 60000;
  let gross: number;
  let method: "hr" | "met";
  if (avgHr != null && age != null) {
    gross = keytelPerMin(avgHr, weightKg, age, sex) * minutes;
    method = "hr";
  } else {
    gross = MET_STRENGTH * weightKg * (minutes / 60);
    method = "met";
  }
  const kcal = bmr != null ? Math.max(0, gross - (bmr / 1440) * minutes) : gross;
  return { kcal: Math.round(kcal), method };
}

export function sumDayExerciseBurn(
  sessions: { totalDurationMs: number | null; avgHr: number | null }[],
  athlete: { weightKg?: number; age?: number; sex?: Sex; bmr?: number | null },
): number {
  return Math.round(sessions.reduce(
    (a, s) => a + estimateSessionBurn({ durationMs: s.totalDurationMs, avgHr: s.avgHr, ...athlete }).kcal,
    0,
  ));
}
```
En `shared/src/index.ts`, junto a los otros exports de nutrition:
```ts
export * from "./nutrition/exerciseBurn";
```

- [ ] **Step 4: Verlo pasar + typecheck**

Run: `cd shared && bun test src/nutrition/exerciseBurn.test.ts && bunx tsc --noEmit`
Expected: PASS. Si algún esperado difiere por ±1 de redondeo, recalculá a mano con la fórmula tal como está escrita y ajustá el NÚMERO del test (no la fórmula), documentando la cuenta.

- [ ] **Step 5: Commit**

IMPORTANT: firmar con `-S`, SIN Co-Authored-By.
```bash
git add shared/src/nutrition/exerciseBurn.ts shared/src/nutrition/exerciseBurn.test.ts shared/src/index.ts
git commit -S -m "feat(shared): estimateSessionBurn (Keytel/MET, gasto neto) + sumDayExerciseBurn"
```

---

### Task 2: Shared — `bmr`/`tdee` informativos en el camino manual de `computeNutritionGoal`

**Files:**
- Modify: `shared/src/nutrition/goal.ts`
- Test: `shared/src/nutrition/goal.test.ts`

- [ ] **Step 1: Tests que fallan**

En `shared/src/nutrition/goal.test.ts`, agregá al final:
```ts
test("manual con perfil completo devuelve bmr/tdee informativos (para el gasto neto)", () => {
  const r = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0, manualKcal: 1400 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(1400);        // la meta sigue siendo la manual
  expect(r.source).toBe("manual");
  expect(r.bmr).toBe(1718);          // informativo (base: male 40a 178cm 80kg)
  expect(r.tdee).toBe(2362);         // 1717.5 * 1.375 → 2362
});

test("manual SIN datos antropométricos sigue con bmr/tdee null", () => {
  const r = computeNutritionGoal({ objective: "maintain", rateKgPerWeek: 0, manualKcal: 2000 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.bmr).toBeNull();
  expect(r.tdee).toBeNull();
});
```

- [ ] **Step 2: Verlos fallar**

Run: `cd shared && bun test src/nutrition/goal.test.ts`
Expected: FAIL (`bmr` es null en el camino manual con datos).

- [ ] **Step 3: Reestructurar `computeNutritionGoal`**

En `shared/src/nutrition/goal.ts`, reemplazá el cuerpo de `computeNutritionGoal` por:
```ts
export function computeNutritionGoal(args: NutritionGoalArgs): NutritionGoalResult {
  const { sex, age, heightCm, weightKg, activityLevel, objective, rateKgPerWeek, manualKcal } = args;

  // BMR/TDEE se computan si hay datos, ANTES del branch manual: el camino manual los devuelve
  // informativos (los usa el gasto neto de #2b), aunque la meta sea la manual.
  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78; // other/sin sexo → promedio
  const hasAnthro = age != null && heightCm != null && weightKg != null;
  const bmrRaw = hasAnthro ? 10 * (weightKg as number) + 6.25 * (heightCm as number) - 5 * (age as number) + s : null;
  const tdeeRaw = bmrRaw != null ? bmrRaw * ACTIVITY_FACTOR[activityLevel ?? "light"] : null;

  // Camino manual: el usuario fija las kcal; pisa el cálculo y no fuerza el piso.
  // Se llama directo desde el móvil con un número parseado, así que 0/negativo NO cuentan como override.
  if (manualKcal != null && manualKcal > 0) {
    return {
      status: "ok", source: "manual", kcal: manualKcal, ...macros(manualKcal, weightKg, objective),
      bmr: bmrRaw != null ? round(bmrRaw) : null, tdee: tdeeRaw != null ? round(tdeeRaw) : null,
    };
  }

  const missing: string[] = [];
  if (age == null) missing.push("edad");
  if (heightCm == null) missing.push("altura");
  if (weightKg == null) missing.push("peso");
  if (missing.length > 0) return { status: "incomplete", missing };

  // Acá bmrRaw/tdeeRaw son no-null (hasAnthro garantizado por el check de missing).
  const adj = (rateKgPerWeek * KCAL_PER_KG) / 7;
  const raw = objective === "lose" ? (tdeeRaw as number) - adj : objective === "gain" ? (tdeeRaw as number) + adj : (tdeeRaw as number);
  const kcal = Math.max(KCAL_FLOOR, round(raw));
  return { status: "ok", source: "auto", kcal, ...macros(kcal, weightKg, objective), bmr: round(bmrRaw as number), tdee: round(tdeeRaw as number) };
}
```
(No toques `ACTIVITY_FACTOR`, `KCAL_FLOOR`, `KCAL_PER_KG`, `round` ni `macros` — quedan como están.)

- [ ] **Step 4: Verlos pasar + suite completa**

Run: `cd shared && bun test && bunx tsc --noEmit`
Expected: TODA la suite de shared verde (los 13 tests previos de goal + los 2 nuevos) — la reestructura no debe cambiar ningún resultado del camino auto.

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/goal.ts shared/src/nutrition/goal.test.ts
git commit -S -m "feat(shared): computeNutritionGoal devuelve bmr/tdee informativos en meta manual"
```

---

### Task 3: Backend — `avgHr` + fallback de duración en `listSessions`

**Files:**
- Modify: `backend/src/sessions/repository.ts`
- Test: `backend/src/sessions/repository.test.ts`

- [ ] **Step 1: Tests que fallan**

READ `backend/src/sessions/repository.test.ts` primero — hay un fixture `nestedRow` (fila anidada con exercises/sets) para reusar. Agregá al final (ajustá el import de arriba para incluir `listSessions`):
```ts
test("listSessions expone avgHr desde hrSeries (promedio redondeado)", async () => {
  const row = { ...nestedRow, hrSeries: [{ t: 0, bpm: 120 }, { t: 5000, bpm: 141 }] };
  const db: any = { query: { workoutSession: { findMany: async () => [row] } } };
  const [item] = await listSessions(db, "u");
  expect(item.avgHr).toBe(131); // (120+141)/2 = 130.5 → 131
});

test("listSessions cae al promedio de hrAvg de las series si no hay hrSeries", async () => {
  // nestedRow no tiene hrSeries; asegurate de que sus sets tengan hrAvg (si el fixture no trae, cloná y seteá)
  const withHr = {
    ...nestedRow,
    hrSeries: null,
    exercises: nestedRow.exercises.map((ex: any) => ({
      ...ex,
      sets: ex.sets.map((st: any, i: number) => ({ ...st, hrAvg: i === 0 ? 110 : null })),
    })),
  };
  const db: any = { query: { workoutSession: { findMany: async () => [withHr] } } };
  const [item] = await listSessions(db, "u");
  expect(item.avgHr).toBe(110); // solo los no-null cuentan
});

test("listSessions avgHr null si no hay FC en ningún lado", async () => {
  const noHr = {
    ...nestedRow, hrSeries: null,
    exercises: nestedRow.exercises.map((ex: any) => ({ ...ex, sets: ex.sets.map((st: any) => ({ ...st, hrAvg: null })) })),
  };
  const db: any = { query: { workoutSession: { findMany: async () => [noHr] } } };
  const [item] = await listSessions(db, "u");
  expect(item.avgHr).toBeNull();
});

test("listSessions deriva la duración de endedAt si totalDurationMs es null", async () => {
  const row = { ...nestedRow, totalDurationMs: null, startedAt: 1000, endedAt: 61000 };
  const db: any = { query: { workoutSession: { findMany: async () => [row] } } };
  const [item] = await listSessions(db, "u");
  expect(item.totalDurationMs).toBe(60000);
});

test("listSessions duración null si la sesión sigue en curso (endedAt null)", async () => {
  const row = { ...nestedRow, totalDurationMs: null, endedAt: null };
  const db: any = { query: { workoutSession: { findMany: async () => [row] } } };
  const [item] = await listSessions(db, "u");
  expect(item.totalDurationMs).toBeNull();
});
```
(ADAPTÁ los clones del fixture a su shape real — la intención de cada test manda: fallback de hrAvg, null total, duración derivada, en-curso null.)

- [ ] **Step 2: Verlos fallar**

Run: `cd backend && bun test src/sessions/repository.test.ts`
Expected: FAIL (`avgHr` undefined; duración no derivada).

- [ ] **Step 3: Implementar en `listSessions`**

En `backend/src/sessions/repository.ts`, dentro del `rows.map((row: any) => { ... })` de `listSessions`, después de `const s = rowsToSession(row);` agregá el cómputo y extendé el objeto devuelto:
```ts
    // FC promedio para estimar gasto (#2b): serie completa si hay; si no, promedio de los hrAvg de las series.
    const seriesHr = s.hrSeries && s.hrSeries.length > 0
      ? s.hrSeries.reduce((a, p) => a + p.bpm, 0) / s.hrSeries.length
      : null;
    const setHrs = s.exercises.flatMap((ex) => ex.sets.map((st) => st.hrAvg).filter((v): v is number => v != null));
    const avgHr = seriesHr != null
      ? Math.round(seriesHr)
      : setHrs.length > 0 ? Math.round(setHrs.reduce((a, v) => a + v, 0) / setHrs.length) : null;
    return {
      id: s.id, programId: s.programId, dayLabel: s.dayLabel, location: s.location,
      startedAt: s.startedAt,
      // Fallback: sesión terminada sin totalDurationMs → derivar de endedAt (en curso → null).
      totalDurationMs: s.totalDurationMs ?? (s.endedAt != null ? s.endedAt - s.startedAt : null),
      completionPct: sessionCompletionPct(s),
      avgHr,
    };
```

- [ ] **Step 4: Verlos pasar + suite backend**

Run: `cd backend && bun test && bunx tsc --noEmit`
Expected: toda la suite verde.

- [ ] **Step 5: Commit**

```bash
git add backend/src/sessions/repository.ts backend/src/sessions/repository.test.ts
git commit -S -m "feat(backend): listSessions expone avgHr + fallback de duración desde endedAt"
```

---

### Task 4: Mobile — `SessionListItem.avgHr` + `buildGoalView(…, exercise)`

**Files:**
- Modify: `mobile/src/api/sessions.ts`
- Modify: `mobile/src/nutrition/goalView.ts`
- Test: `mobile/__tests__/goalView.test.ts`

- [ ] **Step 1: Test que falla**

En `mobile/__tests__/goalView.test.ts`, agregá al final:
```ts
test("exercise suma al restante de kcal y no toca los macros", () => {
  const goal = { status: "ok", source: "auto", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1600, tdee: 2000 } as const;
  const v = bgv(goal, { kcal: 2100, protein_g: 90, carbs_g: 120, fat_g: 40 }, 300);
  expect(v.kcal).toEqual({ meta: 2000, comido: 2100, exercise: 300, restante: 200, over: false }); // 2000-2100+300
  expect(v.macros!.find((m) => m.key === "protein")!.restante).toBe(60); // sin cambio
});

test("sin exercise (default 0) el comportamiento no cambia y over sigue el criterio del restante", () => {
  const goal = { status: "ok", source: "auto", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1600, tdee: 2000 } as const;
  const v = bgv(goal, { kcal: 2100, protein_g: 0, carbs_g: 0, fat_g: 0 });
  expect(v.kcal).toEqual({ meta: 2000, comido: 2100, exercise: 0, restante: -100, over: true });
  // borde .5 con exercise: 2000 - 2000.5 + 0 → restante 0 (|| 0), over false
  const v2 = bgv(goal, { kcal: 2000.5, protein_g: 0, carbs_g: 0, fat_g: 0 });
  expect(v2.kcal!.restante).toBe(0);
  expect(v2.kcal!.over).toBe(false);
});
```
NOTA: el test existente "ok: arma meta/comido/restante + barras por macro" usa `toEqual` sobre `v.kcal` — extendé su esperado con `exercise: 0` (y ya tiene `over: false` del fix de #122). Lo mismo cualquier otro `toEqual` de `v.kcal`.

- [ ] **Step 2: Verlo fallar**

Run: `cd mobile && npm test -- goalView --runInBand`
Expected: FAIL (`buildGoalView` no acepta el 3er parámetro / `exercise` no existe).

- [ ] **Step 3: Implementar**

En `mobile/src/nutrition/goalView.ts`:
- `GoalView.kcal` pasa a:
```ts
  kcal?: { meta: number; comido: number; exercise: number; restante: number; over: boolean };
```
- Firma y cómputo de kcal (manteniendo el criterio de #122 — `over` del restante redondeado, `|| 0` normaliza el −0):
```ts
export function buildGoalView(
  goal: NutritionGoalResult,
  comido: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
  exercise = 0,
): GoalView {
```
y reemplazá el cómputo de `kcalRestante`/`kcal` por:
```ts
  const kcalRestante = Math.round(goal.kcal - comido.kcal + exercise) || 0;
  return {
    status: "ok",
    kcal: { meta: goal.kcal, comido: Math.round(comido.kcal), exercise: Math.round(exercise), restante: kcalRestante, over: kcalRestante < 0 },
```
(el resto — `bar`, macros — queda igual).

En `mobile/src/api/sessions.ts`, agregá al `interface SessionListItem`:
```ts
  avgHr: number | null;
```

- [ ] **Step 4: Verlo pasar + typecheck**

Run: `cd mobile && npm test -- goalView --runInBand && bunx tsc --noEmit`
Expected: PASS, sin errores (nadie desestructura `exercise` todavía; los consumidores actuales de `kcal` no hacen `toEqual` en runtime).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/sessions.ts mobile/src/nutrition/goalView.ts mobile/__tests__/goalView.test.ts
git commit -S -m "feat(mobile): buildGoalView acepta exercise (Restante = Meta − Comido + Ejercicio) + avgHr en SessionListItem"
```

---

### Task 5: Mobile — hook con sesiones del día + UI (card + detalle)

**Files:**
- Modify: `mobile/src/nutrition/useNutritionDay.ts`
- Modify: `mobile/app/(tabs)/nutricion.tsx`
- Modify: `mobile/app/nutricion/detalle.tsx`

- [ ] **Step 1: Hook**

En `mobile/src/nutrition/useNutritionDay.ts`:
- Imports: agregá `getSessions` y su tipo, y las funciones de shared:
```ts
import { getSessions, type SessionListItem } from "../api/sessions";
import { computeNutritionGoal, sumDayExerciseBurn } from "@pulsia/shared";
```
(quitá el import previo de `computeNutritionGoal` suelto si queda duplicado).
- Estado: junto a los otros `useState`:
```ts
  const [daySessions, setDaySessions] = useState<SessionListItem[]>([]);
```
- En `reload`, sumá `getSessions(url)` al `Promise.all` y filtrá por día:
```ts
      const [ms, ws, gi, p, ss] = await Promise.all([
        listMeals(url, from, to), listWater(url, from, to), getNutritionGoal(url), getProfile(), getSessions(url),
      ]);
      setMeals(ms); setWater(ws); setGoalInput(gi); setProfile(p);
      setDaySessions(ss.filter((s) => s.startedAt >= from && s.startedAt <= to));
```
- Después de `goalResult` (y ANTES de `goalView`), computá el gasto y pasalo:
```ts
  const bmrForBurn = goalResult?.status === "ok" ? goalResult.bmr : null; // narrowing: la variante incomplete no tiene bmr
  const exercise = sumDayExerciseBurn(daySessions, { weightKg, age: profile?.age, sex: profile?.sex, bmr: bmrForBurn });
  const goalView = goalResult
    ? buildGoalView(goalResult, { ... /* igual que ahora */ }, exercise)
    : null;
```
- En `NutritionDay` (interface) y en el `return`, agregá `exercise: number`.

- [ ] **Step 2: Card (`nutricion.tsx`)**

- Del hook, desestructurá también `exercise`.
- En la rama `goalView?.status === "ok"` de la card, DEBAJO del `<Text>` del restante, agregá:
```tsx
              {goalView.kcal!.exercise > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>🏋 +{goalView.kcal!.exercise} kcal ejercicio</Text>
              )}
```

- [ ] **Step 3: Detalle (`detalle.tsx`)**

- La leyenda pasa a:
```tsx
        Comido = lo registrado · Meta = tu objetivo · Restante = Meta − Comido + Ejercicio. El gasto del ejercicio se estima desde tus sesiones (FC o duración).
```
- En la sección Calorías (rama "ok"), DEBAJO de la barra, agregá:
```tsx
            {goalView.kcal!.exercise > 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Ejercicio +{goalView.kcal!.exercise} kcal (ya sumado al restante)
              </Text>
            )}
```

- [ ] **Step 4: Typecheck + sweep**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.
Run: `cd mobile && npm test -- --runInBand`
Expected: verde (flakes conocidos: `generando.test.tsx`/`ecg.test.tsx` — ignorar si SOLO esos fallan).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/useNutritionDay.ts "mobile/app/(tabs)/nutricion.tsx" mobile/app/nutricion/detalle.tsx
git commit -S -m "feat(mobile): gasto del entrenamiento en el restante (card + detalle vía useNutritionDay)"
```

---

## Self-Review

**Spec coverage:** Bloque 1 (avgHr + fallback duración) → Task 3. Bloque 2 (exerciseBurn + cambio de goal.ts) → Tasks 1/2. Bloque 3 (goalView + criterio #122) → Task 4. Bloque 4 (hook/card/detalle) → Task 5. Testabilidad cubierta en Tasks 1–4. Entrega: backend sin migración deploya; mobile OTA vc10. ✅

**Placeholder scan:** los clones del fixture en Task 3 se marcan explícitamente como ADAPTAR al shape real (intención de cada test dada) — decisión consciente, no placeholder.

**Type consistency:** `estimateSessionBurn`/`sumDayExerciseBurn` (Task 1) usados por el hook (Task 5) con el shape `{ totalDurationMs, avgHr }` que devuelve `listSessions` (Task 3) y tipa `SessionListItem` (Task 4). `kcal.exercise` (Task 4) consumido por card/detalle (Task 5). `bmrForBurn` con narrowing de la unión. `exercise` expuesto por el hook e importado en la card.

**Riesgos:**
- Task 2 reestructura `computeNutritionGoal` — la suite completa de goal (13 tests) es la red; el camino auto no debe cambiar ni un número.
- Task 4: los `toEqual` existentes sobre `v.kcal` deben extenderse con `exercise: 0`.
- Task 5: mantener el orden goalResult → exercise → goalView (el neto usa el bmr).
