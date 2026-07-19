# Import de CSV de Weight y Steps de Garmin + alineación de mediodía — Diseño

**Fecha:** 2026-07-18
**Rama:** `feat/import-weight-steps-garmin` (desde `origin/main` tras #156)
**Antecede:** #155 (import de sueño), #156 (índice único + upsert)

## Objetivo

1. Importar los CSV de **Weight** y **Steps** de Garmin, completando el trío que empezó con Sleep.
2. Corregir una inconsistencia detectada en #155: el import escribe a **mediodía UTC** mientras la
   carga manual diaria escribe a **mediodía local** → series duplicadas para el mismo día.

## Hallazgo que motiva la pieza 2 (verificado en prod)

`sleep_hours` tiene DOS filas por día en los datos reales:

```
sleep_hours | 2026-07-17 10:00 UTC  ← carga manual (mediodía local, UTC+2)
sleep_hours | 2026-07-17 12:00 UTC  ← import del CSV (mediodía UTC)
```

209 filas del owner están a mediodía UTC; la familia tiene **0**.

## Formatos reales (muestras provistas)

### Weight.csv — jerárquico, con estado
```
Time,Weight,Change,BMI,Body Fat,Skeletal Muscle Mass,Bone Mass,Body Water,
" Jul 18, 2026",
8:28 AM,80.0 kg,0.5 kg,25.0,18.0 %,35.0 kg,3.5 kg,61.0 %,
" Jul 15, 2026",
9:46 AM,80.5 kg,0.5 kg,25.0,18.5 %,35.0 kg,3.5 kg,60.5 %,
8:40 AM,81.0 kg,0.3 kg,25.2,19.5 %,35.5 kg,3.5 kg,60.0 %,
```
Trampas:
- **Filas de fecha vs. filas de medición.** La fecha (`" Jul 18, 2026"`) es una fila propia; las
  siguientes son mediciones de ese día. El parser necesita **estado** (fecha actual).
- **La fila de fecha es un campo entrecomillado CON UNA COMA ADENTRO** → el `split(",")` ingenuo
  del parser de sueño se rompe. Hace falta un splitter que respete comillas.
- **Los valores traen unidad pegada:** `80.0 kg`, `18.0 %`.
- **Varias mediciones por día** (Jul 15 → 2, Jul 13 → 3) → `measuredAt` debe ser el **instante real**
  (fecha + hora), NO un mediodía. Con el índice único de #156, usar mediodía las colapsaría y el
  `ON CONFLICT DO NOTHING` descartaría todas menos una.
- Hora en 12h (`8:28 AM`, `1:05 PM`, `12:27 PM`) → cuidado con el 12 AM/PM.
- Coma final en cada fila → última columna vacía.

### Steps.csv — plano
```
,Actual,Goal
07/12/2026,5565,11790
```
- **La columna de fecha no tiene header** (empieza con coma).
- Fecha en **MM/DD/AAAA** (distinto del ISO de Sleep).
- Una fila por día → mediodía **local**.

## Mapeo

| Columna | metricType | ¿Nuevo? | Nota |
|---|---|---|---|
| Weight | `weight_kg` | no | strip " kg" |
| Body Fat | `body_fat_pct` | no | strip " %" |
| Skeletal Muscle Mass | `skeletal_muscle_mass_kg` | no | strip " kg" |
| Bone Mass | `bone_mass_kg` | no | strip " kg" |
| Body Water | `body_water_pct` | no | strip " %" |
| Change / BMI | — | — | **derivados, se omiten** (el esquema ya rechaza `bmi` por test) |
| Actual (Steps) | `steps` | no | |
| Goal (Steps) | `steps_goal` | **sí** | [0, 100000], "pasos", "Objetivo de pasos" |

**Weight no necesita ningún tipo nuevo.** Solo se agrega `steps_goal`.

## Arquitectura

### Zona horaria: el cliente manda el offset
El backend no sabe la TZ del usuario, y **la app es multi-usuario con familia en Argentina y owner
en Europa** → nada de hardcodear. El móvil manda `tzOffsetMinutes`
(`new Date().getTimezoneOffset()`) en cada request de import; el server arma:

```
epoch = Date.UTC(y, mo, d, H, M, s) + tzOffsetMinutes * 60000
```

- **Diarios (Steps, Sleep):** mediodía local → `Date.UTC(y,mo,d,12,0,0) + off*60000`. Misma clave
  que `dayAtNoon` de la carga manual → sin series duplicadas.
- **Weight:** instante real → `Date.UTC(y,mo,d,H,M,0) + off*60000`.

`tzOffsetMinutes` es opcional en el schema (default 0) para no romper clientes viejos, pero el
móvil siempre lo manda.

### Helpers compartidos (backend)
`backend/src/metrics/csvUtils.ts`:
- `splitCsvLine(line)` — **respeta comillas** (`" Jul 18, 2026"` es UN campo).
- `parseUnitNumber(cell)` — `"80.0 kg"` → `80.0`; `"18.0 %"` → `18.0`; `""`/basura → `null`.
- `localNoonEpoch(y, mo, d, offMin)` y `localEpoch(y, mo, d, H, M, offMin)`.

### Parsers
- `parseWeightCsv(csv, offMin)` — recorre con estado; fila de fecha (`Mon DD, YYYY`, meses EN) fija
  la fecha; fila de medición combina fecha+hora. Filas antes de la primera fecha → `skipped`.
- `parseStepsCsv(csv, offMin)` — col 0 = fecha `MM/DD/AAAA`, `Actual`/`Goal` por nombre de header.
- `parseSleepCsv(csv, offMin)` — **cambia** de mediodía UTC a mediodía local; pasa a usar el
  splitter con comillas.

Los tres validan la salida contra el schema compartido antes de devolver (patrón de `parseFit`).

### Schemas compartidos — generalización
`sleepImport.ts` → `shared/src/schemas/metricImport.ts` con nombres genéricos
(`MetricCsvRowSchema`, `MetricCsvPreviewSchema`, `MetricImportResultSchema`), porque los tres
imports comparten forma. `MetricCsvRow` gana un campo opcional `label` para el display (Weight
necesita mostrar la hora, no solo el día). Se actualizan los usos existentes (TS los detecta todos).

### Rutas
`POST /metrics/import/{sleep,weight,steps}/parse` y `POST /metrics/import/{sleep,weight,steps}`.
Body: `{ csvBase64, tzOffsetMinutes? }`. El import re-parsea server-side (fuente de verdad) y llama
a `insertReadingsDedup` (firma sin cambios tras #156).

### Migración 0020 — corrección puntual
Mueve las filas del import de sueño de mediodía UTC a mediodía local de Berlín:
- **Filtro:** `measured_at % 86400000 = 43200000` AND `metric_type IN (8 tipos de sueño)` AND
  `user_id = <owner>`. Verificado en prod: solo el owner tiene esas filas (209); la familia, 0.
  Un mediodía local nunca cae en 12:00 UTC exacto (Berlín da 10:00/11:00, Argentina 15:00), así que
  el filtro selecciona únicamente filas del import.
- **Destino:** mediodía local de esa fecha vía `AT TIME ZONE 'Europe/Berlin'` → **DST resuelto por
  fecha** (un offset fijo se rompería al cruzar CET/CEST).
- **Colisión:** si ya existe fila en el destino (caso `sleep_hours`/`resting_hr` cargados a mano),
  se **borra la del import** — misma política que el `ON CONFLICT DO NOTHING` del importador
  (lo manual gana).
- Va acotada por `user_id` a propósito: es una corrección de datos de un bug puntual, no una regla.

### Móvil
- `mobile/app/importar-garmin.tsx` (reemplaza `importar-sueno.tsx`): selector Sueño/Peso/Pasos +
  elegir archivo → preview → confirmar. Manda `tzOffsetMinutes` del dispositivo.
- Clientes de API para los tres. CTA en Progreso pasa a "Importar datos de Garmin (CSV)".

## Errores
Archivo que no parsea / sin filas válidas → 400 legible. Fila inválida → `skipped` con motivo, sin
tumbar el import. Valor fuera de `METRIC_RANGES` → se omite esa métrica, el resto de la fila entra.
Reimport → idempotente por el índice único + `DO NOTHING`.

## Testing
- **shared:** exhaustividad de `steps_goal`; schemas genéricos.
- **backend:** `splitCsvLine` con comillas y comas embebidas; `parseUnitNumber`; `parseWeightCsv`
  con la muestra real (2 pesadas el 15, 3 el 13, timestamps distintos, `Change`/`BMI` omitidos);
  `parseStepsCsv` (MM/DD/AAAA, header vacío, `steps_goal`); `parseSleepCsv` con mediodía local;
  rutas de los 3 imports. Test de la migración 0020 sobre datos sintéticos (incluye el caso colisión).
- **móvil:** clientes de API mandan `tzOffsetMinutes`.

## Verificación
`bun run typecheck && bun run test && bun run test:mobile`

## Fuera de alcance
`Change`, `BMI`, y guardar la TZ por usuario en la DB (el offset por request alcanza).
