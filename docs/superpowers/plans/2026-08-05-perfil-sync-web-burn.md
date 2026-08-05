# PR3 — Sincronizar el perfil al backend + la web usa peso real para el heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que el heatmap "Días entrenados y gasto" de la **web** deje de mostrar "Completá peso y edad…" cuando el usuario ya cargó esos datos en el móvil. Causa raíz: el `TrainingProfile` (edad/sexo/altura/nivel) vive **solo en AsyncStorage del teléfono** — el móvil nunca hace `PUT /profile` al backend — y mi card web leía `profile.weightKg` en vez de la última medición `weight_kg` (que sí está en el backend, como hace el móvil).

**Fix (2 partes):**
1. **Móvil:** al guardar el perfil hace `PUT /profile` al backend; y al abrir la app, si el backend no tiene perfil pero el teléfono sí, lo sube una vez (auto-sync). AsyncStorage queda como caché offline.
2. **Web:** la card toma el peso de `GET /metrics/latest` (`weight_kg`), no de `profile.weightKg`; `canComputeBurn = pesoMétrica != null && profile?.age != null` (paridad con el móvil).

**Architecture:** El backend YA tiene la tabla `profiles` + ruta `GET/PUT /profile` (`backend/src/routes/profile.ts`) y `GET /metrics/latest` (`backend/src/routes/metrics.ts:41`). No hay cambios de backend. El móvil hoy: `perfil.tsx onSave` → `setProfile()` (AsyncStorage local, `mobile/src/storage/profile.ts`) + registra `weight_kg` como métrica; NUNCA PUT al backend. `mobile/app/(tabs)/progreso.tsx` arma `canComputeBurn = burnWeightKg != null && burnProfile?.age != null`, con `burnWeightKg` = última métrica `weight_kg` y `burnProfile` = `getProfile()` local.

**Tech Stack:** mobile (RN + Expo Router, jest), web (React 19 + Vite + TanStack Query, Vitest). Backend sin cambios.

**Datos confirmados (research):**
- `mobile/src/api/client.ts` `apiFetch(baseUrl, path, opts?) → Promise<Response>` (se chequea `res.ok`/`res.status`), patrón en `mobile/src/api/cardio.ts`.
- `mobile/src/storage/profile.ts`: `getProfile(): Promise<TrainingProfile|null>` (AsyncStorage), `setProfile(p)`.
- `getBackendUrl()` en `mobile/src/storage/config` (lo usa progreso). Auth via `AuthContext`; `apiFetch` ya adjunta el token.
- `mobile/app/_layout.tsx` `Guarded()` tiene `useAuth().status` (`"in"` = autenticado) — lugar del auto-sync.
- Backend `GET /metrics/latest` → `Partial<Record<MetricType,{value:number;measuredAt:number}>>` (mobile `getLatestMetrics`).
- Web `apiFetch<T>(path, opts?)` (distinto del móvil: sin baseUrl); hooks en `web/src/dashboard/` (`useMetric` ya arma `/metrics?...`).

---

## ⚠️ Setup
- Worktree YA creado: `.claude/worktrees/perfil-sync` (branch `feat/perfil-sync-web-burn`, off `origin/main` @ 0992ef9). Si falta `node_modules`, `bun install`.
- Web test runner: `cd web && bunx vitest run` (NO `bun test web`). Mobile: `cd mobile && bun run test` (jest). Shared: `bun test ./shared`.

## Estructura de archivos (destino)
- `mobile/src/api/profile.ts` — NUEVO (`putProfile`, `getBackendProfile`).
- `mobile/src/profile/syncProfile.ts` — NUEVO (`syncProfileToBackend`) + `syncProfile.test.ts`.
- `mobile/app/(tabs)/perfil.tsx` — `onSave` hace `PUT /profile` (best-effort).
- `mobile/app/_layout.tsx` — auto-sync al pasar a `status === "in"`.
- `web/src/dashboard/useLatestMetrics.ts` — NUEVO (+ test) `GET /metrics/latest`.
- `web/src/dashboard/ConsistencyCard.tsx` — peso desde la métrica; `canComputeBurn` con métrica; incluir la query en loading/error.
- `web/src/dashboard/ConsistencyCard.test.tsx` — actualizar (mockear `/metrics/latest`).

