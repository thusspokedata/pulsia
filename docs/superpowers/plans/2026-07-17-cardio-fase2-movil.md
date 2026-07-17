# Cardio — Fase 2 (móvil: registro manual + historial unificado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para ejecutar tarea por tarea. Steps con checkbox (`- [ ]`).

**Goal:** Que el usuario pueda **cargar a mano** una actividad de cardio (caminata/running/elíptica/…) desde el móvil, y que el **Historial** pase a ser la línea de tiempo de TODO (fuerza + cardio).

**Architecture:** Cliente API `cardio.ts` que espeja `sessions.ts`. Pantalla stack `cardio.tsx` (alta nueva + ver/editar una existente por `?id=`). Función pura `buildTimeline` que mergea `SessionListItem[]` + `CardioActivity[]` en un array discriminado ordenado por `startedAt` desc. `historial.tsx` carga ambas fuentes y renderiza la lista unificada. **Sin dep nativa nueva → OTA a vc10.**

**Tech Stack:** Expo SDK 57 + expo-router + React Native + jest. Backend de cardio (fase 1) ya mergeado y deployado.

**Spec:** `docs/superpowers/specs/2026-07-17-cardio-actividades-import-fit-design.md`

**Alcance:** SOLO registro manual + historial unificado + ver/editar/borrar. **NO** incluye el import `.FIT` (fase 3) ni el wiring del balance energético (fase 4). Las actividades manuales **no tienen `hrSeries`**, así que en esta fase el detalle no dibuja curva de FC (eso llega con el import en la fase 3).

---

## Convenciones (no se negocian)
- **TDD** + **verificación por mutación** de cada test nuevo (romper el código y confirmar que el test se queja; revertir). Reportar cada mutación.
- Tests del móvil: `cd mobile && npx jest <patrón>` (jest-expo). Tests en `mobile/__tests__/`, NUNCA en `mobile/app/`.
- Commits firmados `-S`, **sin** atribución a Claude/Anthropic.
- `zod` no resuelve desde `mobile/` → validar con los schemas de `@pulsia/shared`, no `import { z }`.

## File Structure
| archivo | responsabilidad |
|---|---|
| `mobile/src/api/cardio.ts` (crear) | cliente API: list/create/get/update/delete |
| `mobile/__tests__/cardio-api.test.ts` (crear) | tests del cliente (mock de fetch) |
| `mobile/src/session/timeline.ts` (crear) | `buildTimeline` puro + tipo `TimelineItem` |
| `mobile/__tests__/timeline.test.ts` (crear) | tests puros de `buildTimeline` |
| `mobile/app/cardio.tsx` (crear) | pantalla de alta + ver/editar |
| `mobile/app/(tabs)/historial.tsx` (modificar) | lista unificada fuerza + cardio |

---

## Task 1: Cliente API de cardio

**Files:** Create `mobile/src/api/cardio.ts`, Create `mobile/__tests__/cardio-api.test.ts`

Espeja `mobile/src/api/sessions.ts` (mismo estilo `apiFetch` + `throw new Error`) y `mobile/src/api/ecg.ts`.

- [ ] **Step 1: test primero** — Crear `mobile/__tests__/cardio-api.test.ts`, espejando `mobile/__tests__/sessions-api.test.ts` (mock de `global.fetch`, `afterEach` limpia `global.fetch`). UUID válido para el id.

```ts
import { listCardio, createCardio, deleteCardio } from "../src/api/cardio";

const AID = "11111111-1111-4111-8111-111111111111";
const activity = {
  id: AID, type: "walk" as const, startedAt: 1784000000000, durationMs: 1800000,
  distanceM: 2500, avgHr: null, maxHr: null, elevationGainM: null,
  kcal: null, kcalSource: "estimate" as const, source: "manual" as const, notes: "",
};

afterEach(() => { (global.fetch as any) = undefined; });

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = jest.fn().mockResolvedValue({ ok, status, json: async () => body });
  (global.fetch as any) = fn;
  return fn;
}

test("listCardio hace GET /cardio y devuelve el array", async () => {
  const fn = mockFetch([activity]);
  const res = await listCardio("http://x");
  expect(res).toEqual([activity]);
  expect(fn.mock.calls[0][0]).toBe("http://x/cardio");
});

test("createCardio hace POST /cardio con el body", async () => {
  const fn = mockFetch({ id: AID });
  await createCardio("http://x", activity);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe("http://x/cardio");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual(activity);
});

test("createCardio lanza en 409 (duplicado)", async () => {
  mockFetch({ error: "Ya importaste esta actividad" }, false, 409);
  await expect(createCardio("http://x", activity)).rejects.toThrow();
});

test("deleteCardio hace DELETE /cardio/:id", async () => {
  const fn = mockFetch({ id: AID });
  await deleteCardio("http://x", AID);
  const [url, init] = fn.mock.calls[0];
  expect(url).toBe(`http://x/cardio/${AID}`);
  expect(init.method).toBe("DELETE");
});
```

- [ ] **Step 2: verlo fallar** — `cd mobile && npx jest cardio-api` → FAIL (módulo no existe).

- [ ] **Step 3: implementar** — Crear `mobile/src/api/cardio.ts`:

```ts
import { apiFetch } from "./client";
import type { CardioActivity } from "@pulsia/shared";

