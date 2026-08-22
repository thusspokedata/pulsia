# COACH-1 · Plan de trabajo explicado por la IA — Design

> Spec de la feature **COACH-1** (Kan `ed86iyqu4bkc`, P1 · Features, pedido por owner, tamaño L).
> Fecha: 2026-08-22.

## 1. Qué es (y qué NO es)

La **capa de explicabilidad / justificación** del plan hacia la persona: el *porqué* de los
ejercicios creados y el *porqué* de las calorías/macros. Es **distinta** de "Qué sabe la IA de mí"
(PROG-3 / tabla `athlete_memory`), que es el *input* (lo que la IA **sabe**). COACH-1 es el *output*:
el **razonamiento** — dado ese conocimiento + un objetivo → **por qué** este ejercicio, estas series,
esta meta calórica.

**No es**: no reemplaza la memoria del atleta, no cambia cómo se generan el programa ni la meta
nutricional (sólo agrega la justificación al lado), no hace backfill de planes viejos.

## 2. Alcance (3 piezas)

1. **Objetivo de trabajo explícito** — el "norte" editable, derivado de perfil + objetivos +
   memoria. Contra él se justifica todo.
2. **Rationale por prescripción** — un "por qué" en lenguaje claro para (a) cada día del programa
   y el programa global, y (b) la meta nutricional.
3. **Vista global** — una pantalla que hila perfil + memoria + objetivo → plan actual + su
   justificación, legible de un vistazo.

## 3. Contexto del código existente

- **Programa**: `buildGenerationPrompt` (`backend/src/ai/prompt.ts`) → la IA devuelve un `Program`
  vía tool-call (`backend/src/ai/generate.ts`, `client.ts`). Se persiste en `programs.data` (jsonb,
  `shared` `ProgramSchema`) + `profileSnapshot`. **Hoy no persiste ningún "por qué".** La Fase B
  (`generateProgramForProfile`) re-planea días fuera de objetivo.
- **Meta nutricional**: `computeNutritionGoal` (`shared/src/nutrition/goal.ts`) — **pura y
  determinista** (BMR Mifflin-St Jeor → TDEE por factor de actividad → ajuste por objetivo/ritmo →
  kcal; proteína por peso corporal; grasa 27% kcal; carbos por diferencia). Su porqué es **derivable
  de la fórmula**, no de un prompt.
- **Memoria del atleta**: tabla `athlete_memory` (`userId` PK, `content` text), refrescada por IA
  (`refreshAthleteMemory`, `backend/src/memory/service.ts`), mostrada en `mobile/app/memoria.tsx`
  ("Qué sabe la IA de mí"). Es el *input* que COACH-1 justifica.
- **Objetivos hoy son dos, separados**: entrenamiento (`profile.goal`:
  hypertrophy/strength/endurance/fat_loss/general_fitness/recomposition) y nutricional
  (`NutritionObjective`: lose/maintain/gain + `rateKgPerWeek`). **No existe** un objetivo de trabajo
  unificado — la pieza 1 lo crea.
- **AiClient** (`backend/src/ai/client.ts`) ya tiene `generateProgram` y `updateMemory` (opcional);
  se sigue ese patrón para el método nuevo.

## 4. Decisiones de diseño (aprobadas)

| Fork | Decisión |
| --- | --- |
| Justificación de la meta nutricional | **Plantilla determinista** derivada de la fórmula. Siempre coincide con el número, sin costo de IA, testeable con TDD. |
| Granularidad del rationale del programa | **Por día + global.** Un "por qué" por workout + un rationale de programa que lo ata al objetivo. |
| Forma del "objetivo de trabajo" | **Texto editable con borrador de IA.** La IA propone un norte inicial; el usuario lo edita/confirma. Un blob por usuario (como `athlete_memory` pero autoral). |
| Alcance / entrega | **Un spec, plan por fases** (~3 PRs): objetivo → rationale → vista global. |
| Backfill de planes viejos | **No.** Sólo generaciones nuevas traen rationale; la vista global degrada con gracia. |
| Inyección del objetivo al prompt | **Sí.** El objetivo de trabajo (si existe) entra como bloque de contexto de la generación para que el rationale lo referencie. |
| Acceso a la vista global | **Desde el menú del perfil**, cerca de "Qué sabe la IA de mí" (input/output). No una tab nueva. |

