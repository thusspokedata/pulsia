# Import de CSV de sueño de Garmin — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Importar el CSV de sueño de Garmin desde el móvil y persistir sus campos numéricos en el modelo de métricas existente (`body_metric`), deduplicando por noche.

**Architecture:** El backend parsea el CSV (función pura, validada contra un schema compartido) y expone dos endpoints bajo `/metrics` (preview sin persistir + import con dedupe). El móvil elige el `.csv`, lo manda en base64, muestra el preview y confirma — mismo patrón que el import de `.FIT` de cardio. Se agregan 6 tipos de métrica nuevos; no hace falta migración de DB (`metric_type` es `text`).

**Tech Stack:** Bun, Hono, Drizzle (Postgres), Zod, React Native / Expo Router, `@pulsia/shared` (workspace). Tests: `bun:test` (shared/backend), `jest` (mobile).

**Verify final:** `bun run typecheck && bun test && bun run test:mobile`

**Commits:** firmar siempre con `-S`. Sin `Co-Authored-By`.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `shared/src/schemas/metrics.ts` | +6 tipos en `ACTIVITY_METRIC_TYPES` + claves en los 3 Records | Modificar |
| `shared/src/schemas/sleepImport.ts` | Schemas del preview/resultado del import | Crear |
| `shared/src/index.ts` | Re-export de `sleepImport` | Modificar |
| `backend/src/metrics/parseSleepCsv.ts` | Parser puro `csv → SleepCsvPreview` + `parseHmToHours` | Crear |
| `backend/src/metrics/parseSleepCsv.test.ts` | Tests del parser (fixture real de 7 filas) | Crear |
| `backend/src/metrics/repository.ts` | `insertReadingsDedup` | Modificar |
| `backend/src/routes/metrics.ts` | `POST /import/sleep/parse` y `POST /import/sleep` | Modificar |
| `backend/src/routes/metrics.test.ts` | Tests de las dos rutas nuevas | Modificar |
| `mobile/src/api/metrics.ts` | `parseSleepCsv`, `importSleepCsv` | Modificar |
| `mobile/app/importar-sueno.tsx` | Pantalla de import (picker → preview → confirmar) | Crear |
| `mobile/app/(tabs)/progreso.tsx` | Botón "Importar sueño de Garmin (CSV)" | Modificar |
| `mobile/__tests__/sleep-import.test.ts` | Tests de los clientes de API | Crear |

---

## Task 1: Tipos de métrica nuevos (shared)

**Files:**
- Modify: `shared/src/schemas/metrics.ts`
- Test: `shared/src/schemas/metrics.test.ts` (ya existe el test de exhaustividad; solo se corre)

- [ ] **Step 1: Agregar los 6 tipos + claves en los 3 Records**

En `ACTIVITY_METRIC_TYPES` (línea ~10), dejar:
```ts
export const ACTIVITY_METRIC_TYPES = [
  "steps", "floors", "sleep_hours", "sleep_quality", "resting_hr",
  "sleep_score", "sleep_need_hours", "body_battery", "hrv", "respiration", "pulse_ox",
] as const;
```

En `METRIC_UNITS` agregar:
```ts
  sleep_score: "/100", sleep_need_hours: "h", body_battery: "/100",
  hrv: "ms", respiration: "rpm", pulse_ox: "%",
```

En `METRIC_LABELS` agregar:
```ts
  sleep_score: "Puntaje de sueño", sleep_need_hours: "Sueño necesario", body_battery: "Body Battery",
  hrv: "HRV", respiration: "Respiración", pulse_ox: "SpO₂",
```

En `METRIC_RANGES` agregar:
```ts
  sleep_score: [0, 100], sleep_need_hours: [0, 24], body_battery: [0, 100],
  hrv: [0, 300], respiration: [4, 40], pulse_ox: [50, 100],
```

- [ ] **Step 2: Correr el test de exhaustividad + typecheck**

Run: `bun test shared/src/schemas/metrics.test.ts && bun run --filter @pulsia/shared typecheck`
Expected: PASS. Si falta una clave en algún Record, TS falla (Record exhaustivo). Confirma que los 6 tipos tienen unit/label/range.

- [ ] **Step 3: Commit**

```bash
git add shared/src/schemas/metrics.ts
git commit -S -m "feat(sueño): tipos de métrica de sueño (score, HRV, body battery, etc.)"
```

---

## Task 2: Schemas del preview de import (shared)

