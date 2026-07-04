# C5 — Notas de sesión, sustitución de ejercicio y alimentación a la generación IA — diseño

> Fecha: 2026-07-04. Estado: aprobado, pendiente de plan de implementación.
> Iniciativa **C5**. Es el **paso 1** hacia el norte de producto "Memoria del atleta" (una memoria
> evolutiva de la persona que la IA construye y persiste en la DB, visible al usuario). La memoria
> persistente/summarizada completa es un sub-proyecto siguiente, fuera de alcance acá.

## Problema y objetivo

Hoy la app registra sesiones reales (sub-proyecto A) y genera programas desde un **perfil estático**
(`buildGenerationPrompt(profile)`, `backend/src/ai/prompt.ts`), sin mirar lo que el atleta realmente
hizo, cómo se sintió, ni qué ejercicios no puede hacer. Dos huecos concretos:

1. El campo `notes` existe en `WorkoutSession` (schema/DB/persistencia) pero **no tiene UI** ni alimenta
   la generación.
2. Si un ejercicio del plan no es hacible (ej. `band_assisted_pull_up` sin barra donde colgar la banda),
   no hay forma de **cambiarlo** ni de que la IA se entere para futuras generaciones.

Objetivo: (a) escribir/editar **notas** por sesión; (b) **sustituir un ejercicio** que no puedas hacer,
con una nota del motivo, y que el cambio aplique a **todo el programa vigente**; (c) que **notas +
rendimiento real + sustituciones** de las últimas sesiones **alimenten el prompt de generación**.

## Decisiones tomadas (brainstorming)

- **Notas — dónde/cuándo:** en 3 lugares, todos sobre el mismo campo `notes` (string freeform por
  sesión): **durante la sesión**, **al terminar (resumen)** y **editable después desde el Historial**.
- **Qué ve la IA:** notas recientes **+ resumen compacto del rendimiento real** (ejercicios, pesos/reps/
  RPE logrados, % cumplimiento) **+ sustituciones** (cambió X por Y, motivo). No solo notas, no el
  historial crudo completo.
- **Ventana:** **últimas ~6 sesiones** (número fijo; si hay menos, las que haya).
- **Sustitución — alcance:** aplica a **todo el programa vigente** (reemplaza el ejercicio en sus
  apariciones del plan), además de registrarse en la sesión de hoy.
- **Sustitución — alternativas:** ejercicios del catálogo con el **mismo músculo primario** Y que usen
  **solo equipo disponible** (perfil local, según gym/casa de la sesión), excluyendo el actual.
- **Sustitución es client-side:** el `Program` vive en el AsyncStorage de mobile; el backend guarda una
  copia en `programs.data` **solo al generar** y **nadie la re-lee** (no hay GET/PUT de programas). Por
  eso el swap program-wide se hace **mutando el programa local** — sin endpoint nuevo de backend en v1.
  *Trade-off aceptado:* la copia del backend queda desactualizada tras un swap (hoy nadie la lee; la
  generación usa perfil + sesiones). Sync al backend = opcional a futuro.
- **Decomposición:** 4 PRs secuenciados bajo la iniciativa C5 (ver Arquitectura). Cada uno
  independientemente valioso y revisable.

## Arquitectura (por PR)

### PR 1 — Fix de catálogo (shared, chico, standalone)

`band_assisted_pull_up` está mal: `equipment: ["resistance_band"]` (`shared/src/catalog/exercises.data.ts:1425`)
— una dominada asistida con banda **necesita barra**. Se corrige a `["resistance_band", "pull_up_bar"]`
y se **auditan** las variantes hermanas (colgarse/anclar a barra) por el mismo error. Con el gating
`catalogForEquipment`, si no tenés `pull_up_bar` en el perfil deja de generarse.

- **Test:** `catalogForEquipment(["resistance_band"])` NO incluye `band_assisted_pull_up`;
  `catalogForEquipment(["resistance_band","pull_up_bar"])` sí.

### PR 2 — Notas de sesión (mobile; backend ya persiste `notes`)

