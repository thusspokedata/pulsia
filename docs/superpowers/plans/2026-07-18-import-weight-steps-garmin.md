# Import de Weight/Steps de Garmin + mediodía local — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD por task. Commits firmados (`git commit -S`), SIN `Co-Authored-By`.

**Goal:** Importar los CSV de Weight y Steps de Garmin, y alinear todos los imports diarios al **mediodía local** (no UTC) para no duplicar series contra la carga manual.

**Architecture:** El móvil manda `tzOffsetMinutes`; el backend arma los timestamps locales. Parsers puros por CSV, validados contra schemas compartidos genéricos. Migración 0020 corrige las filas ya importadas.

**Tech Stack:** Bun, Hono, Drizzle/Postgres, Zod, React Native/Expo. Tests: `bun:test` (shared/backend), jest (mobile).

**Verify:** `bun run typecheck && bun run test && bun run test:mobile`

**Contexto clave:** #156 ya agregó el índice único `(user_id, metric_type, measured_at)` y dejó
`insertReadingsDedup` con `ON CONFLICT DO NOTHING` (**firma sin cambios**) e `insertReading` como upsert.
El template a copiar es el import de sueño de #155 (`parseSleepCsv.ts`, rutas `/metrics/import/sleep/*`,
`mobile/app/importar-sueno.tsx`).

---

## Task 1 — `steps_goal` + generalizar schemas (shared)

**Files:** `shared/src/schemas/metrics.ts`, `shared/src/schemas/sleepImport.ts` → renombrar a `metricImport.ts`, `shared/src/index.ts`

- [ ] **1.1** En `metrics.ts`, agregar `"steps_goal"` a `ACTIVITY_METRIC_TYPES` y sus claves:
  `METRIC_UNITS: steps_goal: "pasos"`, `METRIC_LABELS: steps_goal: "Objetivo de pasos"`,
  `METRIC_RANGES: steps_goal: [0, 100000]`. (Los tres Records son exhaustivos → TS obliga.)
- [ ] **1.2** `git mv shared/src/schemas/sleepImport.ts shared/src/schemas/metricImport.ts` (+ su `.test.ts`).
  Renombrar los símbolos: `SleepCsvRow*`→`MetricCsvRow*`, `SleepCsvSkipped*`→`MetricCsvSkipped*`,
  `SleepCsvPreview*`→`MetricCsvPreview*`, `SleepImportResult*`→`MetricImportResult*`.
  Agregar a `MetricCsvRowSchema` un campo opcional `label: z.string().optional()` (Weight muestra la hora).
- [ ] **1.3** Actualizar el `export *` en `index.ts` y TODOS los usos (backend `parseSleepCsv.ts`,
  `routes/metrics.ts`, mobile `api/metrics.ts`, `app/importar-sueno.tsx`). `tsc` los encuentra todos.
- [ ] **1.4** Verify: `bun test shared && bun run typecheck` → PASS. Commit:
  `feat(garmin): steps_goal + schemas de import genéricos`

---

## Task 2 — Helpers de CSV y de tiempo (backend)

**Files:** crear `backend/src/metrics/csvUtils.ts` + `csvUtils.test.ts`

