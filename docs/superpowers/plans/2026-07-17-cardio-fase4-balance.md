# Cardio Fase 4 — Wiring del balance de nutrición Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que el gasto calórico del cardio (caminata/running/elíptica/…) entre al balance energético de nutrición (#2b) y a los informes del agente, reemplazando `sumDayExerciseBurn` por `dayExerciseBurn` en los dos únicos call-sites.

**Architecture:** `dayExerciseBurn(sessions, activities, athlete)` (ya existe en `shared`, sumando fuerza + cardio) reemplaza a `sumDayExerciseBurn(sessions, athlete)` (solo fuerza). Los dos call-sites — la pantalla (`useNutritionDay`) y los informes (`reports/collect`) — pasan a cargar también las actividades de cardio del día y a sumarlas. `sumDayExerciseBurn` se borra en el mismo PR (no conviven: dos funciones que suman gasto es cómo la pantalla y los informes terminan discrepando). Se generalizan dos textos de UI que asumían solo fuerza.

**Tech Stack:** shared (Zod, `estimateCardioBurn`/`dayExerciseBurn`), backend (Hono, `deps` inyectables), mobile (Expo, hook `useNutritionDay`). Bun test / Jest.

---

## Contexto para el implementador

Rama: `feat/cardio-fase4-balance`. Worktree aislado (ya creado). **NUNCA** trabajar en `/Users/kilo/desarrollo26/pulsia` (otra sesión).

**Convenciones (obligatorias):** TDD estricto; cada test nuevo verificado **por mutación**; commits firmados `-S` sin atribución a Claude; **correr `tsc --noEmit` del backend además de `bun test`** (bun no type-checea — en la fase 3 aparecieron 5 errores de tipo que solo `tsc` detectó).

**Funciones en juego (`shared/src/nutrition/exerciseBurn.ts`, ya existen):**
```ts
export interface CardioBurnInput { type: CardioType; durationMs: number; avgHr: number | null; kcal: number | null; }
export type AthleteBurnArgs = { weightKg?: number; age?: number; sex?: Sex; bmr?: number | null };
export function dayExerciseBurn(
  sessions: { totalDurationMs: number | null; avgHr: number | null }[],
  activities: CardioBurnInput[],
  athlete: AthleteBurnArgs,
): number   // = suma fuerza + cardio; una actividad con kcal != null aporta ese valor (device), si no se estima
```
`sumDayExerciseBurn(sessions, athlete)` es la vieja (solo fuerza) — se borra en la Task 3.

**Cómo se listan las actividades de cardio:**
- Backend: `listCardio(db, userId, from?, to?)` en `backend/src/cardio/repository.ts` → `CardioActivity[]`.
- Móvil: `listCardio(baseUrl, from?, to?)` en `mobile/src/api/cardio.ts` → `CardioActivity[]` (con rango, ya filtra por `startedAt`).

`CardioActivity` tiene `{ type, durationMs, avgHr, kcal, startedAt, ... }` → mapear a `CardioBurnInput` es tomar esos 4 campos.

**Orden de las tareas:** primero migrar los dos call-sites (Tasks 1 y 2), DESPUÉS borrar `sumDayExerciseBurn` (Task 3) — borrarla antes rompe la compilación de los callers.

---

### Task 1: Backend — `collect.ts` suma el cardio del período

**Files:**
- Modify: `backend/src/reports/collect.ts`
- Test: `backend/src/reports/collect.test.ts`

`collectReportData(db, userId, from, to, ...)` calcula el gasto sobre el período `[from, to]` (día/semana/mes). Hoy solo suma fuerza. Se agrega una dep `listCardio` y se suma el cardio del período.

- [ ] **Step 1: Escribir el test que falla**

En `backend/src/reports/collect.test.ts`: agregar `listCardio: async () => []` a `baseDeps` (línea ~15-18, junto a `listSessions`), y agregar este test:

