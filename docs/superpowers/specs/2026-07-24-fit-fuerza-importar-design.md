# Importar entrenamientos de fuerza del `.FIT` — Diseño (Pieza 1)

**Fecha:** 2026-07-24
**Rama:** `feat/fit-fuerza-parser` (desde `main` tras #184)
**Dominio:** 1 — Entrenamiento

> ⚠️ **Spec redactado con el owner ausente (pidió avanzar de noche).** Contiene una **decisión de
> arquitectura que es del owner** (§3), tomada acá con la mejor justificación posible pero **marcada
> para su validación**. La implementación de esta noche se limita a las partes **puras y agnósticas a
> esa decisión** (§4: parser + mapeo). La persistencia (§5), que incluye una **migración de DB**, NO
> se implementa ni se deploya sin su OK.

## Objetivo

Hoy, cuando el owner importa un entrenamiento de **fuerza** desde el reloj (archivo `.FIT`), el
sistema lo guarda como una actividad de **cardio "otro"** y **descarta toda la estructura**: series,
repeticiones, pesos, nombres de ejercicio, y el plan que traía. El owner quiere:

1. Que el `.FIT` de fuerza se importe **como entrenamiento** (con sus series/reps/pesos), no como
   una mancha de cardio.
2. Que la IA **reconozca que son los ejercicios que ella le dio**.
3. Que esos datos **alimenten la generación de futuros entrenamientos** (1RM, volumen, PRs, memoria
   del atleta).

Motivación adicional del owner: hoy hace **doble carga** — Pulsia genera el programa, él lo tipea a
mano en Garmin Connect, y entrena con el reloj. Importar el `.FIT` cierra el círculo sin re-registrar.

## Lo que el `.FIT` de fuerza realmente trae (verificado)

Un `.FIT` de una sesión `subSport: "strengthTraining"` contiene, además de lo que ya parseamos
(FC, duración, kcal, `metabolicCalories`, `sportProfileName`):

- **`setMesgs`** — una entrada por serie, intercaladas activo/descanso:
  - Serie activa: `setType: "active"`, `repetitions`, `weight` (kg), `duration`, `category`
    (ej. `["pushUp"]`), `exerciseName` (índice numérico del SDK), `wktStepIndex`.
  - Descanso: `setType: "rest"`, `duration`.
- **`exerciseTitleMesgs`** — el diccionario de ejercicios de la sesión: `wktStepName` (texto, ej.
  "Seated Dumbbell Shoulder Press"), `exerciseCategory`, `exerciseName` (índice).
- **`workoutMesgs` / `workoutStepMesgs`** — el **plan** que el owner cargó en el reloj: `wktName`
  (ej. "day 1 - push"), pasos con `notes`, `durationReps`, `intensity`.

**Lo único que NO trae es el RPE** (`set_log.rpe` ya es nullable, así que encaja).

## 3. Decisión de arquitectura — DÓNDE se guarda (⚠️ del owner)

Un entrenamiento de fuerza es **ejercicios + series**, lo registre el usuario en la app o en el
reloj. El modelo `workout_session` → `session_exercise` → `set_log` ya representa exactamente eso, y
**todo lo que el owner quiere ya lo consume**:

- `computePerformanceTrends` (1RM Epley, volumen, PRs) recibe `WorkoutSession[]`.
- El informe / memoria del atleta cuentan `workout_session` como `sessionsCount`.
- El historial y el resumen leen `workout_session`.

### Opciones

| Opción | Qué implica | Downstream |
|---|---|---|
| **A — `workout_session` con campos de programa opcionales** (recomendada) | Relajar `programId`/`weekNumber`/`dayLabel` a nullable (tabla + schema). Un import es una sesión sin programa detrás. | **Cero re-cableado.** 1RM, volumen, informe, historial funcionan solos. |
| B — tabla nueva `imported_strength_session` | Estructura de series propia. | Hay que **re-cablear** trends, informe, historial, resumen para que la miren. Duplica el modelo de series. |
| C — extender `cardio_activity` con sets en jsonb | El .FIT ya cae ahí. | El jsonb no se integra con `set_log` que esperan las tendencias. Mezcla dos dominios. |

### Recomendación y su costo

**Opción A.** Es la que hace al import un ciudadano de primera clase igual que una sesión de la app,
sin re-implementar nada downstream. El objetivo del owner (que alimente futuros planes) **requiere**
entrar a `computePerformanceTrends`, que consume `WorkoutSession` — con A, entra gratis.

**El costo, y por qué necesita tu OK:** relajar `programId`/`weekNumber`/`dayLabel` toca un invariante
que hoy sostiene el código ("toda sesión cuelga de un programa"). Hay que **auditar cada uso de
`session.programId`** (el resumen, el historial, la generación que mira notas de sesiones previas) y
confirmar que toleran `null`. Más una **migración** (`DROP NOT NULL` en 3 columnas) que, al mergear,
**se auto-aplica en la Pi**. Eso es exactamente lo que no se deploya sin supervisión.

> El comentario del schema de `cardio_activity` dice que NO se metió en `workout_session` porque
> "una caminata no cuelga de un programa". Para fuerza importada el argumento es más débil: **sí** es
> un entrenamiento de fuerza real, con ejercicios y series — lo único ausente es el programa nuestro.
> Relajar el programa es reconocer eso. Pero es tu llamada.

## 4. Lo que se implementa esta noche (puro, agnóstico a §3)

Estas dos piezas son sobre el **`.FIT`**, no sobre dónde se guarda. Valen igual con la opción A, B o
C, así que son seguras de construir antes de que decidas §3. Funciones puras, con tests, sin DB, sin
migración.

### 4a — Parser de fuerza

`backend/src/cardio/parseFitStrength.ts` (nuevo): `parseFitStrength(messages) → FitStrengthPreview`.

```ts
interface FitStrengthSet { reps: number; weightKg: number | null; durationMs: number }
interface FitStrengthExercise {
  category: string;          // "pushUp"
  exerciseNameIndex: number | null;
  displayName: string;       // de exerciseTitleMesgs.wktStepName ("Chest Press with Band")
  sets: FitStrengthSet[];    // solo las activas; los descansos no son series
}
interface FitStrengthPreview {
  workoutName: string | null;   // wktName del plan ("day 1 - push")
  exercises: FitStrengthExercise[];
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number;        // Σ reps × weight
}
```

- Agrupa las `setMesgs` activas por ejercicio usando `wktStepIndex` + el diccionario
  `exerciseTitleMesgs`. Los `setType: "rest"` se descartan (no son series de trabajo).
- **No decide dónde se guarda** — solo transforma el `.FIT` en una estructura de dominio.

### 4b — Mapeo de ejercicios al catálogo

`shared/src/catalog/fitExerciseMap.ts` (nuevo): `mapFitExercise(category, exerciseNameIndex) → catalogId | null`.

- Usa `Profile.types[`${category}ExerciseName`][index]` del SDK de Garmin (la **misma fuente** de la
  que se genera nuestro catálogo) → `camelName` → slug → match contra `EXERCISE_CATALOG`.
- Devuelve `null` si el ejercicio no está en nuestro catálogo curado de 273 (es un subconjunto). El
  llamador decide el fallback (guardar con el `displayName` del `.FIT` y `catalogId` nulo).
- **Es el mecanismo que cumple el objetivo 2** (reconocer los ejercicios): un `catalogId` no nulo es
  "este es un ejercicio que conozco / que la IA pudo haber dado".

### 4c — Fixture sintético de fuerza

`backend/src/cardio/fitFixture.ts` ya genera `.FIT` sintéticos para cardio. Se extiende con
`setMesgs` + `exerciseTitleMesgs` + `workoutMesgs` sintéticos, para testear 4a **sin usar el `.FIT`
real del owner** (repo público — [[nunca-datos-reales-en-el-repo]]).

## 5. Lo que queda para después de tu OK (NO esta noche)

- **§3 decidido** + migración (si es opción A: `DROP NOT NULL`) + auditoría de `programId`.
- **Detección y bifurcación** en el import: `POST /cardio/parse` detecta `subSport === "strengthTraining"`
  y devuelve un preview de fuerza; el móvil lo confirma contra un endpoint que persiste como
  entrenamiento (no como cardio).
- **Dedupe con la app:** si el owner registró la sesión en la app **y** la importa, no debe contar
  doble. (Hoy el owner carga en Garmin a mano y entrena con el reloj — probablemente deje de usar la
  pantalla de sesión para esos, pero hay que decidirlo.)
- **Reconocer el programa activo:** el `.FIT` trae `wktName` ("day 1 - push"); se puede intentar
  matchear contra el programa vigente para decir "esto fue el día que te tocaba". Frágil (match por
  nombre) — diseño aparte.
- **La corrección del gasto de fuerza** (spec `2026-07-24-gasto-fuerza-hrr`, pausado): cuando el
  import trae `totalCalories`/`metabolicCalories` medidos por Garmin, esas mandan sobre cualquier
  fórmula. La fórmula %HRR queda para las sesiones registradas a mano sin reloj.

## Testing

**Verificación por mutación de cada test nuevo** — §6 del ONBOARDING. Fixtures **sintéticos**, nunca
el `.FIT` real del owner.

**4a (parser):**
- Agrupa series activas por ejercicio; descarta los `rest`.
- `totalReps` / `totalVolumeKg` correctos (Σ reps, Σ reps×peso).
- Una serie sin `weight` → `weightKg: null`, no rompe (se puede hacer fuerza sin peso: dominadas).
- `workoutName` sale del `wktName`; ausente → `null`.
- Riesgo de test falso: fixtures con reps/pesos **distintos** por serie, para que un bug de
  agrupación no se esconda tras valores iguales.

**4b (mapeo):**
- Un `category`+`index` conocido resuelve al `catalogId` correcto (ej. `flye`+2 → `dumbbell_flye`).
- Uno que no está en el catálogo curado → `null` (no una cadena vacía ni un throw).
- Un `category` inexistente en el SDK → `null`, sin romper.

## Privacidad

El `.FIT` del owner trae su nombre, peso, altura, FC en reposo y sus datos de salud. **Se parsea solo
en scratchpad, nunca se commitea al repo.** Todos los fixtures y tests usan valores **sintéticos**
([[nunca-datos-reales-en-el-repo]]).
