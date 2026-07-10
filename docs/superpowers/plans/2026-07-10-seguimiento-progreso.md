# Seguimiento de progreso cuantitativo (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la app una serie temporal de métricas corporales (carga manual) + tendencias de rendimiento derivadas de las sesiones ya guardadas, mostrarlas en un tab "Progreso", y que la IA observe un resumen numérico del progreso al generar planes.

**Architecture:** Filas tipadas `body_metric` en Postgres (Drizzle) + endpoints REST bajo `auth`. Cómputo de tendencias **puro en `@pulsia/shared`** (testeable), consumido por el backend (endpoint `/progress/performance` + resumen para la IA). El resumen numérico se inyecta en el prompt de generación y en el refresh de memoria — solo en esos momentos, nunca reactivo. Mobile: tab nuevo con charts en `react-native-svg` (OTA, sin lib nativa).

**Tech Stack:** Bun, Hono, Drizzle/Postgres, Zod (`@pulsia/shared`), `@anthropic-ai/sdk`, Expo/expo-router, react-native-svg, jest / bun test.

**Referencias de patrón (leer antes de codear):** `backend/src/routes/memory.ts` (route), `backend/src/memory/repository.ts` (repo), `backend/src/sessions/repository.ts` (`getRecentSessions`, `rowsToSession`), `backend/src/ai/prompt.ts` + `backend/src/ai/history.ts` (prompts), `backend/src/programs/generateJob.ts` (ensamblado de contexto), `backend/src/app.ts` (registro de rutas + `auth`), `mobile/src/api/sessions.ts` (cliente), `mobile/app/(tabs)/_layout.tsx` (tabs), `mobile/app/memoria.tsx` (patrón de pantalla + `getBackendUrl`), `mobile/src/session/summary.ts` (convención de volumen), `mobile/src/theme/tokens.ts`.

**Convenciones del repo:** commits firmados `git commit -S`, sin atribución a Claude. Tests backend/shared: `bun test`. Tests mobile: `cd mobile && npm test -- --runInBand`. Una rama por PR; los PRs van a review de CodeRabbit antes de merge.

---

## PR-1 — shared + backend: datos & tendencias

Rama: `feat/progreso-backend-datos`

### Task 1: Schemas de métricas en shared

**Files:**
- Create: `shared/src/schemas/metrics.ts`
- Modify: `shared/src/index.ts` (agregar `export * from "./schemas/metrics";`)
- Test: `shared/src/schemas/metrics.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// shared/src/schemas/metrics.test.ts
import { expect, test } from "bun:test";
import {
  METRIC_TYPES, METRIC_UNITS, METRIC_LABELS,
  MetricTypeSchema, BodyMetricEntrySchema, MetricReadingSchema,
} from "./metrics";

test("METRIC_TYPES cubre los 6 tipos y tiene unidad + label cada uno", () => {
  expect(METRIC_TYPES).toEqual([
    "weight_kg", "body_fat_pct", "skeletal_muscle_mass_kg",
    "bone_mass_kg", "body_water_pct", "waist_cm",
  ]);
  for (const t of METRIC_TYPES) {
    expect(METRIC_UNITS[t]).toBeTruthy();
    expect(METRIC_LABELS[t]).toBeTruthy();
  }
});

test("MetricTypeSchema rechaza tipos desconocidos", () => {
  expect(MetricTypeSchema.safeParse("weight_kg").success).toBe(true);
  expect(MetricTypeSchema.safeParse("bmi").success).toBe(false);
});

test("BodyMetricEntrySchema valida el rango por tipo", () => {
  expect(BodyMetricEntrySchema.safeParse({ metricType: "weight_kg", value: 80 }).success).toBe(true);
  expect(BodyMetricEntrySchema.safeParse({ metricType: "weight_kg", value: 5 }).success).toBe(false); // < 20
  expect(BodyMetricEntrySchema.safeParse({ metricType: "body_fat_pct", value: 90 }).success).toBe(false); // > 70
});

test("MetricReadingSchema exige al menos una entry y acepta measuredAt opcional", () => {
  expect(MetricReadingSchema.safeParse({ entries: [] }).success).toBe(false);
  const ok = MetricReadingSchema.safeParse({
    measuredAt: 1_700_000_000_000,
    entries: [{ metricType: "weight_kg", value: 80 }, { metricType: "waist_cm", value: 85 }],
  });
  expect(ok.success).toBe(true);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `bun test shared/src/schemas/metrics.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// shared/src/schemas/metrics.ts
import { z } from "zod";