```ts
test("collectReportData suma el gasto de cardio del período (device kcal + estimado)", async () => {
  const deps = {
    ...baseDeps,
    // sesión 1h sin FC → MET 5*80 = 400 bruto (sin bmr)
    listSessions: async () => [{ id: "s", startedAt: 1, totalDurationMs: 3600000, avgHr: null, dayLabel: "A", location: "gym", programId: "p", completionPct: 100 }],
    // una caminata con kcal del reloj (device → se usa tal cual) y otra fuera del período (se ignora)
    listCardio: async () => [
      { id: "c1", type: "walk", startedAt: 5, durationMs: 1800000, avgHr: null, maxHr: null, elevationGainM: null, distanceM: null, kcal: 150, kcalSource: "device", source: "fit", notes: "" },
      { id: "c2", type: "run", startedAt: 999, durationMs: 600000, avgHr: null, maxHr: null, elevationGainM: null, distanceM: null, kcal: 99, kcalSource: "device", source: "fit", notes: "" },
    ],
  };
  const athlete = { weightKg: 80, age: 40, sex: "male", goal: { status: "ok", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: null } } as any;
  // período [0, 10]: entra la sesión (startedAt 1) y c1 (startedAt 5), NO c2 (startedAt 999)
  const data = await collectReportData({} as any, "u", 0, 10, athlete, deps as any);
  expect(data.exercise).toBe(550); // 400 fuerza + 150 device del cardio; c2 fuera de rango
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/backend && bun test src/reports/collect.test.ts`
Expected: FAIL — `listCardio` no existe en `CollectDeps` (o el `exercise` da 400, no 550).

- [ ] **Step 3: Implementar**

En `backend/src/reports/collect.ts`:

1. Cambiar el import (línea 1):
```ts
import { sumNullableMicro, dayExerciseBurn } from "@pulsia/shared";
import type { AthleteContext, Meal, WaterLog, PlanView, CardioActivity } from "@pulsia/shared";
```
2. Agregar el import del repo (junto a los otros, ~línea 4):
```ts
import { listCardio as listCardioImpl } from "../cardio/repository";
```
3. Agregar `listCardio` a `CollectDeps` (interface, ~línea 40-48):
```ts
  listCardio: (db: Db, userId: string) => Promise<CardioActivity[]>;
```
4. Agregar a `defaultDeps` (~línea 49-57):
```ts
  listCardio: (db, u) => listCardioImpl(db, u),
```
5. En el `Promise.all` (~línea 69-74), agregar `deps.listCardio(db, userId)` y capturarlo:
```ts
  const [meals, water, allSessions, allCardio, metrics, activePlan, takes, catalog] = await Promise.all([
    deps.listMeals(db, userId, from, to), deps.listWater(db, userId, from, to),
    deps.listSessions(db, userId), deps.listCardio(db, userId), deps.getMetrics(db, userId, { from, to }),
    deps.getActivePlan(db, userId), deps.listTakesForRange(db, userId, fromDateStr, toDateStr),
    deps.listSupplements(db, userId),
  ]);
```
6. Reemplazar el cálculo de `exercise` (~línea 95-97):
```ts
  const daySessions = allSessions.filter((s) => s.startedAt >= from && s.startedAt <= to);
  const dayCardio = allCardio
    .filter((a) => a.startedAt >= from && a.startedAt <= to)
    .map((a) => ({ type: a.type, durationMs: a.durationMs, avgHr: a.avgHr, kcal: a.kcal }));
  const bmr = athlete.goal.status === "ok" ? (athlete.goal.bmr ?? null) : null;
  const exercise = dayExerciseBurn(daySessions, dayCardio, { weightKg: athlete.weightKg, age: athlete.age, sex: athlete.sex, bmr });
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/backend && bun test src/reports/collect.test.ts`
Expected: PASS (todos, incluido el nuevo y el preexistente que sigue en 400).

- [ ] **Step 5: Verificación por mutación**

Cambiar en `collect.ts` el map de `dayCardio` para no filtrar por rango (quitar el `.filter(...)`) → el nuevo test debe FALLAR (sumaría c2, dando 649 en vez de 550). Revertir. Segunda mutación: pasar `[]` como `activities` a `dayExerciseBurn` → el nuevo test debe FALLAR (da 400). Revertir.

