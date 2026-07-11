# Datos de actividad y salud — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar métricas diarias (pasos, pisos, sueño+calidad, FC reposo, estrés/ánimo/energía) con backfill por fecha, hacer el peso single-source (Progreso canónico), y agregar sexo opcional al perfil.

**Architecture:** Los tipos de métrica nuevos viven en el modelo tipado extensible de `shared` (sin migración). El resumen para la IA (`progress.ts`) separa métricas de **tendencia** (delta) de **flujo diario** (promedio 7 días + umbrales). El peso deja de duplicarse: se saca del prompt y el perfil queda como fallback. La UI de Progreso suma dos secciones con un selector de fecha **JS puro** (OTA-safe). Sexo = enum opcional en el perfil.

**Tech Stack:** `shared`/`backend` (TS, `bun test`), `mobile` (Expo/RN, jest `--runInBand`). Rama `feat/datos-actividad-salud` (spec ya commiteado). TDD, commits firmados (`-S`, sin atribución). Ejecución por capas: shared → backend → mobile.

**Entrega:** backend auto-deploya en el merge; mobile por OTA a vc8. **No agregar deps nativas** (rompería el OTA).

---

## CAPA 1 — shared

### Task 1: Tipos de métrica nuevos + `FLOW_METRIC_TYPES` + sexo (TDD)

**Files:**
- Modify: `shared/src/schemas/metrics.ts`
- Modify: `shared/src/schemas/profile.ts`
- Test: `shared/src/schemas/metrics.test.ts` (existe; agregar casos) y `shared/src/schemas/profile.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `shared/src/schemas/metrics.test.ts` agregar:
```ts
import { METRIC_TYPES, METRIC_UNITS, METRIC_LABELS, METRIC_RANGES, ACTIVITY_METRIC_TYPES, SUBJECTIVE_METRIC_TYPES, FLOW_METRIC_TYPES, BodyMetricEntrySchema } from "./metrics";

test("los tipos nuevos están en METRIC_TYPES y cubiertos por units/labels/ranges", () => {
  for (const t of [...ACTIVITY_METRIC_TYPES, ...SUBJECTIVE_METRIC_TYPES]) {
    expect(METRIC_TYPES).toContain(t);
    expect(METRIC_UNITS[t]).toBeDefined();
    expect(METRIC_LABELS[t]).toBeDefined();
    expect(METRIC_RANGES[t]).toBeDefined();
  }
});

test("FLOW_METRIC_TYPES = actividad + subjetivo", () => {
  expect(new Set(FLOW_METRIC_TYPES)).toEqual(new Set([...ACTIVITY_METRIC_TYPES, ...SUBJECTIVE_METRIC_TYPES]));
});

test("valida rango de una métrica nueva (steps)", () => {
  expect(BodyMetricEntrySchema.safeParse({ metricType: "steps", value: 8000 }).success).toBe(true);
  expect(BodyMetricEntrySchema.safeParse({ metricType: "sleep_hours", value: 30 }).success).toBe(false);
});
```
En `shared/src/schemas/profile.test.ts` agregar:
```ts
test("sex es opcional y valida el enum", () => {
  expect(TrainingProfileSchema.safeParse({ ...baseProfile, sex: "female" }).success).toBe(true);
  expect(TrainingProfileSchema.safeParse({ ...baseProfile }).success).toBe(true); // sin sex
  expect(TrainingProfileSchema.safeParse({ ...baseProfile, sex: "otro" }).success).toBe(false);
});
```
(Usar el `baseProfile` válido que ya exista en ese test; si no hay, construir uno mínimo válido con los campos requeridos.)

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/schemas/metrics.test.ts shared/src/schemas/profile.test.ts`
Expected: FAIL (símbolos/campo no existen).

- [ ] **Step 3: Implementar en `metrics.ts`**

