# Seguimiento de progreso cuantitativo (Fase 1) — diseño

> Fecha: 2026-07-10. Estado: aprobado (el usuario lo pidió, eligió alcance por preguntas y dijo "espectacular, ponte a trabajar"). Norte de producto: [[athlete-ai-memory]] — dar a la IA un canal **numérico** del progreso del atleta, y que la app **muestre** que sigue ese progreso.

## Problema / contexto

Hoy Pulsia captura datos ricos por serie (peso, reps, RPE, HR) y mantiene una **memoria de texto libre** del atleta, pero:

- El peso corporal es un único valor estático en el perfil (`shared/src/schemas/profile.ts` `weightKg`), que se **sobrescribe** en cada guardado — **sin historial**.
- Las métricas de sesión (volumen, carga, PRs) se calculan **al vuelo en el móvil** (`mobile/src/session/summary.ts`) y **no se persisten** → no existe ninguna vista de tendencia **entre** sesiones.
- La memoria del atleta (`athlete_memory`) es **cualitativa** (texto): no tiene un canal numérico estructurado que la IA pueda "observar" para medir progreso.

El usuario quiere: (a) registrar peso corporal y otras métricas **en el tiempo**, (b) que la app **mida el progreso** y lo muestre claramente, y (c) que la IA **observe** esos datos.

## Alcance — Fase 1 (este spec)

Dos canales de progreso, una superficie, integración con la IA en el momento de generar.

1. **Métricas corporales (serie temporal, carga manual).** Modelo **tipado/extensible**: cada lectura son filas `(tipo, valor, fecha)`. Una lectura de balanza de bioimpedancia carga varias de una. Tipos al arranque:
   - `weight_kg` (peso), `body_fat_pct` (% grasa), `skeletal_muscle_mass_kg` (masa muscular esquelética), `bone_mass_kg` (masa ósea), `body_water_pct` (agua corporal), `waist_cm` (cintura).
   - **IMC**: **derivado** (peso / altura², usando `heightCm` del perfil), no se guarda como tipo — una sola fuente de verdad. Si no hay altura, se omite.
   - El modelo tipado permite sumar tipos nuevos después **sin migración de columnas**.

2. **Tendencias de rendimiento (derivadas de las sesiones que YA guardamos, sin carga manual).**
   - **1RM estimado** por ejercicio (Epley: `peso × (1 + reps/30)`), tomando la **mejor serie de trabajo** (con `weightKg > 0` y `reps > 0`) por ejercicio por sesión.
   - **Volumen/tonelaje** por sesión (Σ reps×peso) a lo largo del tiempo.
   - **PRs** por ejercicio (mejor 1RMe y serie más pesada históricas).
   - Cómputo **puro en `shared/`** (testeable), consumido por el backend (endpoint + resumen para la IA).

3. **Tab "Progreso"** (mobile): gráficos de tendencia (line charts) + "Registrar medición" + valores actuales. **Charts en `react-native-svg`** (ya instalado) — sin lib de charts nativa ⇒ **entregable 100% por OTA**, sin build de APK nuevo.

4. **La IA observa el progreso — en el momento de generar (no reactivo).** Se arma un **resumen numérico compacto** (últimos valores + deltas de ~8 semanas + tendencias de fuerza/volumen) que se inyecta:
   - en el prompt de generación (`backend/src/ai/prompt.ts`), como una sección "Progreso medido"; y
   - en el input del refresh de memoria (`refreshAthleteMemory`), para que la memoria capture observaciones cualitativas.
   - **Clave (pedido del usuario):** la carga de datos NO dispara regeneración. Los datos se tienen en cuenta **cuando se genera un plan nuevo** (o al refrescar memoria a mano). Nada reactivo.

## Fuera de alcance (fases siguientes)

- **Fase 2 — Fotos de progreso + análisis visual por IA:** subir fotos periódicas y que Claude (visión) comente composición/cambios corporales. Capa aparte (captura, storage de imágenes, privacidad, prompt de visión, costo) → su propio spec.
- **Fase 3 — Coach proactivo / PT agent:** alertas ("3 semanas sin progreso en sentadilla") y conversación. Se solapa con el PT agent; los datos de Fase 1 quedan estructurados para que ese agente los consuma.
- Recordatorios/cadencia de pesaje, ingesta Garmin (sueño/HRV/estrés), edición de valores históricos más allá de borrar una entrada errónea, importación desde la app de la balanza.

## Modelo de datos (backend)

Tabla nueva `body_metric` (filas tipadas, migración drizzle **0007**):

| columna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `userId` | uuid fk → users | scoping por usuario (cascade) |
| `metricType` | text | uno de los tipos soportados (validado por `MetricTypeSchema`) |
| `value` | real | la unidad la implica el tipo (kg / % / cm) |
| `measuredAt` | timestamp | fecha de la lectura (default `now`); una lectura = varias filas con el mismo `measuredAt` |
| `createdAt` | timestamp | default `now` |

- **Sin columna `unit`**: la unidad es función del tipo, resuelta en `shared` (`METRIC_UNITS`). Evita divergencias.
- **Agrupar una lectura**: por `(userId, measuredAt)`. No hace falta una entidad "lectura" separada (YAGNI).
- Índice por `(userId, metricType, measuredAt)` para las series.