- [ ] **2.1** Test primero. Casos obligatorios:
```ts
import { test, expect } from "bun:test";
import { splitCsvLine, parseUnitNumber, parse12hTime, localEpoch, localNoonEpoch } from "./csvUtils";

test("splitCsvLine respeta comillas con comas adentro", () => {
  expect(splitCsvLine('" Jul 18, 2026",')).toEqual(["Jul 18, 2026", ""]);
  expect(splitCsvLine("8:28 AM,73.2 kg,0.5 kg,")).toEqual(["8:28 AM", "73.2 kg", "0.5 kg", ""]);
});

test("parseUnitNumber saca la unidad pegada", () => {
  expect(parseUnitNumber("73.2 kg")).toBe(73.2);
  expect(parseUnitNumber("22.1 %")).toBe(22.1);
  expect(parseUnitNumber("23.4")).toBe(23.4);
  expect(parseUnitNumber("")).toBeNull();
  expect(parseUnitNumber("Good")).toBeNull();
});

test("parse12hTime convierte 12h a 24h", () => {
  expect(parse12hTime("8:28 AM")).toEqual({ h: 8, mi: 28 });
  expect(parse12hTime("1:05 PM")).toEqual({ h: 13, mi: 5 });
  expect(parse12hTime("12:27 PM")).toEqual({ h: 12, mi: 27 });   // mediodía
  expect(parse12hTime("12:05 AM")).toEqual({ h: 0, mi: 5 });     // medianoche
  expect(parse12hTime("basura")).toBeNull();
});

test("localNoonEpoch usa el offset del cliente (Berlín CEST = -120)", () => {
  // Mediodía local en CEST son las 10:00 UTC — coincide con lo que escribe la carga manual.
  expect(localNoonEpoch(2026, 7, 17, -120)).toBe(Date.UTC(2026, 6, 17, 10, 0, 0));
  // offset 0 → mediodía UTC
  expect(localNoonEpoch(2026, 7, 17, 0)).toBe(Date.UTC(2026, 6, 17, 12, 0, 0));
});

test("localEpoch arma un instante real", () => {
  expect(localEpoch(2026, 7, 18, 8, 28, -120)).toBe(Date.UTC(2026, 6, 18, 6, 28, 0));
});
```
- [ ] **2.2** Implementar:
```ts
// Split de una línea CSV respetando comillas: el export de Garmin trae la fecha como
// `" Jul 18, 2026"`, un campo entrecomillado CON una coma adentro.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// "73.2 kg" → 73.2 ; "22.1 %" → 22.1 ; "23.4" → 23.4 ; null si no arranca con número.
export function parseUnitNumber(cell: string): number | null {
  const m = cell.trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// "1:05 PM" → {h:13,mi:5}. Ojo con el 12: 12 AM = 0h, 12 PM = 12h.
export function parse12hTime(raw: string): { h: number; mi: number } | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 1 || h > 12 || mi > 59) return null;
  const pm = m[3].toUpperCase() === "PM";
  h = h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h;
  return { h, mi };
}

// offMin = Date#getTimezoneOffset() del cliente (minutos a SUMAR al local para llegar a UTC).
export function localEpoch(y: number, mo: number, d: number, h: number, mi: number, offMin: number): number {
  return Date.UTC(y, mo - 1, d, h, mi, 0) + offMin * 60000;
}
export function localNoonEpoch(y: number, mo: number, d: number, offMin: number): number {
  return localEpoch(y, mo, d, 12, 0, offMin);
}
```
- [ ] **2.3** Verify + commit: `feat(garmin): helpers de CSV con comillas y de tiempo local`

---

## Task 3 — `parseWeightCsv` (backend)

**Files:** crear `backend/src/metrics/parseWeightCsv.ts` + test

- [ ] **3.1** Test con la muestra REAL:
```ts
const SAMPLE = [
  "Time,Weight,Change,BMI,Body Fat,Skeletal Muscle Mass,Bone Mass,Body Water,",
  '" Jul 15, 2026",',
  "9:46 AM,73.3 kg,0.5 kg,23.4,22.3 %,30.5 kg,4.0 kg,56.7 %,",
  "8:40 AM,73.8 kg,0.3 kg,23.6,23.3 %,30.6 kg,4.0 kg,56.0 %,",
].join("\n");
```
Aserciones: 2 filas; `measuredAt` distintos y en orden; la de 9:46 con offset −120 =
`Date.UTC(2026,6,15,7,46,0)`; entries incluyen `weight_kg:73.3`, `body_fat_pct:22.3`,
`skeletal_muscle_mass_kg:30.5`, `bone_mass_kg:4.0`, `body_water_pct:56.7`; y **NO** incluyen
`bmi` ni nada de `Change`. Además: una fila de medición antes de cualquier fecha → `skipped`;
CSV sin ninguna fila válida → `throw`.

- [ ] **3.2** Implementar. Estructura obligatoria:
  - `MONTHS_EN = {Jan:1,…,Dec:12}`; fila de fecha = primer campo matchea `/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/`.
  - Estado `curDate: {y,mo,d} | null`. Fila de medición sin `curDate` → `skipped` con motivo.
  - Header → mapa columna→metricType por nombre (`weight`→`weight_kg`, `body fat`→`body_fat_pct`,
    `skeletal muscle mass`→`skeletal_muscle_mass_kg`, `bone mass`→`bone_mass_kg`,
    `body water`→`body_water_pct`). `change`, `bmi`, `time` y la columna vacía final NO se mapean.
  - Valores con `parseUnitNumber`; fuera de `METRIC_RANGES` → se omite esa métrica.
  - `measuredAt = localEpoch(y,mo,d,h,mi,offMin)`; `label = "YYYY-MM-DD HH:MM"`.
  - Sin entries → `skipped`. Al final `MetricCsvPreviewSchema.parse(...)`.
