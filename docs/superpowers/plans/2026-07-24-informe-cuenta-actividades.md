# El informe cuenta las actividades importadas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el agente de informes le pase a la IA el desglose de actividades (con el nombre del perfil deportivo del reloj), para que deje de reportar "0 sesiones" cuando el usuario importó entrenamientos del `.FIT`.

**Architecture:** Dos cambios en el backend. `collect.ts` expone un campo nuevo `activities` en `ReportData`, armado desde las actividades del rango con `sportProfileName ?? CARDIO_LABELS[type]`. `report.ts` (el prompt) reemplaza la línea única de entrenamiento por un desglose que lista cada actividad en el informe diario y las agrega por nombre en el periódico. Backend puro, sin migración, sin cambios en shared ni mobile.

**Tech Stack:** TypeScript, Hono, Bun. Tests con `bun test`.

**Spec:** [`docs/superpowers/specs/2026-07-24-informe-cuenta-actividades-design.md`](../specs/2026-07-24-informe-cuenta-actividades-design.md)

---

## Contexto que el implementador necesita

**Convenciones del repo (no negociables):**

- **TDD estricto** + **verificación por mutación de cada test nuevo**: después de que un test pase, rompé a propósito el código que prueba y confirmá que se pone rojo. Si sigue verde, el test no prueba lo que dice. Este repo acumuló múltiples tests falsos, varios nacidos en planes como este — no la saltees.
- **Commits firmados**: `git commit -S`. **Nunca** `Co-Authored-By` ni atribución a Claude/Anthropic.
- Antes de correr tests: `export PATH="$HOME/.bun/bin:$PATH"`. Desde la raíz del repo: `bun test backend`.

**El bug, concreto:** los `.FIT` de fuerza se importan como `cardio_activity` con `type: "other"` y `sport_profile_name: "Fuerza"`. El informe (`report.ts`) solo reporta `sessionsCount` (que cuenta `workout_session`, no el cardio), así que la IA lee `"Entrenamiento: 0 sesión(es)"`. `collect.ts` ya calcula las actividades del día (`dayCardio`) pero solo las usa para el total de kcal — nunca se las pasa a la IA.

**Datos de referencia (prod, del owner):**
```
type   sport_profile_name  kcal  avg_hr  duración
other  Fuerza              354   134     47 min   (2026-07-23)
other  Fuerza              124   102     28 min   (2026-07-24)
```

**`CARDIO_LABELS`** (en `@pulsia/shared`, de `shared/src/schemas/cardio.ts`) mapea el `type` a su label español: `walk → "Caminata"`, `run → "Running"`, `elliptical → "Elíptica"`, `bike → "Bici"`, `swim → "Natación"`, `rowing → "Remo"`, `other → "Otro"`.

**`CardioActivity`** (shared) tiene, entre otros: `type: CardioType`, `startedAt: number`, `durationMs: number`, `avgHr: number | null`, `kcal: number | null`, `sportProfileName?: string` (optional, sin nullable — o está o se omite).

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `backend/src/reports/collect.ts` | Recolecta los datos del informe. Se agrega el campo `activities` a `ReportData` y su armado. | Modificar |
| `backend/src/reports/collect.test.ts` | Cobertura del nuevo campo. | Modificar |
| `backend/src/ai/report.ts` | Arma el prompt. `dataBlock` reemplaza la línea de entrenamiento por el desglose. | Modificar |
| `backend/src/ai/report.test.ts` | Cobertura del formato diario y periódico. | Modificar |

Dos tasks: una por capa (datos, luego prompt). La Task 2 depende del campo que crea la Task 1.

---

## Task 1: `collect.ts` expone `ReportData.activities`

**Files:**
- Modify: `backend/src/reports/collect.ts` (el tipo `ReportData` ~línea 19; el armado ~línea 104 y el `return` ~línea 116)
- Modify: `backend/src/reports/collect.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `backend/src/reports/collect.test.ts`. El archivo **ya tiene** el patrón: `baseDeps` (objeto spreadeable con todas las deps a `async () => []`), un `athlete` inline, y la firma `collectReportData({} as any, "u", 0, 10, athlete, deps as any)` con período `[0, 10]`. El segundo test existente ya usa `listCardio` con actividades y filtrado por rango — copiá ese shape. Las actividades cardio en los tests llevan el shape completo (`id, type, startedAt, durationMs, avgHr, maxHr, elevationGainM, distanceM, kcal, kcalSource, source, notes`); agregarles `sportProfileName` donde aplique.

```ts
const athleteOk = { weightKg: 80, age: 40, sex: "male", goal: { status: "ok", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: null } } as any;
const act = (o: any) => ({ id: "c", type: "walk", startedAt: 5, durationMs: 1800000, avgHr: null, maxHr: null, elevationGainM: null, distanceM: null, kcal: null, kcalSource: "device", source: "fit", notes: "", ...o });