export async function listCardio(baseUrl: string, from?: number, to?: number): Promise<CardioActivity[]> {
  const qs = from != null && to != null ? `?from=${from}&to=${to}` : "";
  const res = await apiFetch(baseUrl, `/cardio${qs}`);
  if (!res.ok) throw new Error("No se pudieron cargar las actividades");
  return (await res.json()) as CardioActivity[];
}

export async function createCardio(baseUrl: string, activity: CardioActivity): Promise<{ id: string }> {
  const res = await apiFetch(baseUrl, "/cardio", { method: "POST", body: JSON.stringify(activity) });
  if (!res.ok) {
    if (res.status === 409) throw new Error("Ya existe una actividad en ese momento");
    throw new Error("No se pudo guardar la actividad");
  }
  return (await res.json()) as { id: string };
}

export async function getCardioById(baseUrl: string, id: string): Promise<CardioActivity> {
  const res = await apiFetch(baseUrl, `/cardio/${id}`);
  if (!res.ok) throw new Error("No se pudo cargar la actividad");
  return (await res.json()) as CardioActivity;
}

export async function updateCardio(
  baseUrl: string, id: string,
  patch: Partial<Pick<CardioActivity, "type" | "durationMs" | "distanceM" | "notes">>,
): Promise<void> {
  const res = await apiFetch(baseUrl, `/cardio/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!res.ok) throw new Error("No se pudo actualizar la actividad");
}

export async function deleteCardio(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/cardio/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("No se pudo borrar la actividad");
}
```

- [ ] **Step 4: verde** — `npx jest cardio-api` → PASS (4).
- [ ] **Step 5: mutación** — en `createCardio`, quitar el `if (!res.ok)` (devolver siempre) → falla "lanza en 409". Revertir. En `listCardio`, cambiar el path a `/cardios` → falla "GET /cardio". Revertir. Reportar.
- [ ] **Step 6: commit** — `git add mobile/src/api/cardio.ts mobile/__tests__/cardio-api.test.ts && git commit -S -m "feat(cardio): cliente API móvil de actividades"`

---

## Task 2: `buildTimeline` (función pura)

**Files:** Create `mobile/src/session/timeline.ts`, Create `mobile/__tests__/timeline.test.ts`

Mergea las dos fuentes del historial en un array discriminado. Espeja el estilo puro de `mobile/__tests__/metric-date.test.ts`.

- [ ] **Step 1: test primero** — Crear `mobile/__tests__/timeline.test.ts`:

```ts
import { buildTimeline } from "../src/session/timeline";

const session = (id: string, startedAt: number) => ({
  id, programId: "p", dayLabel: "Día 1", location: "gym" as const,
  startedAt, totalDurationMs: 3600000, completionPct: 100, avgHr: null,
});
const cardio = (id: string, startedAt: number) => ({
  id, type: "walk" as const, startedAt, durationMs: 1800000, distanceM: 2000,
  avgHr: null, maxHr: null, elevationGainM: null, kcal: null,
  kcalSource: "estimate" as const, source: "manual" as const, notes: "",
});

test("mergea ambas fuentes ordenadas por startedAt desc", () => {
  const t = buildTimeline([session("s1", 1000), session("s2", 3000)], [cardio("c1", 2000)]);
  expect(t.map((i) => i.id)).toEqual(["s2", "c1", "s1"]);
});

test("cada ítem lleva su discriminante kind", () => {
  const t = buildTimeline([session("s1", 1000)], [cardio("c1", 2000)]);
  expect(t.find((i) => i.id === "c1")!.kind).toBe("cardio");
  expect(t.find((i) => i.id === "s1")!.kind).toBe("session");
});

test("listas vacías → []", () => {
  expect(buildTimeline([], [])).toEqual([]);
});

test("solo cardio, sin sesiones", () => {
  const t = buildTimeline([], [cardio("c1", 5000), cardio("c2", 1000)]);
  expect(t.map((i) => i.id)).toEqual(["c1", "c2"]);
});
```

- [ ] **Step 2: verlo fallar** — `npx jest timeline` → FAIL.

- [ ] **Step 3: implementar** — Crear `mobile/src/session/timeline.ts`:

```ts
import type { CardioActivity } from "@pulsia/shared";
import type { SessionListItem } from "../api/sessions";

export type TimelineItem =
  | { kind: "session"; id: string; startedAt: number; session: SessionListItem }
  | { kind: "cardio"; id: string; startedAt: number; activity: CardioActivity };

// Línea de tiempo unificada del historial (fuerza + cardio), más reciente primero.
export function buildTimeline(sessions: SessionListItem[], activities: CardioActivity[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...sessions.map((s): TimelineItem => ({ kind: "session", id: s.id, startedAt: s.startedAt, session: s })),
    ...activities.map((a): TimelineItem => ({ kind: "cardio", id: a.id, startedAt: a.startedAt, activity: a })),
  ];
  return items.sort((a, b) => b.startedAt - a.startedAt);
}
```

- [ ] **Step 4: verde** — `npx jest timeline` → PASS (4).
- [ ] **Step 5: mutación** — cambiar el sort a `a.startedAt - b.startedAt` (asc) → falla "desc". Revertir. Sacar el spread de `activities` → falla "solo cardio". Revertir. Reportar.
- [ ] **Step 6: commit** — `git add mobile/src/session/timeline.ts mobile/__tests__/timeline.test.ts && git commit -S -m "feat(cardio): buildTimeline — historial unificado fuerza + cardio"`

---

## Task 3: Pantalla `cardio.tsx` (alta + ver/editar)

**Files:** Create `mobile/app/cardio.tsx`

Ruta stack (expo-router file-based, como `ecg.tsx` — **no** hace falta tocar `_layout.tsx`). Se navega con `router.push("/cardio")` (alta nueva) o `router.push(\`/cardio?id=<id>\`)` (ver/editar). Molde de UI: `ecg.tsx` (header, botón primario `colors.accent`, `useScreenPadding`). Chips: `ChipGroup single`. Fecha: patrón de `progreso.tsx` (`dayAtNoon`/`dayLabel` de `src/session/metricDate.ts`, `Math.max(0, ...)` para no ir al futuro). ID nuevo: `newSessionId()` de `src/session/id.ts` (es un UUID v4, sirve).

**Esta pantalla no tiene lógica pura nueva testeable en aislamiento** (es UI + llamadas al cliente ya testeado). Por eso NO lleva test unitario propio; se valida con typecheck + el smoke del historial (Task 4) + prueba manual del usuario. Si al implementar aparece un helper puro no trivial (p.ej. parseo/validación de la duración), extraelo a `src/cardio/` con su test + mutación.

- [ ] **Step 1: implementar la pantalla**. Requisitos concretos:
  - Lee `useLocalSearchParams<{ id?: string }>()`. Si hay `id`: `getCardioById` al montar → modo **ver/editar** (precarga los campos, botón "Guardar cambios" → `updateCardio` con el patch de type/durationMs/distanceM/notes, botón "Borrar" con `Alert.alert` → `deleteCardio` → `router.back()`). Sin `id`: modo **alta nueva**.
  - Campos del alta: **Tipo** (`ChipGroup single`, `options = CARDIO_TYPES.map(t => ({ value: t, label: CARDIO_LABELS[t] }))`), **Duración** (input numérico en minutos → `durationMs = minutos * 60000`, obligatorio y > 0), **Distancia** (input opcional en metros o km — elegí una unidad y rotulala; si km, `distanceM = Math.round(km*1000)`), **FC media** (input opcional → `avgHr`), **fecha** (navegador `◀ día ▶ + Hoy`, `startedAt = dayAtNoon(dayOffset, Date.now())`), **notas** (opcional).
  - Guardar (alta): construir el `CardioActivity` completo con `id: newSessionId()`, `source: "manual"`, `kcalSource: "estimate"` (el server lo re-deriva igual), campos opcionales ausentes = `null`, `hrSeries` omitido, `notes` = "" si vacío. **Validar con `CardioActivitySchema.safeParse` antes de mandar** (no `import { z }`); si falla, mostrar el error y no enviar. Luego `createCardio(baseUrl, activity)` → `router.back()`.
  - baseUrl: `getBackendUrl()` (de `src/storage/config`), guardado en un `useRef`; si no hay, error "Configurá el backend".
  - Estados: guardando (deshabilita el botón, `ActivityIndicator`), error visible (`colors.danger`).
  - testIDs: `cardio-save`, `cardio-delete`, `cardio-duration`, `cardio-distance`, `cardio-hr`, y los chips salen con `chip-<type>` del `ChipGroup`.

- [ ] **Step 2: typecheck** — `cd mobile && npx tsc --noEmit` → limpio. (No hay test unitario de la pantalla; el typecheck + Task 4 la cubren.)
- [ ] **Step 3: commit** — `git add mobile/app/cardio.tsx && git commit -S -m "feat(cardio): pantalla de alta manual + ver/editar actividad"`

---

## Task 4: Historial unificado

**Files:** Modify `mobile/app/(tabs)/historial.tsx`

Hoy `historial.tsx` (192 líneas) carga solo `getSessions` y renderiza `SessionListItem[]`. Pasa a cargar **ambas** fuentes, mergear con `buildTimeline`, y renderizar la lista unificada con ícono por tipo. Al tocar un ítem de cardio → `router.push(\`/cardio?id=<id>\`)`. Los ítems de fuerza siguen abriendo el detalle inline existente (sin cambios).

- [ ] **Step 1: extraer la fila a un componente** — Crear el componente de fila (en el mismo archivo o en `mobile/src/components/`) que reciba un `TimelineItem` y renderice:
  - **session**: como hoy (dayLabel, fecha, ⏱ duración, %, 🗑). testIDs `hist-item-<id>`, `hist-pct-<id>`, `hist-del-<id>`.
  - **cardio**: ícono por tipo (mapa emoji: walk 🚶, run 🏃, elliptical 🏋 o el que corresponda, bike 🚴, swim 🏊, rowing 🚣, other 🤸) + `CARDIO_LABELS[type]`, fecha, ⏱ duración (reusar `fmt`), distancia si `distanceM != null` (formatear a km), y 🗑. testIDs `cardio-item-<id>`, `cardio-del-<id>`.

- [ ] **Step 2: cargar ambas fuentes** — En el `useFocusEffect`, `Promise.all([getSessions(url), listCardio(url)])`; construir `buildTimeline(sessions, cardios)`; el dedupe por ref (`JSON.stringify`) ahora serializa el timeline. Guardar el timeline en estado.

- [ ] **Step 3: render + navegación** — Mapear el timeline: fila `session` → `onPress` abre el detalle inline (`onOpen`, sin cambios); fila `cardio` → `onPress` hace `router.push(\`/cardio?id=<id>\`)`; el 🗑 de cardio → `Alert.alert` → `deleteCardio` → recargar (actualizar `lastLoaded.current` como hace el borrado de sesión). Estado vacío: "Todavía no hay actividad".

- [ ] **Step 4: botón "Registrar actividad"** — Agregar en la vista de lista (arriba de la lista) un botón que haga `router.push("/cardio")` (alta nueva). testID `cardio-add`.

- [ ] **Step 5: smoke test del render** — Agregar un test en `mobile/__tests__/` que renderice `historial.tsx` con `getSessions`/`listCardio` mockeados devolviendo una sesión + una actividad, y verifique que aparecen ambos ítems (por testID `hist-item-*` y `cardio-item-*`) ordenados. Seguí el patrón de mock de un test de pantalla existente (buscá uno que mockee expo-router + los clientes API). **Verificá por mutación** (romper el merge → el ítem de cardio no aparece).

- [ ] **Step 6: typecheck + suite** — `cd mobile && npx tsc --noEmit` limpio, `npx jest historial timeline cardio-api --runInBand` verde, y `npx jest --runInBand` sin regresiones.
- [ ] **Step 7: commit** — `git add mobile/app/\(tabs\)/historial.tsx mobile/__tests__/ && git commit -S -m "feat(cardio): historial unificado (fuerza + cardio) con buildTimeline"`

---

## Task 5: PR

- [ ] **Step 1** — `git push -u origin feat/cardio-fase2-movil`
- [ ] **Step 2** — `gh pr create` con título "feat(cardio): fase 2 — registro manual + historial unificado (móvil)" y cuerpo explicando: alta manual (`cardio.tsx`), historial unificado (`buildTimeline`), sin dep nativa → **OTA a vc10**, y que el import `.FIT` (fase 3) + wiring del balance (fase 4) quedan pendientes.
- [ ] **Step 3** — `gh pr comment --body "@claude review"`. Menores → fix + merge; Mayores → fix + nuevo review.

---

## Self-review del plan
- **Cobertura del spec §9 (UI):** historial unificado (Task 4) + pantalla de alta (Task 3) ✓. §5/§6 (kcal/balance) son fase 4, fuera de alcance (declarado). §7 (import) es fase 3.
- **Sin placeholders:** cada task de lógica tiene test + código. La pantalla (Task 3) es UI sin lógica pura testeable → typecheck + smoke del historial, declarado explícitamente (no es un hueco, es dónde vive la verificación).
- **Consistencia de tipos:** `TimelineItem` (Task 2) es lo que consume la fila (Task 4). `CardioActivity`/`CARDIO_LABELS` de `@pulsia/shared`. `listCardio`/`createCardio`/`deleteCardio` (Task 1) usados por Tasks 3-4.
