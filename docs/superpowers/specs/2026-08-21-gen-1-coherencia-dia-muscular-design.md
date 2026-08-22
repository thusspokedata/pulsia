# GEN-1 · Coherencia rótulo↔ejercicios por día en el plan generado

**Fecha:** 2026-08-21 · **Ticket:** Kan GEN-1 (PUL) · **Toca:** `shared/`, `backend/`

## Problema

La generación de programas NO valida que los ejercicios de un día coincidan con el
grupo muscular de ese día. En el plan del hermano del owner, un día rotulado
**"Espalda y Bíceps"** incluía un ejercicio de **piernas**.

La única validación post-generación es `unknownCatalogIds` (`backend/src/ai/generate.ts`):
chequea que cada `catalogId` **exista en el catálogo**, no su grupo muscular. El rótulo
del día (`dayLabel`) lo inventa el modelo como texto libre y nada verifica la coherencia
entre ese rótulo y los ejercicios que puso. Si el modelo se equivoca, no hay red que lo cace.

## Dirección del owner (decisiones tomadas)

1. **El día es un objetivo de entrenamiento.** La IA arma un plan porque entiende las
   necesidades del usuario y tiene claro por qué pone cada ejercicio. Un día debe tener un
   objetivo declarado y sus ejercicios deben servirlo.
2. **Ante un error, se re-planea SOLO ese día** (el día donde está el error), no todo el
   programa.
3. **La generación en general anda bien** — no romper lo que funciona; solo cazar el caso
   "ejercicio de un grupo ajeno al objetivo del día".
4. **Si tras re-planear el día sigue imperfecto (raro), queda así**: el usuario lo cambia
   desde la app con el **selector de alternativas, que ya existe**. Sin descarte, sin hard-fail.

## Diseño

Tres capas: (1) el día declara su objetivo de forma estructurada, (2) una validación pura lo
chequea, (3) reparación por día vía IA. Más una cuarta capa de prevención en el prompt.

### ① Schema — el día declara su objetivo estructurado

`shared/src/schemas/program.ts`, `WorkoutSchema`:

```
- focus: MuscleGroupSchema            // un solo grupo — hoy NADIE lo consume
+ targetMuscles: MuscleGroupSchema[]  // z.array(...).min(1) — el objetivo del día
```

Así "Espalda y Bíceps" = `["back", "biceps"]`.

**Por qué es seguro cambiarlo:**
- `focus` (singular) existe en el schema y lo emite el modelo, pero **ningún consumidor lo lee**:
  la UI móvil (`WorkoutDayCard.tsx`) solo muestra `dayLabel`; el backend no lo usa (solo aparece
  en tests). Es un campo vestigial.
- Los programas se guardan como `jsonb` casteado (`programs.data.$type<Program>()`) y Drizzle
  **no re-valida al leer** — las filas viejas con `focus` se devuelven tal cual y el móvil solo
  lee `dayLabel` + `exercises`. Sin migración de datos.

**Consumidor a actualizar:** `backend/src/ai/oneoff.ts` (entreno puntual) produce un `Program`
con 1 workout y hoy setea `focus="${args.focus[0]}"` en el prompt. Pasa a emitir
`targetMuscles = args.focus` (el array completo de grupos pedidos — más correcto: el entreno
puntual ya acepta varios grupos). Se actualizan sus tests y los fixtures que usan `focus:` en
workouts (`generate.test.ts`, `programs.test.ts`, `program.test.ts`, `generateJob.test.ts`).

### ② Validación — función pura en `shared/` (testeable)

Nueva función pura, p.ej. `shared/src/schemas/program.ts` o un módulo hermano:

```ts
// Un ejercicio está "fuera de objetivo" si sus primaryMuscles no intersectan los
// targetMuscles del día. full_body es comodín en AMBOS sentidos.
exercisesOutOfScope(workout, lookup): ProgramExercise[]
```

**Regla de tolerancia (mínima, para no romper lo que ya anda):**
- Match = algún `primaryMuscles` del ejercicio ∈ `targetMuscles` del día.
- **`full_body` es comodín bidireccional:** un ejercicio con `primaryMuscles` que incluye
  `full_body` (peso muerto, cargadas, etc.) entra en **cualquier** día; y un día cuyo
  `targetMuscles` incluye `full_body` acepta **cualquier** ejercicio.
- Solo `primaryMuscles` — los secundarios NO cuentan (contarlos sería tan laxo que dejaría
  pasar el bug original).

Ejemplos: día `[back, biceps]` → remo (primary `back`) ✅, curl (primary `biceps`) ✅,
prensa (primary `quads`) ❌ (caza el bug). Peso muerto (primary incluye `full_body`) ✅
en cualquier día.

La función necesita el catálogo para resolver `primaryMuscles` desde `catalogId`. Se le pasa
un `lookup` (p.ej. `getExerciseById`) para no acoplar `shared/schemas` al catálogo y mantenerla
pura/testeable con un lookup falso.

### ③ Reparación — re-planear solo el día con error (IA, best-effort)

En `backend/src/ai/generate.ts`, **después** de que el loop existente de `unknownCatalogIds`
entregue un programa con todos los IDs válidos (Fase A), corre la Fase B:

