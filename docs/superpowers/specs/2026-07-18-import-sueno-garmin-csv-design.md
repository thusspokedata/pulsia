# Import de CSV de sueño de Garmin — Diseño

**Fecha:** 2026-07-18
**Estado:** aprobado (el usuario autorizó explícitamente ejecutar hasta el merge: "PR → code review de @claude → aplicar cambios → nuevo review si hace falta → merge → OTA")
**Rama:** `feat/import-sueno-garmin-csv` (desde `origin/main` @ `ad7dee0`)

## Objetivo

Importar el CSV de **sueño** que exporta Garmin Connect y persistir sus campos numéricos
en el modelo de métricas existente (`body_metric`), para alimentar el dominio de
estrés / estado holístico. El usuario pidió puntualmente el **sleep score**.

## Alcance (decisiones tomadas en brainstorming)

- **Solo el CSV de Sleep** (Weight y Steps quedan fuera de esta versión).
- **Todos los campos numéricos** del CSV. Se omiten los no-numéricos (`Quality` = Good/Fair/Poor)
  y los metadatos de hora (`Bedtime`, `Wake Time`).
- **Ingesta desde el móvil**, replicando el patrón del import de `.FIT` de cardio:
  file-picker → base64 → backend parsea → preview → confirmar → guardar.

## Formato real del CSV (muestra provista)

```
Sleep Score 7 Days,Score,Resting Heart Rate,Body Battery,Pulse Ox,Respiration,HRV Status,Quality,Duration,Sleep Need,Bedtime,Wake Time
2026-07-17,70,60,50,97.00,15.00,40,Good,7h 42min,8h 45min,11:52 PM,7:34 AM
```

Notas del formato:
- La **columna 0** tiene el header `Sleep Score 7 Days` pero su contenido es la **fecha ISO**
  (`YYYY-MM-DD`) de la noche/mañana. Es una rareza de Garmin: el header no describe la columna.
- `Duration` y `Sleep Need` vienen como `"7h 42min"` / `"8h 45min"` → parsear a horas decimales.
- El resto son numéricos directos (enteros o con decimales).

## Mapeo de columnas → métrica

| Columna CSV          | metricType             | ¿Nuevo? | Rango sano   | Unidad | Notas |
|----------------------|------------------------|---------|--------------|--------|-------|
| (col 0) fecha        | — (define `measuredAt`)| —       | —            | —      | ISO `YYYY-MM-DD` |
| Score                | `sleep_score`          | **sí**  | [0, 100]     | /100   | entero |
| Resting Heart Rate   | `resting_hr`           | no      | [30, 120]    | bpm    | reusa el existente |
| Body Battery         | `body_battery`         | **sí**  | [0, 100]     | /100   | |
| Pulse Ox             | `pulse_ox`             | **sí**  | [50, 100]    | %      | decimal |
| Respiration          | `respiration`          | **sí**  | [4, 40]      | rpm    | decimal, resp/min |
| HRV Status           | `hrv`                  | **sí**  | [0, 300]     | ms     | |
| Quality              | — (omitido)            | —       | —            | —      | no numérico |
| Duration             | `sleep_hours`          | no      | [0, 24]      | h      | parsear `Xh Ymin` |
| Sleep Need           | `sleep_need_hours`     | **sí**  | [0, 24]      | h      | parsear `Xh Ymin` |
| Bedtime / Wake Time  | — (omitido)            | —       | —            | —      | metadato de hora |

**6 tipos nuevos:** `sleep_score`, `body_battery`, `pulse_ox`, `respiration`, `hrv`, `sleep_need_hours`.
Van en `ACTIVITY_METRIC_TYPES` (métricas de "flujo diario"), de modo que entran automáticamente
en `FLOW_METRIC_TYPES`, en la sección "Actividad y recuperación" del móvil, y en el resumen de
progreso de la IA (`backend/src/ai/progress.ts`).

**No hace falta migración de DB:** `body_metric.metric_type` es `text` (no un enum de Postgres),
y ya existe el índice `(user_id, metric_type, measured_at)` que usaremos para deduplicar.

## Arquitectura

### `measuredAt` determinista → import idempotente
Cada fila (una noche) se guarda con `measuredAt = mediodía UTC de la fecha`
(`Date.UTC(y, m-1, d, 12, 0, 0)`). Mediodía UTC mantiene el día de calendario estable para
la zona del usuario (UTC−3: 9 AM local, mismo día) y es 100% determinista, así que reimportar
ventanas de 7 días superpuestas **no genera duplicados**.

### Parser (backend, puro)
`backend/src/metrics/parseSleepCsv.ts` — `(csv: string) => SleepCsvPreview`:
- Primera línea = header. Se **mapea por nombre de columna** (trim + case-insensitive), no por
  índice fijo, para tolerar reordenamientos. La columna 0 se trata siempre como la fecha
  (rareza de Garmin), validando que su valor sea `YYYY-MM-DD`; si no, error legible.