Agregar después de `BP_METRIC_TYPES`:
```ts
export const ACTIVITY_METRIC_TYPES = ["steps", "floors", "sleep_hours", "sleep_quality", "resting_hr"] as const;
export const SUBJECTIVE_METRIC_TYPES = ["stress", "mood", "energy"] as const;
// Métricas de "flujo diario" (promedio reciente, NO delta de tendencia).
export const FLOW_METRIC_TYPES = [...ACTIVITY_METRIC_TYPES, ...SUBJECTIVE_METRIC_TYPES] as const;
```
Cambiar `METRIC_TYPES`:
```ts
export const METRIC_TYPES = [...BODY_METRIC_TYPES, ...BP_METRIC_TYPES, ...ACTIVITY_METRIC_TYPES, ...SUBJECTIVE_METRIC_TYPES] as const;
```
Extender los 4 records con las entradas nuevas:
```ts
// en METRIC_UNITS:
  steps: "pasos", floors: "pisos", sleep_hours: "h", sleep_quality: "/5", resting_hr: "bpm",
  stress: "/5", mood: "/5", energy: "/5",
// en METRIC_LABELS:
  steps: "Pasos", floors: "Pisos", sleep_hours: "Sueño", sleep_quality: "Calidad de sueño", resting_hr: "FC en reposo",
  stress: "Estrés", mood: "Ánimo", energy: "Energía",
// en METRIC_RANGES:
  steps: [0, 100000], floors: [0, 500], sleep_hours: [0, 24], sleep_quality: [1, 5], resting_hr: [30, 120],
  stress: [1, 5], mood: [1, 5], energy: [1, 5],
```

- [ ] **Step 4: Implementar en `profile.ts`**

Agregar el enum y el campo en `TrainingProfileSchema`:
```ts
export const SexSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);
```
Dentro del objeto (p.ej. después de `experience`/`goal`):
```ts
  sex: SexSchema.optional(),
```

- [ ] **Step 5: Correr los tests + suite shared**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared`
Expected: verde (incluidos los casos nuevos).

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas/metrics.ts shared/src/schemas/profile.ts shared/src/schemas/metrics.test.ts shared/src/schemas/profile.test.ts
git commit -S -m "feat(shared): métricas de actividad/subjetivas (flow) + sexo opcional en el perfil"
```

---

## CAPA 2 — backend

### Task 2: `progress.ts` — flujo diario (promedio + umbrales) + peso fallback (TDD)

**Files:**
- Modify: `backend/src/ai/progress.ts`
- Modify (callers): `backend/src/memory/service.ts`, `backend/src/programs/generateJob.ts`, `backend/src/routes/programs.ts`
- Test: `backend/src/ai/progress.test.ts` (existe; agregar casos)

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/src/ai/progress.test.ts`:
```ts
const day = 24 * 60 * 60 * 1000;

test("métricas de flujo: promedio reciente (7 días) y umbrales, no delta", () => {
  const NOW = 1_000 * day;
  const out = buildProgressSummary({
    metrics: [
      { id: "1", metricType: "steps", value: 6000, measuredAt: NOW - 1 * day },
      { id: "2", metricType: "steps", value: 10000, measuredAt: NOW - 2 * day },
      { id: "3", metricType: "sleep_hours", value: 5, measuredAt: NOW - 1 * day },
      { id: "4", metricType: "sleep_hours", value: 8, measuredAt: NOW - 2 * day },
    ],
    sessions: [], heightCm: null, nowMs: NOW,
  });
  expect(out).toContain("Pasos: ~8000"); // promedio de 6000 y 10000
  expect(out).toContain("1 de 2 días < 8.000"); // umbral pasos
  expect(out).toContain("1 de 2 noches < 6 h"); // umbral sueño
});

