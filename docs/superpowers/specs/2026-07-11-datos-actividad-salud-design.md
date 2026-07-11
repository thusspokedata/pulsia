# Datos de actividad y salud: métricas diarias + peso single-source + sexo

> Diseño. Fecha: 2026-07-11. Primera tanda de datos hacia el norte de **companion de salud** ([[athlete-ai-memory]], roadmap entrenamiento → comidas → estrés → estado holístico). Todo **JS/backend → OTA (mobile) + auto-deploy (backend)**, sin APK nuevo.

## Objetivo

Sumar datos que hoy no se capturan, para que el coach conozca mejor a la persona:
1. **Métricas diarias de actividad/recuperación y bienestar:** pasos, pisos, sueño (+ calidad), FC en reposo, y check-in subjetivo (estrés, ánimo, energía). Ingreso **manual** (auto-captura vía wearables = proyecto futuro).
2. **Peso single-source:** el peso deja de estar duplicado (perfil estático + Progreso) → una sola fuente de verdad (Progreso), con el perfil como semilla.
3. **Sexo (opcional)** en el perfil, para interpretar composición corporal y (a futuro) nutrición.

## Contexto (verificado en código)

- `shared/src/schemas/metrics.ts`: modelo **tipado y extensible** — `BODY_METRIC_TYPES`, `BP_METRIC_TYPES`, `METRIC_TYPES`, `METRIC_UNITS`, `METRIC_LABELS`, `METRIC_RANGES`, y el payload `MetricReading` (una lectura con N entries + fecha común). La tabla `body_metric` es genérica → **sumar un tipo NO requiere migración**.
- El tipo nuevo se propaga solo: Progreso (`mobile/app/(tabs)/progreso.tsx`) mapea sobre los tipos para cards/tendencias/form; `buildProgressSummary` (`backend/src/ai/progress.ts`) emite una línea por tipo en el prompt.
- **Gotcha:** `metricLine` resume TODO como "primer→último valor en la ventana de 8 semanas" (delta). Correcto para composición corporal, **incorrecto para métricas diarias** (querés promedio reciente).
- Peso: hoy va a la IA por **dos lados** — `prompt.ts` (línea estática `- Peso: X kg` del perfil) y `progress.ts` (último `weight_kg` + IMC). Redundante y puede contradecirse.
- `shared/src/schemas/profile.ts`: `TrainingProfileSchema` sin campo `sex`.

## No-objetivos (YAGNI)

- **No** hay integración con wearables/Health Connect/Garmin/Coros (auto-captura = futuro). Todo manual por ahora.
- **No** se toca nutrición (fotos/macros, fase 2) ni el subsistema de meditación/respiración (fase 3).
- **No** se arma un "readiness score" compuesto todavía (llega cuando estén todos los inputs).
- Sexo: **opcional**, nunca bloquea la generación.

## Diseño

### 1. Métricas nuevas (`shared/src/schemas/metrics.ts`)

Dos grupos nuevos, en paralelo a `BODY_METRIC_TYPES`/`BP_METRIC_TYPES`:

```ts
export const ACTIVITY_METRIC_TYPES = ["steps", "floors", "sleep_hours", "sleep_quality", "resting_hr"] as const;
export const SUBJECTIVE_METRIC_TYPES = ["stress", "mood", "energy"] as const;
```
Sumarlos a `METRIC_TYPES = [...BODY_METRIC_TYPES, ...BP_METRIC_TYPES, ...ACTIVITY_METRIC_TYPES, ...SUBJECTIVE_METRIC_TYPES]`, y completar los 4 records:

| tipo | label | unidad | rango |
|---|---|---|---|
| `steps` | Pasos | pasos | [0, 100000] |
| `floors` | Pisos | pisos | [0, 500] |
| `sleep_hours` | Sueño | h | [0, 24] |
| `sleep_quality` | Calidad de sueño | /5 | [1, 5] |
| `resting_hr` | FC en reposo | bpm | [30, 120] |
| `stress` | Estrés | /5 | [1, 5] |
| `mood` | Ánimo | /5 | [1, 5] |
| `energy` | Energía | /5 | [1, 5] |

La validación de rango de `BodyMetricEntrySchema` ya cubre los tipos nuevos (usa `METRIC_RANGES[metricType]`). No hay refine cruzado nuevo (a diferencia de la presión).

### 2. Progreso (mobile) — dos secciones de carga nuevas

En `mobile/app/(tabs)/progreso.tsx`, replicar el patrón del **grupo de presión arterial** (carga agrupada) para:
- **"Actividad y recuperación"**: form con los 5 tipos de `ACTIVITY_METRIC_TYPES` (una lectura del día).
- **"Cómo te sentís"**: form con los 3 de `SUBJECTIVE_METRIC_TYPES` (1–5).

Cada métrica nueva aparece automáticamente en las cards de valor actual y en las tendencias (el UI ya mapea sobre los tipos). Las secciones de carga se agrupan para no mezclar con composición corporal. Los 1–5 pueden entrarse como número (el rango valida 1–5); no hace falta un selector especial en esta tanda.