- **`mobile/src/session/engine.ts` — `setNotes(session, notes): WorkoutSession`** (pura).
- **`mobile/src/components/NotesEditor.tsx`** (nuevo, reutilizable): `TextInput` multiline etiquetado,
  tokens del theme, `maxLength: 1000`. Props: `value`, `onChangeText`, `onSave?`/`onBlur?`, `editable?`,
  `placeholder?`. Sin lógica de persistencia adentro.
- **Durante la sesión** (`app/sesion.tsx`, vista activa): bloque colapsable con `NotesEditor` bindeado a
  la sesión activa vía `setNotes` + `apply` (persiste a storage + encola sync). El finish la incluye.
- **Al terminar** (`app/sesion.tsx`, vista terminada, junto a `SessionSummary`): mismo `NotesEditor`;
  editar → `putSession` (upsert idempotente por id).
- **Historial** (`app/(tabs)/historial.tsx`, detalle `selected != null`): `NotesEditor` sobre
  `selected.notes`; guardar → `putSession(url, { ...selected, notes })` + actualizar estado local.
- `SessionSummary` queda read-only (las notas se editan en el contenedor).

### PR 3 — Sustitución de ejercicio + nota por-ejercicio (shared + backend + mobile)

- **Shared — `SessionExerciseSchema`** (`shared/src/schemas/session.ts:25`): agregar
  `note: z.string().default("")` y `substitutedFromId: z.string().nullable().default(null)`.
- **Shared — helper puro `alternativesFor(catalogId, availableEquipment): CatalogExercise[]`**
  (en `shared/src/catalog/`): del `EXERCISE_CATALOG`, los que comparten músculo primario con `catalogId`,
  tienen `equipment ⊆ availableEquipment`, y `id !== catalogId`. Testeable con `bun test`.
- **Backend — migración**: agregar columnas `note` (`text default ""`) y `substituted_from_id`
  (`text`/`uuid` nullable) a `session_exercise` (`backend/src/db/schema.ts`); `upsertSession` persiste
  ambas y `rowsToSession` las hidrata (`backend/src/sessions/repository.ts`).
- **Mobile — engine (puras):**
  - `substituteExercise(session, { order, newCatalogId, newGarminName, note }): WorkoutSession` —
    reemplaza los campos del `SessionExercise` en ese `order`, setea `note` + `substitutedFromId` (= el
    catalogId original), preserva `planned` y `sets` ya logrados.
  - `substituteInProgram(program, oldCatalogId, newExercise, note): Program` — reemplaza cada
    `ProgramExercise` con `catalogId === oldCatalogId` (mantiene sets/reps/targetLoad/rest, actualiza
    catalogId/garminName, escribe el motivo en el campo `notes` de `ProgramExercise`).
- **Mobile — UI** (`app/sesion.tsx`): botón **"Cambiar ejercicio"** en el ejercicio activo → picker con
  `alternativesFor(actual, equipoDisponible)` (equipo del perfil local según `session.location`) →
  input de **nota** → al confirmar: `apply(substituteExercise(...))` (sesión, persiste+sync) **y**
  `setStoredProgram(substituteInProgram(...))` (programa local, program-wide). Requiere importar
  `EXERCISE_CATALOG`/`alternativesFor` desde `@pulsia/shared` en mobile (dato plano, no `zod`).

### PR 4 — Feed a la generación (backend; depende de PR 2 y 3)

- **`backend/src/sessions/repository.ts` — `getRecentSessions(db, userId, limit = 6)`**: sesiones
  completas (exercises/sets + notes + note/substitutedFromId), más recientes primero, reusa `rowsToSession`.
- **`backend/src/ai/history.ts` — `buildTrainingHistorySummary(sessions): string`** (pura): por sesión
  (reciente→viejo) fecha/`dayLabel`/`location`; por ejercicio los sets logrados (`peso×reps@RPE`) +
  % cumplimiento; **sustituciones** ("cambió `<substitutedFromId>` por `<catalogId>` — motivo:
  `<note>`"); **notas por-ejercicio**; y la **nota de sesión** (truncadas ~300 chars). Sin datos → `""`.
- **`backend/src/ai/prompt.ts` — `buildGenerationPrompt(profile, historySummary?)`**: si no vacío, agrega
  un bloque "Historial reciente (ajustá cargas/volumen/ejercicios según esto; respetá las notas y las
  sustituciones — el atleta no puede hacer esos ejercicios)". **Backward-compatible**: sin historial,
  prompt idéntico al actual.