- [ ] **Step 6: Typecheck + commit**

Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/backend && bunx tsc --noEmit` → 0 errores.
```bash
git add backend/src/reports/collect.ts backend/src/reports/collect.test.ts
git commit -S -m "feat(cardio): los informes suman el gasto de cardio del período"
```

---

### Task 2: Móvil — `useNutritionDay` suma el cardio del día

**Files:**
- Modify: `mobile/src/nutrition/useNutritionDay.ts`

El hook carga las comidas/sesiones del día y calcula `exercise`. Se le agrega la carga de las actividades de cardio del día y se pasa a `dayExerciseBurn`. (El hook usa `useFocusEffect`; la corrección se verifica con `tsc` + la suite — la lógica de suma ya está cubierta por los tests de `dayExerciseBurn` en `shared`.)

- [ ] **Step 1: Implementar**

En `mobile/src/nutrition/useNutritionDay.ts`:

1. Imports:
```ts
import { computeNutritionGoal, dayExerciseBurn } from "@pulsia/shared";
import type { Meal, WaterLog, NutritionGoalInput, TrainingProfile, NutritionGoalResult, CardioBurnInput } from "@pulsia/shared";
import { listCardio } from "../api/cardio";
```
   (reemplaza `sumDayExerciseBurn` por `dayExerciseBurn` en el primer import; agrega `CardioBurnInput` al import de tipos y el import de `listCardio`.)
2. Estado nuevo (junto a `daySessions`, ~línea 34):
```ts
  const [dayCardio, setDayCardio] = useState<CardioBurnInput[]>([]);
```
3. En `reload`, agregar `listCardio(url, from, to)` al `Promise.all` y mapear (`listCardio` con rango ya filtra por `startedAt`):
```ts
      const [ms, ws, gi, p, ss, cardio] = await Promise.all([
        listMeals(url, from, to), listWater(url, from, to), getNutritionGoal(url), getProfile(), getSessions(url), listCardio(url, from, to),
      ]);
      setMeals(ms); setGoalInput(gi); setProfile(p); setWater(ws);
      setDaySessions(ss.filter((s) => s.startedAt >= from && s.startedAt <= to));
      setDayCardio(cardio.map((a) => ({ type: a.type, durationMs: a.durationMs, avgHr: a.avgHr, kcal: a.kcal })));
```
   (mantener el orden real del código; lo importante es agregar `listCardio` y `setDayCardio`.)
4. Reemplazar el cálculo de `exercise` (~línea 63):
```ts
  const exercise = dayExerciseBurn(daySessions, dayCardio, { weightKg, age: profile?.age, sex: profile?.sex, bmr: bmrForBurn });
```

- [ ] **Step 2: Verificar (typecheck + suite)**

Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/mobile && bunx tsc --noEmit` → 0 errores.
Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/mobile && bunx jest --runInBand` → suite verde.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/nutrition/useNutritionDay.ts
git commit -S -m "feat(cardio): la pantalla de nutrición suma el cardio del día al balance"
```

---

### Task 3: Shared — borrar `sumDayExerciseBurn`

**Files:**
- Modify: `shared/src/nutrition/exerciseBurn.ts`
- Test: `shared/src/nutrition/exerciseBurn.test.ts`

Con los dos call-sites migrados, `sumDayExerciseBurn` queda sin uso. Se borra (junto a sus tests) para que no haya dos funciones que sumen gasto.

- [ ] **Step 1: Confirmar que no quedan usos productivos**

Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt && grep -rn "sumDayExerciseBurn" shared backend mobile --include=*.ts --include=*.tsx | grep -v "\.test\."`
Expected: solo la definición en `shared/src/nutrition/exerciseBurn.ts`. Si aparece otro call-site, migralo primero (mismo patrón que Tasks 1/2). NO continuar si hay usos productivos fuera de la definición.

- [ ] **Step 2: Borrar la función y actualizar el comentario**

En `shared/src/nutrition/exerciseBurn.ts`:
- Borrar el bloque completo `export function sumDayExerciseBurn(...) { ... }`.
- En el comentario de `dayExerciseBurn`, quitar la frase que dice que reemplaza a `sumDayExerciseBurn` "que se borra en la fase 4" (ya está borrada). Dejar, por ejemplo:
```ts
// Gasto del día = fuerza + cardio. Única fuente del gasto de ejercicio: dos funciones que suman
// gasto es cómo la pantalla y los informes terminan discrepando.
```

- [ ] **Step 3: Borrar sus tests**

En `shared/src/nutrition/exerciseBurn.test.ts`: borrar los tests que ejercitan `sumDayExerciseBurn` (buscar `sumDayExerciseBurn` y quitar esos `test(...)` y el import si quedara sin usar). Dejar intactos los de `estimateSessionBurn`, `estimateCardioBurn` y `dayExerciseBurn`.

- [ ] **Step 4: Verificar**

Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/shared && bun test src/nutrition/exerciseBurn.test.ts` → verde.
Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt && grep -rn "sumDayExerciseBurn" shared backend mobile --include=*.ts --include=*.tsx` → **sin resultados** (ni definición ni tests ni imports).

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/exerciseBurn.ts shared/src/nutrition/exerciseBurn.test.ts
git commit -S -m "refactor(cardio): borrar sumDayExerciseBurn (reemplazada por dayExerciseBurn)"
```

