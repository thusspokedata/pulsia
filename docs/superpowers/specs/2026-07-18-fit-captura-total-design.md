# Captura total del `.FIT` — Fase 1 (captura) — Diseño

**Fecha:** 2026-07-18
**Rama:** `feat/fit-captura-total` (desde `origin/main` @ `72d0efe`)
**Antecede:** #152 (import .FIT), #157 (imports CSV)

## Objetivo

Dejar de descartar el 90% de lo que trae un `.FIT`. Hoy `parseFit.ts` extrae 8 escalares y la serie
de FC, y **el archivo se tira** ("solo transporte"). El usuario quiere que **no se pierda nada**.

Fase 1 = **captura**, sin UI nueva. Los datos quedan guardados esperando la Fase 2 (visualización).

## Hallazgos de un `.FIT` de elíptica (~29 KB, ~30 min, 440 records)

Decodificado con `@garmin/fitsdk` a partir de un archivo real, **inspeccionado solo localmente**.
Los valores concretos de esa sesión son datos de salud personales y **no se transcriben acá**: lo
que importa para el diseño es de qué mensaje sale cada cosa. Se verificó que los números del
archivo coinciden con lo que muestra Garmin Connect, así que las capturas del usuario sirven de
spec visual para la Fase 2.

| Dato de la pantalla | De dónde sale |
|---|---|
| Tiempo en zonas Z1–Z5 | `timeInZoneMesgs.timeInHrZone` (segundos por zona) |
| Fronteras de zona · FC máx · umbral | `timeInZoneMesgs.hrZoneHighBoundary` · `zonesTargetMesgs` |
| Atleta (peso, altura, FC reposo) | `userProfileMesgs` — **incluye el NOMBRE: ver §Testing** |
| Carga de entrenamiento · Efecto aeróbico | `trainingLoadPeak` · `totalTrainingEffect` |

**Mensajes presentes:** `fileIdMesgs`, `fileCreatorMesgs`, `activityMesgs`, `sessionMesgs`,
`timeInZoneMesgs`(2), `lapMesgs`, `timestampCorrelationMesgs`, `eventMesgs`(2),
`deviceInfoMesgs`(14), `deviceSettingsMesgs`, `userProfileMesgs`, `sportMesgs`,
`trainingSettingsMesgs`, `zonesTargetMesgs`, `recordMesgs`(440).

**Escalares de sesión que hoy se tiran:** `totalCycles`, `trainingLoadPeak`, `totalTrainingEffect`,
`totalAnaerobicTrainingEffect`, `avgCadence`, `maxCadence`, `avgFractionalCadence`,
`maxFractionalCadence`, `enhancedAvgRespirationRate`, `enhancedMaxRespirationRate`,
`enhancedMinRespirationRate`, `metabolicCalories`, `sportProfileName`, `numLaps`.

**Campos desconocidos:** con `read({ includeUnknownData: true })` el SDK **sí** expone los campos
que no sabe nombrar (llegan con clave numérica, p. ej. `135`, `136`, `143`, `144`). En el archivo
inspeccionado, uno de ellos replica exacto a `heartRate` y otro decrece de forma monótona a lo largo
de la sesión (comportamiento consistente con Body Battery); el resto sin identificar. **Se guardan
crudos, sin interpretar** — ponerles nombre es trabajo de otra fase.

**Canales dispersos:** `enhancedRespirationRate` aparece en 162/440 records y `cycleLength16` en
69/440. El stream debe tolerar huecos **por canal**; no es una matriz completa.

**El archivo trae su propia zona horaria:** `activityMesgs.localTimestamp` − `timestamp` = **+2 h**.
Para cardio se usa ésa y NO el offset del cliente: es correcto aunque importes desde un teléfono en
otra zona de donde entrenaste.

## Arquitectura

### `cardio_fit_file` — tabla nueva, el archivo crudo
`activity_id` (uuid PK → `cardio_activity.id`, on delete cascade), `bytes` (bytea), `size_bytes`
(int), `sha256` (text), `created_at`. **En tabla aparte a propósito**: los listados de actividades
no deben arrastrar el binario. 29 KB por actividad ⇒ ~7,6 MB/año a 5 por semana.

Es lo que habilita el reprocesamiento futuro: el día que sepamos qué es el campo `143`, se
backfillea el histórico sin pedirle al usuario que reimporte nada.

