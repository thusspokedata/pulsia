# PR2 — Card web "Días entrenados y gasto" (paridad con el móvil) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reemplazar la card web `ConsistencyCard` ("Constancia de entrenos", que colorea por CANTIDAD de sesiones) por una card con **paridad total al móvil**: se llama **"Días entrenados y gasto"**, colorea por **gasto calórico** del día (fuerza + cardio) usando el motor ya en `@pulsia/shared` (PR #211), oculta los días futuros y fuera del año, no desborda horizontalmente (scroll interno), y muestra el contador **X/365** (días entrenados / días del año).

**Architecture:** La web reusa `buildDailyBurn` + `burnThresholds` + `buildYearHeatmap` + `availableYears` de `@pulsia/shared` (idénticos a los que consume el móvil). Solo hace falta plumbing de datos web (sesiones con `avgHr`, actividades de cardio, perfil+bmr) y un componente de presentación HTML/SVG. Se añade un helper compartido `daysInYear`/`countTrainedDays` (nit del review de @claude en #211) usado por web **y** móvil para no duplicar la regla de calendario.

**Tech Stack:** shared (TS, `bun:test`), web (React 19 + Vite + TanStack Query + Tailwind/shadcn, Vitest), mobile (RN, jest).

**Datos confirmados (research):**
- `GET /sessions` YA devuelve `avgHr: number|null` (mobile `SessionListItem` lo tiene); el tipo web `SessionRow` solo no lo declara → agregarlo.
- `GET /cardio` devuelve `CardioActivity[]`; `CardioActivity` tiene `{ type, startedAt, durationMs, avgHr, kcal }` = exactamente `BurnActivity`.
- `useProfile()` → `TrainingProfile` con `{ sex, age, weightKg, heightCm, activityLevel }`. `useNutritionGoal()` → `NutritionGoalResult` (`status:"ok"` trae `bmr`).
- `AthleteBurnArgs = { weightKg?, age?, sex?, bmr? }` (todos opcionales).
- Motor shared (PR #211): `buildDailyBurn(sessions, activities, athlete): Map<string,DayBurn>`; `burnThresholds(allDayKcal: number[]): [n,n,n]`; `buildYearHeatmap(burnByDate, thresholds, year, nowMs?): { weeks: HeatmapCell[][] }` (marca `inYear`/`future`, recorta año en curso a la semana de hoy); `availableYears(sessions, activities): number[]`; `localDayKey(ms)`.
- Referencia visual (mobile `YearHeatmap.tsx`): `LEVEL_COLORS {0: gris/border, 1:#CFE9EA, 2:#86C6CB, 3:#2E959D, 4: teal accent}`; celda `transparent` si `!inYear || future`; leyenda `menos [0..4] más`; detalle al tocar (fecha · kcal, fuerza, cardio, minutos); grid columnas=semanas × 7 filas.

---

## ⚠️ Setup
- Worktree YA creado: `.claude/worktrees/heatmap-web` (branch `feat/heatmap-web`, off `origin/main` @ 67954ab — ya incluye el motor en shared).
- Archivos web actuales: `web/src/dashboard/ConsistencyCard.tsx` (a reescribir), `ConsistencyCard.test.tsx`, `useSessions.ts` (agregar `avgHr`), `heatmap.ts` (helpers `localDayKey`/`yearOf`/`countByLocalDay` — `countByLocalDay` queda huérfano tras el cambio; ver Task 3), `DashboardPage.tsx` (monta la card). Hooks reusables: `web/src/alimentacion/useProfile.ts`, `useNutritionGoal.ts`.

## Estructura de archivos (destino)
- `shared/src/session/heatmap.ts` — agregar `daysInYear(year)` + `countTrainedDays(burnByDate, year)` (+ tests en `heatmap.test.ts`).
- `mobile/app/(tabs)/progreso.tsx` — usar los helpers de shared en vez del cálculo inline (DRY).
- `web/src/dashboard/useSessions.ts` — `SessionRow` gana `avgHr: number | null`.
- `web/src/dashboard/useCardio.ts` — NUEVO (`GET /cardio` → `CardioActivity[]`).
- `web/src/dashboard/useHeatmapAthlete.ts` — NUEVO helper que ensambla `AthleteBurnArgs` desde profile+goal (o inline en la card; ver Task 3).
- `web/src/dashboard/YearHeatmapGrid.tsx` — NUEVO (presentación; consume el motor de shared).
- `web/src/dashboard/ConsistencyCard.tsx` — reescrito (título "Días entrenados y gasto", X/365, selector de año, leyenda).
- Tests: `ConsistencyCard.test.tsx` actualizado; opcional `YearHeatmapGrid.test.tsx`.

---

### Task 1: Helper compartido `daysInYear` + `countTrainedDays` (nit del review) + móvil lo usa

**Files:** `shared/src/session/heatmap.ts`, `shared/src/session/heatmap.test.ts`, `mobile/app/(tabs)/progreso.tsx`

- [ ] **Step 1 (TDD):** En `heatmap.test.ts` agregá casos: `daysInYear(2024)===366`, `daysInYear(2023)===365`, `daysInYear(2000)===366`, `daysInYear(1900)===365`; `countTrainedDays` cuenta solo días con `kcal>0` del año dado (armá un `Map<string,DayBurn>` con 2 días del año objetivo con kcal>0, 1 día kcal=0, y 1 día de otro año → espera 2).
- [ ] **Step 2:** Implementá en `heatmap.ts`:
```ts
export function daysInYear(year: number): number {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}
// Días con gasto > 0 dentro del año dado (el "X" del contador X/365).
export function countTrainedDays(burnByDate: Map<string, DayBurn>, year: number): number {
  let n = 0;
  for (const [date, d] of burnByDate) if (d.kcal > 0 && Number(date.slice(0, 4)) === year) n++;
  return n;
}
```
  (Ya se exportan vía `export * from "./session/heatmap"` en el barrel — verificar.)
- [ ] **Step 3:** En `mobile/app/(tabs)/progreso.tsx` reemplazá el bloque inline (`heatmapY`/`trainedDays`/`daysInYear`) por: `const heatmapY = heatmapYear ?? new Date().getFullYear(); const trainedDays = countTrainedDays(burnByDate, heatmapY); const daysInYearN = daysInYear(heatmapY);` y usá `daysInYearN` en el JSX (`{trainedDays}/{daysInYearN} días`). Importá ambos de `@pulsia/shared`.
- [ ] **Step 4:** `bun test shared` verde (nuevos casos). `cd mobile && bun run test` verde (el título "Días entrenados y gasto" intacto). `bunx tsc --noEmit` en shared y mobile.
- [ ] **Step 5:** Commit `-S`: `refactor(shared): helpers daysInYear/countTrainedDays reusables (web+móvil)`.

### Task 2: Plumbing de datos web (sesiones con avgHr + cardio)

**Files:** `web/src/dashboard/useSessions.ts`, `web/src/dashboard/useCardio.ts` (nuevo)

- [ ] **Step 1:** En `useSessions.ts`, `SessionRow` gana `avgHr: number | null;` (el backend ya lo manda; solo se declara).
- [ ] **Step 2:** Crear `useCardio.ts` (espejo de `useSessions`):
```ts
import { useQuery } from "@tanstack/react-query";
import type { CardioActivity } from "@pulsia/shared";
import { apiFetch } from "../api/client";
export function useCardio() {
  return useQuery({ queryKey: ["cardio"], queryFn: () => apiFetch<CardioActivity[]>("/cardio") });
}
```
- [ ] **Step 3 (test de la costura):** test que mockee `apiFetch` y verifique que `useCardio` pega a `/cardio` y devuelve el array (patrón de los tests de hooks existentes en web). `bun test web` (o `vitest`) verde.
- [ ] **Step 4:** Commit `-S`: `feat(web): hooks de sesiones (avgHr) y cardio para el heatmap de gasto`.

### Task 3: Componente de grilla + reescritura de la card

**Files:** `web/src/dashboard/YearHeatmapGrid.tsx` (nuevo), `web/src/dashboard/ConsistencyCard.tsx`, `web/src/dashboard/ConsistencyCard.test.tsx`, (limpiar `countByLocalDay` de `heatmap.ts` si queda sin uso)

- [ ] **Step 1: `YearHeatmapGrid.tsx`** — props `{ burnByDate: Map<string,DayBurn>; thresholds: [number,number,number]; year: number }`. Usa `buildYearHeatmap(burnByDate, thresholds, year, Date.now())`. Render: contenedor con `overflow-x: auto` (NO desbordar el body); grilla de columnas=semanas, 7 filas; cada celda un `<div>`/`<rect>` con color:
```ts
const LEVEL_COLORS = { 0: "var(--border, #e2e8f0)", 1: "#CFE9EA", 2: "#86C6CB", 3: "#2E959D", 4: "#0E7C86" } as const;
function cellColor(cell: HeatmapCell) { return (!cell.inYear || cell.future) ? "transparent" : LEVEL_COLORS[cell.level]; }
```
  Tooltip por celda (`title={\`${cell.date}: ${cell.kcal} kcal\`}`) solo si `inYear && !future`. Leyenda "menos [0..4] más" con los 5 colores. (El detalle-al-tocar del móvil es opcional; mínimo = tooltip.)
- [ ] **Step 2: Reescribir `ConsistencyCard.tsx`:**
  - Título `role="heading" aria-level={2}` = **"Días entrenados y gasto"**.
  - Data: `useSessions()`, `useCardio()`, `useProfile()`, `useNutritionGoal()`. Loading si sesiones/cardio cargan; error si fallan.
  - `athlete = { weightKg: profile?.weightKg, age: profile?.age, sex: profile?.sex, bmr: goal?.status === "ok" ? goal.bmr : null }`.
  - `canComputeBurn = profile?.weightKg != null && profile?.age != null` (paridad con el guard del móvil). Si no, empty state: "Completá peso y edad en tu perfil para ver el gasto." (o el copy que ya use la web).
  - `sessions` → map a `{ startedAt, totalDurationMs, avgHr }`; `activities` = data de `useCardio` (ya es `BurnActivity`).
  - `burnByDate = buildDailyBurn(sessionArgs, activities, athlete)`; `thresholds = burnThresholds([...burnByDate.values()].map(d => d.kcal))`.
  - `years = availableYears(sessions, activities)`; selector `<select>` (patrón actual) con estado `selectedYear`; `year = selectedYear ?? years[0] ?? new Date().getFullYear()`.
  - Contador **`{countTrainedDays(burnByDate, year)}/{daysInYear(year)} días`** (helpers de shared) arriba de la grilla.
  - Render `<YearHeatmapGrid burnByDate={burnByDate} thresholds={thresholds} year={year} />`.
  - Si `availableYears` está vacío → empty state "Todavía no hay entrenamientos registrados." (paridad móvil).
- [ ] **Step 3:** Actualizar `ConsistencyCard.test.tsx`: assert título exacto "Días entrenados y gasto"; con sesiones+perfil mockeados, que se rendericen celdas con color de nivel (no por count) y el contador X/365; empty state sin perfil. Mockear `useSessions`/`useCardio`/`useProfile`/`useNutritionGoal` (o `apiFetch`). Si `countByLocalDay` queda huérfano en `heatmap.ts`, borralo (y su test si existe) — barrel-export-muerto.
- [ ] **Step 4:** `bun test web` (vitest) verde; `cd web && bunx tsc --noEmit` sin errores; `cd web && bun run build` (Vite) OK.
- [ ] **Step 5:** Commit `-S`: `feat(web): card "Días entrenados y gasto" con paridad al móvil (gasto, futuros ocultos, X/365)`.

### Task 4: Verificación final + PR

- [ ] **Step 1:** `bun test shared` + `cd mobile && bun run test` + `bun test web` + typechecks (shared/mobile/web) + `cd web && bun run build` → todo verde. Pegá la salida.
- [ ] **Step 2:** Chequeo visual: la grilla NO desborda el body (scroll interno), no hay días futuros pintados, los colores varían por gasto.
- [ ] **Step 3: Push + PR + review:**
```bash
git push -u origin feat/heatmap-web
gh pr create --base main --title "feat(web): card 'Días entrenados y gasto' (paridad con el móvil)" --body "..."
gh pr comment <n> --body "@claude review"
```

---

## Self-Review
**Cobertura:** helper compartido (Task 1, cierra el nit de #211) + plumbing web (Task 2) + presentación/reescritura (Task 3). ✔
**Paridad:** mismo motor de shared, mismos `LEVEL_COLORS`, mismo criterio `inYear/future`, mismo contador X/365, mismo guard `canComputeBurn`. ✔
**No overflow:** contenedor `overflow-x:auto` (regla del harness: nada de scroll horizontal del body). ✔
**Riesgo:** el móvil se toca (Task 1) → requiere OTA al mergear (JS-only, runtime "11" no cambia). El backend NO cambia (endpoints ya existen) → el deploy es no-op salvo rebuild de shared.
**Seam test:** `useCardio` se testea contra `/cardio` (testear-la-costura). El `countByLocalDay` huérfano se borra (barrel-export-muerto).