- **Wiring** en `backend/src/routes/programs.ts` (`POST /programs/generate`): antes de generar, obtener
  `getRecentSessions(db, userId, 6)` → `buildTrainingHistorySummary(...)` → pasar el string por
  `generateProgramForProfile({ ..., historySummary })` → `client.ts` → `buildGenerationPrompt`.

## Data flow

- **Notas (escritura):** `NotesEditor` → `setNotes`/estado local → `putSession`/`apply`+sync →
  `PUT /sessions/:id` → `workout_session.notes`.
- **Sustitución:** UI → `substituteExercise` (sesión, `apply`+sync → `session_exercise.note`/
  `substituted_from_id`) **+** `substituteInProgram` (`setStoredProgram`, programa local).
- **Generación:** `POST /programs/generate` → `getRecentSessions(6)` → `buildTrainingHistorySummary` →
  `buildGenerationPrompt(profile, summary)` → Claude.

## Error handling / edge cases

- **Sin sesiones / notas vacías / sin sustituciones:** `buildTrainingHistorySummary` → `""` → prompt
  intacto (sin regresión).
- **Largo de notas:** cap en mobile (`maxLength: 1000`) + truncado por nota en el summarizer (~300).
- **Sets con `weightKg`/`rpe` null:** el summarizer los formatea sin romper (omite `@RPE`, `peso`="—").
- **Sustitución sin alternativas** (ningún ejercicio del mismo músculo con tu equipo): el picker muestra
  un vacío explicativo; el usuario puede saltar el ejercicio (flujo `skip` existente) y dejar una nota.
- **Migración `session_exercise`:** columnas con default → filas viejas quedan `note=""`,
  `substituted_from_id=null` (sin backfill).
- **Copia del programa en backend desactualizada** tras un swap: aceptado en v1 (nadie la lee).
- **Fallo de red al guardar:** mostrar error inline y no perder el texto/selección tipeada.

## Testing (TDD)

- **PR1:** gating de `catalogForEquipment` con/ sin `pull_up_bar` para `band_assisted_pull_up`.
- **PR2:** `setNotes` puro; `NotesEditor` render/onChange/maxLength; historial edita → `putSession` con
  `notes`; nota durante sesión persiste vía `apply`.
- **PR3:** `alternativesFor` (mismo músculo + equipo ⊆, excluye actual, casos sin alternativas);
  `substituteExercise` puro (swap correcto, preserva sets logrados, setea note+substitutedFromId);
  `substituteInProgram` puro (reemplaza todas las apariciones, preserva planned); backend upsert/hydrate
  de `note`/`substituted_from_id`; UI: confirmar swap dispara `apply` + `setStoredProgram`.
- **PR4:** `buildTrainingHistorySummary` (formato, vacío→`""`, truncado, sets null, sustituciones,
  orden); `buildGenerationPrompt` incluye/omite el bloque; `getRecentSessions` ≤ limit orden desc;
  ruta `/generate` obtiene y pasa el historial (con `aiClient` mockeado).

## Fuera de alcance (explícito)

- **Memoria del atleta persistente/summarizada** (norte de producto): tabla de memoria en DB, proceso de
  actualización/summarización, UI de "qué sabe la IA de mí". Sub-proyecto aparte.
- **Sync de la sustitución a la copia del programa en el backend** (endpoint `PUT /programs/:id`): v-next
  (hoy nadie lee esa copia).
- **Heatmap anual** de entrenamientos (backlog, pedido aparte).
- **Notas por-ejercicio como campo editable libre en toda la UI**: el `note` por-ejercicio se setea en el
  flujo de sustitución; edición libre general de notas por-ejercicio queda fuera.
- Incluir notas/% cumplimiento en la **lista liviana** del historial (`GET /sessions`): fuera de alcance.