- [ ] **3.3** Verify + commit: `feat(garmin): parser del CSV de peso (jerárquico, instante real)`

---

## Task 4 — `parseStepsCsv` (backend)

**Files:** crear `backend/src/metrics/parseStepsCsv.ts` + test

- [ ] **4.1** Test con la muestra real (`,Actual,Goal` / `07/17/2026,19002,11170`):
  `steps:19002`, `steps_goal:11170`, `measuredAt = localNoonEpoch(2026,7,17,-120)` =
  `Date.UTC(2026,6,17,10,0,0)`. Fecha inválida (`13/45/2026`) → `skipped`. Sin filas → `throw`.
- [ ] **4.2** Implementar: col 0 = fecha `MM/DD/AAAA` (validar rango real de calendario con
  round-trip, como hace `parseSleepCsv`); `actual`→`steps`, `goal`→`steps_goal` por header.
- [ ] **4.3** Verify + commit: `feat(garmin): parser del CSV de pasos (MM/DD/AAAA + objetivo)`

---

## Task 5 — Sueño a mediodía local + rutas de los 3 imports (backend)

**Files:** `backend/src/metrics/parseSleepCsv.ts`, `backend/src/routes/metrics.ts` (+ tests)

- [ ] **5.1** `parseSleepCsv(csv, offMin)`: usar `splitCsvLine` de `csvUtils` y
  `localNoonEpoch(y,mo,d,offMin)` en vez de `Date.UTC(...,12,...)`. Actualizar su test:
  con `offMin=-120`, `measuredAt` = `Date.UTC(2026,6,17,10,0,0)`; con `offMin=0` sigue siendo mediodía UTC.
- [ ] **5.2** En `routes/metrics.ts`: extender el body a
  `z.object({ csvBase64: z.string().min(1), tzOffsetMinutes: z.number().int().min(-840).max(840).optional() })`
  (default 0) y agregar los 4 endpoints nuevos (`weight`/`steps`, `parse` + import) siguiendo
  EXACTAMENTE el patrón de los de sueño (400 legible en error del parser, tope de tamaño,
  `insertReadingsDedup` para el import). Declarar todo antes de `r.delete("/:id")`.
  **Factorizar** el handler común: los 6 endpoints difieren solo en el parser → una helper local
  `importHandler(parser, persist: boolean)` evita 6 copias.
- [ ] **5.3** Tests de ruta para weight y steps (preview no persiste; import devuelve conteos;
  base64 basura → 400). Verify + commit: `feat(garmin): endpoints de import de peso y pasos + sueño a mediodía local`

---

## Task 6 — Migración 0020 (corrección de datos)

**Files:** `backend/drizzle/0020_<nombre>.sql` + entrada en `backend/drizzle/meta/_journal.json`

- [ ] **6.1** LEER `backend/drizzle/0019_funny_crystal.sql` y `meta/_journal.json` para copiar el
  formato exacto de la entrada del journal (idx, version, when, tag, breakpoints). Como esto es una
  migración de DATOS (sin cambio de esquema), `drizzle-kit generate` no la genera: se escribe a mano
  y se agrega la entrada al journal manualmente. **No** hace falta snapshot nuevo si el esquema no cambia
  — confirmar mirando cómo está armado el journal.