## 5. Modelo de datos y persistencia

### 5.1 Tabla nueva `work_objective`

Espeja `athlete_memory`. Un blob autoral por usuario.

```
work_objective(
  user_id   uuid PRIMARY KEY REFERENCES users(id),
  content   text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

Migración Drizzle nueva (`backend/drizzle/NNNN_*.sql` + `schema.ts`). No cascade especial (mismo
patrón que `athlete_memory`, que tampoco lo tiene).

### 5.2 Rationale del programa → dentro del `Program` JSON

En `shared/src/schemas/program.ts`, campos **opcionales** (los programas viejos siguen parseando):

- `WorkoutSchema` += `rationale: z.string().optional()` — el porqué del día (qué grupos, por qué
  esos ejercicios/series, cómo sirve al objetivo).
- `ProgramSchema` += `rationale: z.string().optional()` — el porqué global del programa.

Viajan con el plan en `programs.data`; el móvil los lee sin endpoint nuevo. No se toca el esquema de
la tabla `programs`.

### 5.3 Meta nutricional → sin persistencia

Determinista: su porqué se computa on-the-fly desde `NutritionGoalResult` + args. Nada que guardar.

## 6. Pieza 1 — Objetivo de trabajo

### 6.1 Backend

- `backend/src/objective/repository.ts`: `getWorkObjective(db, userId): Promise<string>` (default
  `""`), `upsertWorkObjective(db, userId, content): Promise<void>`. Mismo patrón que
  `memory/repository.ts`.
- `backend/src/routes/objective.ts` (montado bajo `/objective`, con `requireAuth`):
  - `GET /objective` → `{ content }`.
  - `PUT /objective` (body `{ content }`) → persiste lo editado, devuelve `{ content }`.
  - `POST /objective/draft` → la IA propone un borrador desde perfil + `profile.goal` + objetivo
    nutricional + memoria del atleta. **No persiste**; devuelve `{ content }` para que el usuario lo
    edite/confirme. 400 si no hay API key; 501 si el cliente no soporta el método.
- `AiClient` += método opcional `draftWorkObjective({ profile, memory, nutritionObjective, apiKey,
  model }): Promise<string>` (mismo patrón que `updateMemory`). Prompt: "sos un coach; dado este
  perfil/objetivos/memoria, redactá en 2-4 frases el objetivo de trabajo (el norte) de esta persona".

### 6.2 Móvil

- `mobile/src/api/objective.ts`: `getObjective`, `putObjective`, `draftObjective`.
- Pantalla editable estilo `memoria.tsx`: textarea con el contenido, botón **"Sugerir con IA"**
  (rellena el textarea con el draft, sin guardar), botón **"Guardar"** (PUT). Estados de
  loading/saving/error como en `memoria.tsx`.

## 7. Pieza 2 — Rationale

### 7.1 Nutrición (determinista, `shared`)

Función pura nueva `shared/src/nutrition/goalRationale.ts`:

```ts
buildGoalRationale(goal: Extract<NutritionGoalResult, {status:"ok"}>, args: NutritionGoalArgs):
  { lines: string[] }   // o un tipo estructurado equivalente
