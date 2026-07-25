# El resumen del import de fuerza se ve completo — Diseño

**Fecha:** 2026-07-25
**Rama:** `feat/fit-fuerza-resumen` (desde `main` tras #188)
**Dominio:** 1 — Entrenamiento

> Continuación de la Pieza 1 (importar fuerza del `.FIT`, [[fit-fuerza-import-status]]). Un import ya
> se guarda como `workout_session` y se abre con el `SessionSummary` del Historial, pero se ve pobre
> porque el transformador no pobló varios campos. Esto los puebla desde el `.FIT`.

## Objetivo

Que al tocar un entrenamiento de fuerza importado en el Historial, el resumen se vea **idéntico** a
una sesión registrada en la app: tiles (tiempo, volumen, reps, carga, FC media/máx), trabajo/descanso,
por-ejercicio con FC, **curva de FC de la sesión**, **mapa corporal** y **detalle por serie** (set,
tiempo, descanso, reps, peso, volumen). El owner lo pidió con capturas del `SessionSummary` actual.

### Causa raíz de que hoy se vea pobre

`fitStrengthToSession` (backend, #186) puso **`endedAt: null`** y `startedAt` fijo en todas las
series. El `SessionSummary` (`mobile/src/session/summary.ts`) **solo cuenta las series terminadas**
(`endedAt != null`, ver `doneSetsOf`). Con `endedAt` null, un import queda con:

- detalle por serie **vacío**, trabajo/descanso mal repartido,
- reps y volumen en **0** (se calculan sobre las series terminadas aplanadas),
- FC media/máx y FC por ejercicio **vacías** (`hrAvg`/`hrMax` por serie eran null),
- **sin curva de FC** (`hrSeries` era null).

El `.FIT` tiene todo lo necesario (verificado contra el `.FIT` real del owner): cada `setMesg` activa
trae `startTime` (absoluto) + `duration`, y hay `recordMesgs` con FC continua (937 records; la FC de
una serie se obtiene promediando los records de su intervalo — probado: serie 1 → avg 90, máx 109).

## Alcance

- **Esta pieza:** poblar lo que `workout_session`/`WorkoutSession` **ya modela** — timestamps reales
  por serie, `hrAvg`/`hrMax` por serie, `hrSeries` de la sesión. Sin migración, sin UI nueva (reusa
  `SessionSummary`).
- **Fuera (Pieza 2, decidida por el owner):** lo que el reloj mide de más y `workout_session` NO
  modela — kcal medidas por Garmin, tiempo en zonas de FC, cadencia, respiración, Training Effect.
  Necesita migración + sección nueva. **Como no se guarda el `.FIT` crudo, la Pieza 2 requerirá
  re-importar el archivo** (elección del owner: no guardar el crudo ahora).

## Diseño

Todo en el backend, en el momento del import. Cero cambios en el móvil (el `SessionSummary` ya
consume estos campos).

### 1. `parseFitStrength` — `startedAt` por serie

`FitStrengthSet` gana `startedAt: number` (epoch ms, de `setMesg.startTime`). Ya tenía `durationMs`.
Si un `setMesg` no trae `startTime` (raro), la serie hereda el `startedAt` de la sesión como fallback
(no rompe; el summary la cuenta igual). El orden de las series se preserva por `startTime`.

### 2. Helper compartido `extractHrSamples(messages, sessionStartedAt)`

`backend/src/cardio/hrSamples.ts` (nuevo): recorre `recordMesgs` y devuelve `{ t: number; bpm: number }[]`
donde `t` es **epoch ms absoluto** y `bpm` la FC. Es un refactor de la lógica que `parseFit`
(cardio) ya tiene inline (`parseFit.ts:126-130`): se extrae acá y **cardio pasa a usarla**, para que
la extracción de FC viva en un solo lugar. Descarta records sin `heartRate` o sin `timestamp` válido.

### 3. `fitStrengthToSession` puebla la FC y los timestamps

Firma nueva: `fitStrengthToSession(preview, meta, hrSamples?)`. Por cada serie:

- `startedAt = set.startedAt`, `endedAt = set.startedAt + set.durationMs`, `durationMs = set.durationMs`.
- `hrAvg` = promedio redondeado de los `hrSamples` en `[startedAt, endedAt]`; `hrMax` = máximo. Si no
  hay samples en el intervalo (import sin FC), quedan `null` (el summary lo tolera).

Y a nivel sesión: `hrSeries` = los `hrSamples` **relativos a `meta.startedAt`** (`t = sample.t −
meta.startedAt`), **downsampleados a buckets de ~5 s** (promedio por bucket) para no inflar el jsonb
—misma resolución que las sesiones de la app—. Se omite si no hay FC.

### 4. La ruta `/sessions/from-fit` conecta

`POST /sessions/from-fit` (`routes/sessions.ts`): tras decodificar, extrae `hrSamples` con el helper
y se los pasa a `fitStrengthToSession`. El `/from-fit/preview` no cambia (el preview no muestra FC).

### 5. Mapa corporal — verificar, no construir

El `SessionSummary` deriva el mapa corporal de los `catalogId` de los ejercicios (que #186 ya mapea
vía `catalogIdForFit`). **Verificación:** un `catalogId` real (ej. `dumbbell_push_press`) debe pintar
sus músculos; un id sintético `fit:<category>` no está en `MUSCLE_MAP` y no pinta (aceptable: es un
ejercicio que no reconocemos). No hay código nuevo acá, solo un test que lo confirme.

## Componentes

| Archivo | Cambio |
|---|---|
| `backend/src/cardio/parseFitStrength.ts` | `startedAt` por serie (+ tipo) |
| `backend/src/cardio/hrSamples.ts` | **nuevo**: `extractHrSamples` (refactor de parseFit) |
| `backend/src/cardio/parseFit.ts` | usa `extractHrSamples` (sin cambio de comportamiento) |
| `backend/src/cardio/fitStrengthToSession.ts` | puebla timestamps reales + FC por serie + hrSeries |
| `backend/src/routes/sessions.ts` | extrae hrSamples y los pasa al transformador |

Backend puro. **Sin migración** (`workout_session` ya tiene `hr_series`, y `set_log` ya tiene
`started_at`/`ended_at`/`hr_avg`/`hr_max`). **Sin OTA** (el móvil no cambia). Un merge auto-deploya.

## Testing

**Verificación por mutación de cada test nuevo**, fixtures **sintéticos** ([[nunca-datos-reales-en-el-repo]]).

1. **`parseFitStrength`**: cada serie expone su `startedAt` (del `startTime` del fixture); el orden se
   preserva.
2. **`extractHrSamples`**: extrae los records con FC, descarta los sin `heartRate`/timestamp. Y el
   refactor: los tests existentes de `parseFit` (cardio) siguen verdes (mismo `hrSeries`).
3. **`fitStrengthToSession` con FC**:
   - Las series tienen `endedAt != null` (la corrección de la causa raíz) → `doneSetsOf` las cuenta.
   - `hrAvg`/`hrMax` por serie = promedio/máximo de los samples del intervalo (fixture con FC
     conocida). Mutación: promediar el intervalo equivocado debe romperlo.
   - `hrSeries` poblada y relativa a `startedAt` de la sesión.
   - **Sin FC** (`hrSamples` vacío): `hrAvg`/`hrMax` null y `hrSeries` omitida, sin romper.
4. **Invariante end-to-end (la costura, [[testear-la-costura]]):** un preview + hrSamples → `fitStrengthToSession`
   → `summarize()` (el mismo de `mobile/src/session/summary.ts`, importable en un test) produce reps,
   volumen, trabajo/descanso y FC **no vacíos**. Es el test que garantiza que el resumen se ve lleno,
   no solo que las piezas sueltas andan. Riesgo de test falso: usar valores distintos por serie para
   que un bug de agrupación/promedio no se esconda.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `summarize` vive en `mobile/` pero el test es de backend | El invariante e2e va en un test de `mobile/__tests__` (jest), armando el `WorkoutSession` con el transformador; o se importa `summarize` como función pura. Definir en el plan de qué lado corre. |
| El `.FIT` sin FC (banda no conectada) | `hrAvg`/`hrMax` null, `hrSeries` omitida — el resto (reps/volumen/trabajo) igual se ve. Test explícito. |
| Downsampling de `hrSeries` mete un bug de buckets | Test del helper de downsampling con una serie conocida. |

## Pendiente del owner (post-merge)

1. **Ver un import en el teléfono** y confirmar que el resumen se ve como sus capturas (FC, curva,
   detalle por serie, mapa corporal).
2. **Decidir la Pieza 2** (el extra: kcal medidas, zonas de FC, cadencia) — spec propio; requerirá
   re-importar o, si se prefiere, una pieza previa que guarde el `.FIT` crudo con el import.