### `cardio_activity` — columnas nuevas
Escalares que van a los tiles y que podrían graficarse en el tiempo: `total_cycles`,
`training_load`, `training_effect_aerobic`, `training_effect_anaerobic`, `avg_cadence`,
`max_cadence`, `avg_fractional_cadence`, `avg_respiration`, `max_respiration`, `min_respiration`,
`metabolic_kcal`, `sport_profile_name`, `tz_offset_minutes`.

Más dos jsonb:
- **`samples`** — stream multicanal **columnar**: `{ t: number[], hr?, cad?, fracCad?, resp?,
  cycleLen?, unknown?: Record<string, (number|null)[]> }`. Columnar y no fila-por-muestra porque
  comprime mucho mejor en TOAST y se grafica canal por canal. Los huecos son `null`.
- **`fit_extras`** — `{ zones?, devices?, athlete?, laps?, events? }`. Display, no se consulta.

### `hr_series` → `samples`
La migración **backfillea** `samples` desde `hr_series` (array de `{t,bpm}` → `{t:[…], hr:[…]}`).
`hr_series` se conserva por ahora; el móvil lee `samples` y **cae a `hrSeries`** si no está, así las
actividades viejas siguen graficando. Un solo modelo hacia adelante.

### Parser
`parseFit.ts` pasa a `read({ includeUnknownData: true, applyScaleAndOffset: true, expandSubFields:
true, convertTypesToStrings: true, convertDateTimesToDates: true })` y extrae todo lo de arriba.
Sigue validando la salida contra el schema antes de devolver, y cualquier throw sigue siendo un 400
legible (nunca 500 con stack).

### El archivo tiene que llegar al server para guardarse
Hoy `/cardio/parse` recibe el `fitBase64` y devuelve el preview, y después el móvil hace
`POST /cardio` **sin el archivo**. Se agrega `fitBase64` opcional al body de `POST /cardio`: si
viene y `source === "fit"`, se guarda en `cardio_fit_file`. 29 KB ⇒ ~39 KB en base64; el tope
existente (`MAX_FIT_B64`, 7 MB) ya cubre.

## Fuera de alcance (Fase 1)

- **UI nueva**: los tiles y gráficos son Fase 2 (las capturas del usuario son su spec).
- **Reprocesamiento**: Fase 3. Hoy no hay archivos guardados que reprocesar.
- **Interpretar `135/136/143/144`**: se guardan crudos.
- **Actividades ya importadas**: no tienen el archivo (se descartaba). Quedan con los datos viejos
  salvo que el usuario las reimporte. No hay forma de recuperarlas sin los `.FIT` originales.

## Testing

- **Fixture SINTÉTICO, nunca el archivo real.** El repo es **público** y el `.FIT` del usuario trae
  su nombre, peso, altura, FC en reposo y FC máxima: commitearlo publicaría datos de salud
  personales, de forma permanente por el historial de git. Se extiende el generador que ya existe
  (`backend/src/cardio/fitFixture.ts`, que sintetiza `.FIT` con el `Encoder` del SDK) para emitir
  también `timeInZoneMesgs`, `userProfileMesgs`, `zonesTargetMesgs`, `deviceInfoMesgs`, `lapMesgs`,
  `eventMesgs` y campos desconocidos, con datos inventados.
- El archivo real del usuario se usa **solo localmente** para contrastar que el parser saca los
  valores correctos (ciclos, carga, efecto, cadencia, respiración, tiempos por zona y offset).
  **Esos valores NO se transcriben a ningún archivo del repo** — ni acá, ni en comentarios, ni en
  tests: son datos de salud y el historial de git es permanente.
- `parseFit` (contra el fixture sintético): extrae los escalares nuevos; zonas con sus tiempos y
  fronteras; snapshot del atleta; offset derivado de `localTimestamp`; el stream columnar con
  `null` en los huecos de los canales dispersos; y los campos desconocidos presentes y **sin
  interpretar**.
- Migración 0021 verificada contra Postgres efímero: backfill de `hr_series`→`samples`, y no-op en
  re-run.
- Ruta: `POST /cardio` con `fitBase64` guarda el archivo; sin él, no rompe (manual).

## Verificación
`bun run typecheck && bun run test && bun run test:mobile`