export const METRIC_TYPES = [
  "weight_kg", "body_fat_pct", "skeletal_muscle_mass_kg",
  "bone_mass_kg", "body_water_pct", "waist_cm",
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const MetricTypeSchema = z.enum(METRIC_TYPES);

export const METRIC_UNITS: Record<MetricType, string> = {
  weight_kg: "kg", body_fat_pct: "%", skeletal_muscle_mass_kg: "kg",
  bone_mass_kg: "kg", body_water_pct: "%", waist_cm: "cm",
};

export const METRIC_LABELS: Record<MetricType, string> = {
  weight_kg: "Peso", body_fat_pct: "% grasa", skeletal_muscle_mass_kg: "Masa muscular",
  bone_mass_kg: "Masa ósea", body_water_pct: "Agua corporal", waist_cm: "Cintura",
};

// Rangos sanos para atajar typos de carga (no son límites médicos).
export const METRIC_RANGES: Record<MetricType, [number, number]> = {
  weight_kg: [20, 400], body_fat_pct: [2, 70], skeletal_muscle_mass_kg: [5, 100],
  bone_mass_kg: [0.5, 10], body_water_pct: [20, 80], waist_cm: [30, 250],
};

export const BodyMetricEntrySchema = z
  .object({ metricType: MetricTypeSchema, value: z.number() })
  .refine(
    (e) => {
      const [min, max] = METRIC_RANGES[e.metricType];
      return e.value >= min && e.value <= max;
    },
    { message: "valor fuera de rango para la métrica" },
  );
export type BodyMetricEntry = z.infer<typeof BodyMetricEntrySchema>;

// Payload de carga: una lectura (fecha común) con N métricas. measuredAt en epoch ms
// (convención del resto de la app; ver workoutSession.startedAt).
export const MetricReadingSchema = z.object({
  measuredAt: z.number().int().optional(),
  entries: z.array(BodyMetricEntrySchema).min(1),
});
export type MetricReading = z.infer<typeof MetricReadingSchema>;

// Fila persistida / devuelta por el backend.
export const BodyMetricSchema = z.object({
  id: z.string().uuid(),
  metricType: MetricTypeSchema,
  value: z.number(),
  measuredAt: z.number().int(),
});
export type BodyMetric = z.infer<typeof BodyMetricSchema>;
```

Y en `shared/src/index.ts` agregar la línea `export * from "./schemas/metrics";`.

- [ ] **Step 4: Correr el test**

Run: `bun test shared/src/schemas/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/schemas/metrics.ts shared/src/schemas/metrics.test.ts shared/src/index.ts
git commit -S -m "feat(shared): schemas de métricas corporales (tipos, unidades, rangos)"
```

### Task 2: Cómputo puro de tendencias de rendimiento en shared

**Files:**
- Create: `shared/src/progress/trends.ts`
- Modify: `shared/src/index.ts` (agregar `export * from "./progress/trends";`)
- Test: `shared/src/progress/trends.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// shared/src/progress/trends.test.ts
import { expect, test } from "bun:test";
import type { WorkoutSession } from "../schemas/session";
import { estimate1RM, computePerformanceTrends } from "./trends";

test("estimate1RM usa Epley: w*(1+reps/30)", () => {
  expect(estimate1RM(100, 0)).toBeCloseTo(100, 5);
  expect(estimate1RM(100, 5)).toBeCloseTo(116.667, 2);
});

function session(id: string, startedAt: number, sets: { w: number | null; reps: number; skipped?: boolean }[]): WorkoutSession {
  return {
    id, programId: "00000000-0000-4000-8000-000000000000", weekNumber: 1,
    dayLabel: "Día 1", location: "gym", startedAt, endedAt: startedAt + 1000,
    totalDurationMs: 1000, notes: "",
    exercises: [{
      catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", order: 0,
      planned: { sets: sets.length, reps: "5", targetLoad: "", restSeconds: 90 },
      skipped: false, note: "", substitutedFromId: null,
      sets: sets.map((s, i) => ({
        setNumber: i + 1, reps: s.reps, weightKg: s.w, rpe: null,
        startedAt, endedAt: startedAt + 500, durationMs: 500, repTimestamps: [],
        hrAvg: null, hrMax: null, skipped: s.skipped ?? false,
      })),
    }],
  };
}

test("computePerformanceTrends: 1RMe por sesión, volumen, PRs; excluye bodyweight/skipped", () => {
  const s1 = session("11111111-1111-4111-8111-111111111111", 1000, [{ w: 80, reps: 5 }, { w: 0, reps: 10 }]);
  const s2 = session("22222222-2222-4222-8222-222222222222", 2000, [{ w: 90, reps: 3 }, { w: 100, reps: 1, skipped: true }]);
  const t = computePerformanceTrends([s2, s1]); // desordenadas a propósito

  const bench = t.perExercise.find((e) => e.catalogId === "barbell_bench_press")!;
  expect(bench.points.map((p) => p.measuredAt)).toEqual([1000, 2000]); // ordenadas asc
  expect(bench.points[0].topSetWeightKg).toBe(80); // el set de w:0 no cuenta
  expect(bench.points[0].est1RM).toBeCloseTo(estimate1RM(80, 5), 3);
  expect(bench.points[1].topSetWeightKg).toBe(90); // el skipped no cuenta

  expect(t.volumeSeries).toEqual([
    { measuredAt: 1000, volumeKg: 400 }, // 80*5 (bodyweight cuenta 0)
    { measuredAt: 2000, volumeKg: 270 }, // 90*3
  ]);

  const pr = t.prs.find((p) => p.catalogId === "barbell_bench_press")!;
  expect(pr.heaviestKg).toBe(90);
});

test("computePerformanceTrends: perExercise solo incluye ejercicios con >=2 puntos", () => {
  const s1 = session("11111111-1111-4111-8111-111111111111", 1000, [{ w: 80, reps: 5 }]);
  const t = computePerformanceTrends([s1]);
  expect(t.perExercise.length).toBe(0); // un solo punto → sin tendencia
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `bun test shared/src/progress/trends.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// shared/src/progress/trends.ts
import type { WorkoutSession } from "../schemas/session";

// Epley. reps 0 → devuelve el peso.
export function estimate1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export interface Perf1RMPoint { measuredAt: number; est1RM: number; topSetWeightKg: number; reps: number }
export interface ExercisePerfTrend { catalogId: string; garminName: string; points: Perf1RMPoint[] }
export interface VolumePoint { measuredAt: number; volumeKg: number }
export interface ExercisePR { catalogId: string; garminName: string; best1RM: number; heaviestKg: number }
export interface PerformanceTrends {
  perExercise: ExercisePerfTrend[];
  volumeSeries: VolumePoint[];
  prs: ExercisePR[];
}

// Una serie "de trabajo" válida para fuerza: con carga y reps, no saltada.
function isWorkingSet(s: WorkoutSession["exercises"][number]["sets"][number]): boolean {
  return !s.skipped && s.weightKg != null && s.weightKg > 0 && s.reps > 0;
}

export function computePerformanceTrends(sessions: WorkoutSession[]): PerformanceTrends {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);

  const perExMap = new Map<string, ExercisePerfTrend>();
  const prMap = new Map<string, ExercisePR>();
  const volumeSeries: VolumePoint[] = [];

  for (const s of sorted) {
    let sessionVolume = 0;
    for (const ex of s.exercises) {
      let best: { est1RM: number; w: number; reps: number } | null = null;
      for (const set of ex.sets) {
        if (set.weightKg != null && !set.skipped) sessionVolume += set.reps * set.weightKg;
        if (!isWorkingSet(set)) continue;
        const est = estimate1RM(set.weightKg as number, set.reps);
        if (!best || est > best.est1RM) best = { est1RM: est, w: set.weightKg as number, reps: set.reps };
      }
      if (best) {
        const trend = perExMap.get(ex.catalogId) ?? { catalogId: ex.catalogId, garminName: ex.garminName, points: [] };
        trend.points.push({ measuredAt: s.startedAt, est1RM: best.est1RM, topSetWeightKg: best.w, reps: best.reps });
        perExMap.set(ex.catalogId, trend);

        const pr = prMap.get(ex.catalogId) ?? { catalogId: ex.catalogId, garminName: ex.garminName, best1RM: 0, heaviestKg: 0 };
        pr.best1RM = Math.max(pr.best1RM, best.est1RM);
        pr.heaviestKg = Math.max(pr.heaviestKg, best.w);
        prMap.set(ex.catalogId, pr);
      }
    }
    volumeSeries.push({ measuredAt: s.startedAt, volumeKg: sessionVolume });
  }

  const perExercise = [...perExMap.values()]
    .filter((e) => e.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length); // más frecuentes primero

  return { perExercise, volumeSeries, prs: [...prMap.values()] };
}
```

Y en `shared/src/index.ts` agregar `export * from "./progress/trends";`.

- [ ] **Step 4: Correr el test**

Run: `bun test shared/src/progress/trends.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/progress/trends.ts shared/src/progress/trends.test.ts shared/src/index.ts
git commit -S -m "feat(shared): cómputo puro de tendencias de rendimiento (1RMe, volumen, PRs)"
```

### Task 3: Tabla body_metric + migración

**Files:**
- Modify: `backend/src/db/schema.ts` (agregar tabla `bodyMetric`)
- Generar: migración drizzle (será `0007_*.sql`) vía `bun run db:generate`

- [ ] **Step 1: Agregar la tabla al schema**

En `backend/src/db/schema.ts`, después de `athleteMemory`:

```ts
export const bodyMetric = pgTable("body_metric", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  metricType: text("metric_type").notNull(),
  value: doublePrecision("value").notNull(),
  measuredAt: bigint("measured_at", { mode: "number" }).notNull(), // epoch ms
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUserTypeTime: index("body_metric_user_type_time_idx").on(t.userId, t.metricType, t.measuredAt),
}));
```

Agregar `index` al import de `drizzle-orm/pg-core` (la primera línea del archivo): `import { pgTable, uuid, text, jsonb, timestamp, integer, bigint, boolean, doublePrecision, index } from "drizzle-orm/pg-core";`

- [ ] **Step 2: Generar la migración**

Run: `cd backend && bun run db:generate`
Expected: crea `backend/drizzle/0007_*.sql` con el `CREATE TABLE "body_metric"` + índice. Verificar el SQL a ojo.

- [ ] **Step 3: Verificar el SQL generado (sin aplicar)**

`db:generate` es offline (diffea el schema contra `drizzle/meta/`). NO correr `db:migrate` local (la Postgres de dev puede no estar levantada; la migración se aplica sola en el deploy — el contenedor auto-migra). Abrir el `0007_*.sql` generado y confirmar a ojo: `CREATE TABLE "body_metric"` con las columnas correctas + el índice + la FK a `users` con `on delete cascade`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -S -m "feat(backend): tabla body_metric + migración 0007"
```

### Task 4: Repositorio de métricas

**Files:**
- Create: `backend/src/metrics/repository.ts`
- Test: `backend/src/metrics/repository.test.ts`

- [ ] **Step 1: Escribir el test que falla**

⚠️ **Convención del repo (importante):** los tests de backend NO usan una DB real. Testean funciones **puras** o pasan un `db` **falso** con los métodos stubbeados (ver `backend/src/sessions/repository.test.ts` y `backend/src/app.test.ts`). Acá: se extrae la lógica pura (`pickLatestPerType`, y el armado de filas en `insertReading`) y se testea con un `db` falso que captura/devuelve lo necesario.

```ts
// backend/src/metrics/repository.test.ts
import { expect, test } from "bun:test";
import { insertReading, getMetrics, deleteMetric, pickLatestPerType } from "./repository";

test("insertReading arma una fila por entry con measuredAt común y mapea al shape compartido", async () => {
  let captured: any[] = [];
  const db: any = { insert: () => ({ values: (v: any[]) => { captured = v; return { returning: async () => v.map((r, i) => ({ id: `id-${i}`, ...r })) }; } }) };
  const rows = await insertReading(db, "u1", {
    measuredAt: 1000,
    entries: [{ metricType: "weight_kg", value: 80 }, { metricType: "waist_cm", value: 85 }],
  });
  expect(captured.length).toBe(2);
  expect(captured.every((r) => r.measuredAt === 1000 && r.userId === "u1")).toBe(true);
  expect(rows[0]).toEqual({ id: "id-0", metricType: "weight_kg", value: 80, measuredAt: 1000 });
});

test("getMetrics mapea filas de la DB al shape BodyMetric", async () => {
  const dbRows = [{ id: "a", userId: "u1", metricType: "weight_kg", value: 79, measuredAt: 3000, createdAt: new Date() }];
  const db: any = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => dbRows }) }) }) };
  const series = await getMetrics(db, "u1", { type: "weight_kg" });
  expect(series).toEqual([{ id: "a", metricType: "weight_kg", value: 79, measuredAt: 3000 }]);
});

