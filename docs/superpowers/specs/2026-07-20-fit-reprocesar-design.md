# Reprocesar el `.FIT` guardado — Fase 3 — Diseño

**Fecha:** 2026-07-20
**Rama:** `feat/fit-reprocesar` (desde `origin/main` @ `851b20b`)
**Antecede:** #160 (captura, guarda el `.FIT` crudo), #167 (visualización), #172 (fix de propagación)

## Objetivo

Rellenar los datos ricos de una actividad **desde el `.FIT` crudo ya guardado**, sin que el usuario
reimporte. Caso concreto e inmediato: las actividades importadas antes del fix #172 tienen el archivo
guardado en `cardio_fit_file` pero `samples`/`fitExtras`/escalares en NULL. Caso futuro: cuando
mejore el parser (p. ej. si confirmamos qué es el campo `143`), reprocesar el histórico.

**Cero UI de datos nueva** más allá de un botón: reusa el parser y la pantalla de detalle existentes.

## El núcleo

`reprocessActivity(db, id, userId): Promise<ReprocessResult>` (backend):
1. Carga los `bytes` del `.FIT` de `cardio_fit_file` por `activityId`, **validando que la actividad
   sea de este `userId`** (una actividad de otro usuario → como si no existiera).
2. Si no hay archivo → devuelve `{ status: "no-file" }`. Nada que reprocesar (actividades pre-Fase 1).
3. Corre `parseFit(bytes)` — el mismo parser puro del import. Si tira (archivo corrupto / ya no
   parsea) → `{ status: "parse-error", message }`, la actividad **queda intacta**.
4. Actualiza la actividad **respetando lo editado por el usuario** y refrescando el resto:
   - **Se preservan:** `type`, `durationMs`, `distanceM`, `avgHr`, `notes` — exactamente los campos
     que el formulario de edición puede tocar (los 4 que `buildFitActivity` sobreescribe con el form,
     más `notes`).
   - **Se refrescan desde el parse:** `samples`, `fitExtras`, `maxHr`, `elevationGainM`, `kcal`, y los
     13 escalares de la Fase 1 (`totalCycles`, `trainingLoad`, `trainingEffect*`, `avgCadence`,
     `maxCadence`, `avgFractionalCadence`, `avg/max/minRespiration`, `metabolicKcal`,
     `sportProfileName`, `tzOffsetMinutes`).
   - `hrSeries` se deja como está (histórico; el móvil ya prioriza `samples`).
   - Devuelve `{ status: "ok" }`.

**Idempotente:** correrlo dos veces da el mismo resultado. Alinear la lista de "preservados" con el
override de `buildFitActivity` no es casual: es la misma costura, definida una sola vez conceptualmente.

## Repositorio

- `getCardioFitFileBytes(db, activityId, userId): Promise<Buffer | null>` — join liviano
  `cardio_fit_file` ⋈ `cardio_activity` filtrando por `userId`; devuelve los bytes o null.
- `updateCardioFromFit(db, id, userId, derived)` — UPDATE que setea SOLO los campos refrescados
  (nunca los preservados), con `updatedAt`. Distinto de `updateCardio` (que es para el form).
- `listReprocessableIds(db, userId): Promise<string[]>` — ids de actividades del usuario que tienen
  fila en `cardio_fit_file` (para el reproceso masivo). Sin traer binarios.

## Rutas (bajo `/cardio`, auth heredada)

- `POST /cardio/:id/reprocess` — llama a `reprocessActivity`. Mapea el resultado: `ok` → 200
  `{ status:"ok" }`; `no-file` → 404 `{ error:"esta actividad no tiene archivo guardado" }`;
  `parse-error` → 400 con el mensaje. Debe declararse de forma que no choque con `GET /:id`
  (es POST y con sufijo `/reprocess`, así que no colisiona).
- `POST /cardio/reprocess-all` — `listReprocessableIds` → `reprocessActivity` de cada una →
  devuelve `{ reprocesadas, sinArchivo, fallidas }` (contadores). Acotado al `userId` del token.
  **Literal antes de `/:id`** en el registro para que el router no lo capture como un id.

## `getCardio` suma `hasFitFile`

`GET /cardio/:id` (detalle) agrega un booleano `hasFitFile` vía `EXISTS` sobre `cardio_fit_file`,
sin traer el binario. `CardioActivitySchema` gana `hasFitFile: z.boolean().optional()`. El listado
(`listCardio`) **no** lo trae (sigue liviano; el detalle es el único que lo necesita).

## Móvil

- `mobile/src/api/cardio.ts`: `reprocessCardio(baseUrl, id)` → `POST /cardio/:id/reprocess`;
  `reprocessAllCardio(baseUrl)` → `POST /cardio/reprocess-all`.
- `mobile/app/actividad.tsx`: si `a.source === "fit" && a.hasFitFile && !a.samples`, mostrar un botón
  **"Reprocesar desde el archivo"**. Al tap: llama a `reprocessCardio`, y al volver recarga la
  actividad (re-fetch `getCardioById`) para que aparezcan tiles/gráficos/zonas. Spinner mientras corre;
  error legible si falla.
- El reproceso masivo (`reprocess-all`) se expone como una acción discreta en Configuración
  ("Reprocesar actividades de Garmin"), que muestra el resumen de contadores. Es la herramienta para
  después de mejorar el parser.

## Errores

Archivo corrupto → 400 legible, actividad intacta. Actividad de otro usuario → 404 (no se filtra su
existencia). Sin archivo → 404 con mensaje claro. El masivo nunca aborta por una que falle: cuenta la
fallida y sigue.

## Testing

- **backend:** `reprocessActivity` con fixture sintético (`buildFitFixture`): con archivo → refresca
  los derivados y **preserva** `type`/`durationMs`/`distanceM`/`avgHr`/`notes` (test explícito de que
  una edición previa sobrevive); sin archivo → `no-file`; bytes que no parsean → `parse-error` sin
  tocar la fila. `listReprocessableIds` filtra por usuario. Rutas: `:id/reprocess` (200/404/400) y
  `reprocess-all` (cuenta ok/sin-archivo/fallida) con la fake-db. `getCardio` devuelve `hasFitFile`.
- **móvil:** los dos clientes de API pegan a la URL correcta; el botón aparece solo con
  `hasFitFile && !samples`.
- Fixtures **sintéticos**, nunca datos reales.

## Verificación

`bun run typecheck && bun run test && bun run test:mobile`

## Fuera de alcance

Reprocesar actividades sin archivo guardado (pre-Fase 1: no hay bytes que leer). Interpretar
`135`/`136`/`144`. Migración de datos automática al deploy (el reproceso es on-demand, no en el arranque).