**Files:**
- Create: `shared/src/schemas/sleepImport.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/schemas/sleepImport.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `shared/src/schemas/sleepImport.test.ts`:
```ts
import { test, expect } from "bun:test";
import { SleepCsvPreviewSchema, SleepImportResultSchema } from "./sleepImport";

test("SleepCsvPreviewSchema acepta un preview válido", () => {
  const ok = SleepCsvPreviewSchema.safeParse({
    rows: [{ date: "2026-07-17", measuredAt: Date.UTC(2026, 6, 17, 12), entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [{ line: 3, reason: "sin datos" }],
  });
  expect(ok.success).toBe(true);
});

test("SleepCsvPreviewSchema rechaza una fila con fecha mal formada", () => {
  const bad = SleepCsvPreviewSchema.safeParse({
    rows: [{ date: "17/07/2026", measuredAt: 1, entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [],
  });
  expect(bad.success).toBe(false);
});

test("SleepCsvPreviewSchema rechaza una fila sin entradas", () => {
  const bad = SleepCsvPreviewSchema.safeParse({
    rows: [{ date: "2026-07-17", measuredAt: 1, entries: [] }],
    skipped: [],
  });
  expect(bad.success).toBe(false);
});

test("SleepImportResultSchema valida conteos + filas", () => {
  const ok = SleepImportResultSchema.safeParse({
    imported: 5, duplicates: 2,
    rows: [{ date: "2026-07-17", measuredAt: 1, entries: [{ metricType: "sleep_score", value: 85 }] }],
    skipped: [],
  });
  expect(ok.success).toBe(true);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `bun test shared/src/schemas/sleepImport.test.ts`
Expected: FAIL (no existe `./sleepImport`).

- [ ] **Step 3: Escribir el schema**

Create `shared/src/schemas/sleepImport.ts`:
```ts
import { z } from "zod";
import { BodyMetricEntrySchema } from "./metrics";

// Una noche del CSV: fecha ISO + timestamp derivado (mediodía UTC) + sus métricas válidas.
export const SleepCsvRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  measuredAt: z.number().int(),
  entries: z.array(BodyMetricEntrySchema).min(1),
});
export type SleepCsvRow = z.infer<typeof SleepCsvRowSchema>;

export const SleepCsvSkippedSchema = z.object({ line: z.number().int(), reason: z.string() });
export type SleepCsvSkipped = z.infer<typeof SleepCsvSkippedSchema>;

// Preview del parseo (lo que devuelve /import/sleep/parse): filas válidas + filas saltadas.
export const SleepCsvPreviewSchema = z.object({
  rows: z.array(SleepCsvRowSchema),
  skipped: z.array(SleepCsvSkippedSchema),
});
export type SleepCsvPreview = z.infer<typeof SleepCsvPreviewSchema>;

// Resultado del import (lo que devuelve /import/sleep): conteos + el preview usado.
export const SleepImportResultSchema = z.object({
  imported: z.number().int(),
  duplicates: z.number().int(),
  rows: z.array(SleepCsvRowSchema),
  skipped: z.array(SleepCsvSkippedSchema),
});
export type SleepImportResult = z.infer<typeof SleepImportResultSchema>;
```

- [ ] **Step 4: Re-exportar desde el índice**

En `shared/src/index.ts`, junto a la línea `export * from "./schemas/metrics";`, agregar:
```ts
export * from "./schemas/sleepImport";
```

- [ ] **Step 5: Correr test + typecheck**

Run: `bun test shared/src/schemas/sleepImport.test.ts && bun run --filter @pulsia/shared typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas/sleepImport.ts shared/src/schemas/sleepImport.test.ts shared/src/index.ts
git commit -S -m "feat(sueño): schemas del preview/resultado del import de CSV"
```

---

## Task 3: Parser del CSV (backend, puro)

**Files:**
- Create: `backend/src/metrics/parseSleepCsv.ts`
- Test: `backend/src/metrics/parseSleepCsv.test.ts`

- [ ] **Step 1: Escribir el test que falla (con la muestra real)**

Create `backend/src/metrics/parseSleepCsv.test.ts`:
```ts
import { test, expect } from "bun:test";
import { parseSleepCsv, parseHmToHours } from "./parseSleepCsv";

const HEADER =
  "Sleep Score 7 Days,Score,Resting Heart Rate,Body Battery,Pulse Ox,Respiration,HRV Status,Quality,Duration,Sleep Need,Bedtime,Wake Time";
const SAMPLE = [
  HEADER,
  "2026-07-17,70,60,50,97.00,15.00,40,Good,7h 42min,8h 45min,11:52 PM,7:34 AM",
  "2026-07-16,55,62,30,96.50,16.00,40,Poor,6h 15min,8h 0min,12:40 AM,6:50 AM",
].join("\n");

test("parseHmToHours convierte 'Xh Ymin' a horas decimales", () => {
  expect(parseHmToHours("8h 0min")).toBe(8);
  expect(parseHmToHours("6h 17min")).toBeCloseTo(6 + 17 / 60, 5);
  expect(parseHmToHours("50min")).toBeCloseTo(50 / 60, 5);
  expect(parseHmToHours("10h")).toBe(10);
  expect(parseHmToHours("basura")).toBeNull();
});

test("parseSleepCsv mapea columnas por nombre de header", () => {
  const { rows } = parseSleepCsv(SAMPLE);
  expect(rows).toHaveLength(2);
  const first = rows[0];
  expect(first.date).toBe("2026-07-17");
  const byType = Object.fromEntries(first.entries.map((e) => [e.metricType, e.value]));
  expect(byType.sleep_score).toBe(70);
  expect(byType.resting_hr).toBe(60);
  expect(byType.body_battery).toBe(50);
  expect(byType.pulse_ox).toBeCloseTo(97.0, 2);
  expect(byType.respiration).toBeCloseTo(15.0, 2);
  expect(byType.hrv).toBe(40);
  expect(byType.sleep_hours).toBeCloseTo(7 + 42 / 60, 5);
  expect(byType.sleep_need_hours).toBe(8.75);
  // Quality/Bedtime/Wake Time se omiten (no numéricos / metadatos)
  expect(byType.sleep_quality).toBeUndefined();
});

test("parseSleepCsv usa mediodía UTC como measuredAt", () => {
  const { rows } = parseSleepCsv(SAMPLE);
  expect(rows[0].measuredAt).toBe(Date.UTC(2026, 6, 17, 12, 0, 0));
});

test("parseSleepCsv salta una fila cuya col 0 no es fecha", () => {
  const csv = [HEADER, "no-fecha,70,60,50,96.00,15.50,40,Good,6h 30min,8h 0min,1:00 AM,8:00 AM"].join("\n");
  const { rows, skipped } = parseSleepCsv(csv.replace(HEADER, HEADER) + "\n2026-07-10,80,50,60,96,14,44,Good,7h 0min,8h 0min,1:00 AM,8:00 AM");
  expect(skipped.some((s) => /no es una fecha/i.test(s.reason))).toBe(true);
  expect(rows.some((r) => r.date === "2026-07-10")).toBe(true);
});

test("parseSleepCsv omite un valor fuera de rango pero conserva el resto de la fila", () => {
  // Pulse Ox 5 (< 50) se descarta; el resto de la fila entra.
  const csv = [HEADER, "2026-07-09,80,50,60,5,14,44,Good,7h 0min,8h 0min,1:00 AM,8:00 AM"].join("\n");
  const { rows } = parseSleepCsv(csv);
  const byType = Object.fromEntries(rows[0].entries.map((e) => [e.metricType, e.value]));
  expect(byType.pulse_ox).toBeUndefined();
  expect(byType.sleep_score).toBe(80);
});

test("parseSleepCsv tira error si no hay ninguna noche válida", () => {
  expect(() => parseSleepCsv(HEADER + "\n")).toThrow();
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `bun test backend/src/metrics/parseSleepCsv.test.ts`
Expected: FAIL (no existe `./parseSleepCsv`).

- [ ] **Step 3: Escribir el parser**

Create `backend/src/metrics/parseSleepCsv.ts`:
```ts
import {
  METRIC_RANGES,
  SleepCsvPreviewSchema,
  type MetricType,
  type SleepCsvPreview,
  type BodyMetricEntry,
} from "@pulsia/shared";

// Header (trim+lower) → metricType. La col 0 es la fecha (el header de Garmin la llama
// "Sleep Score 7 Days" por error) y se trata aparte. Columnas no mapeadas se ignoran
// (Quality, Bedtime, Wake Time).
const HEADER_TO_METRIC: Record<string, MetricType> = {
  score: "sleep_score",
  "resting heart rate": "resting_hr",
  "body battery": "body_battery",
  "pulse ox": "pulse_ox",
  respiration: "respiration",
  "hrv status": "hrv",
  duration: "sleep_hours",
  "sleep need": "sleep_need_hours",
};

// Métricas que vienen como "Xh Ymin" y se guardan en horas decimales.
const HM_METRICS = new Set<MetricType>(["sleep_hours", "sleep_need_hours"]);

// "6h 17min" → 6.2833 ; "8h 0min" → 8 ; "50min" → 0.8333 ; "10h" → 10 ; null si no hay nada parseable.
export function parseHmToHours(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?$/i);
  if (!m || (m[1] == null && m[2] == null)) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return h + min / 60;
}

// CSV simple del export de Garmin (sin comillas ni comas embebidas): split por coma + trim.
function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSleepCsv(csv: string): SleepCsvPreview {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("El CSV no tiene filas de datos");

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  // La col 0 es la fecha; el resto se mapea por nombre de header.
  const colMetric: (MetricType | null)[] = header.map((h, i) => (i === 0 ? null : HEADER_TO_METRIC[h] ?? null));

  const rows: SleepCsvPreview["rows"] = [];
  const skipped: SleepCsvPreview["skipped"] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const dateRaw = cells[0] ?? "";
    if (!ISO_DATE.test(dateRaw)) {
      skipped.push({ line: i + 1, reason: `La primera columna no es una fecha (YYYY-MM-DD): "${dateRaw}"` });
      continue;
    }
    const [y, mo, d] = dateRaw.split("-").map((n) => parseInt(n, 10));
    const measuredAt = Date.UTC(y, mo - 1, d, 12, 0, 0);

    const entries: BodyMetricEntry[] = [];
    for (let c = 1; c < header.length; c++) {
      const metric = colMetric[c];
      if (!metric) continue;
      const cell = (cells[c] ?? "").trim();
      if (cell === "") continue;
      const value = HM_METRICS.has(metric) ? parseHmToHours(cell) : Number(cell);
      if (value == null || !Number.isFinite(value)) continue;
      const [min, max] = METRIC_RANGES[metric];
      if (value < min || value > max) continue; // fuera de rango → se omite esa métrica
      entries.push({ metricType: metric, value });
    }

    if (entries.length === 0) {
      skipped.push({ line: i + 1, reason: "La fila no tiene ninguna métrica válida" });
      continue;
    }
    rows.push({ date: dateRaw, measuredAt, entries });
  }

  if (rows.length === 0) throw new Error("No se pudo leer ninguna noche del CSV");
  // Valida la forma de salida antes de devolver (mismo patrón que parseFit → Schema.parse).
  return SleepCsvPreviewSchema.parse({ rows, skipped });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `bun test backend/src/metrics/parseSleepCsv.test.ts`
Expected: PASS (los 6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/metrics/parseSleepCsv.ts backend/src/metrics/parseSleepCsv.test.ts
git commit -S -m "feat(sueño): parser del CSV de sueño de Garmin (puro, mediodía UTC)"
```

---

## Task 4: Insert con dedupe (backend repository)

**Files:**
- Modify: `backend/src/metrics/repository.ts`
- Test: `backend/src/metrics/repository.test.ts` (ya existe; agregar tests)

- [ ] **Step 1: Escribir el test que falla**

En `backend/src/metrics/repository.test.ts` agregar (importar `insertReadingsDedup` arriba):
```ts
test("insertReadingsDedup inserta solo las métricas que no existían", async () => {
  const inserted: any[] = [];
  const db: any = {
    select: () => ({ from: () => ({ where: async () => [
      { metricType: "sleep_score", measuredAt: 100 }, // ya existe
    ] }) }),
    insert: () => ({ values: async (v: any[]) => { inserted.push(...v); } }),
  };
  const rows = [
    { measuredAt: 100, entries: [{ metricType: "sleep_score", value: 85 }, { metricType: "hrv", value: 45 }] },
    { measuredAt: 200, entries: [{ metricType: "sleep_score", value: 60 }] },
  ];
  const res = await insertReadingsDedup(db, "u1", rows);
  expect(res.imported).toBe(2); // hrv@100 + sleep_score@200
  expect(res.duplicates).toBe(1); // sleep_score@100
  expect(inserted).toHaveLength(2);
  expect(inserted.every((r) => r.userId === "u1")).toBe(true);
});

test("insertReadingsDedup no inserta si no hay filas nuevas", async () => {
  let insertCalled = false;
  const db: any = {
    select: () => ({ from: () => ({ where: async () => [{ metricType: "sleep_score", measuredAt: 100 }] }) }),
    insert: () => ({ values: async () => { insertCalled = true; } }),
  };
  const res = await insertReadingsDedup(db, "u1", [{ measuredAt: 100, entries: [{ metricType: "sleep_score", value: 85 }] }]);
  expect(res.imported).toBe(0);
  expect(res.duplicates).toBe(1);
  expect(insertCalled).toBe(false);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `bun test backend/src/metrics/repository.test.ts`
Expected: FAIL (`insertReadingsDedup` no existe).

- [ ] **Step 3: Escribir la función**

En `backend/src/metrics/repository.ts` (ya importa `and, eq, gte, lte` y `bodyMetric`), agregar:
```ts
// Inserta las lecturas de un import deduplicando por (metricType, measuredAt) contra lo que ya
// existe en el rango — así reimportar ventanas de 7 días superpuestas es idempotente.
export async function insertReadingsDedup(
  db: Db,
  userId: string,
  rows: { measuredAt: number; entries: { metricType: string; value: number }[] }[],
): Promise<{ imported: number; duplicates: number }> {
  // Aplana + dedupea dentro del propio batch (por si el CSV repitiera una fecha).
  const batchSeen = new Set<string>();
  const all: { metricType: string; value: number; measuredAt: number }[] = [];
  for (const r of rows) {
    for (const e of r.entries) {
      const k = `${e.metricType}@${r.measuredAt}`;
      if (batchSeen.has(k)) continue;
      batchSeen.add(k);
      all.push({ metricType: e.metricType, value: e.value, measuredAt: r.measuredAt });
    }
  }
  if (all.length === 0) return { imported: 0, duplicates: 0 };

  const times = all.map((x) => x.measuredAt);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const existing = await db
    .select({ metricType: bodyMetric.metricType, measuredAt: bodyMetric.measuredAt })
    .from(bodyMetric)
    .where(and(eq(bodyMetric.userId, userId), gte(bodyMetric.measuredAt, min), lte(bodyMetric.measuredAt, max)));
  const seen = new Set(existing.map((r) => `${r.metricType}@${r.measuredAt}`));

  const toInsert = all.filter((x) => !seen.has(`${x.metricType}@${x.measuredAt}`));
  const duplicates = all.length - toInsert.length;
  if (toInsert.length > 0) {
    await db.insert(bodyMetric).values(
      toInsert.map((x) => ({ userId, metricType: x.metricType, value: x.value, measuredAt: x.measuredAt })),
    );
  }
  return { imported: toInsert.length, duplicates };
}
```

- [ ] **Step 4: Correr el test + typecheck**

Run: `bun test backend/src/metrics/repository.test.ts && bun run --filter @pulsia/backend typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/metrics/repository.ts backend/src/metrics/repository.test.ts
git commit -S -m "feat(sueño): insertReadingsDedup (import idempotente por noche)"
```

---

## Task 5: Rutas de import (backend)

**Files:**
- Modify: `backend/src/routes/metrics.ts`
- Test: `backend/src/routes/metrics.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `backend/src/routes/metrics.test.ts` agregar (mismo estilo de fake-db del archivo). Usar base64 de un CSV mínimo:
```ts
const SLEEP_CSV =
  "Sleep Score 7 Days,Score,Resting Heart Rate,Body Battery,Pulse Ox,Respiration,HRV Status,Quality,Duration,Sleep Need,Bedtime,Wake Time\n" +
  "2026-07-17,70,60,50,97.00,15.00,40,Good,7h 42min,8h 45min,11:52 PM,7:34 AM";
const SLEEP_B64 = Buffer.from(SLEEP_CSV).toString("base64");

test("POST /metrics/import/sleep/parse devuelve el preview sin persistir", async () => {
  let inserted = false;
  const db: any = { insert: () => ({ values: () => { inserted = true; return { returning: async () => [] }; } }) };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/sleep/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: SLEEP_B64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.rows).toHaveLength(1);
  expect(body.rows[0].date).toBe("2026-07-17");
  expect(inserted).toBe(false);
});

test("POST /metrics/import/sleep/parse con base64 basura → 400 legible", async () => {
  const db: any = {};
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/sleep/parse", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: Buffer.from("no es un csv").toString("base64") }),
  });
  expect(res.status).toBe(400);
});

test("POST /metrics/import/sleep inserta y devuelve conteos", async () => {
  const values: any[] = [];
  const db: any = {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({ values: async (v: any[]) => { values.push(...v); } }),
  };
  const app = createApp({ db, config: baseConfig, aiClient } as any);
  const res = await app.request("/metrics/import/sleep", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csvBase64: SLEEP_B64 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.imported).toBe(8); // 8 métricas numéricas en la fila
  expect(body.duplicates).toBe(0);
  expect(values.length).toBe(8);
});
```
> Nota: `baseConfig` y `aiClient` ya están definidos en el archivo (ver el resto de `metrics.test.ts`). Si `aiClient` no existe en ese archivo, usar `{} as any` como en los otros tests de ruta.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `bun test backend/src/routes/metrics.test.ts`
Expected: FAIL (rutas no existen → 404).

- [ ] **Step 3: Escribir las rutas**

En `backend/src/routes/metrics.ts`:
- Agregar imports arriba:
```ts
import { z } from "zod";
import { parseSleepCsv } from "../metrics/parseSleepCsv";
import { insertReading, getMetrics, getLatestMetrics, deleteMetric, insertReadingsDedup } from "../metrics/repository";
```
(reemplazar la línea de import de `../metrics/repository` existente por la de arriba).

- Dentro de `metricsRoutes`, ANTES de `r.delete("/:id", …)`, agregar:
```ts
  const ImportSleepSchema = z.object({ csvBase64: z.string().min(1) });
  // Tope: ~2.2 MB de CSV → base64 ~3 MB. Un export de sueño típico son unos pocos KB.
  const MAX_CSV_B64 = 3_000_000;

  r.post("/import/sleep/parse", async (c) => {
    const parsed = ImportSleepSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Falta el archivo CSV" }, 400);
    if (parsed.data.csvBase64.length > MAX_CSV_B64) return c.json({ error: "El archivo es demasiado grande" }, 400);
    const csv = Buffer.from(parsed.data.csvBase64, "base64").toString("utf8");
    try {
      return c.json(parseSleepCsv(csv));
    } catch (e) {
      return c.json({ error: (e as Error).message || "No se pudo leer el CSV" }, 400);
    }
  });

  r.post("/import/sleep", async (c) => {
    const parsed = ImportSleepSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Falta el archivo CSV" }, 400);
    if (parsed.data.csvBase64.length > MAX_CSV_B64) return c.json({ error: "El archivo es demasiado grande" }, 400);
    const csv = Buffer.from(parsed.data.csvBase64, "base64").toString("utf8");
    let preview;
    try {
      preview = parseSleepCsv(csv);
    } catch (e) {
      return c.json({ error: (e as Error).message || "No se pudo leer el CSV" }, 400);
    }
    const { imported, duplicates } = await insertReadingsDedup(deps.db, c.get("userId"), preview.rows);
    return c.json({ imported, duplicates, rows: preview.rows, skipped: preview.skipped });
  });
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `bun test backend/src/routes/metrics.test.ts && bun run --filter @pulsia/backend typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/metrics.ts backend/src/routes/metrics.test.ts
git commit -S -m "feat(sueño): endpoints /metrics/import/sleep (preview + import)"
```

---

## Task 6: Clientes de API (mobile)

**Files:**
- Modify: `mobile/src/api/metrics.ts`
- Test: `mobile/__tests__/sleep-import.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `mobile/__tests__/sleep-import.test.ts`:
```ts
import { parseSleepCsv, importSleepCsv } from "../src/api/metrics";

jest.mock("../src/storage/authToken", () => ({ getToken: async () => "t0ken", clearToken: async () => {} }));
jest.mock("../src/auth/unauthorized", () => ({ notifyUnauthorized: () => {} }));

function mockFetch(body: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({ ok, status, json: async () => body } as any);
}

test("parseSleepCsv POSTea a /metrics/import/sleep/parse con el base64", async () => {
  const preview = { rows: [], skipped: [] };
  global.fetch = mockFetch(preview) as any;
  const res = await parseSleepCsv("http://x", "YmFzZTY0");
  expect(res).toEqual(preview);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://x/metrics/import/sleep/parse");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ csvBase64: "YmFzZTY0" });
});

test("importSleepCsv POSTea a /metrics/import/sleep", async () => {
  const result = { imported: 3, duplicates: 1, rows: [], skipped: [] };
  global.fetch = mockFetch(result) as any;
  const res = await importSleepCsv("http://x", "YmFzZTY0");
  expect(res).toEqual(result);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://x/metrics/import/sleep");
  expect(init.method).toBe("POST");
});

test("parseSleepCsv propaga el error del backend", async () => {
  global.fetch = mockFetch({ error: "No parece un CSV de sueño" }, false, 400) as any;
  await expect(parseSleepCsv("http://x", "z")).rejects.toThrow("No parece un CSV de sueño");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `bun run --filter @pulsia/mobile test -- sleep-import`
Expected: FAIL (funciones no exportadas).

- [ ] **Step 3: Escribir los clientes**

En `mobile/src/api/metrics.ts`:
- Ampliar el import de tipos:
```ts
import type { BodyMetric, MetricReading, MetricType, SleepCsvPreview, SleepImportResult } from "@pulsia/shared";
```
- Agregar al final:
```ts
// Manda el CSV de sueño (base64) a parsear. Devuelve el preview SIN persistir; propaga el
// mensaje del backend en error (mismo patrón que parseFitCardio).
export async function parseSleepCsv(baseUrl: string, csvBase64: string): Promise<SleepCsvPreview> {
  const res = await apiFetch(baseUrl, "/metrics/import/sleep/parse", { method: "POST", body: JSON.stringify({ csvBase64 }) });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo leer el CSV de sueño");
  }
  return (await res.json()) as SleepCsvPreview;
}

// Importa el CSV de sueño (dedupe por noche en el backend). Devuelve conteos + preview usado.
export async function importSleepCsv(baseUrl: string, csvBase64: string): Promise<SleepImportResult> {
  const res = await apiFetch(baseUrl, "/metrics/import/sleep", { method: "POST", body: JSON.stringify({ csvBase64 }) });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo importar el sueño");
  }
  return (await res.json()) as SleepImportResult;
}
```

- [ ] **Step 4: Correr el test + typecheck**

Run: `bun run --filter @pulsia/mobile test -- sleep-import && bun run --filter @pulsia/mobile typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/metrics.ts mobile/__tests__/sleep-import.test.ts
git commit -S -m "feat(sueño): clientes de API parseSleepCsv/importSleepCsv (móvil)"
```

---

## Task 7: Pantalla de import + botón de entrada (mobile)

**Files:**
- Create: `mobile/app/importar-sueno.tsx`
- Modify: `mobile/app/(tabs)/progreso.tsx`

- [ ] **Step 1: Crear la pantalla**

Create `mobile/app/importar-sueno.tsx` (mirar `mobile/app/cardio.tsx` para tokens de tema y patrón de picker/spinner):
```tsx
import { useRef, useState, useEffect } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import type { SleepCsvPreview, SleepImportResult } from "@pulsia/shared";
import { parseSleepCsv, importSleepCsv } from "../src/api/metrics";
import { getBackendUrl } from "../src/storage/config";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

export default function ImportarSueno() {
  const router = useRouter();
  const baseUrl = useRef<string | null>(null);
  const pad = useScreenPadding();
  const [csvB64, setCsvB64] = useState<string | null>(null);
  const [preview, setPreview] = useState<SleepCsvPreview | null>(null);
  const [result, setResult] = useState<SleepImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getBackendUrl().then((u) => { baseUrl.current = u; }); }, []);

  async function onPick() {
    const url = baseUrl.current;
    if (!url) { setError("Configurá el backend"); return; }
    setError(null); setResult(null); setPreview(null); setCsvB64(null);
    let picked;
    try {
      // `.csv` no tiene un MIME confiable en todos los dispositivos → abrir "*/*".
      picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    } catch { setError("No se pudo abrir el selector de archivos"); return; }
    if (picked.canceled || !picked.assets || picked.assets.length === 0) return;
    setBusy(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: "base64" });
      const pv = await parseSleepCsv(url, b64);
      setCsvB64(b64); setPreview(pv);
    } catch (e) {
      setError((e as Error).message || "No se pudo leer el CSV");
    } finally { setBusy(false); }
  }

  async function onConfirm() {
    const url = baseUrl.current;
    if (!url || !csvB64) return;
    setBusy(true); setError(null);
    try {
      const r = await importSleepCsv(url, csvB64);
      setResult(r); setPreview(null); setCsvB64(null);
    } catch (e) {
      setError((e as Error).message || "No se pudo importar");
    } finally { setBusy(false); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, ...pad }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Importar sueño de Garmin</Text>
      <Text style={{ color: colors.textMuted }}>
        Exportá el CSV de sueño desde Garmin Connect y elegilo acá. Se guardan puntaje, FC en reposo,
        Body Battery, Pulse Ox, respiración, HRV, duración y sueño necesario, una fila por noche.
      </Text>

      <Pressable testID="sleep-pick" onPress={onPick} disabled={busy}
        style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
        {busy && !preview ? <ActivityIndicator color={colors.accent} /> : <Text style={{ color: colors.accentText, fontWeight: "600" }}>Elegir archivo CSV</Text>}
      </Pressable>

      {error ? <Text testID="sleep-error" style={{ color: colors.danger }}>{error}</Text> : null}

      {preview ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>
            {preview.rows.length} noche{preview.rows.length === 1 ? "" : "s"} detectada{preview.rows.length === 1 ? "" : "s"}
            {preview.skipped.length > 0 ? ` · ${preview.skipped.length} fila(s) salteada(s)` : ""}
          </Text>
          {preview.rows.slice(0, 14).map((row) => {
            const score = row.entries.find((e) => e.metricType === "sleep_score")?.value;
            const dur = row.entries.find((e) => e.metricType === "sleep_hours")?.value;
            return (
              <View key={row.date} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text }}>{row.date}</Text>
                <Text style={{ color: colors.textMuted }}>
                  {score != null ? `score ${score}` : "—"}{dur != null ? ` · ${dur.toFixed(1)} h` : ""}
                </Text>
              </View>
            );
          })}
          <Pressable testID="sleep-confirm" onPress={onConfirm} disabled={busy}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>{busy ? "Importando…" : "Importar"}</Text>
          </Pressable>
        </View>
      ) : null}

      {result ? (
        <View style={{ gap: spacing.sm }}>
          <Text testID="sleep-result" style={{ color: colors.text, fontWeight: "600" }}>
            {result.imported} medición(es) importada(s){result.duplicates > 0 ? ` · ${result.duplicates} ya estaban` : ""}.
          </Text>
          <Pressable testID="sleep-done" onPress={() => router.back()}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Listo</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}
```
> Si `colors.danger`, `colors.accentText`, `colors.bg`, `spacing.sm/lg` o `useScreenPadding` no existen con ese nombre, usar los que sí estén en `mobile/src/theme/tokens.ts` (mirar cómo los usa `cardio.tsx`).

- [ ] **Step 2: Agregar el botón de entrada en progreso**

En `mobile/app/(tabs)/progreso.tsx`, importar el router si no está (`import { useRouter } from "expo-router";` y `const router = useRouter();` dentro del componente), y justo DEBAJO del bloque `<Pressable testID="act-save" …>` (fin de la sección "Actividad y recuperación", ~línea 328), agregar:
```tsx
        <Pressable testID="sleep-import-cta" onPress={() => router.push("/importar-sueno")}
          style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: colors.accentText ?? colors.accent, fontWeight: "600" }}>Importar sueño de Garmin (CSV)</Text>
        </Pressable>
```

- [ ] **Step 3: Typecheck**

Run: `bun run --filter @pulsia/mobile typecheck`
Expected: PASS (ajustar nombres de tokens si el compilador se queja).

- [ ] **Step 4: Correr toda la suite de móvil**

Run: `bun run --filter @pulsia/mobile test`
Expected: PASS (ninguna regresión).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/importar-sueno.tsx "mobile/app/(tabs)/progreso.tsx"
git commit -S -m "feat(sueño): pantalla de import de CSV + acceso desde Progreso"
```

---

## Task 8: Verificación final

- [ ] **Step 1: Typecheck de todo**

Run: `bun run typecheck`
Expected: PASS (shared + backend + mobile).

- [ ] **Step 2: Tests de shared + backend**

Run: `bun test`
Expected: PASS.

- [ ] **Step 3: Tests de móvil**

Run: `bun run test:mobile`
Expected: PASS.

- [ ] **Step 4: (si algo falla) usar systematic-debugging antes de tocar nada.**

---

## Self-review del plan

- **Cobertura del spec:** 6 tipos nuevos (T1) ✓; schema preview/resultado (T2) ✓; parser puro con mediodía UTC + parseHmToHours + mapeo por header + rango + fila saltada (T3) ✓; dedupe idempotente (T4) ✓; endpoints parse+import (T5) ✓; clientes móviles (T6) ✓; pantalla + acceso (T7) ✓; verificación (T8) ✓. `Quality`/`Bedtime`/`Wake Time` omitidos por diseño (no mapeados en `HEADER_TO_METRIC`) ✓.
- **Placeholders:** ninguno. Todo paso que toca código muestra el código completo.
- **Consistencia de tipos:** `SleepCsvPreview`/`SleepImportResult`/`SleepCsvRow` definidos en T2 y usados igual en T3/T5/T6/T7. `insertReadingsDedup` firma idéntica en T4 y T5. `parseSleepCsv`/`parseHmToHours` idénticos T3↔uso.