test("activities: usa sportProfileName como nombre cuando está", async () => {
  const deps = { ...baseDeps, listCardio: async () => [act({ type: "other", durationMs: 47 * 60000, avgHr: 134, kcal: 354, sportProfileName: "Fuerza" })] };
  const data = await collectReportData({} as any, "u", 0, 10, athleteOk, deps as any);
  expect(data.activities).toHaveLength(1);
  expect(data.activities[0]).toEqual({ name: "Fuerza", durationMin: 47, kcal: 354, avgHr: 134 });
});

test("activities: fallback al label del tipo cuando no hay sportProfileName", async () => {
  const deps = { ...baseDeps, listCardio: async () => [act({ type: "walk", durationMs: 30 * 60000, avgHr: 90, kcal: 150 })] };
  const data = await collectReportData({} as any, "u", 0, 10, athleteOk, deps as any);
  expect(data.activities[0].name).toBe("Caminata");
});

test("activities: una actividad fuera del rango no entra", async () => {
  const deps = { ...baseDeps, listCardio: async () => [act({ startedAt: 999, type: "walk", sportProfileName: "Caminar" })] };
  const data = await collectReportData({} as any, "u", 0, 10, athleteOk, deps as any);
  expect(data.activities).toHaveLength(0);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test backend/src/reports/collect.test.ts`
Expected: FAIL — `data.activities` es `undefined` (la propiedad no existe todavía).

- [ ] **Step 3: Agregar el campo al tipo `ReportData`**

En `backend/src/reports/collect.ts`, dentro de `export interface ReportData` (después de `sessionsCount`):

```ts
  activities: { name: string; durationMin: number; kcal: number | null; avgHr: number | null }[];
```

- [ ] **Step 4: Armar `activities` y agregarlo al `return`**

En `collectReportData`, junto al armado de `dayCardio` (~línea 104), agregar — **sin tocar `dayCardio`**, que se sigue usando para `dayExerciseBurn`:

```ts
  const activities = allCardio
    .filter((a) => a.startedAt >= from && a.startedAt <= to)
    .sort((x, y) => x.startedAt - y.startedAt)
    .map((a) => ({
      name: a.sportProfileName ?? CARDIO_LABELS[a.type],
      durationMin: Math.round(a.durationMs / 60000),
      kcal: a.kcal,
      avgHr: a.avgHr,
    }));
```

Agregar `activities` al objeto que devuelve `collectReportData` (junto a `exercise, sessionsCount`).

Importar `CARDIO_LABELS` del import existente de `@pulsia/shared` (la primera línea de imports: `import { sumNullableMicro, dayExerciseBurn, saltGFromSodiumMg } from "@pulsia/shared";` → agregar `CARDIO_LABELS`).

- [ ] **Step 5: Correr y verificar que pasa**

Run: `bun test backend/src/reports/collect.test.ts`
Expected: PASS (los 3 nuevos + los existentes).

- [ ] **Step 6: Verificación por mutación**

1. Cambiar `a.sportProfileName ?? CARDIO_LABELS[a.type]` por `CARDIO_LABELS[a.type]` → debe fallar "usa sportProfileName".
2. Borrar el `.filter(...)` de rango → debe fallar "fuera del rango no entra".
3. Cambiar `?? CARDIO_LABELS[a.type]` por `?? "x"` → debe fallar "fallback al label del tipo".

Si alguna no rompe, el test no discrimina: arreglalo antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add backend/src/reports/collect.ts backend/src/reports/collect.test.ts
git commit -S -m "feat(informes): expone el desglose de actividades en ReportData"
```

---

## Task 2: `report.ts` muestra el desglose a la IA

**Files:**
- Modify: `backend/src/ai/report.ts` (la función `dataBlock`, la línea `- Entrenamiento: ...` ~línea 23)
- Modify: `backend/src/ai/report.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/src/ai/report.test.ts`. El fixture `data` es `any`, así que hay que agregarle `activities` (los tests existentes no lo traen — agregarlo al `data` base como `[]` para que sigan pasando, y los nuevos lo sobreescriben):

```ts
test("diario: lista cada actividad con su nombre, duración, kcal y FC", () => {
  const p = buildReportPrompt("daily", {
    ...data, periodDays: 1, sessionsCount: 0,
    activities: [
      { name: "Fuerza", durationMin: 47, kcal: 354, avgHr: 134 },
      { name: "Fuerza", durationMin: 28, kcal: 124, avgHr: 102 },
    ],
  });
  expect(p).toMatch(/Fuerza 47 min/);   // patrón completo, no el literal "Fuerza" suelto
  expect(p).toMatch(/Fuerza 28 min/);
  expect(p).toMatch(/354/);
});

test("periódico: agrega las actividades por nombre en vez de listarlas", () => {
  const p = buildReportPrompt("weekly", {
    ...data, periodDays: 7,
    activities: [
      { name: "Fuerza", durationMin: 47, kcal: 354, avgHr: 134 },
      { name: "Fuerza", durationMin: 28, kcal: 124, avgHr: 102 },
      { name: "Caminata", durationMin: 30, kcal: 150, avgHr: 90 },
    ],
  });
  expect(p).toMatch(/2×\s*Fuerza/);
  expect(p).toMatch(/1×\s*Caminata/);
  expect(p).not.toMatch(/Fuerza 47 min/); // en periódico NO se lista cada una
});

test("sin actividades no aparece la línea de actividades", () => {
  const p = buildReportPrompt("daily", { ...data, periodDays: 1, activities: [] });
  expect(p).not.toMatch(/Actividades registradas/);
});
```

**Importante:** agregar `activities: []` al objeto `data` base del archivo (línea ~5-10) para que los tests preexistentes, que no lo definen, no rompan al leer `d.activities`.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test backend/src/ai/report.test.ts`
Expected: FAIL — el prompt no contiene "Fuerza 47 min" ni el agregado "2× Fuerza".

- [ ] **Step 3: Implementar el desglose en `dataBlock`**

En `backend/src/ai/report.ts`, dentro de `dataBlock(d)`, **reemplazar** la línea:

```ts
    `- Entrenamiento: ${d.sessionsCount} sesión(es), gasto estimado ${d.exercise} kcal`,
```

por (usando `d.periodDays` para ramificar; `d.periodDays === 1` es el informe diario):

```ts
    `- Entrenamiento de fuerza (app): ${d.sessionsCount} sesión(es)`,
    activitiesLine(d),
    `- Gasto total de ejercicio: ${d.exercise} kcal`,
```

Y agregar, arriba de `dataBlock` (o como helper local del módulo), la función que arma esa línea:

```ts
// Desglose de actividades registradas/importadas (cardio + entrenamientos de fuerza importados del
// .FIT, que hoy se guardan como cardio "other" con sportProfileName="Fuerza"). En el informe diario
// se lista cada una; en el periódico se agregan por nombre para no inundar el prompt. Devuelve null
// si no hubo ninguna (la línea se filtra igual que foodNamesLine).
function activitiesLine(d: ReportData): string | null {
  if (d.activities.length === 0) return null;
  if (d.periodDays === 1) {
    const items = d.activities.map(
      (a) => `${a.name} ${a.durationMin} min (${n(a.kcal, " kcal")}, FC ${n(a.avgHr)})`,
    );
    return `- Actividades registradas/importadas: ${items.join(", ")}`;
  }
  const counts = new Map<string, number>();
  for (const a of d.activities) counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
  const agg = [...counts.entries()].map(([name, c]) => `${c}× ${name}`);
  return `- Actividades registradas/importadas: ${agg.join(", ")}`;
}
```

`activitiesLine` devuelve `string | null`, y el array de líneas de `dataBlock` ya termina en
`.filter(Boolean)` (lo usa `foodNamesLine`), así que un `null` se descarta solo. `n(...)` es el
helper ya definido en el archivo (`n(v, unit)` → `"s/d"` si es null).

- [ ] **Step 4: Correr y verificar que pasan**

Run: `bun test backend/src/ai/report.test.ts`
Expected: PASS (los 3 nuevos + los existentes con `activities: []`).

- [ ] **Step 5: Verificación por mutación**

1. Forzar la rama diaria siempre (borrar `if (d.periodDays === 1)` y dejar solo el listado) → debe fallar "periódico agrega".
2. Forzar la rama agregada siempre → debe fallar "diario lista cada actividad".
3. Cambiar `if (d.activities.length === 0) return null;` por `return null` incondicional → debe fallar "diario lista" y "periódico agrega".
4. Quitar el guard de vacío (que siempre arme la línea) → debe fallar "sin actividades no aparece la línea".

- [ ] **Step 6: Correr toda la suite del backend**

Run: `bun test backend`
Expected: todo verde. Si algún test viejo de `report.test.ts` rompe por leer `d.activities`, es porque falta el `activities: []` en el `data` base (Step 1).

- [ ] **Step 7: Commit**

```bash
git add backend/src/ai/report.ts backend/src/ai/report.test.ts
git commit -S -m "feat(informes): la IA ve el desglose de actividades importadas

El informe reportaba '0 sesiones' cuando el usuario importaba
entrenamientos del .FIT (guardados como cardio 'other'). Ahora el prompt
lista las actividades con su sportProfileName ('Fuerza'), diario por
actividad y periódico agregado por nombre."
```

---

## Task 3: PR

- [ ] **Step 1: Suite completa + push**

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun test backend
git push -u origin feat/informe-cuenta-actividades
```

- [ ] **Step 2: Abrir el PR**

```bash
gh pr create --title "feat(informes): el informe cuenta las actividades importadas del .FIT" --body "$(cat <<'EOF'
## Qué

El owner importó dos entrenamientos de fuerza (`.FIT`) y la IA no los tuvo en cuenta como entrenamientos en el informe.

## Causa (verificada en prod)

Los `.FIT` de fuerza se importan como cardio `type: "other"` (con `sport_profile_name: "Fuerza"`), y el informe solo reportaba `sessionsCount` (que cuenta `workout_session`, no el cardio). La IA leía `"Entrenamiento: 0 sesión(es), gasto 478 kcal"` — contradictorio.

## Cómo

- `collect.ts` expone `ReportData.activities` con el desglose de actividades del rango, usando `sportProfileName` como nombre (fallback al label del tipo).
- `report.ts` lista cada actividad en el informe diario y las agrega por nombre en el periódico.
- **Sin migración** (los datos ya están), backend puro → no toca el fingerprint del OTA.

## Alcance

Fix acotado del síntoma (Pieza 0). NO reclasifica: el `"other"` sigue siendo "other". Importar la fuerza como entrenamiento estructurado (series/reps/pesos + reconocer los ejercicios que dio la IA) es la Pieza 1, con su propio spec.

Spec: `docs/superpowers/specs/2026-07-24-informe-cuenta-actividades-design.md`
EOF
)"
```

- [ ] **Step 3: Disparar el review**

```bash
gh pr comment --body "@claude review"
```

⚠️ El `@claude review` es estático y no corre Bash — su LGTM no reemplaza haber ejecutado la suite.

---

## Notas de cierre para quien ejecute

- **Este plan puede tener errores.** Los últimos planes de este repo tuvieron varios, incluyendo aserciones falsas escritas en el plan y copiadas verbatim. Si un test pasa con la feature borrada, el plan está mal: arreglá el test y dejá constancia.
- **Verificá los helpers reales de los tests.** `depsWith`/`fakeDb`/`athlete` en `collect.test.ts` son ilustrativos en este plan; usá los que el archivo ya tenga. Si no hay factory de deps, inyectá solo `listCardio` y stubeá el resto a `[]`.
- **Después del merge:** el backend auto-deploya a la Pi. Verificar `/health`. No hay OTA (no cambió nada del móvil). El owner puede regenerar el informe del 2026-07-23/24 para ver el efecto.
- **Pieza 1 pendiente:** parsear la fuerza del `.FIT` (series/reps/pesos), reconocer los ejercicios del programa activo, y decidir dónde se guarda (`workout_session` vs estructura propia). Tiene su propio brainstorming.
