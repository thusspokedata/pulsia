# Balance energético #2b — Net calories (gasto del entrenamiento)

> Diseño. Fecha: 2026-07-14. Segundo slice del sub-proyecto #2 (balance energético), sobre #2a. Cierra el loop de MFP: `Restante = Meta − Comido + Ejercicio`. Estima las **kcal quemadas** en las sesiones de entrenamiento del día y las suma al restante. Decisiones aprobadas por el usuario: **Keytel (FC) con fallback MET**, y gasto **neto** (restando el BMR de la duración; fallback a bruto si el perfil está incompleto).

## Objetivo

1. **Estimar el gasto** de cada sesión de entrenamiento del día: Keytel cuando hay FC promedio, MET×duración×peso cuando no; en ambos casos **neto** (restando el BMR correspondiente a la duración).
2. **Sumarlo al restante** de calorías: `Restante = Meta − Comido + Ejercicio`. Solo afecta kcal (los macros no cambian).
3. Mostrarlo en el tab (indicador de ejercicio en la card) y en el detalle (línea Ejercicio + fórmula explícita).

## No-objetivos (YAGNI)

- **No** importar actividades de Garmin (caminatas, etc.): es la fuente extra futura (ver memoria `garmin-activities-idea`); #2b usa las sesiones propias de la app.
- **No** contar pasos/`steps` como ejercicio (impreciso; queda para el futuro junto con Garmin).
- **No** "devolver" macros por el ejercicio (MFP tampoco; el ejercicio solo ajusta las calorías).
- **No** editar el gasto a mano por sesión (se estima; el método manual quedó descartado).
- **No** MET por tipo de ejercicio fino: un MET fijo de fuerza (~5) para el fallback sin FC.
- **No** migración de DB (`avgHr` se computa al vuelo desde datos ya guardados).

## Diseño

### Bloque 1 — Backend: exponer la FC de la sesión en el listado

En `backend/src/sessions/repository.ts`, `listSessions` hoy devuelve `{ id, programId, dayLabel, location, startedAt, totalDurationMs, completionPct }`. Dos cambios:
1. Agregar **`avgHr: number | null`**:
   - Preferencia 1: promedio de `hrSeries[].bpm` (si hay serie no vacía).
   - Preferencia 2: promedio de los `hrAvg` no-null de todas las series (`exercises[].sets[].hrAvg`).
   - Si no hay ninguno → `null`.
2. **Fallback de duración**: devolver `totalDurationMs: s.totalDurationMs ?? (s.endedAt != null ? s.endedAt - s.startedAt : null)` — una sesión terminada con `totalDurationMs` null pero `endedAt` presente no debe aportar 0 kcal por un dato derivable. (Una sesión EN CURSO —`endedAt` null— sigue dando null → aporta 0 hasta terminar, que es lo deseado.)

Redondear a entero. Nota: `listSessions` devuelve un objeto literal (sin schema de Zod), y `SessionListItem` es un **`interface` del móvil** en `mobile/src/api/sessions.ts` (no hay schema en `shared`). Así que el cambio es: (a) agregar `avgHr` al objeto que devuelve `listSessions` en el backend, y (b) agregar `avgHr: number | null` al `interface SessionListItem` del móvil. Sin migración, sin schema de shared. `estimateSessionBurn`/`sumDayExerciseBurn` (Bloque 2) reciben un shape mínimo estructural (`{ totalDurationMs, avgHr }`), sin depender del tipo del móvil.

### Bloque 2 — Shared: estimación del gasto (función pura)

`shared/src/nutrition/exerciseBurn.ts`:
```ts
estimateSessionBurn(args: {
  durationMs: number | null; avgHr: number | null;
  weightKg?: number; age?: number; sex?: Sex; bmr?: number | null;
}): { kcal: number; method: "hr" | "met" | "none" }
```
Reglas (todo en minutos = `durationMs / 60000`; si `durationMs` es null/0 o falta peso → `{ kcal: 0, method: "none" }`):
- **Keytel** (si `avgHr` y `age` y `weightKg`): kcal/min por sexo (fórmula estándar), gross:
  - male: `(-55.0969 + 0.6309*hr + 0.1988*w + 0.2017*age) / 4.184`
  - female: `(-20.4022 + 0.4472*hr - 0.1263*w + 0.074*age) / 4.184`
  - other/sin sexo: promedio de ambas.
  - `gross = max(0, kcalPorMin) * minutos` ; `method: "hr"`.
- **MET fallback** (sin FC, con peso): `gross = 5 * weightKg * (minutos / 60)` ; `method: "met"`. (Si tampoco hay peso → `none`, kcal 0.)
- **Neto**: si hay `bmr` → `kcal = max(0, gross - (bmr / 1440) * minutos)`; si no → `kcal = gross` (bruto). Redondear a entero.