---

### Task 1: Móvil — API `/profile` + auto-sync + PUT al guardar

**Files:** `mobile/src/api/profile.ts` (nuevo), `mobile/src/profile/syncProfile.ts` (+test, nuevos), `mobile/app/(tabs)/perfil.tsx`, `mobile/app/_layout.tsx`

- [ ] **Step 1: `mobile/src/api/profile.ts`** (calcá el estilo de `mobile/src/api/cardio.ts`):
```ts
import { apiFetch } from "./client";
import type { TrainingProfile } from "@pulsia/shared";

// Sube el perfil al backend (upsert por usuario). Fuente de verdad para la web.
export async function putProfile(baseUrl: string, profile: TrainingProfile): Promise<void> {
  const res = await apiFetch(baseUrl, "/profile", { method: "PUT", body: JSON.stringify(profile) });
  if (!res.ok) throw new Error("No se pudo sincronizar el perfil");
}

// Lee el perfil del backend. 404 (sin perfil) → null; otros errores lanzan.
export async function getBackendProfile(baseUrl: string): Promise<TrainingProfile | null> {
  const res = await apiFetch(baseUrl, "/profile");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("No se pudo leer el perfil del backend");
  return (await res.json()) as TrainingProfile;
}
```
- [ ] **Step 2 (TDD): `mobile/src/profile/syncProfile.ts` + `syncProfile.test.ts`.** Helper testeable (la costura), con las deps inyectables para poder mockear sin red:
```ts
import { getProfile } from "../storage/profile";
import { getBackendProfile, putProfile } from "../api/profile";

// Backfill de una sola vía: si hay perfil local pero el backend no tiene ninguno, lo sube.
// Si el backend ya tiene perfil, no toca nada (los cambios posteriores viajan por putProfile
// en el guardado). Best-effort: cualquier error se traga (offline / sin backend configurado).
export async function syncProfileToBackend(baseUrl: string): Promise<void> {
  try {
    const local = await getProfile();
    if (!local) return;
    const remote = await getBackendProfile(baseUrl);
    if (remote == null) await putProfile(baseUrl, local);
  } catch {
    /* offline o backend caído: se reintenta en el próximo arranque */
  }
}
```
  Test con jest: mockeá `../storage/profile` y `../api/profile`. Casos: (a) local existe + backend 404 → llama `putProfile` con el local; (b) local existe + backend ya tiene → NO llama `putProfile`; (c) sin local → NO llama `getBackendProfile` ni `putProfile`; (d) `getBackendProfile` lanza → no propaga (best-effort). Seguí el patrón de mocks de los tests jest existentes en `mobile/src`.
- [ ] **Step 3: `perfil.tsx onSave`** — después de `await setProfile(parsed.data)` (local), agregá un PUT best-effort al backend (no romper el guardado si falla, igual que hace hoy con la métrica de peso). Reusá el `url = backendUrl.current` que ya calcula la función. P.ej. tras el bloque de peso:
```ts
if (url) { try { await putProfile(url, parsed.data); } catch { /* se sincroniza en el próximo arranque */ } }
```
  Importá `putProfile` de `../../src/api/profile`. NO cambies la lógica del `setProfile` local ni la métrica de peso.
- [ ] **Step 4: `_layout.tsx`** — auto-sync al autenticarse. En `Guarded()` agregá un `useEffect` que, cuando `status === "in"`, obtenga el backend URL (`getBackendUrl()` de `../src/storage/config`) y llame `void syncProfileToBackend(url)` (best-effort, sin await bloqueante, sin romper si no hay URL). Import de `syncProfileToBackend` de `../src/profile/syncProfile`. Cuidá las deps del effect (`[status]`).
- [ ] **Step 5: Verificar** — `cd mobile && bun run test` (jest, incluye el nuevo `syncProfile.test.ts` y que `perfil`/layout compilen) + `bunx tsc --noEmit`. Pegá la salida.
- [ ] **Step 6: Commit `-S`** (sin atribución): `feat(mobile): sincronizar el perfil al backend (PUT al guardar + auto-sync al abrir)`.

### Task 2: Web — peso desde la métrica + card corregida