```
para cada week, para cada workout con exercisesOutOfScope(workout) no vacío:
    día' = repararDía(profile, workout, ai, apiKey, model)   // 1 llamada IA
    si día' es válido → reemplazar exercises del workout por los de día'
    si la llamada falla o día' trae un catalogId inexistente → conservar el día original
```

- **Caso normal (generación buena):** 0 días fuera de objetivo → **0 llamadas extra**. La
  validación es gratis (solo recorre el programa en memoria).
- **Día malo:** paga **1** llamada IA acotada (~30–60s) que re-planea ESE día.
- **Reparación:** reusa la maquinaria de un solo día (estilo `buildOneOffPrompt`): se le pasan
  `targetMuscles` del día como grupos objetivo + `location` + equipo del perfil según location +
  `sessionMinutes` + limitaciones. Se **preservan** `dayLabel`, `location`, `targetMuscles` y
  `weekNumber` originales (solo se reemplazan los `exercises`), para no perturbar la estructura
  ni la progresión del programa.
- **Invariante mantenido:** si la reparación introduce un `catalogId` inexistente o la llamada
  IA falla, se **conserva el día original** (que ya tenía IDs válidos, solo con un ejercicio
  fuera de objetivo). Nunca se despacha un ejercicio inexistente; nunca falla la generación.
- **Se acepta el resultado tal cual** (sin re-validar-y-descartar). Si el día re-planeado
  todavía tuviera un ejercicio fuera de objetivo (raro), queda así y el usuario lo ajusta con el
  **selector de alternativas de la app** (ya existe — ver §0 del onboarding).

### ④ Prompt más estricto (primera línea de defensa)

`backend/src/ai/prompt.ts`, `buildGenerationPrompt`:
- Instruir emitir `targetMuscles` (los grupos que entrena ese día) por día.
- Regla nueva: *"Cada día representa un objetivo de entrenamiento. Emití `targetMuscles` con los
  grupos que entrena ese día y asegurate de que CADA ejercicio del día entrene principalmente al
  menos uno de esos grupos. No mezcles grupos ajenos al objetivo del día."*

El prompt es necesario pero **no suficiente** — la validación (②) + reparación (③) son el backstop.

## Componentes y límites

| Unidad | Qué hace | Dónde | Depende de |
|---|---|---|---|
| `WorkoutSchema.targetMuscles` | Objetivo estructurado del día | `shared/schemas/program.ts` | `MuscleGroupSchema` |
| `exercisesOutOfScope` (pura) | Lista ejercicios fuera de objetivo de un día | `shared/` | lookup de catálogo (inyectado) |
| `repairDayInScope` | Re-planea 1 día vía IA, best-effort | `backend/src/ai/` | `AiClient`, prompt de día |
| Fase B en `generateProgramForProfile` | Orquesta validación + reparación por día | `backend/src/ai/generate.ts` | los de arriba |
| Regla de prompt | Emitir `targetMuscles` + coherencia | `backend/src/ai/prompt.ts` | — |

## Testing (TDD, con verificación por mutación)

**`shared/` — `exercisesOutOfScope` (puro):**
- día `[back, biceps]` con prensa (quads) → la marca fuera de objetivo.
- día `[back, biceps]` con remo + curl → vacío (todos en objetivo).
- ejercicio `full_body` (peso muerto) en día `[back]` → NO marcado (comodín).
- día con target `full_body` + cualquier ejercicio → nada marcado (comodín bidireccional).
- solo cuenta `primaryMuscles`: ejercicio con el grupo del día solo como secundario → marcado.

**`backend/` — Fase B (con `AiClient` falso):**
- programa sin días fuera de objetivo → **cero** llamadas de reparación; programa idéntico.
- programa con 1 día malo → 1 llamada de reparación; ese día queda con los ejercicios reparados;
  se preservan `dayLabel`/`location`/`targetMuscles`/`weekNumber`.
- reparación devuelve un día con `catalogId` inexistente → se **conserva** el día original.
- la llamada de reparación **lanza** (error IA) → se conserva el día original; la generación no
  falla.
- se acepta el día reparado aunque siga con un ejercicio fuera de objetivo (no se descarta).

**`backend/` — prompt:** `buildGenerationPrompt` incluye la instrucción de `targetMuscles` +
coherencia (test de contenido, como los existentes).

**Fixtures:** sintéticos (repo público — nunca datos reales del atleta).

## Fuera de alcance (YAGNI)

- Selector de alternativas en la app (**ya existe**).
- Campo de "objetivo" en texto libre por día además de `targetMuscles` (`dayLabel` ya lo comunica
  en español; `targetMuscles` es la verdad chequeable).
- Validar coherencia `dayLabel` ↔ `targetMuscles` (cosmético; `targetMuscles` manda).
- Reemplazo determinista desde el catálogo (el owner eligió re-planeo por IA + backstop humano).

## Refs

- `backend/src/ai/generate.ts` (única validación actual: `unknownCatalogIds`)
- `backend/src/ai/prompt.ts` (`buildGenerationPrompt`)
- `backend/src/ai/oneoff.ts` (`buildOneOffPrompt` — maquinaria de un solo día a reusar)
- `backend/src/ai/client.ts` (`callStructuredTool`, `generateProgram`)
- `shared/src/schemas/program.ts` (`WorkoutSchema.focus` → `targetMuscles`)
- `shared/src/schemas/catalog.ts` (`MuscleGroupSchema`, `primaryMuscles`)