Y un agregador (shape mínimo estructural, sin importar el tipo del móvil):
```ts
sumDayExerciseBurn(
  sessions: { totalDurationMs: number | null; avgHr: number | null }[],
  athlete: { weightKg?: number; age?: number; sex?: Sex; bmr?: number | null },
): number
```
= suma de `estimateSessionBurn(...)` sobre las sesiones (redondeada). (El filtrado por día lo hace quien llama, con `startedAt`.)

**Cambio acompañante en `goal.ts` (#2a):** el camino `manualKcal` de `computeNutritionGoal` hoy devuelve `bmr: null, tdee: null`. Como el neto depende del `bmr`, un usuario con meta manual y perfil completo caería silenciosamente a bruto. Fix: en el camino manual, si hay `age`/`heightCm`/`weightKg`, **computar y devolver `bmr`/`tdee` informativos** igual (la meta sigue siendo la manual; solo cambia que los campos dejan de ser null cuando hay datos). Ajustar el test existente que asertaba `bmr: null` en manual.

### Bloque 3 — Integración: `Restante = Meta − Comido + Ejercicio`

En `mobile/src/nutrition/goalView.ts`, `buildGoalView(goal, comido, exercise = 0)`:
- El ejercicio **solo** ajusta las kcal: `restante = Math.round(meta - comido + exercise) || 0`, `over = restante < 0`, y exponer `exercise` en el objeto `kcal`. Los macros **no** cambian.
- **Mantener el criterio del fix de #122**: `over` se deriva SIEMPRE del restante redondeado, y el `|| 0` normaliza el `-0` de `Math.round(-0.5)` — no regresionar el borde `.5`.
- `kcal: { meta, comido, exercise, restante, over }`.

### Bloque 4 — Mobile

- **Hook `useNutritionDay(offset)`**: sumar `getSessions(url)` al `Promise.all`; filtrar las del día (`startedAt` dentro de `dayBounds(offset)`), y computar `exercise = sumDayExerciseBurn(sessionesDelDia, { weightKg, age: profile.age, sex: profile.sex, bmr })` con `bmr = goalResult?.status === "ok" ? goalResult.bmr : null` (la unión no tiene `bmr` en la variante `incomplete` — narrowear, no `goalResult?.bmr`). Pasar `exercise` a `buildGoalView`. Exponer `exercise` en el return (para la UI).
  - Ojo con el orden: `goalResult` (que da el `bmr`) se computa antes de `exercise`.
- **Card** (`nutricion.tsx`): el restante ya incluye el ejercicio (vía goalView). Agregar un indicador chico cuando `exercise > 0`: **`🏋 +{exercise} kcal ejercicio`**.
- **Detalle** (`detalle.tsx`), sección Calorías: mostrar explícito **Comido {comido} · Ejercicio +{exercise} · Meta {meta} → Restante {restante}**, y la leyenda pasa a `Restante = Meta − Comido + Ejercicio`.

## Casos borde

- Sin sesiones el día → `exercise = 0`, restante = meta − comido (comportamiento de #2a intacto).
- Sesión sin FC → MET fallback; sin FC ni peso → aporta 0.
- Perfil incompleto (`goalResult` incomplete → no bmr) → gasto **bruto** (no neto). Nota realista: si falta el PESO, tanto Keytel como MET dan 0 → el ejercicio directamente no aporta; el "gasto bruto sin bmr" solo aplica cuando hay peso pero falta edad/altura. Con meta "incomplete" no se muestra el restante (comido + CTA, como en #2a).
- Meta **manual** con perfil completo → neto igual (gracias al cambio acompañante en `goal.ts` que devuelve `bmr` informativo en el camino manual).
- Keytel puede dar kcal/min negativo con FC muy baja → `max(0, ...)`.
- Neto podría dar negativo si el gross < BMR de la duración → piso en 0.
- `activityLevel` del perfil se definió "sin contar entrenamientos" (#2a) → sumar el gasto no dobla-cuenta; el neto además saca el BMR de esa hora.

## Testabilidad

- **`exerciseBurn.test.ts`** (shared): Keytel male/female/other con números a mano, MET fallback (sin FC), neto vs bruto (con/sin bmr), duración null/0 → 0, sin peso → 0, `sumDayExerciseBurn` suma varias.
- **`goal.test.ts`** (ajustar): el camino manual con datos completos devuelve `bmr`/`tdee` informativos (antes null); manual SIN datos sigue devolviendo null.
- **`goalView.test.ts`** (extender): con `exercise > 0`, `restante = meta − comido + exercise` y `over` coherente (incluido el borde `.5` con exercise); sin exercise (default 0) el comportamiento no cambia.
- **backend**: `listSessions` devuelve `avgHr` (promedio de hrSeries; fallback a hrAvg de sets; null si nada) y el fallback de duración (`endedAt − startedAt` si `totalDurationMs` es null) — test con fakeDb.
- El hook y las pantallas son glue → typecheck + sweep + device.

## Entrega

- **shared + backend** (sin migración) → merge deploya a la Pi.
- **Mobile, todo JS, sin dep nativa** → **OTA a vc10** (`784872cb…`; `eas update --branch preview --environment preview`).