**Files:** `web/src/dashboard/useLatestMetrics.ts` (+test, nuevos), `web/src/dashboard/ConsistencyCard.tsx`, `web/src/dashboard/ConsistencyCard.test.tsx`

- [ ] **Step 1: `useLatestMetrics.ts`** (espejo de `useSessions`/`useCardio`):
```ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export type LatestMetrics = Record<string, { value: number; measuredAt: number } | undefined>;

// GET /metrics/latest → último valor por tipo de métrica. El heatmap de gasto usa weight_kg
// (misma fuente que el móvil: el "peso actual" es la última medición, no el del perfil).
export function useLatestMetrics() {
  return useQuery({ queryKey: ["metrics-latest"], queryFn: () => apiFetch<LatestMetrics>("/metrics/latest") });
}
```
  Test (patrón de `useCardio.test.tsx`): mock de `fetch`/`apiFetch`, verifica que pega a `/metrics/latest` y devuelve el mapa.
- [ ] **Step 2: `ConsistencyCard.tsx`** — cambios:
  - `const latestQ = useLatestMetrics();`
  - Incluir en estado: `isLoading = ... || latestQ.isLoading`, `isError = ... || latestQ.isError`.
  - `const weightKg = latestQ.data?.weight_kg?.value;`
  - `athlete = { weightKg, age: profile?.age, sex: profile?.sex, bmr: goal?.status === "ok" ? goal.bmr : null };` (peso desde la métrica, NO `profile?.weightKg`).
  - `const canComputeBurn = weightKg != null && profile?.age != null;` (paridad exacta con `mobile/app/(tabs)/progreso.tsx:232`).
  - Empty state sin datos: texto actual "Completá peso y edad en tu perfil para ver el gasto." se mantiene (ahora se dispara solo si realmente falta la métrica de peso o la edad).
  - El resto (buildDailyBurn/thresholds/years/contador/grid) igual.
- [ ] **Step 3: `ConsistencyCard.test.tsx`** — el mock por-URL ahora debe responder también `/metrics/latest`. Actualizá: el caso "perfil completo" pasa `weight_kg` en `/metrics/latest` (y `age` en `/profile`) → renderiza contador + celdas; el caso "empty" devuelve `/metrics/latest` sin `weight_kg` (o `{}`) → muestra el mensaje. OJO: el perfil del backend puede NO tener `weightKg` (ahora es irrelevante para el burn); el test no debe depender de `profile.weightKg`.
- [ ] **Step 4: Verificar** — `cd web && bunx vitest run` + `bunx tsc --noEmit` + `bun run build`. Pegá la salida.
- [ ] **Step 5: Commit `-S`**: `fix(web): el heatmap toma el peso de la última medición (paridad con el móvil)`.

### Task 3: Verificación final + PR

- [ ] **Step 1:** `cd mobile && bun run test` + `cd web && bunx vitest run` + typechecks (mobile/web) + `cd web && bun run build` → todo verde. Pegá la salida.
- [ ] **Step 2: Push + PR + review:**
```bash
git push -u origin feat/perfil-sync-web-burn
gh pr create --base main --title "feat: sincronizar el perfil al backend → la web ve peso/edad para el heatmap de gasto" --body "..."
gh pr comment <n> --body "@claude review"
```

---

## Self-Review
**Causa raíz atacada:** el perfil ahora llega al backend (PUT al guardar + backfill on-open), y la web usa la métrica de peso real. ✔
**Paridad:** `canComputeBurn` idéntico al móvil (peso-métrica + edad-perfil). ✔
**Sin romper offline:** todo best-effort; AsyncStorage sigue siendo la caché; el guardado del perfil no falla si el backend está caído. ✔
**Seam test:** `syncProfileToBackend` se testea con las 4 ramas (backfill/ya-existe/sin-local/error). `useLatestMetrics` contra `/metrics/latest`. ✔
**Riesgo:** toca móvil (→ OTA JS-only, runtime "11") y web (→ deploy no-op salvo rebuild). Backend sin cambios. El auto-sync sube el perfil UNA vez (backend 404); ediciones posteriores viajan por el PUT-al-guardar.
**bmr:** la web sigue tomando `bmr` del goal existente (best-effort); el burn principal usa peso+HR, así que basta para mostrar el heatmap. Afinar el bmr con la métrica de peso queda fuera de alcance.