- Por fila: parsea cada celda a su métrica. `Duration`/`Sleep Need` con `parseHmToHours("Xh Ymin")`.
  Celda vacía → se omite esa entrada (no la fila). Valor fuera de `METRIC_RANGES` → se omite la
  entrada y se registra un warning.
- Una fila sin ninguna entrada válida → fila saltada (con motivo). Devuelve el preview validado
  contra el schema compartido antes de retornar (mismo patrón que `parseFit` → `...Schema.parse`).
- Cualquier throw = culpa del archivo → el endpoint lo traduce a 400 legible (nunca 500 con stack).

### Schema compartido — `shared/src/schemas/metrics.ts`
- Agregar los 6 tipos a `ACTIVITY_METRIC_TYPES` + sus claves en `METRIC_UNITS`, `METRIC_LABELS`,
  `METRIC_RANGES` (los tres son `Record<MetricType,…>` exhaustivos → el compilador obliga).
- `SleepCsvRowSchema = { date: string(YYYY-MM-DD), measuredAt: int, entries: BodyMetricEntry[] }`
- `SleepCsvPreviewSchema = { rows: SleepCsvRow[], skipped: {line:int, reason:string}[] }`

### Repositorio — `backend/src/metrics/repository.ts`
`insertReadingsDedup(db, userId, rows): Promise<{ imported: number; duplicates: number }>`:
- Consulta las filas existentes del usuario en el rango `[minMeasuredAt, maxMeasuredAt]`,
  arma un `Set` de `` `${metricType}@${measuredAt}` ``, filtra las entradas ya presentes,
  hace un `insert` masivo de las restantes y devuelve los conteos. Sin filas nuevas → no inserta.

### Rutas — `backend/src/routes/metrics.ts` (montadas bajo `/metrics`, auth heredada)
- `POST /metrics/import/sleep/parse` — body `{ csvBase64 }` → decodifica → `parseSleepCsv` →
  devuelve el preview **sin persistir**. Tope de tamaño (~2 MB de CSV). Error → 400 legible.
- `POST /metrics/import/sleep` — body `{ csvBase64 }` → **re-parsea en el server** (fuente de
  verdad; no confía en una estructura del cliente) → `insertReadingsDedup` → devuelve
  `{ imported, duplicates, rows: <preview> }`.

Se declaran con paths POST propios, sin colisión con el `DELETE /:id` existente.

### Móvil
- `mobile/src/api/metrics.ts`: `parseSleepCsv(baseUrl, csvBase64)` y `importSleepCsv(baseUrl, csvBase64)`
  (espejo de `parseFitCardio`/`createCardio`, vía `apiFetch`).
- Pantalla nueva `mobile/app/importar-sueno.tsx`: elegir `.csv` con `DocumentPicker`
  (`type: "*/*"`, ya que `.csv` no tiene MIME confiable) → `FileSystem.readAsStringAsync(uri, base64)`
  → `parseSleepCsv` → preview (lista de noches: fecha + score + duración; contador de noches y de
  duplicados esperados) → botón "Importar" → `importSleepCsv` → resultado ("N importadas, M ya estaban")
  → volver. Spinner de carga como en el import de `.FIT`.
- Punto de entrada: `Pressable` "Importar sueño de Garmin (CSV)" en la sección
  "Actividad y recuperación" de `mobile/app/(tabs)/progreso.tsx`, con `router.push("/importar-sueno")`.

## Manejo de errores
- Archivo que no parsea / header incompleto / columna 0 no es fecha → **400 legible** en `/parse`.
- Filas inválidas → se saltan y se reportan en `skipped` (no tumban el import completo).
- Valores fuera de rango → se omite esa métrica puntual, el resto de la fila entra.
- Reimport de ventanas superpuestas → dedupe por `(metricType, measuredAt)` → idempotente.

## Testing
- **shared:** el test de exhaustividad (`metrics.test.ts`) ya cubre que los 6 tipos nuevos tengan
  unit/label/range. Tests del `SleepCsvPreviewSchema`.
- **backend:** `parseSleepCsv.test.ts` con la **muestra real de 7 filas** como fixture: parseo
  correcto, `parseHmToHours`, mapeo por nombre de header, `measuredAt` = mediodía UTC, fila saltada,
  valor fuera de rango, columna 0 no-fecha → error. Tests de ruta en `metrics.test.ts`:
  `/parse` devuelve preview; `/import/sleep` inserta y deduplica (con la fake-db del repo).
- **móvil:** `sleep-import.test.ts` mockea `fetch` y verifica URL/método/body de los dos clientes.

## Verificación
`bun run typecheck && bun test && bun run test:mobile`

## Fuera de alcance (registrado, no se hace ahora)
- CSVs de Weight y Steps.
- `Quality` (Good/Fair/Poor) y metadatos de hora (`Bedtime`/`Wake Time`).
- Deploy del backend a la Pi y publicación del OTA: **quedan acoplados** — el botón del móvil
  llama a un endpoint que no existe hasta desplegar el backend. Por la política de deploy no
  supervisado (usuario ausente), esto se hace juntos cuando el usuario esté presente. Ver el
  handoff al final de la sesión.
