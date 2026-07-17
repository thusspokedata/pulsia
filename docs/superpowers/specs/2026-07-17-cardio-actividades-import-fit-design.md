# Actividades de cardio + import .FIT — Diseño

> Fecha: 2026-07-17 · Estado: aprobado por el usuario, listo para plan de implementación

## 1. Problema

Pulsia no registra cardio. El modelo (`workout_session`/`session_exercise`/`set_log`) es enteramente de fuerza: series, reps, peso, RPE. Una caminata, un running o una sesión de elíptica no tienen dónde entrar.

Consecuencia concreta en el dominio de Nutrición: el balance energético (#2b) solo ve las sesiones de fuerza. Si el usuario camina 8 km, esas kcal **no existen** para `Restante = Meta − Comido + Ejercicio`, y la meta del día queda mal calculada.

El usuario tiene un reloj Garmin y la app Garmin Connect **funciona en su GrapheneOS** (verificado, ver [[garmin-coros-api-research]]). Las APIs oficiales de Garmin/Coros están cerradas para un dev individual, y los wrappers no oficiales están bloqueados por rate-limiting server-side desde marzo 2026 (riesgo de bloqueo de la cuenta personal). **El import manual de archivos `.FIT` es el único camino robusto**, y además el más alineado con la privacidad: el archivo va del teléfono al backend propio, sin terceros.

## 2. Alcance

**Entra:**
- Entidad nueva de actividad de cardio, con registro **manual** e **import de `.FIT`** como caminos de primera clase (decisión del usuario: "los dos por igual").
- Tipos: caminata, running, elíptica, bici, natación, remo, otro.
- El gasto calórico del cardio alimenta el balance energético de Nutrición (#2b) y los informes del agente.
- Historial unificado (fuerza + cardio) y pantalla de alta/import.

**No entra (v1):**
- **`.TCX`** — Garmin Connect exporta `.FIT` nativo y más rico (kcal, FC, elevación). `.TCX` es XML: otro parser, otro set de tests, para un formato que el usuario no necesita hoy. Se agrega si aparece la necesidad.
- Mapa/GPS, records personales, zonas de FC, sincronización automática.
- Push de workouts al reloj (requiere Training API aprobada — cerrada).

## 3. Decisión de arquitectura: entidad nueva, no extender `workout_session`

**Elegido: tabla nueva `cardio_activity` (migración 0017).**

Extender `workout_session` obligaría a hacer nullables `program_id` (hoy **FK real** a `programs`), `week_number`, `day_label` y `exercises`, y a abrir el enum `location` (`gym|home`). Es decir: **debilitar las invariantes que hoy garantizan que toda sesión de fuerza cuelgue de un programa**, para beneficiar a un caso que no las usa. Al revés también falla: `distance_m`, elevación y las kcal del reloj no tienen lugar en el modelo de fuerza. Comparten solo tiempo y FC.

La rama descartada (un discriminante `kind: "strength"|"cardio"` sobre la tabla existente) se evaluó y se rechaza por eso: el costo lo pagarían las invariantes de fuerza, que hoy están sanas y con FK real.

### Tabla `cardio_activity`

| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK | generado en el **cliente**, igual que `workout_session` (sin `defaultRandom`) |
| `user_id` | uuid FK → `users.id` NN | scoping por `c.get("userId")`, nunca `SINGLE_USER_ID` |
| `type` | text NN | enum en Zod (ver §4); en PG queda `text`, como `location` |
| `started_at` | bigint `{mode:"number"}` NN | epoch ms — convención del repo |
| `duration_ms` | integer NN | |
| `distance_m` | integer | nullable |
| `avg_hr`, `max_hr` | integer | nullable |
| `elevation_gain_m` | integer | nullable |
| `kcal` | integer | nullable; ver §5 |
| `kcal_source` | text NN | `device` \| `estimate` — **forzado por el server** |
| `source` | text NN | `manual` \| `fit` |
| `hr_series` | jsonb `$type<{t,bpm}[]>` | **mismo shape que `workout_session.hr_series`** (`t` relativo a `started_at`) → reusa `LineChart` |
| `notes` | text default "" NN | |
| `created_at`, `updated_at` | timestamp defaultNow NN | |

**Índice** en `(user_id, started_at)`: todas las lecturas son "las actividades de este usuario en este rango".

## 4. Schemas (`shared/`)

```ts
export const CARDIO_TYPES = ["walk","run","elliptical","bike","swim","rowing","other"] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

export const CARDIO_LABELS = {
  walk: "Caminata", run: "Running", elliptical: "Elíptica",
  bike: "Bici", swim: "Natación", rowing: "Remo", other: "Otro",
} satisfies Record<CardioType, string>;
```

El `satisfies Record<CardioType, string>` es deliberado: agregar un tipo **rompe la compilación** en los 3 workspaces en vez de renderizar `undefined` en silencio. Mismo patrón que `MEAL_LABELS`.

`CardioActivitySchema`: `id` uuid · `type` enum · `startedAt` int · `durationMs` int≥0 · `distanceM` int≥0 nullable · `avgHr`/`maxHr` int≥0 nullable · `elevationGainM` int nullable · `kcal` int≥0 nullable · `kcalSource` enum · `source` enum · `hrSeries?` · `notes` default "".

## 5. Las kcal: el reloj manda, la estimación es fallback

Replica el patrón `label`/`estimate` del catálogo de alimentos.

- **`.FIT` con kcal del reloj → `kcalSource: "device"`**, se usa tal cual. El reloj combina acelerómetro, FC y perfil; le gana a cualquier fórmula nuestra.
- **Sin kcal (típicamente manual) → `kcalSource: "estimate"`**: Keytel si hay FC + edad, si no, **MET por tipo de actividad**.

### Bug a corregir en `exerciseBurn.ts`

`MET_STRENGTH = 5` está **hardcodeado** (`shared/src/nutrition/exerciseBurn.ts:3`) y es el único fallback. Para una caminata (MET ~3.5) sobrestima ~40%; para running (~9.8) subestima a la mitad.

Se parametriza el MET por tipo, **sin cambiar el comportamiento de fuerza** (que sigue en 5):

```ts
export const MET_BY_CARDIO = {
  walk: 3.5, run: 9.8, elliptical: 5.0, bike: 7.5,
  swim: 7.0, rowing: 7.0, other: 5.0,
} satisfies Record<CardioType, number>;
```

Se mantiene el neto de BMR (`Math.max(0, gross - (bmr/1440)*minutes)`) y el clamp a 0 de Keytel.

**Invariante: el server fuerza `kcalSource`.** Aunque el campo viaje en el body (el schema describe la entidad completa, que se usa también en las respuestas), **el server lo ignora y lo deriva él**: si el request es la confirmación de un parse con kcal del reloj → `device`; en todo otro caso → `estimate`. Mismo criterio que el `source: "estimate"` forzado en `/foods/describe` y el disclaimer server-side del ECG: no se le pide al cliente que no mienta, se pisa.

**Ojo con la lectura del chip:** `estimate` significa "esto lo calculamos nosotros con una fórmula", `device` significa "esto lo midió el reloj". No es lo mismo que el `label`/`estimate` de alimentos, aunque el patrón sea análogo.

## 6. Integración con el balance energético (#2b)

`sumDayExerciseBurn` acepta hoy cualquier `{ totalDurationMs, avgHr }[]` — no está atado a `WorkoutSession`. Se extiende:

```ts
export function dayExerciseBurn(
  sessions: { totalDurationMs: number | null; avgHr: number | null }[],
  activities: { type: CardioType; durationMs: number; avgHr: number | null; kcal: number | null }[],
  athlete: { weightKg?: number; age?: number; sex?: Sex; bmr?: number | null },
): number
```

Regla: una actividad con `kcal != null` aporta ese valor tal cual; si no, se estima con Keytel/MET del tipo.

**`sumDayExerciseBurn` se reemplaza por `dayExerciseBurn`, no conviven.** Tener dos funciones que suman gasto es exactamente cómo se llega a que la pantalla y los informes discrepen. Los dos call-sites migran en PR4 y `sumDayExerciseBurn` se borra en el mismo PR. `estimateSessionBurn` (por-sesión) sí queda: es la pieza que `dayExerciseBurn` usa por dentro.

⚠️ **Dos call-sites calculan el gasto por separado y ambos deben cambiar**, o los informes de la IA van a contradecir a la pantalla:
- `mobile/src/nutrition/useNutritionDay.ts:63`
- `backend/src/reports/collect.ts:97`

La fórmula `Restante = Meta − Comido + Ejercicio` (`mobile/src/nutrition/goalView.ts:38`) **no cambia de forma**; `Ejercicio` pasa a incluir el cardio. El texto explicativo de `detalle.tsx:37` ("El gasto del ejercicio se estima desde tus sesiones (FC o duración)") queda desactualizado y hay que corregirlo.

El filtro por día es por `startedAt` en el rango `dayBounds(offset)`, igual que las sesiones.

## 7. El import: sin runner async ni polling

**Deliberadamente distinto al ECG.** El ECG poletea porque la interpretación de la IA tarda ~60s. **Parsear un `.FIT` son milisegundos**: no necesita columna `status`, ni floating promise, ni cota de intentos. Copiar ese patrón acá sería complejidad de culto a la carga.

**Flujo:** elegir archivo → base64 → `POST /cardio/parse` → **preview** (tipo, duración, distancia, kcal, FC) → el usuario confirma/corrige → `POST /cardio`.

El preview es el mismo criterio que el alta de alimento por foto: el parser propone, el usuario confirma. Permite corregir el tipo si el reloj lo marcó mal (Garmin a veces registra una caminata como "hiking" o genérico).

**El archivo `.FIT` no se persiste.** A diferencia del ECG (donde el PDF es el documento médico y se guarda), acá el `.FIT` es solo el transporte: una vez parseado, los datos están en la tabla. No guardarlo evita una columna `bytea` y un blob por actividad.

### Validación (patrón ECG)

1. Límite de tamaño **en chars de base64 antes de decodificar** (los `.FIT` típicos son 50-500 KB; techo de 5 MB).
2. **Magic bytes**: el header FIT tiene el string `".FIT"` en los bytes 8-11 (equivalente al `%PDF` del ECG). Si no, 400 "No parece un archivo .FIT".
3. Parseo con try/catch → 400 con mensaje claro, nunca un 500 con stack.

### Dedupe

Reimportar el mismo archivo no debe crear dos caminatas. **Rechazo con 409** si ya existe una actividad del usuario cuyo `started_at` cae **dentro del mismo segundo** (`floor(startedAt / 1000)` igual — `started_at` está en ms, y el `.FIT` guarda el timestamp en segundos, así que dos parseos del mismo archivo dan exactamente el mismo valor). Dos actividades reales distintas no arrancan en el mismo segundo.

El dedupe aplica **solo al import** (`source: "fit"`). La carga manual no lo chequea: si el usuario quiere anotar dos actividades cortas seguidas, es asunto suyo.

### Dependencia

Parser `.FIT` en el **backend** (`@garmin/fitsdk`, oficial y JS). No toca el fingerprint OTA — **solo las deps del móvil lo re-basan**. El móvil reusa `expo-document-picker` + `expo-file-system`, ya instalados por el ECG.

> **Consecuencia clave: toda esta feature llega por OTA a vc10.** No requiere APK nuevo.
> `DocumentPicker` necesita `type: "*/*"` — `.fit` no tiene MIME estándar registrado. Es un cambio de argumento JS, no de dep.

## 8. Endpoints (`backend/src/routes/cardio.ts`)

Todos bajo `auth`, scopeados por `c.get("userId")`.

| ruta | notas |
|---|---|
| `POST /cardio/parse` | body `{ fitBase64 }` → devuelve el preview parseado, **no persiste**. Llega en PR3 (necesita el parser); el resto es PR1 |
| `POST /cardio` | body `CardioActivitySchema` → inserta; 409 si `startedAt` duplicado |
| `GET /cardio` | lista (rango opcional `from`/`to`) |
| `GET /cardio/:id` | completa (con `hrSeries`); 404/409 |
| `PATCH /cardio/:id` | editar (tipo, duración, notas) |
| `DELETE /cardio/:id` | |

⚠️ **Orden de rutas**: `/cardio/parse` es literal y debe declararse **antes** de `/cardio/:id`, o el param la captura (mismo cuidado que `/sessions/last-weights`).

## 9. UI

### Historial unificado (`mobile/app/(tabs)/historial.tsx`)

Pasa a ser la línea de tiempo de **todo**: fuerza + cardio, ordenado por `startedAt` desc. Cada ítem con ícono por tipo. La proyección de lista de cardio muestra: tipo, fecha, duración, distancia (si hay), kcal.

Hoy el archivo tiene 192 líneas y ya hace dos cosas (lista + detalle en la misma pantalla, según `selected`). Sumarle una segunda fuente de datos y un segundo detalle lo empuja a hacer demasiado. **Se extrae la fila a un componente y el merge de las dos fuentes a una función pura** (`buildTimeline(sessions, activities) → TimelineItem[]`), testeable sin render. Es la mejora acotada que el trabajo requiere, no un refactor oportunista.

### Pantalla de alta/import (`mobile/app/cardio.tsx`)

Fuera de `(tabs)/`, ruta stack — igual que `ecg.tsx`. Dos caminos de primera clase:
- **Importar .FIT**: picker → preview → confirmar.
- **Cargar a mano**: tipo (chips), duración, distancia opcional, FC opcional, fecha (mismo navegador `◀ día ▶` de Progreso, convención `dayAtNoon`).

### Detalle

Reusa `LineChart` para la curva de FC (el `hrSeries` tiene el mismo shape). Sin componente nuevo de gráficos.

### Nutrición

La card del tab (`nutricion.tsx:94`) hoy dice `🏋 +{exercise} kcal ejercicio`. El ícono de mancuerna deja de ser exacto cuando el gasto incluye caminatas; se generaliza el texto.

## 10. Errores

- **Import**: archivo que no es `.FIT` → 400 con mensaje claro; `.FIT` corrupto → 400, no 500; duplicado → 409 con "Ya importaste esta actividad".
- **Manual**: validación por Zod, rangos con `.refine` (duración > 0, distancia ≥ 0).
- **Offline**: la carga manual es un POST simple; si falla, error visible y el form conserva lo tipeado (no hay cola de sync como en sesiones — YAGNI hasta que moleste).
- El gasto de cardio **nunca** puede volver negativo el aporte (`Math.max(0, ...)` ya está en `estimateSessionBurn`).

## 11. Testing

TDD, siguiendo la convención del repo (tests en `mobile/__tests__/`, jest `--runInBand`; `bun test` en shared/backend).

**⚠️ Cada test nuevo se verifica por mutación antes de darlo por bueno** — romper el código a propósito y confirmar que el test se queja. Es la lección explícita de la sesión 2026-07-16/17: aparecieron 5 tests en verde que no probaban lo que decían, 2 de ellos llevaban meses en `main`, y ningún review los encontró. Cuesta ~30 segundos por test.

Cobertura mínima:
- **Puro (`shared/`)**: MET por tipo; `kcal != null` gana sobre la estimación; neto de BMR; que fuerza **siga dando lo mismo** que antes (test de regresión sobre `estimateSessionBurn`); `dayExerciseBurn` sumando ambas fuentes.
- **Parser**: un `.FIT` real de fixture → campos esperados; magic bytes inválidos; archivo corrupto.
- **Backend**: scoping por usuario (409 ajeno), dedupe 409, orden de rutas (`/parse` no capturada por `/:id`).
- **Móvil**: `buildTimeline` mergeando y ordenando; preview → confirmar; el balance sumando cardio.

## 12. Fases (un PR por fase)

1. **PR1 — `shared/` + backend**: schemas, tabla, migración 0017, MET por tipo, `dayExerciseBurn`, endpoints CRUD. Sin parser todavía.
2. **PR2 — móvil, registro manual**: pantalla `cardio.tsx` (camino manual), historial unificado (`buildTimeline`), detalle.
3. **PR3 — import .FIT**: parser en backend + `POST /cardio/parse` + preview en el móvil.
4. **PR4 — wiring del balance**: los dos call-sites (`useNutritionDay` + `reports/collect`), textos de la UI, informes del agente viendo el cardio.

Cada PR: rama → review de CodeRabbit + `@claude review` → merge (squash). Ejecución **subagent-driven**, un implementador a la vez por worktree aislado.

## 13. Referencias

- [[garmin-coros-api-research]] — por qué el import manual es el camino (APIs cerradas, no oficiales bloqueadas, Health Connect no viable en GrapheneOS)
- [[garmin-activities-idea]] — la idea original: Garmin como fuente del gasto para #2b
- `shared/src/nutrition/exerciseBurn.ts` — Keytel + MET, el `MET_STRENGTH` hardcodeado
- `backend/src/ecg/` — el patrón de upload que se reusa (y el runner async que **no** se reusa)