test("pickLatestPerType elige el más reciente por tipo (filas ordenadas desc)", () => {
  const rows = [
    { metricType: "weight_kg", value: 79, measuredAt: 3000 },
    { metricType: "weight_kg", value: 80, measuredAt: 1000 },
    { metricType: "waist_cm", value: 85, measuredAt: 2000 },
  ] as any;
  const latest = pickLatestPerType(rows);
  expect(latest.weight_kg).toEqual({ value: 79, measuredAt: 3000 });
  expect(latest.waist_cm).toEqual({ value: 85, measuredAt: 2000 });
});

test("deleteMetric devuelve true/false según haya borrado", async () => {
  const dbHit: any = { delete: () => ({ where: () => ({ returning: async () => [{ id: "x" }] }) }) };
  const dbMiss: any = { delete: () => ({ where: () => ({ returning: async () => [] }) }) };
  expect(await deleteMetric(dbHit, "u1", "x")).toBe(true);
  expect(await deleteMetric(dbMiss, "u1", "x")).toBe(false);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && bun test src/metrics/repository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// backend/src/metrics/repository.ts
import { and, eq, gte, lte, asc, desc } from "drizzle-orm";
import type { Db } from "../db/client";
import { bodyMetric } from "../db/schema";
import type { BodyMetric, MetricReading, MetricType } from "@pulsia/shared";

function toBodyMetric(row: typeof bodyMetric.$inferSelect): BodyMetric {
  return { id: row.id, metricType: row.metricType as MetricType, value: row.value, measuredAt: row.measuredAt };
}

export async function insertReading(db: Db, userId: string, reading: MetricReading): Promise<BodyMetric[]> {
  const measuredAt = reading.measuredAt ?? Date.now();
  const rows = await db
    .insert(bodyMetric)
    .values(reading.entries.map((e) => ({ userId, metricType: e.metricType, value: e.value, measuredAt })))
    .returning();
  return rows.map(toBodyMetric);
}

export async function getMetrics(
  db: Db, userId: string, opts: { type?: MetricType; from?: number; to?: number } = {},
): Promise<BodyMetric[]> {
  const conds = [eq(bodyMetric.userId, userId)];
  if (opts.type) conds.push(eq(bodyMetric.metricType, opts.type));
  if (opts.from != null) conds.push(gte(bodyMetric.measuredAt, opts.from));
  if (opts.to != null) conds.push(lte(bodyMetric.measuredAt, opts.to));
  const rows = await db.select().from(bodyMetric).where(and(...conds)).orderBy(asc(bodyMetric.measuredAt));
  return rows.map(toBodyMetric);
}

// Puro: dado filas ordenadas por measuredAt DESC, toma la primera (más reciente) por tipo.
export function pickLatestPerType(
  rows: { metricType: string; value: number; measuredAt: number }[],
): Partial<Record<MetricType, { value: number; measuredAt: number }>> {
  const out: Partial<Record<MetricType, { value: number; measuredAt: number }>> = {};
  for (const r of rows) {
    const t = r.metricType as MetricType;
    if (!out[t]) out[t] = { value: r.value, measuredAt: r.measuredAt };
  }
  return out;
}

export async function getLatestMetrics(
  db: Db, userId: string,
): Promise<Partial<Record<MetricType, { value: number; measuredAt: number }>>> {
  const rows = await db
    .select().from(bodyMetric)
    .where(eq(bodyMetric.userId, userId))
    .orderBy(desc(bodyMetric.measuredAt));
  return pickLatestPerType(rows);
}

export async function deleteMetric(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(bodyMetric)
    .where(and(eq(bodyMetric.id, id), eq(bodyMetric.userId, userId)))
    .returning({ id: bodyMetric.id });
  return rows.length > 0;
}
```

- [ ] **Step 4: Correr el test**

Run: `cd backend && bun test src/metrics/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/metrics/repository.ts backend/src/metrics/repository.test.ts
git commit -S -m "feat(backend): repositorio de métricas corporales"
```

### Task 5: Rutas /metrics y /progress + registro en app

**Files:**
- Create: `backend/src/routes/metrics.ts`, `backend/src/routes/progress.ts`
- Modify: `backend/src/app.ts` (auth + route de `/metrics` y `/progress`)
- Test: `backend/src/routes/metrics.test.ts` (seguir el patrón de `backend/src/routes/*.test.ts` — crear la app con `createApp` y `fetch` contra ella)

- [ ] **Step 1: Escribir el test que falla**

⚠️ **Convención del repo:** las rutas se testean con `createApp(deps)` pasando un `db` **falso** (stubs de los métodos que la ruta usa) y `config.singleUserMode: true` para saltear el auth (ver `backend/src/app.test.ts`). NO hay DB real ni `makeTestApp`.

```ts
// backend/src/routes/metrics.test.ts
import { expect, test } from "bun:test";
import { createApp } from "../app";

const baseConfig = { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6", inviteCode: "x", sessionTtlDays: 4, singleUserMode: true };
const aiClient = { generateProgram: async () => ({ name: "x", weeks: [] }) };

test("POST /metrics inserta y responde 200 con las filas", async () => {
  const db: any = { insert: () => ({ values: (v: any[]) => ({ returning: async () => v.map((r, i) => ({ id: `id-${i}`, ...r })) }) }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ measuredAt: 1000, entries: [{ metricType: "weight_kg", value: 80 }] }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body[0].value).toBe(80);
});

test("POST /metrics rechaza payload inválido con 400", async () => {
  const db: any = {};
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries: [] }),
  });
  expect(res.status).toBe(400);
});

test("GET /progress/performance responde 200 con la forma esperada", async () => {
  const db: any = { query: { workoutSession: { findMany: async () => [] } } };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/progress/performance", {});
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("perExercise");
  expect(body).toHaveProperty("volumeSeries");
  expect(body).toHaveProperty("prs");
});
```

> Nota: `getMetrics` en el POST no se ejerce; el `db` falso solo necesita stubbear lo que cada test toca. Para `/progress/performance`, `getRecentSessions` usa `db.query.workoutSession.findMany` (ver `sessions/repository.ts`).

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && bun test src/routes/metrics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar las rutas**

```ts
// backend/src/routes/metrics.ts
import { Hono } from "hono";
import { MetricReadingSchema, MetricTypeSchema } from "@pulsia/shared";
import { insertReading, getMetrics, getLatestMetrics, deleteMetric } from "../metrics/repository";
import type { AppDeps } from "../app";

export function metricsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.post("/", async (c) => {
    const parsed = MetricReadingSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Lectura inválida", detail: parsed.error.issues }, 400);
    const rows = await insertReading(deps.db, c.get("userId"), parsed.data);
    return c.json(rows);
  });

  r.get("/", async (c) => {
    const typeRaw = c.req.query("type");
    let type: import("@pulsia/shared").MetricType | undefined;
    if (typeRaw) {
      const t = MetricTypeSchema.safeParse(typeRaw);
      if (!t.success) return c.json({ error: "Tipo de métrica inválido" }, 400);
      type = t.data;
    }
    const from = c.req.query("from") ? Number(c.req.query("from")) : undefined;
    const to = c.req.query("to") ? Number(c.req.query("to")) : undefined;
    return c.json(await getMetrics(deps.db, c.get("userId"), { type, from, to }));
  });

  r.get("/latest", async (c) => {
    return c.json(await getLatestMetrics(deps.db, c.get("userId")));
  });

  r.delete("/:id", async (c) => {
    const ok = await deleteMetric(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrada" }, 404);
  });

  return r;
}
```

```ts
// backend/src/routes/progress.ts
import { Hono } from "hono";
import { computePerformanceTrends } from "@pulsia/shared";
import { getRecentSessions } from "../sessions/repository";
import type { AppDeps } from "../app";

const PROGRESS_SESSION_LIMIT = 200; // cota superior: todo el historial razonable para charts

export function progressRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.get("/performance", async (c) => {
    const sessions = await getRecentSessions(deps.db, c.get("userId"), PROGRESS_SESSION_LIMIT);
    return c.json(computePerformanceTrends(sessions));
  });

  return r;
}
```

- [ ] **Step 4: Registrar en `app.ts`**

En `backend/src/app.ts`: importar `metricsRoutes` y `progressRoutes`; agregar el `auth` y las rutas (junto a las otras):

```ts
import { metricsRoutes } from "./routes/metrics";
import { progressRoutes } from "./routes/progress";
// ... dentro de createApp, junto a los otros app.use(...):
app.use("/metrics", auth);
app.use("/metrics/*", auth);
app.use("/progress", auth);
app.use("/progress/*", auth);
// ... junto a los otros app.route(...):
app.route("/metrics", metricsRoutes(deps));
app.route("/progress", progressRoutes(deps));
```

- [ ] **Step 5: Correr el test**

Run: `cd backend && bun test src/routes/metrics.test.ts`
Expected: PASS.

- [ ] **Step 6: Correr toda la suite backend + shared**

Run: `bun test shared backend`
Expected: PASS (todo verde).

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/metrics.ts backend/src/routes/progress.ts backend/src/routes/metrics.test.ts backend/src/app.ts
git commit -S -m "feat(backend): endpoints /metrics (CRUD) y /progress/performance"
```

### PR-1 cierre

- [ ] Push de la rama, abrir PR con descripción (referenciar el spec). Disparar `@coderabbitai review`. Esperar review; aplicar cambios (re-review si son mayores); mergear (squash) → verificar auto-deploy + health + que la migración 0007 corrió (`ssh vps 'curl -s http://10.8.0.2:3011/health'`).

---

## PR-2 — backend: la IA observa el progreso

Rama: `feat/progreso-ia-generacion` (partir de `main` ya con PR-1 mergeado).

### Task 6: buildProgressSummary (resumen numérico para la IA)

**Files:**
- Create: `backend/src/ai/progress.ts`
- Test: `backend/src/ai/progress.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/ai/progress.test.ts
import { expect, test } from "bun:test";
import type { BodyMetric, WorkoutSession } from "@pulsia/shared";
import { buildProgressSummary } from "./progress";

const NOW = 60 * 24 * 60 * 60 * 1000; // 60 días en ms, como "ahora"
const day = 24 * 60 * 60 * 1000;

test("sin datos → string vacío (no rompe el prompt)", () => {
  expect(buildProgressSummary({ metrics: [], sessions: [], heightCm: null, nowMs: NOW })).toBe("");
});

test("incluye delta de peso e IMC derivado cuando hay altura", () => {
  const metrics: BodyMetric[] = [
    { id: "a", metricType: "weight_kg", value: 82, measuredAt: NOW - 50 * day },
    { id: "b", metricType: "weight_kg", value: 79.5, measuredAt: NOW - 1 * day },
  ];
  const out = buildProgressSummary({ metrics, sessions: [], heightCm: 180, nowMs: NOW });
  expect(out).toContain("Peso");
  expect(out).toContain("82");
  expect(out).toContain("79.5");
  expect(out.toLowerCase()).toContain("imc");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && bun test src/ai/progress.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// backend/src/ai/progress.ts
import type { BodyMetric, MetricType, WorkoutSession } from "@pulsia/shared";
import { METRIC_LABELS, METRIC_UNITS, computePerformanceTrends } from "@pulsia/shared";

const EIGHT_WEEKS_MS = 56 * 24 * 60 * 60 * 1000;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Para un tipo: valor más reciente vs más antiguo dentro de la ventana.
function metricLine(type: MetricType, points: BodyMetric[]): string | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.measuredAt - b.measuredAt);
  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;
  const unit = METRIC_UNITS[type];
  if (sorted.length === 1) return `${METRIC_LABELS[type]}: ${fmt(last)} ${unit}`;
  const delta = last - first;
  const sign = delta > 0 ? "+" : "";
  return `${METRIC_LABELS[type]}: ${fmt(first)} → ${fmt(last)} ${unit} (${sign}${fmt(delta)})`;
}

export function buildProgressSummary(input: {
  metrics: BodyMetric[];
  sessions: WorkoutSession[];
  heightCm?: number | null;
  nowMs: number;
  windowMs?: number;
}): string {
  const windowMs = input.windowMs ?? EIGHT_WEEKS_MS;
  const since = input.nowMs - windowMs;
  const recentMetrics = input.metrics.filter((m) => m.measuredAt >= since);

  const byType = new Map<MetricType, BodyMetric[]>();
  for (const m of recentMetrics) {
    const arr = byType.get(m.metricType) ?? [];
    arr.push(m);
    byType.set(m.metricType, arr);
  }

  const bodyLines: string[] = [];
  for (const [type, pts] of byType) {
    const line = metricLine(type, pts);
    if (line) bodyLines.push(line);
  }

  // IMC derivado del último peso + altura del perfil.
  const weightPts = byType.get("weight_kg");
  if (weightPts && weightPts.length > 0 && input.heightCm && input.heightCm > 0) {
    const lastW = [...weightPts].sort((a, b) => a.measuredAt - b.measuredAt).at(-1)!.value;
    const bmi = lastW / (input.heightCm / 100) ** 2;
    bodyLines.push(`IMC: ${bmi.toFixed(1)}`);
  }

  // Fuerza: top ~5 ejercicios por frecuencia, delta de 1RMe en la ventana.
  const recentSessions = input.sessions.filter((s) => s.startedAt >= since);
  const trends = computePerformanceTrends(recentSessions);
  const strengthLines = trends.perExercise.slice(0, 5).map((e) => {
    const first = e.points[0].est1RM;
    const last = e.points[e.points.length - 1].est1RM;
    const delta = last - first;
    const sign = delta > 0 ? "+" : "";
    return `${e.garminName}: 1RMe ${fmt(first)}→${fmt(last)} kg (${sign}${fmt(delta)})`;
  });

  if (bodyLines.length === 0 && strengthLines.length === 0) return "";

  const parts = ["Progreso medido (últimas ~8 semanas):"];
  for (const l of bodyLines) parts.push(`- ${l}`);
  if (strengthLines.length) parts.push(`- Fuerza (1RM estimado): ${strengthLines.join("; ")}`);
  return parts.join("\n");
}
```

- [ ] **Step 4: Correr el test**

Run: `cd backend && bun test src/ai/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/progress.ts backend/src/ai/progress.test.ts
git commit -S -m "feat(backend): buildProgressSummary (resumen numérico de progreso para la IA)"
```

### Task 7: Inyectar el progreso en la generación y en la memoria

**Files:**
- Modify: `backend/src/ai/prompt.ts` (`buildGenerationPrompt` — 4º param `progressSummary?`)
- Modify: `backend/src/ai/memory.ts` (`buildMemoryUpdatePrompt` — 3er param `progressSummary?`)
- Modify: `backend/src/ai/client.ts` (`generateProgram` input + `updateMemory` input: agregar `progressSummary?`; pasarlos a los builders)
- Modify: `backend/src/memory/service.ts` (`refreshAthleteMemory` — computar/propagar `progressSummary`)
- Modify: `backend/src/programs/generateJob.ts` (computar `progressSummary` y pasarlo a `generateProgramForProfile` + al refresh)
- Modify: `backend/src/ai/generate.ts` (propagar `progressSummary` a `ai.generateProgram`)
- Modify: `backend/src/metrics/repository.ts` (agregar `getMetricsSince`)
- Test: `backend/src/ai/prompt.test.ts` (extender o crear)

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/ai/prompt.test.ts  (agregar este caso; si el archivo no existe, crearlo)
import { expect, test } from "bun:test";
import { buildGenerationPrompt } from "./prompt";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate", goal: "hypertrophy", daysPerWeek: 3, sessionMinutes: 60,
  gymEquipment: [], homeEquipment: [], limitations: [],
} as TrainingProfile;

test("buildGenerationPrompt incluye el bloque de progreso cuando se pasa", () => {
  const out = buildGenerationPrompt(profile, undefined, undefined, "Progreso medido:\n- Peso: 82 → 79 kg");
  expect(out).toContain("Progreso medido");
  expect(out).toContain("79 kg");
});

test("buildGenerationPrompt sin progreso queda intacto", () => {
  const out = buildGenerationPrompt(profile);
  expect(out).not.toContain("Progreso medido");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && bun test src/ai/prompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar los cambios**

`prompt.ts` — agregar 4º parámetro y sección (junto al bloque de memoria):

```ts
export function buildGenerationPrompt(
  profile: TrainingProfile,
  historySummary?: string,
  memory?: string,
  progressSummary?: string,
): string {
  // ... igual que ahora, y dentro del array (antes de "Devolvé el resultado..."):
  ...(progressSummary && progressSummary.trim()
    ? [
        "",
        "Progreso medido del atleta (métricas corporales y de fuerza en el tiempo): tenelo en cuenta para ajustar cargas, volumen y objetivo del plan.",
        progressSummary,
      ]
    : []),
```

`memory.ts` — 3er parámetro:

```ts
export function buildMemoryUpdatePrompt(current: string, historySummary: string, progressSummary?: string): string {
  return [
    // ... igual, y antes de la instrucción final agregar:
    ...(progressSummary && progressSummary.trim()
      ? ["", "Progreso medido (métricas y fuerza en el tiempo):", progressSummary]
      : []),
    // ... la instrucción final queda igual
  ].join("\n");
}
```

> El implementador debe insertar ese bloque respetando el array existente (no romper el `.join("\n")`).

`client.ts` — agregar `progressSummary?: string` a los inputs de `generateProgram` y `updateMemory`, y pasarlo a `buildGenerationPrompt(profile, historySummary, memory, progressSummary)` y a `buildMemoryUpdatePrompt(current, historySummary, progressSummary)` respectivamente.

`metrics/repository.ts` — agregar:

```ts
export async function getMetricsSince(db: Db, userId: string, sinceMs: number): Promise<BodyMetric[]> {
  return getMetrics(db, userId, { from: sinceMs });
}
```

`memory/service.ts` — extender la firma y computar el progreso cuando no venga dado:

```ts
export async function refreshAthleteMemory(
  db: Db, ai: AiClient, userId: string, apiKey: string, model: string,
  opts?: { current?: string; historySummary?: string; progressSummary?: string },
): Promise<string> {
  if (!ai.updateMemory) throw new Error("Actualización de memoria no disponible.");
  const current = opts?.current ?? (await getMemory(db, userId));
  const recent = await getRecentSessions(db, userId, 6);
  const historySummary = opts?.historySummary ?? buildTrainingHistorySummary(recent);
  let progressSummary = opts?.progressSummary;
  if (progressSummary == null) {
    const since = Date.now() - 56 * 24 * 60 * 60 * 1000;
    const metrics = await getMetricsSince(db, userId, since);
    const profile = await getProfile(db, userId); // usar el repo de perfil existente
    progressSummary = buildProgressSummary({ metrics, sessions: recent, heightCm: profile?.heightCm ?? null, nowMs: Date.now() });
  }
  const updated = await ai.updateMemory({ current, historySummary, progressSummary, apiKey, model });
  await upsertMemory(db, userId, updated);
  return updated;
}
```

> El implementador: importar `getMetricsSince`, `buildProgressSummary`, y el getter de perfil que ya exista (mirar cómo `programs`/`profile` leen el perfil; reusar ese). No duplicar.

`generateJob.ts` — computar el progreso y propagarlo:

```ts
// tras obtener `recent` y `memory`:
const since = Date.now() - 56 * 24 * 60 * 60 * 1000;
const metrics = await getMetricsSince(deps.db, userId, since);
const progressSummary = buildProgressSummary({ metrics, sessions: recent, heightCm: profile.heightCm ?? null, nowMs: Date.now() });
const program = await generateProgramForProfile({ profile, apiKey, model, ai: deps.aiClient, historySummary, memory, progressSummary });
// ... y en el refresh en background:
void refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model, { current: memory, historySummary, progressSummary })
```

`generate.ts` — `generateProgramForProfile` debe aceptar y reenviar `progressSummary` a `ai.generateProgram`.

- [ ] **Step 4: Correr el test + suite completa**

Run: `cd backend && bun test src/ai/prompt.test.ts` → PASS
Run: `bun test shared backend` → PASS (verificar que no rompió generación/memoria)

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/prompt.ts backend/src/ai/memory.ts backend/src/ai/client.ts backend/src/ai/generate.ts backend/src/memory/service.ts backend/src/programs/generateJob.ts backend/src/metrics/repository.ts backend/src/ai/prompt.test.ts
git commit -S -m "feat(backend): la IA observa el progreso (resumen en generación + memoria)"
```

### PR-2 cierre

- [ ] Push, PR, `@coderabbitai review`, aplicar cambios / re-review si mayores, merge (squash) → verificar auto-deploy + health.

---

## PR-3 — mobile: tab "Progreso" (OTA)

Rama: `feat/progreso-mobile` (partir de `main` con PR-1 y PR-2 mergeados).

### Task 8: Clientes API

**Files:**
- Create: `mobile/src/api/metrics.ts`, `mobile/src/api/progress.ts`
- Test: (cubierto indirectamente; los clientes son thin. Test opcional de forma con mock de `apiFetch` si el repo ya testea clientes — mirar `mobile/__tests__/`.)

- [ ] **Step 1: Implementar los clientes** (seguir EXACTO el patrón de `mobile/src/api/sessions.ts`)

```ts
// mobile/src/api/metrics.ts
import { apiFetch } from "./client";
import type { BodyMetric, MetricReading, MetricType } from "@pulsia/shared";

export async function postReading(baseUrl: string, reading: MetricReading): Promise<BodyMetric[]> {
  const res = await apiFetch(baseUrl, "/metrics", { method: "POST", body: JSON.stringify(reading) });
  if (!res.ok) throw new Error("No se pudo guardar la medición");
  return (await res.json()) as BodyMetric[];
}

export async function getMetricSeries(baseUrl: string, type: MetricType): Promise<BodyMetric[]> {
  const res = await apiFetch(baseUrl, `/metrics?type=${type}`);
  if (!res.ok) throw new Error("No se pudieron cargar las métricas");
  return (await res.json()) as BodyMetric[];
}

export async function getLatestMetrics(baseUrl: string): Promise<Partial<Record<MetricType, { value: number; measuredAt: number }>>> {
  const res = await apiFetch(baseUrl, "/metrics/latest");
  if (!res.ok) throw new Error("No se pudieron cargar las métricas");
  return await res.json();
}

export async function deleteMetric(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/metrics/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("No se pudo borrar la medición");
}
```

```ts
// mobile/src/api/progress.ts
import { apiFetch } from "./client";
import type { PerformanceTrends } from "@pulsia/shared";

export async function getPerformance(baseUrl: string): Promise<PerformanceTrends> {
  const res = await apiFetch(baseUrl, "/progress/performance");
  if (!res.ok) throw new Error("No se pudo cargar el progreso");
  return (await res.json()) as PerformanceTrends;
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/api/metrics.ts mobile/src/api/progress.ts
git commit -S -m "feat(mobile): clientes API de métricas y progreso"
```

### Task 9: Componente LineChart (SVG puro) + helper testeable

**Files:**
- Create: `mobile/src/components/LineChart.tsx`, `mobile/src/session/chart.ts` (helper puro)
- Test: `mobile/__tests__/chart.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// mobile/__tests__/chart.test.ts
import { scalePoints } from "../src/session/chart";

test("scalePoints mapea al viewport con padding y invierte el eje Y", () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 100 }];
  const out = scalePoints(pts, { width: 100, height: 100, padding: 10 });
  // x min→padding, x max→width-padding
  expect(out[0].x).toBeCloseTo(10, 5);
  expect(out[1].x).toBeCloseTo(90, 5);
  // y min (0) → abajo (height-padding); y max (100) → arriba (padding)
  expect(out[0].y).toBeCloseTo(90, 5);
  expect(out[1].y).toBeCloseTo(10, 5);
});

test("scalePoints con un solo punto lo centra sin dividir por cero", () => {
  const out = scalePoints([{ x: 5, y: 5 }], { width: 100, height: 100, padding: 10 });
  expect(Number.isFinite(out[0].x)).toBe(true);
  expect(Number.isFinite(out[0].y)).toBe(true);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd mobile && npm test -- --runInBand chart.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el helper**

```ts
// mobile/src/session/chart.ts
export interface XY { x: number; y: number }
export interface ChartBox { width: number; height: number; padding: number }

// Escala puntos de datos al viewport SVG. Y invertido (SVG crece hacia abajo).
export function scalePoints(points: XY[], box: ChartBox): XY[] {
  const { width, height, padding } = box;
  if (points.length === 0) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const w = width - padding * 2;
  const h = height - padding * 2;
  return points.map((p) => ({
    x: points.length === 1 ? width / 2 : padding + ((p.x - minX) / spanX) * w,
    y: points.length === 1 ? height / 2 : padding + (1 - (p.y - minY) / spanY) * h,
  }));
}

export function toPath(points: XY[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}
```

- [ ] **Step 4: Implementar el componente** (usa `react-native-svg`, ya instalado)

```tsx
// mobile/src/components/LineChart.tsx
import { View, Text } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { scalePoints, toPath, type XY } from "../session/chart";
import { colors, spacing } from "../theme/tokens";

export function LineChart({ data, height = 160, unit = "" }: { data: XY[]; height?: number; unit?: string }) {
  const width = 320;
  if (data.length === 0) {
    return <Text style={{ color: colors.textMuted, padding: spacing.md }}>Sin datos todavía.</Text>;
  }
  const pts = scalePoints(data, { width, height, padding: 16 });
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={toPath(pts)} stroke={colors.accent} strokeWidth={2} fill="none" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.accent} />
        ))}
      </Svg>
    </View>
  );
}
```

- [ ] **Step 5: Correr el test**

Run: `cd mobile && npm test -- --runInBand chart.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/session/chart.ts mobile/src/components/LineChart.tsx mobile/__tests__/chart.test.ts
git commit -S -m "feat(mobile): LineChart en SVG + helper de escalado testeable"
```

### Task 10: Pantalla "Progreso" + registro del tab

**Files:**
- Create: `mobile/app/(tabs)/progreso.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (agregar `<Tabs.Screen name="progreso" .../>`)
- Test: `mobile/__tests__/metricForm.test.ts` (validación pura del form)

- [ ] **Step 1: Escribir el test que falla** (helper puro de armado de la lectura desde el form)

```ts
// mobile/__tests__/metricForm.test.ts
import { buildReadingFromForm } from "../src/session/metricForm";

test("arma la lectura solo con los campos completados y válidos", () => {
  const r = buildReadingFromForm({ weight_kg: "80.5", waist_cm: "", body_fat_pct: "abc" }, 1000);
  expect(r).toEqual({ measuredAt: 1000, entries: [{ metricType: "weight_kg", value: 80.5 }] });
});

test("devuelve null si no hay ninguna entry válida", () => {
  expect(buildReadingFromForm({ weight_kg: "" }, 1000)).toBeNull();
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd mobile && npm test -- --runInBand metricForm.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el helper**

```ts
// mobile/src/session/metricForm.ts
import { METRIC_TYPES, METRIC_RANGES, type MetricReading, type MetricType } from "@pulsia/shared";

export function buildReadingFromForm(form: Partial<Record<MetricType, string>>, measuredAt: number): MetricReading | null {
  const entries = METRIC_TYPES.flatMap((t) => {
    const raw = form[t]?.trim();
    if (!raw) return [];
    const value = Number(raw);
    if (!Number.isFinite(value)) return [];
    const [min, max] = METRIC_RANGES[t];
    if (value < min || value > max) return [];
    return [{ metricType: t, value }];
  });
  return entries.length ? { measuredAt, entries } : null;
}
```

- [ ] **Step 4: Implementar la pantalla** (patrón de `mobile/app/memoria.tsx` para `getBackendUrl` + estados; tokens de `theme/tokens`)

```tsx
// mobile/app/(tabs)/progreso.tsx
import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl } from "../../src/storage/config";
import { getLatestMetrics, getMetricSeries, postReading } from "../../src/api/metrics";
import { getPerformance } from "../../src/api/progress";
import { LineChart } from "../../src/components/LineChart";
import { buildReadingFromForm } from "../../src/session/metricForm";
import { METRIC_TYPES, METRIC_LABELS, METRIC_UNITS, type MetricType, type BodyMetric, type PerformanceTrends } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

export default function ProgresoScreen() {
  const baseUrl = useRef<string | null>(null);
  const [latest, setLatest] = useState<Partial<Record<MetricType, { value: number; measuredAt: number }>>>({});
  const [selected, setSelected] = useState<MetricType>("weight_kg");
  const [series, setSeries] = useState<BodyMetric[]>([]);
  const [perf, setPerf] = useState<PerformanceTrends | null>(null);
  const [form, setForm] = useState<Partial<Record<MetricType, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadSeries(url: string, type: MetricType) {
    setSeries(await getMetricSeries(url, type));
  }

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (!url) { setError("Configurá el backend"); return; }
      try {
        setLatest(await getLatestMetrics(url));
        setPerf(await getPerformance(url));
        await loadSeries(url, selected);
      } catch { setError("No se pudo cargar el progreso"); }
    })();
  }, []);

  async function onSelect(type: MetricType) {
    setSelected(type);
    if (baseUrl.current) await loadSeries(baseUrl.current, type);
  }

  async function onSave() {
    const url = baseUrl.current;
    if (!url) return;
    const reading = buildReadingFromForm(form, Date.now());
    if (!reading) { setError("Cargá al menos un valor válido"); return; }
    setSaving(true); setError(null);
    try {
      await postReading(url, reading);
      setForm({});
      setLatest(await getLatestMetrics(url));
      await loadSeries(url, selected);
    } catch { setError("No se pudo guardar la medición"); }
    finally { setSaving(false); }
  }

  const chartData = series.map((m) => ({ x: m.measuredAt, y: m.value }));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Valores actuales</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {METRIC_TYPES.map((t) => (
          <View key={t} style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, minWidth: 100 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{METRIC_LABELS[t]}</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
              {latest[t] ? `${latest[t]!.value} ${METRIC_UNITS[t]}` : "—"}
            </Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Tendencia</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {METRIC_TYPES.map((t) => (
          <Pressable key={t} onPress={() => onSelect(t)}
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: selected === t ? colors.accent : colors.surface }}>
            <Text style={{ color: selected === t ? "#fff" : colors.text, fontSize: 13 }}>{METRIC_LABELS[t]}</Text>
          </Pressable>
        ))}
      </View>
      <LineChart data={chartData} unit={METRIC_UNITS[selected]} />

      {perf && perf.perExercise.length > 0 ? (
        <>
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Fuerza (1RM estimado)</Text>
          {perf.perExercise.slice(0, 5).map((e) => (
            <View key={e.catalogId} style={{ gap: spacing.xs }}>
              <Text style={{ color: colors.text }}>{e.garminName}</Text>
              <LineChart data={e.points.map((p) => ({ x: p.measuredAt, y: p.est1RM }))} unit="kg" />
            </View>
          ))}
        </>
      ) : null}

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Registrar medición</Text>
      {METRIC_TYPES.map((t) => (
        <View key={t} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text }}>{METRIC_LABELS[t]} ({METRIC_UNITS[t]})</Text>
          <TextInput
            keyboardType="decimal-pad" value={form[t] ?? ""}
            onChangeText={(v) => setForm((f) => ({ ...f, [t]: v }))}
            placeholder="—" placeholderTextColor={colors.textMuted}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8, width: 100, color: colors.text }}
          />
        </View>
      ))}
      <Pressable onPress={onSave} disabled={saving}
        style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>{saving ? "Guardando…" : "Guardar medición"}</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 5: Registrar el tab** en `mobile/app/(tabs)/_layout.tsx` (agregar antes de `perfil`):

```tsx
<Tabs.Screen
  name="progreso"
  options={{
    title: "Progreso",
    tabBarIcon: ({ color, size, focused }) => (
      <Ionicons name={focused ? "trending-up" : "trending-up-outline"} size={size} color={color} />
    ),
  }}
/>
```

- [ ] **Step 6: Correr el test + typecheck**

Run: `cd mobile && npm test -- --runInBand metricForm.test.ts` → PASS
Run: `cd mobile && npm test -- --runInBand` → toda la suite mobile PASS
Run: `bun run --filter @pulsia/mobile typecheck` (o el typecheck del repo) → OK

- [ ] **Step 7: Commit**

```bash
git add mobile/app/\(tabs\)/progreso.tsx mobile/app/\(tabs\)/_layout.tsx mobile/src/session/metricForm.ts mobile/__tests__/metricForm.test.ts
git commit -S -m "feat(mobile): tab Progreso (charts + registrar medición)"
```

### PR-3 cierre

- [ ] Push, PR, `@coderabbitai review`, aplicar cambios / re-review si mayores, merge (squash). **Entrega OTA**: publicar con `cd mobile && bunx --bun eas-cli update --branch preview --environment preview --message "tab Progreso" --non-interactive` (el runtime del update matchea el fingerprint de vc7; el usuario cierra/reabre la app 2×). ⚠️ **Este paso de OTA lo dispara el usuario** salvo autorización explícita — dejar la rama mergeada y avisar.

---

## Self-review (chequeado contra el spec)

- **Métricas corporales serie temporal** → Tasks 1, 3, 4, 5 (schema, tabla, repo, endpoints). ✓
- **6 tipos + IMC derivado** → Task 1 (tipos) + Task 6 (IMC en el resumen; la UI lo puede derivar igual del último peso + altura). ✓
- **Tendencias de rendimiento (1RMe, volumen, PRs)** → Task 2 (puro) + Task 5 (endpoint). ✓
- **Tab Progreso con charts SVG (OTA)** → Tasks 9, 10. ✓
- **IA observa en generación + memoria, no reactivo** → Tasks 6, 7 (solo en generateJob y refreshAthleteMemory). ✓
- **Auth/scoping por usuario** → repos y rutas usan `c.get("userId")` y filtran por `userId`. ✓
- **Fuera de alcance (fotos, coach proactivo)** → no hay tareas; correcto. ✓

**Consistencia de tipos:** `MetricType`, `BodyMetric`, `MetricReading`, `PerformanceTrends`, `buildProgressSummary`, `computePerformanceTrends`, `scalePoints` usados con la misma firma en todas las tareas. ✓