test("peso: usa el profileWeightKg de fallback cuando no hay medición weight_kg", () => {
  const NOW = 1_000 * day;
  const out = buildProgressSummary({ metrics: [], sessions: [], heightCm: 180, nowMs: NOW, profileWeightKg: 80 });
  expect(out).toContain("80"); // el peso semilla aparece (línea de peso / IMC)
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/ai/progress.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar en `progress.ts`**

1. Import de los sets:
```ts
import { METRIC_LABELS, METRIC_UNITS, computePerformanceTrends, FLOW_METRIC_TYPES } from "@pulsia/shared";
```
2. Constantes arriba:
```ts
const FLOW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SLEEP_MIN_H = 6;
const STEPS_MIN = 8000;
const FLOW_SET = new Set<MetricType>(FLOW_METRIC_TYPES);
```
3. `metricLine` (delta) queda SOLO para tendencia. Agregar `flowLine`:
```ts
// Métrica de flujo diario: promedio en la ventana corta + señal de umbral (sueño/pasos).
function flowLine(type: MetricType, points: BodyMetric[], nowMs: number): string | null {
  const since = nowMs - FLOW_WINDOW_MS;
  const recent = points.filter((p) => p.measuredAt >= since);
  if (recent.length === 0) return null;
  const avg = recent.reduce((s, p) => s + p.value, 0) / recent.length;
  let line = `${METRIC_LABELS[type]}: ~${fmt(avg)} ${METRIC_UNITS[type]} (prom. últimos 7 días)`;
  if (type === "sleep_hours") {
    const bad = recent.filter((p) => p.value < SLEEP_MIN_H).length;
    if (bad > 0) line += `; ${bad} de ${recent.length} noches < 6 h`;
  }
  if (type === "steps") {
    const bad = recent.filter((p) => p.value < STEPS_MIN).length;
    if (bad > 0) line += `; ${bad} de ${recent.length} días < 8.000`;
  }
  return line;
}
```
4. En el cuerpo, al armar `bodyLines`, separar trend vs flow. El loop actual sobre `byType` (construido con `recentMetrics` de 8 semanas) debe **saltar** los flow types; y agregar un loop de flow sobre TODAS las métricas (no solo las de 8 semanas — usar `input.metrics`, la ventana corta la aplica `flowLine`):
```ts
  const bodyLines: string[] = [];
  for (const [type, pts] of byType) {
    if (FLOW_SET.has(type)) continue; // las flow van aparte
    const line = metricLine(type, pts);
    if (line) bodyLines.push(line);
  }
  // Flow (diarias): promedio 7 días desde TODAS las métricas, no solo la ventana de 8 sem.
  const flowByType = new Map<MetricType, BodyMetric[]>();
  for (const m of input.metrics) {
    if (!FLOW_SET.has(m.metricType)) continue;
    const arr = flowByType.get(m.metricType) ?? [];
    arr.push(m); flowByType.set(m.metricType, arr);
  }
  for (const t of FLOW_METRIC_TYPES) {
    const pts = flowByType.get(t);
    if (pts) { const l = flowLine(t, pts, input.nowMs); if (l) bodyLines.push(l); }
  }
```
5. Peso fallback: agregar `profileWeightKg?: number | null` al input type. En el bloque de IMC/peso, si no hay `weight_kg` en la ventana pero sí `profileWeightKg`, usarlo como último peso:
```ts
  const weightPts = byType.get("weight_kg");
  const lastW = (weightPts && weightPts.length > 0)
    ? [...weightPts].sort((a, b) => a.measuredAt - b.measuredAt).at(-1)!.value
    : (input.profileWeightKg ?? null);
  if (lastW != null) {
    // línea de peso si no vino ya por metricLine (cuando el peso salió del fallback)
    if (!weightPts || weightPts.length === 0) bodyLines.unshift(`${METRIC_LABELS["weight_kg"]}: ${fmt(lastW)} ${METRIC_UNITS["weight_kg"]}`);
    if (input.heightCm && input.heightCm > 0) {
      const bmi = lastW / (input.heightCm / 100) ** 2;
      bodyLines.push(`IMC: ${bmi.toFixed(1)}`);
    }
  }
```
(Reemplaza el bloque de IMC anterior que solo miraba `weightPts`.)

- [ ] **Step 4: Actualizar los 3 callers para pasar `profileWeightKg`**

- `backend/src/programs/generateJob.ts:32` y `backend/src/routes/programs.ts:49`: agregar `profileWeightKg: profile.weightKg ?? null` al objeto.
- `backend/src/memory/service.ts:42`: ese caller tiene `heightCm` pero verificar si tiene el profile a mano; si tiene `profile`, pasar `profileWeightKg: profile.weightKg ?? null`; si no, pasar `profileWeightKg: null` (no rompe).

- [ ] **Step 5: Correr los tests + suite backend**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test backend && (cd backend && bunx tsc --noEmit)`
Expected: verde, typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/progress.ts backend/src/memory/service.ts backend/src/programs/generateJob.ts backend/src/routes/programs.ts backend/src/ai/progress.test.ts
git commit -S -m "feat(backend): resumen de flujo diario (promedio+umbrales) + peso fallback del perfil"
```

### Task 3: `prompt.ts` — sacar el peso duplicado + sumar sexo (TDD)

**Files:**
- Modify: `backend/src/ai/prompt.ts`
- Test: `backend/src/ai/prompt.test.ts` (existe; ajustar/agregar)

- [ ] **Step 1: Escribir/ajustar los tests**

En `backend/src/ai/prompt.test.ts`:
- Ajustar el test "incluye edad/peso/altura" → el prompt **ya NO debe incluir la línea de peso** del perfil (`expect(prompt).not.toContain("- Peso:")`), pero sí edad y altura.
- Agregar:
```ts
test("incluye el sexo cuando está presente", () => {
  const prompt = buildGenerationPrompt({ ...profile, sex: "female" });
  expect(prompt).toContain("Sexo: femenino");
});
test("no incluye línea de sexo cuando no está", () => {
  const prompt = buildGenerationPrompt({ ...profile });
  expect(prompt).not.toContain("Sexo:");
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/ai/prompt.test.ts`

- [ ] **Step 3: Implementar en `prompt.ts`**

- Borrar la línea `...(profile.weightKg != null ? [\`- Peso: ${profile.weightKg} kg\`] : []),`.
- Agregar el mapeo y la línea de sexo (después de `Objetivo`):
```ts
const SEX_ES: Record<string, string> = { male: "masculino", female: "femenino", other: "otro", prefer_not_to_say: "prefiere no decir" };
```
```ts
    ...(profile.sex != null ? [`- Sexo: ${SEX_ES[profile.sex]}`] : []),
```

- [ ] **Step 4: Correr los tests + suite backend**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test backend && (cd backend && bunx tsc --noEmit)`

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/prompt.ts backend/src/ai/prompt.test.ts
git commit -S -m "feat(backend): sacar peso duplicado del prompt + sumar sexo"
```

---

## CAPA 3 — mobile

### Task 4: builders de form genéricos + helper de fecha puro (TDD)

**Files:**
- Modify: `mobile/src/session/metricForm.ts`
- Create: `mobile/src/session/metricDate.ts`
- Test: `mobile/__tests__/metricForm.test.ts` (existe; agregar), `mobile/__tests__/metric-date.test.ts` (nuevo)

- [ ] **Step 1: Tests que fallan**

`mobile/__tests__/metric-date.test.ts`:
```ts
import { dayAtNoon } from "../src/session/metricDate";

test("dayAtNoon(0) = mediodía de hoy", () => {
  const now = new Date(2026, 6, 11, 9, 30).getTime(); // 11 jul 09:30 local
  const d = new Date(dayAtNoon(0, now));
  expect(d.getHours()).toBe(12);
  expect(d.getDate()).toBe(11);
});

test("dayAtNoon(2) = mediodía de hace 2 días", () => {
  const now = new Date(2026, 6, 11, 9, 30).getTime();
  const d = new Date(dayAtNoon(2, now));
  expect(d.getDate()).toBe(9);
  expect(d.getHours()).toBe(12);
});
```
En `mobile/__tests__/metricForm.test.ts` agregar (builder genérico para actividad):
```ts
import { buildReadingForTypes } from "../src/session/metricForm";
import { ACTIVITY_METRIC_TYPES } from "@pulsia/shared";

test("buildReadingForTypes arma una lectura con la fecha dada", () => {
  const { reading } = buildReadingForTypes({ steps: "8000", sleep_hours: "7" }, ACTIVITY_METRIC_TYPES, 555);
  expect(reading?.measuredAt).toBe(555);
  expect(reading?.entries).toEqual([
    { metricType: "steps", value: 8000 },
    { metricType: "sleep_hours", value: 7 },
  ]);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd mobile && npm test -- --runInBand metric-date metricForm`

- [ ] **Step 3: Implementar**

`mobile/src/session/metricDate.ts`:
```ts
// Mediodía local del día `offsetDays` hacia atrás desde `now` (bucket diario sin líos de TZ).
export function dayAtNoon(offsetDays: number, now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() - offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

// Label corto del día (p.ej. "hoy", "ayer", o "mié 9 jul").
export function dayLabel(offsetDays: number, now: number): string {
  if (offsetDays === 0) return "hoy";
  if (offsetDays === 1) return "ayer";
  const d = new Date(dayAtNoon(offsetDays, now));
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}
```
En `metricForm.ts`, agregar el builder genérico (reutilizable) — parametriza sobre una lista de tipos:
```ts
export function buildReadingForTypes(
  form: Partial<Record<MetricType, string>>,
  types: readonly MetricType[],
  measuredAt: number,
): BuildReadingResult {
  const entries: { metricType: MetricType; value: number }[] = [];
  const invalid: MetricType[] = [];
  for (const t of types) {
    const raw = form[t]?.trim();
    if (!raw) continue;
    const value = Number(raw);
    const [min, max] = METRIC_RANGES[t];
    if (!Number.isFinite(value) || value < min || value > max) { invalid.push(t); continue; }
    entries.push({ metricType: t, value });
  }
  return { reading: entries.length ? { measuredAt, entries } : null, invalid };
}
```

- [ ] **Step 4: Verde**

Run: `cd mobile && npm test -- --runInBand metric-date metricForm && bunx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/metricForm.ts mobile/src/session/metricDate.ts mobile/__tests__/metric-date.test.ts mobile/__tests__/metricForm.test.ts
git commit -S -m "feat(mobile): builder de form genérico + helper de fecha (backfill)"
```

### Task 5: Progreso — secciones de actividad/subjetivo + selector de fecha (TDD)

**Files:**
- Modify: `mobile/app/(tabs)/progreso.tsx`
- Test: agregar a `mobile/__tests__` un test de la carga agrupada (modelar el test de presión existente, si hay; si no, un test que verifique que al enviar el form de actividad se persiste una `MetricReading` con la fecha seleccionada).

- [ ] **Step 1: Test que falla**

Modelar el patrón del test de carga existente (buscar en `mobile/__tests__/` cómo se testea `progreso`/BP; si no hay, testear vía `buildReadingForTypes` + el estado de fecha). Caso mínimo: seleccionar "ayer" y cargar `steps=8000` → el reading persistido tiene `measuredAt === dayAtNoon(1, now)` y la entry de steps.

- [ ] **Step 2: Implementar la UI**

En `mobile/app/(tabs)/progreso.tsx`:
1. Imports: `ACTIVITY_METRIC_TYPES, SUBJECTIVE_METRIC_TYPES` de `@pulsia/shared`; `buildReadingForTypes` de metricForm; `dayAtNoon, dayLabel` de metricDate.
2. Estado: `const [dayOffset, setDayOffset] = useState(0)` (compartido por las secciones diarias), y forms `const [actForm, setActForm] = useState<Partial<Record<MetricType,string>>>({})` y `const [subjForm, setSubjForm] = useState({})`.
3. **Fila de fecha** (arriba de las secciones diarias): `◀`  `{dayLabel(dayOffset, Date.now())}`  `▶` + botón "Hoy". `▶` deshabilitado si `dayOffset === 0` (no futuro); `◀` hace `setDayOffset(o => o + 1)`; `▶` hace `setDayOffset(o => Math.max(0, o - 1))`; "Hoy" → `setDayOffset(0)`.
4. **Sección "Actividad y recuperación"** y **"Cómo te sentís"**: replicar la estructura visual del bloque de Presión (título + inputs numéricos por métrica + botón Guardar). Cada input usa `METRIC_LABELS[t]`/`METRIC_UNITS[t]` y `keyboardType="numeric"`. El submit:
```ts
const measuredAt = dayAtNoon(dayOffset, Date.now());
const { reading, invalid } = buildReadingForTypes(actForm, ACTIVITY_METRIC_TYPES, measuredAt);
if (reading) { await putMetrics(reading); /* refrescar + limpiar actForm */ }
```
(usar la misma fn de guardado que ya usa el form de presión/composición — ver cómo se llama `putMetrics`/`saveReading` en el archivo).
5. Las cards de "valor actual" y las tendencias ya mapean sobre los tipos → aparecen solas; si el UI mapea explícitamente sobre `BODY_METRIC_TYPES`, extenderlo para incluir también `ACTIVITY_METRIC_TYPES`/`SUBJECTIVE_METRIC_TYPES` en las cards/tendencias (agrupadas por sección si conviene).

- [ ] **Step 3: Verde + typecheck**

Run: `cd mobile && npm test -- --runInBand progreso && bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(tabs)/progreso.tsx" mobile/__tests__/
git commit -S -m "feat(mobile): Progreso — actividad/subjetivo + selector de fecha (backfill)"
```

### Task 6: Perfil — sexo (chips) + peso relabel/última medición (TDD)

**Files:**
- Modify: `mobile/app/(tabs)/perfil.tsx`
- Test: `mobile/__tests__/perfil.test.tsx` (existe; agregar)

- [ ] **Step 1: Test que falla**

Agregar a `mobile/__tests__/perfil.test.tsx`: al elegir un sexo en los chips y guardar, el perfil persistido incluye `sex` con el valor elegido (modelar el patrón de guardado existente del test — cómo verifica que se guardó experience/goal).

- [ ] **Step 2: Implementar**

En `mobile/app/(tabs)/perfil.tsx`:
1. `const SEX = [{ value: "male", label: "Masculino" }, { value: "female", label: "Femenino" }, { value: "other", label: "Otro" }, { value: "prefer_not_to_say", label: "Prefiero no decir" }];`
2. Estado `const [sex, setSex] = useState<string | undefined>(undefined)`; cargar de `p.sex` en el efecto de carga; incluir `sex: sex as any` en el objeto que se guarda (solo si está definido — o mandarlo undefined, el schema lo tolera).
3. Un `<View><Text style={label}>Sexo</Text><ChipGroup single options={SEX} selected={sex} onChange={setSex} /></View>` (mirror de Experiencia/Objetivo; verificar la prop exacta de `ChipGroup` — `selected`/`value`/`onChange`).
4. Relabelar el campo de peso: `Peso kg (opc.)` → `Peso inicial (se actualiza con tus mediciones)`. (Opcional, si es barato: mostrar el último `weight_kg` de `getLatestMetrics()`/`GET /metrics/latest` como referencia; si complica, dejar solo el relabel en esta tanda y anotarlo.)

- [ ] **Step 3: Verde + typecheck**

Run: `cd mobile && npm test -- --runInBand perfil && bunx tsc --noEmit`

- [ ] **Step 4: Suite mobile completa**

Run: `cd mobile && npm test -- --runInBand`
Expected: toda verde.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/perfil.tsx" mobile/__tests__/perfil.test.tsx
git commit -S -m "feat(mobile): sexo (opcional) en el perfil + relabel del peso"
```

---

## Self-review — cobertura del spec

- Métricas nuevas (actividad + subjetivo) sin migración → Task 1. ✓
- Sexo opcional en el perfil → Task 1 (schema) + Task 6 (UI) + Task 3 (prompt). ✓
- Resumen flow vs trend (promedio 7 días + umbrales sueño/pasos) → Task 2. ✓
- Peso single-source (fuera del prompt + fallback del perfil) → Task 2 + Task 3. ✓
- Progreso: 2 secciones + selector de fecha JS puro (backfill) → Task 5 (+ builder/fecha en Task 4). ✓
- Sin deps nativas (OTA-safe) → helper de fecha JS puro, sin date picker. ✓
- Entrega OTA + deploy → todo JS/backend. ✓