### Shared (`@pulsia/shared`)
- `MetricTypeSchema` (enum de los 6 tipos) + `METRIC_UNITS: Record<MetricType, string>` + rangos de validación sanos por tipo (ej. `weight_kg` 20–400, `body_fat_pct` 2–70, `waist_cm` 30–250).
- `BodyMetricSchema` (fila) y `MetricReadingSchema` (payload de carga: `{ measuredAt?, entries: {metricType, value}[] }`).
- Cómputo de tendencias de rendimiento (puro): `computePerformanceTrends(sessions) → { perExercise: {...}[], volumeSeries: {...}[], prs: {...}[] }` y `estimate1RM(weightKg, reps)`. Reusa las mismas convenciones que `mobile/src/session/summary.ts` (bodyweight = 0 volumen; series `skipped` excluidas).

## Endpoints (todos bajo `auth`, `userId` del contexto)

- `POST /metrics` — body `MetricReadingSchema`; inserta N filas (una por entry) con `measuredAt` común. Devuelve las filas creadas. (Ej.: la app manda de una peso+grasa+músculo+agua desde la balanza.)
- `GET /metrics?type=&from=&to=` — series de un tipo (o todos si se omite `type`), ordenadas por `measuredAt`. Para los charts.
- `GET /metrics/latest` — último valor por tipo. Para los "valores actuales".
- `DELETE /metrics/:id` — borrar una entrada errónea (scoped por `userId`).
- `GET /progress/performance` — agrega desde las sesiones guardadas (repo de sesiones) vía `computePerformanceTrends`. Devuelve las series de 1RMe por ejercicio (los que tengan ≥2 puntos, ordenados por frecuencia/recencia), la serie de volumen por sesión, y los PRs. Alimenta los charts de rendimiento y el resumen para la IA.

## IA — resumen de progreso (solo en generación / refresh de memoria)

Módulo nuevo `backend/src/ai/progress.ts`: `buildProgressSummary({ bodyMetrics, sessions, profile }) → string`. Texto compacto, p.ej.:

```
Progreso medido (últimas ~8 semanas):
- Peso: 82.0 → 79.5 kg (−2.5). IMC: 25.3 → 24.5.
- % grasa: 22.0 → 19.5. Agua: 55 → 57%.
- Fuerza (1RM estimado): Press banca 80→88 kg (+8); Sentadilla 100→108 (+8); Peso muerto 120→120 (=).
- Volumen medio/sesión: 6.4k → 7.1k kg.
```

- Se inyecta en `buildGenerationPrompt` (nueva sección) — junto a perfil + historial + memoria que ya se mandan (`backend/src/programs/generateJob.ts`).
- Se pasa también al input de `refreshAthleteMemory` para que la memoria escriba observaciones.
- **Best-effort**: si no hay datos suficientes, se omite la sección (no rompe la generación).
- Ventana ~8 semanas: compara el valor más reciente contra el más antiguo dentro de la ventana; si un tipo tiene <2 puntos, se muestra solo el último.

## Mobile — tab "Progreso" (OTA)

- Ruta nueva `app/(tabs)/progreso.tsx` + entrada en el tab bar (ícono).
- **Valores actuales** (últimos de cada tipo, de `GET /metrics/latest`) + IMC derivado.
- **Gráficos** (`components/LineChart.tsx`, puro `react-native-svg`): selector de métrica (chips) → line chart de la serie; sección de rendimiento con 1RMe por ejercicio (selectable) y volumen por sesión (de `GET /progress/performance`).
- **Registrar medición**: form (fecha, default hoy) con campos opcionales por tipo → `POST /metrics`. Todos opcionales: cargás lo que te dé la balanza ese día.
- Cliente API: `src/api/metrics.ts` (post/getSeries/getLatest/delete) y `src/api/progress.ts` (getPerformance).
- **Nada nativo** ⇒ se entrega por OTA (ruta + charts SVG son JS puro).

## Testing

- **shared**: `BodyMetricSchema`/`MetricTypeSchema` (validación + rangos), `estimate1RM`, `computePerformanceTrends` (1RMe por serie, volumen, PRs, bordes: series vacías, bodyweight, skipped).
- **backend**: endpoints de `/metrics` (insert bulk, list por tipo/rango, latest, delete; scoping por usuario, 404 cross-user), `/progress/performance`, y `buildProgressSummary` (deltas, ventana, sin datos).
- **mobile** (jest `--runInBand`): helpers puros del `LineChart` (escalado min/max, puntos), validación del form de carga, clientes API.

## Decomposición en PRs (backend primero; el móvil depende del backend)

- **PR-1 (shared + backend — datos & tendencias):** schemas + `METRIC_UNITS` + `computePerformanceTrends` en shared; tabla `body_metric` + migración 0007; endpoints `/metrics` (POST/GET/latest/DELETE) y `/progress/performance`; tests. → review → merge → **auto-deploy** (verificar health + migración).
- **PR-2 (backend — IA):** `buildProgressSummary` + cableado en `buildGenerationPrompt` y `refreshAthleteMemory`; tests. → review → merge → auto-deploy.
- **PR-3 (mobile — OTA):** clientes API + tab "Progreso" + `LineChart` + form de carga; tests. → review → merge → **OTA** (no requiere APK).

(PR-1 y PR-2 podrían ir juntas si el review lo hace manejable; se separan para reviewabilidad.)