```

Explica, en líneas claras y en español:
- **Fuente** (auto vs manual). Si manual: "vos fijaste N kcal".
- Si auto: **TDEE** y cómo se compone (BMR Mifflin ≈ X × factor de actividad = TDEE), el **ajuste**
  por objetivo/ritmo (lose/gain: ± `rateKgPerWeek`·7700/7 kcal/día; maintain: sin ajuste), y el
  **piso** de 1500 si aplicó.
- **Macros**: proteína = peso × (2.0 en déficit / 1.8 si no) g; grasa = 27% de kcal / 9; carbos por
  diferencia.

TDD + verificación por mutación. Sin IA, sin red. Se exporta desde `shared/src/index.ts`.

Se muestra bajo la meta en la tab Nutrición (colapsable "¿Por qué esta meta?").

### 7.2 Programa (IA)

- **Tool-schema** de generación (`backend/src/ai/client.ts` / `generate.ts`): agregar a la
  herramienta los campos `rationale` **requeridos** — por cada `workout` y a nivel `program`.
- **Prompt** (`buildGenerationPrompt`): recibe además `workObjective?: string` como bloque de
  contexto ("Objetivo de trabajo del atleta: … — justificá cada día contra este norte y la memoria")
  y una regla nueva que pide emitir `rationale` por día y global.
- **Persistencia**: como parte del `Program` que ya se guarda (§5.2). `generateJob.ts` lee el
  objetivo de trabajo (`getWorkObjective`) y lo pasa a `generateProgramForProfile` →
  `buildGenerationPrompt`.
- **Fase B** (`generate.ts`): cuando re-planea un día, el rationale del día se regenera con él
  (o, si el re-planeo acotado no lo produce, se conserva el del día original — nunca se despacha un
  día peor, consistente con la lógica actual).
- Sólo **generaciones nuevas** traen rationale. Los `.optional()` cubren los planes viejos.

## 8. Pieza 3 — Vista global ("Plan de trabajo")

Pantalla nueva (`mobile/app/plan-trabajo.tsx` o similar), de arriba a abajo:

1. **Objetivo de trabajo** — editable inline (reusa pieza 1: ver/editar/sugerir/guardar).
2. **Meta nutricional + su porqué** — el número (cálculo cliente ya existente) + el rationale
   determinista (§7.1) colapsable.
3. **Programa actual + su porqué** — rationale global del programa + un acordeón por día con su
   rationale. Si el plan vigente **no tiene** rationale (generado antes de esta feature) → nota
   "Regenerá el plan para ver el porqué de cada día".

Datos: `GET /objective`, la meta nutricional (cliente), y el último `Program` (endpoint/carga ya
existente del viewer del programa). Acceso desde el menú del perfil, contiguo a "Qué sabe la IA de
mí".

## 9. Fases (≈3 PRs) y testing

- **Fase 1 — Objetivo de trabajo**: tabla `work_objective` + migración + `repository` + rutas
  (`GET`/`PUT`/`POST draft`) + `draftWorkObjective` en `AiClient` + API + pantalla editable móvil.
  TDD backend (repo/rutas con AiClient fake) + jest móvil.
- **Fase 2 — Rationale**: `goalRationale.ts` puro (TDD + mutación) + UI de la meta nutricional;
  extensión del tool-schema/prompt del programa + inyección del objetivo + persistencia en el
  `Program` JSON + regeneración en Fase B. Tests: `shared` (rationale), backend (prompt incluye el
  objetivo; el schema exige rationale), y test de la costura (un programa generado trae rationale).
- **Fase 3 — Vista global**: pantalla que compone las tres partes + degradación para planes viejos.
  jest móvil (render con/sin rationale).

Convenciones: rama por fase, PR revisado, merge squash tras review; commits `-S`; TDD con
verificación por mutación de cada test nuevo. **Fixtures siempre sintéticos** (repo público, nunca
datos reales de salud). No requiere APK nativo nuevo (todo JS/backend); publicar **OTA** al mergear
cambios de móvil (verificar runtime `11`). Un merge a `main` auto-deploya el backend a la Pi.

## 10. Riesgos / notas

- **Deriva prompt↔schema**: si el tool-schema exige `rationale` pero el prompt no lo pide con
  claridad, la generación puede fallar la validación. Mitigación: pedirlo explícito en el prompt +
  reintento (ya existe el loop de 2 intentos en `generateProgramForProfile`).
- **Costo de tokens**: el rationale por día suma salida. Aceptable (generación ya es async y pesada);
  mantener los textos concisos por regla del prompt.
- **Meta nutricional manual**: el rationale determinista debe manejar el caso `source: "manual"`
  (no inventar un TDEE como origen de la meta).
- **`buildGoalRationale` vs UI**: la función devuelve datos/estructura, no JSX — la pantalla arma el
  render. Mantiene `shared` sin dependencias de RN.
```