---

### Task 4: UI — generalizar los textos que asumían solo fuerza

**Files:**
- Modify: `mobile/app/nutricion/detalle.tsx`
- Modify: `mobile/app/(tabs)/nutricion.tsx`

- [ ] **Step 1: Texto explicativo en `detalle.tsx`**

En `mobile/app/nutricion/detalle.tsx` (líneas ~37-38), el texto actual:
```
Comido = lo registrado · Meta = tu objetivo · Restante = Meta − Comido + Ejercicio. El gasto del ejercicio se
estima desde tus sesiones (FC o duración).
```
Reemplazar la segunda frase para incluir el cardio y las kcal del reloj:
```
Comido = lo registrado · Meta = tu objetivo · Restante = Meta − Comido + Ejercicio. El gasto del ejercicio
sale de tus sesiones y actividades de cardio (las kcal del reloj mandan; si no, se estiman por FC o duración).
```
(Mantener el mismo `<Text>`/estructura; solo cambia el string. Si está partido en dos líneas de JSX, ajustar ambas.)

- [ ] **Step 2: Ícono/etiqueta en `nutricion.tsx`**

En `mobile/app/(tabs)/nutricion.tsx` (~línea 95):
```tsx
<Text style={{ color: colors.textMuted, fontSize: 12 }}>🏋 +{goalView.kcal!.exercise} kcal ejercicio</Text>
```
La mancuerna deja de ser exacta cuando el gasto incluye caminatas. Cambiar el emoji por uno genérico de gasto calórico:
```tsx
<Text style={{ color: colors.textMuted, fontSize: 12 }}>🔥 +{goalView.kcal!.exercise} kcal ejercicio</Text>
```

- [ ] **Step 3: Verificar**

Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/mobile && bunx tsc --noEmit` → 0 errores.
Run: `cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/mobile && bunx jest --runInBand` → verde.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/nutricion/detalle.tsx "mobile/app/(tabs)/nutricion.tsx"
git commit -S -m "feat(cardio): generalizar los textos de gasto de ejercicio (incluye cardio)"
```

---

### Task 5: Verificación final + PR

- [ ] **Step 1: Suites completas + typecheck**

```bash
cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/shared && bun test && bunx tsc --noEmit
cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/backend && bun test && bunx tsc --noEmit
cd /Users/kilo/desarrollo26/pulsia-cardio4-wt/mobile && bunx jest --runInBand && bunx tsc --noEmit
```
Expected: todo verde, `tsc` en 0 en los tres.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/cardio-fase4-balance
gh pr create --title "feat(cardio): wiring del gasto de cardio al balance de nutrición (fase 4)" --body "<resumen: dayExerciseBurn reemplaza a sumDayExerciseBurn en los dos call-sites (useNutritionDay + reports/collect), el cardio del día/período entra al net-calories y a los informes; se borra sumDayExerciseBurn; textos de UI generalizados>"
```

- [ ] **Step 3: `@claude review`**, evaluar hallazgos (skill receiving-code-review), aplicar los válidos, re-review.

- [ ] **Step 4: Merge (squash)** — solo con OK del usuario.

---

## Notas

- **Sin migración de DB.** La tabla `cardio_activity` ya existe (fase 1). Esta fase es wiring puro.
- **OTA:** cambios de móvil JS-only (sin dep nativa) → llega por **OTA a vc10** (runtime `784872cb…`; verificar en la salida del `eas update`). El backend se auto-deploya al mergear a `main`.
- **Cierra el dominio cardio:** con esto, una caminata sube el "Restante" del día y aparece en los informes del agente — el objetivo original de [[garmin-activities-idea]].