**Selector de fecha (backfill de días olvidados) — 100% JS, OTA-safe.** Hoy el form manda `Date.now()` (`buildReadingFromForm(form, Date.now())`), o sea siempre "hoy". Como las métricas diarias se suelen olvidar por varios días, las secciones de actividad/subjetivo llevan una **fila de fecha**: `◀  <día seleccionado>  ▶` (default hoy; `▶` deshabilitado en hoy — no se cargan días futuros) + un botón **"Hoy"** para resetear. El submit usa el **mediodía del día elegido** como `measuredAt` (bucket diario sin líos de timezone). `MetricReading.measuredAt` ya lo acepta → **sin cambios de backend**.

⚠️ **No usar un date picker nativo** (`@react-native-community/datetimepicker` u otro módulo nativo): cambiaría el `runtimeVersion` y rompería el OTA a vc8. El selector es JS puro (aritmética de fechas + un label con `toLocaleDateString`), sin dependencia nueva. Se aplica a las secciones diarias (actividad + subjetivo); extenderlo a composición corporal/presión es un follow-up trivial (mismo componente).

### 3. Resumen para la IA (`backend/src/ai/progress.ts`) — trend vs flow

Separar los tipos en dos familias:
- **Trend** (delta primer→último, como hoy): `BODY_METRIC_TYPES` + `BP_METRIC_TYPES`.
- **Flow** (diarias): `ACTIVITY_METRIC_TYPES` + `SUBJECTIVE_METRIC_TYPES`.

Para las **flow**, en vez del delta:
- **Promedio de los últimos ~7 días** (ventana corta, distinta de la de 8 semanas para composición): `"Pasos: ~7.800/día (últimos 7 días)"`.
- **Señales de alerta** cuando aplican: nº de **noches con `sleep_hours` < 6** y nº de **días con `steps` < 8000** en la ventana → líneas tipo `"Sueño: 3 de 7 noches < 6 h"`. (Umbrales: sueño < 6 h, pasos < 8.000 — elegidos como anclas; parametrizables como constantes.)

`buildProgressSummary` computa ambas familias y arma el bloque de progreso. Función pura, testeable.

### 4. Peso single-source

- **`prompt.ts`:** quitar la línea `- Peso: ${profile.weightKg} kg` del bloque de perfil (el peso ya lo aporta el resumen de progreso).
- **`progress.ts`:** `buildProgressSummary` recibe un `profileWeightKg?` de fallback. Si no hay ninguna medición `weight_kg` en la ventana, usa `profileWeightKg` como "último peso" (para la línea de peso + IMC). Si hay mediciones, esas mandan.
- **`perfil.tsx`:** relabelar el campo a "Peso inicial (se actualiza con tus mediciones)"; mostrar el **último peso registrado** (de `GET /metrics/latest`) como referencia si existe. El campo editable sigue seteando `profile.weightKg` (la semilla).

### 5. Sexo

- **`profile.ts`:** `sex: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional()` en `TrainingProfileSchema`.
- **`perfil.tsx`:** grupo de chips "Sexo" (4 opciones), opcional (se puede dejar sin elegir).
- **`prompt.ts`:** una línea en el bloque de perfil cuando está presente (p.ej. `- Sexo: femenino`), con mapeo enum→español. Nunca bloquea la generación.

## Testabilidad

- **shared:** el schema valida rangos de los tipos nuevos; test de que `METRIC_TYPES` incluye los nuevos y los 4 records (`UNITS`/`LABELS`/`RANGES`) los cubren (cobertura, como el patrón existente). `sex` opcional parsea.
- **backend (`progress.ts`, puro):** flow metrics → promedio reciente + conteos de umbral (no delta); trend metrics → siguen con delta; peso: usa la medición si hay, cae al `profileWeightKg` si no. Tests de `prompt.ts`: ya no incluye la línea de peso; incluye la de sexo cuando está.
- **mobile:** la carga agrupada de actividad/subjetivo persiste una `MetricReading` con las entries correctas (patrón del test de presión). **El selector de fecha:** por default usa hoy; al retroceder días, el `measuredAt` del reading es el mediodía del día elegido; no permite días futuros. El perfil guarda/lee `sex`. (Extraer la aritmética de fecha a una fn pura testeable: `dayAtNoon(offsetDays)` / resolver el label.)

## Entrega

JS/backend → el backend auto-deploya en el merge; el móvil sale por **OTA a vc8** (runtime `88cc46dd…`), bundleado en el próximo `eas update`.

## Riesgos

- **Métricas diarias como lecturas puntuales:** cargar dos veces el mismo día (o backfillear un día ya cargado) crea dos puntos; el promedio reciente lo absorbe (no se deduplica/upsertea por día en esta tanda). Aceptable; el upsert-por-día queda como mejora futura.
- **Selector de fecha nativo = trampa de OTA:** debe ser JS puro (ver §2). Un módulo nativo rompería el fingerprint y exigiría APK nuevo.
- **Escalas 1–5 como input numérico:** simple; un selector visual (1–5 tappable) queda como mejora futura.
- **Umbrales del coach (8k pasos / 6h sueño):** anclas razonables; se dejan como constantes para ajustar sin refactor.