- [ ] **6.2** Contenido del SQL:
```sql
-- Corrección puntual de datos: el import de sueño (#155) escribía a mediodía UTC mientras la carga
-- manual diaria escribe a mediodía LOCAL → dos filas del mismo dato por día (verificado en prod:
-- sleep_hours tenía filas a 10:00 y a 12:00 UTC el mismo día).
-- Acotada al owner: es el ÚNICO usuario con filas a mediodía UTC exacto (209; la familia tiene 0).
-- Un mediodía local nunca cae en 12:00 UTC exacto (Berlín da 10:00/11:00; Argentina 15:00), así que
-- el filtro % 86400000 = 43200000 selecciona solo filas del import.
-- Se usa AT TIME ZONE 'Europe/Berlin' (no un offset fijo) para que el DST se resuelva por fecha.

-- 1) Las que colisionarían con una fila ya existente en el destino se borran: gana lo manual,
--    misma política que el ON CONFLICT DO NOTHING del importador.
DELETE FROM body_metric b
WHERE b.user_id = 'dae98d70-dc82-4321-83cb-d020bf83beb3'
  AND b.measured_at % 86400000 = 43200000
  AND b.metric_type IN ('sleep_score','body_battery','pulse_ox','respiration','hrv','sleep_need_hours','sleep_hours','resting_hr')
  AND EXISTS (
    SELECT 1 FROM body_metric o
    WHERE o.user_id = b.user_id
      AND o.metric_type = b.metric_type
      AND o.measured_at = (EXTRACT(EPOCH FROM (
            (date_trunc('day', to_timestamp(b.measured_at/1000.0) AT TIME ZONE 'UTC') + interval '12 hours')
            AT TIME ZONE 'Europe/Berlin')) * 1000)::bigint
  );

-- 2) El resto se mueve al mediodía local.
UPDATE body_metric b
SET measured_at = (EXTRACT(EPOCH FROM (
      (date_trunc('day', to_timestamp(b.measured_at/1000.0) AT TIME ZONE 'UTC') + interval '12 hours')
      AT TIME ZONE 'Europe/Berlin')) * 1000)::bigint
WHERE b.user_id = 'dae98d70-dc82-4321-83cb-d020bf83beb3'
  AND b.measured_at % 86400000 = 43200000
  AND b.metric_type IN ('sleep_score','body_battery','pulse_ox','respiration','hrv','sleep_need_hours','sleep_hours','resting_hr');
```
- [ ] **6.3** ⚠️ **Verificar el SQL en un Postgres efímero antes de commitear** (NO contra prod):
  `docker run --rm -e POSTGRES_PASSWORD=x -p 55432:5432 -d postgres:16`, crear la tabla mínima,
  insertar filas sintéticas (una a 12:00 UTC sin colisión → debe moverse a 10:00; una a 12:00 UTC
  CON una fila manual a 10:00 → la de 12:00 debe desaparecer y quedar solo la manual; y una fila de
  OTRO user_id a 12:00 → NO debe tocarse). Pegar el output real. Commit:
  `fix(métricas): migración 0020 — mover el sueño importado al mediodía local`

---

## Task 7 — Móvil: clientes + pantalla unificada

**Files:** `mobile/src/api/metrics.ts`, crear `mobile/app/importar-garmin.tsx` (reemplaza
`importar-sueno.tsx`), `mobile/app/(tabs)/progreso.tsx`, test

- [ ] **7.1** Clientes: `parseGarminCsv(baseUrl, kind, csvBase64)` e `importGarminCsv(baseUrl, kind, csvBase64)`
  con `kind: "sleep"|"weight"|"steps"`, que pegan a `/metrics/import/${kind}[/parse]` y mandan
  `{ csvBase64, tzOffsetMinutes: new Date().getTimezoneOffset() }`. Test con fetch mockeado que
  verifica URL, método y que **el offset viaja en el body**.
- [ ] **7.2** `importar-garmin.tsx`: partir de `importar-sueno.tsx` (mismo flujo picker→preview→confirmar),
  agregando arriba un selector de 3 opciones (Sueño / Peso / Pasos) que fija `kind`. En el preview
  mostrar `row.label ?? row.date`. Borrar `importar-sueno.tsx`.
- [ ] **7.3** En `progreso.tsx`: el CTA pasa a `router.push("/importar-garmin")` con texto
  "Importar datos de Garmin (CSV)".
- [ ] **7.4** Verify: `bun run --filter @pulsia/mobile test` (suite completa) + typecheck. Commit:
  `feat(garmin): pantalla unificada de import (sueño/peso/pasos) + offset del dispositivo`

---

## Task 8 — Verificación final

- [ ] `bun run typecheck` → 0
- [ ] `bun run test` → 0 fail
- [ ] `bun run test:mobile` → 0 fail
- [ ] Si algo falla: superpowers:systematic-debugging antes de tocar nada.

## Self-review

- **Cobertura del spec:** steps_goal (T1) ✓; schemas genéricos + label (T1) ✓; splitter con comillas
  + unidades + 12h + offset (T2) ✓; Weight jerárquico con instante real (T3) ✓; Steps MM/DD/AAAA +
  goal (T4) ✓; sueño a mediodía local + 6 endpoints con tzOffsetMinutes (T5) ✓; migración 0020 con
  colisión y scope por user (T6) ✓; móvil unificado mandando offset (T7) ✓.
- **Placeholders:** ninguno; T3/T4/T6 llevan el código o la especificación exacta de comportamiento.
- **Consistencia:** `MetricCsvPreview`/`MetricImportResult` definidos en T1 y usados igual en T3–T7;
  `localEpoch`/`localNoonEpoch`/`splitCsvLine`/`parseUnitNumber`/`parse12hTime` definidos en T2 y
  consumidos con la misma firma en T3–T5.
