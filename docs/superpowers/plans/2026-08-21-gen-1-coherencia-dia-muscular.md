# GEN-1 Coherencia día↔músculo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el plan generado nunca meta un ejercicio de un grupo muscular ajeno al objetivo del día (p.ej. pierna en día de espalda/bíceps).

**Architecture:** El día declara su objetivo estructurado (`targetMuscles: MuscleGroup[]` reemplaza al vestigial `focus`). Una función pura en `shared/` detecta ejercicios fuera de objetivo (intersección de `primaryMuscles`, `full_body` comodín). Tras la generación (Fase A: loop existente de IDs válidos), una Fase B re-planea vía IA **solo los días con error**, reusando la maquinaria de entreno puntual; si la reparación falla o mete un ID inexistente, conserva el día original. El prompt de generación se endurece para emitir `targetMuscles` y exigir coherencia.

**Tech Stack:** TypeScript, Bun test (`bun:test`), Zod, `@pulsia/shared`, Anthropic SDK (mockeado en tests).

---

## Contexto para el implementador (leer una vez)

- **`WorkoutSchema.focus: MuscleGroupSchema`** (un solo grupo) existe en `shared/src/schemas/program.ts` y lo emite el modelo, pero **ningún consumidor lo lee**: el móvil (`WorkoutDayCard.tsx`) solo muestra `dayLabel`; el backend no lo usa. Cambiarlo por `targetMuscles: MuscleGroup[]` es retro-seguro (los programas viejos viven en `jsonb` casteado sin re-validación al leer).
- **`OneOffArgs.focus: MuscleGroup[]`** (`backend/src/ai/oneoff.ts`) y **`OneOffRequestSchema.focus`** (`shared/src/schemas/oneoff.ts`) son **otra cosa** (el pedido del entreno puntual, un array). **NO tocarlos.** Solo cambia `Workout.focus`.
- **La reparación reusa `ai.generateProgram({ ..., oneOff })`** (que devuelve un `Program` con 1 semana / 1 workout). No se agrega método nuevo al `AiClient`. Los tests distinguen la llamada inicial (sin `oneOff`) de la de reparación (con `oneOff`).
- Patrón de test: `bun:test`, `AiClient` falso inline (ver `backend/src/ai/generate.test.ts`).
- Correr tests: desde la raíz `bun test shared backend` (o un archivo puntual: `bun test shared/src/schemas/programScope.test.ts`). `export PATH="$HOME/.bun/bin:$PATH"` si `bun` no está en PATH.
- Commits **firmados** (`git commit -S`), **sin** atribución a Claude/Anthropic.

---

## File Structure

- **Modify** `shared/src/schemas/program.ts` — `focus` → `targetMuscles: z.array(MuscleGroupSchema).min(1)`.
- **Create** `shared/src/schemas/programScope.ts` — `exerciseInScope` + `exercisesOutOfScope` (puras).
- **Create** `shared/src/schemas/programScope.test.ts` — tests de las puras.
- **Modify** `shared/src/index.ts` — exportar `programScope`.
- **Modify** `shared/src/schemas/program.test.ts` — fixtures `focus` → `targetMuscles`.
- **Modify** `backend/src/ai/oneoff.ts` — el prompt instruye emitir `targetMuscles`.
- **Modify** `backend/src/ai/oneoff.test.ts` — asserts del prompt (targetMuscles).
- **Modify** `backend/src/ai/prompt.ts` — `buildGenerationPrompt` emite regla de `targetMuscles` + coherencia.
- **Modify** `backend/src/ai/prompt.test.ts` (si existe; si no, crear un test mínimo de contenido).
- **Modify** `backend/src/ai/generate.ts` — Fase B: validación + reparación por día.
- **Modify** `backend/src/ai/generate.test.ts` — fixtures `focus` → `targetMuscles` + tests de Fase B.
- **Modify** `backend/src/routes/programs.test.ts` — fixture workout `focus` → `targetMuscles` (línea ~9; NO tocar los `focus:` de oneOff).
- **Modify** `backend/src/programs/generateJob.test.ts` — fixture workout `focus` → `targetMuscles`.

---

## Task 1: Schema — `focus` → `targetMuscles`

**Files:**
- Modify: `shared/src/schemas/program.ts`
- Modify: `shared/src/schemas/program.test.ts`
- Modify: `backend/src/ai/generate.test.ts`
- Modify: `backend/src/routes/programs.test.ts`
- Modify: `backend/src/programs/generateJob.test.ts`

- [ ] **Step 1: Actualizar el fixture del test de schema para que falle**

En `shared/src/schemas/program.test.ts`, en el primer test ("acepta un programa válido"), cambiar la línea `focus: "chest",` por:

```ts
            targetMuscles: ["chest"],
```

Buscar **todas** las apariciones de `focus:` dentro de un workout en ese archivo y reemplazarlas por `targetMuscles: [<mismo valor entre corchetes>]` (p.ej. `focus: "back",` → `targetMuscles: ["back"],`). Si hay un test que verifica el rechazo con `location: "park"`, dejarlo pero con `targetMuscles: ["back"]`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test shared/src/schemas/program.test.ts`
Expected: FAIL (el schema todavía pide `focus`, no `targetMuscles`).

- [ ] **Step 3: Cambiar el schema**

En `shared/src/schemas/program.ts`, dentro de `WorkoutSchema`, reemplazar:

```ts
  focus: MuscleGroupSchema,
```

por:

```ts
  // Objetivo estructurado del día: los grupos musculares que entrena. Reemplaza al viejo
  // `focus` (grupo único, sin consumidores). La validación de coherencia (programScope) chequea
  // que cada ejercicio del día entrene al menos uno de estos grupos.
  targetMuscles: z.array(MuscleGroupSchema).min(1),
```

- [ ] **Step 4: Correr el test de schema y verificar que pasa**

Run: `bun test shared/src/schemas/program.test.ts`
Expected: PASS.

- [ ] **Step 5: Actualizar los fixtures del backend que rompieron**

Reemplazar `focus: "chest",` (u otro grupo) por `targetMuscles: ["chest"],` **solo en workouts** en:
- `backend/src/ai/generate.test.ts` (línea ~13).
- `backend/src/programs/generateJob.test.ts` (línea ~5, dentro del `program`).
- `backend/src/routes/programs.test.ts` (línea ~9, dentro de `validProgram`). **NO** tocar las líneas ~168/175/185/188/199 que usan `focus:` para el **pedido oneOff** (esas son `OneOffRequestSchema`, quedan igual).

- [ ] **Step 6: Correr shared + backend y verificar verde**

Run: `bun test shared backend`
Expected: PASS (o los mismos fallos preexistentes si los hubiera; ningún fallo nuevo por `focus`/`targetMuscles`). Si algún test del backend de generación/rutas falla por `targetMuscles` faltante en un fixture, corregir ese fixture del mismo modo.

- [ ] **Step 7: Commit**

```bash
git add shared/src/schemas/program.ts shared/src/schemas/program.test.ts backend/src/ai/generate.test.ts backend/src/programs/generateJob.test.ts backend/src/routes/programs.test.ts
git commit -S -m "feat(gen-1): el día declara targetMuscles (reemplaza focus vestigial)"
```

---

## Task 2: Función pura de coherencia en `shared/`

**Files:**
- Create: `shared/src/schemas/programScope.ts`
- Create: `shared/src/schemas/programScope.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `shared/src/schemas/programScope.test.ts`:

```ts
import { test, expect } from "bun:test";
import { exerciseInScope, exercisesOutOfScope } from "./programScope";
import type { CatalogExercise } from "./catalog";
import type { Workout } from "./program";

// Lookup falso: mapea catalogId → primaryMuscles.
function fakeLookup(map: Record<string, string[]>) {
  return (id: string): CatalogExercise | undefined =>
    map[id]
      ? ({ id, garminCategory: "c", garminName: id, displayName: id, primaryMuscles: map[id] as any, secondaryMuscles: [], equipment: ["bodyweight"] })
      : undefined;
}

function ex(catalogId: string): Workout["exercises"][number] {
  return { catalogId, garminName: catalogId, sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 60, notes: "" };
}

function workout(targetMuscles: string[], exerciseIds: string[]): Workout {
  return { dayLabel: "D", location: "gym", targetMuscles: targetMuscles as any, exercises: exerciseIds.map(ex) };
}

test("exerciseInScope: intersección directa", () => {
  expect(exerciseInScope(["back"], ["back", "biceps"])).toBe(true);
  expect(exerciseInScope(["quads"], ["back", "biceps"])).toBe(false);
});

test("exerciseInScope: full_body es comodín en ambos sentidos", () => {
  expect(exerciseInScope(["full_body"], ["back"])).toBe(true);
  expect(exerciseInScope(["quads"], ["full_body"])).toBe(true);
});

test("exercisesOutOfScope: marca la prensa en día de espalda/bíceps", () => {
  const lookup = fakeLookup({ row: ["back"], curl: ["biceps"], leg_press: ["quads"] });
  const out = exercisesOutOfScope(workout(["back", "biceps"], ["row", "curl", "leg_press"]), lookup);
  expect(out.map((e) => e.catalogId)).toEqual(["leg_press"]);
});

test("exercisesOutOfScope: día coherente → vacío", () => {
  const lookup = fakeLookup({ row: ["back"], curl: ["biceps"] });
  expect(exercisesOutOfScope(workout(["back", "biceps"], ["row", "curl"]), lookup)).toEqual([]);
});

test("exercisesOutOfScope: peso muerto (full_body) NO se marca en día de espalda", () => {
  const lookup = fakeLookup({ deadlift: ["full_body"] });
  expect(exercisesOutOfScope(workout(["back"], ["deadlift"]), lookup)).toEqual([]);
});

test("exercisesOutOfScope: solo cuenta primaryMuscles (secundario no alcanza)", () => {
  // press de banca: primary chest; en día de tríceps (secundario) → se marca.
  const lookup = fakeLookup({ bench: ["chest"] });
  expect(exercisesOutOfScope(workout(["triceps"], ["bench"]), lookup).map((e) => e.catalogId)).toEqual(["bench"]);
});

test("exercisesOutOfScope: catalogId desconocido no es asunto de esta validación", () => {
  const lookup = fakeLookup({});
  expect(exercisesOutOfScope(workout(["back"], ["no_existe"]), lookup)).toEqual([]);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/schemas/programScope.test.ts`
Expected: FAIL ("Cannot find module './programScope'").

- [ ] **Step 3: Implementar la función pura**

Crear `shared/src/schemas/programScope.ts`:

```ts
import type { CatalogExercise, MuscleGroup } from "./catalog";
import type { ProgramExercise, Workout } from "./program";

// Un ejercicio pertenece al objetivo del día si alguno de sus primaryMuscles está entre los
// targetMuscles del día. `full_body` es comodín BIDIRECCIONAL: un ejercicio full_body (peso
// muerto, cargadas) entra en cualquier día, y un día con target full_body acepta cualquier
// ejercicio. Solo se consideran primaryMuscles (los secundarios serían demasiado laxos).
export function exerciseInScope(primaryMuscles: MuscleGroup[], targetMuscles: MuscleGroup[]): boolean {
  if (primaryMuscles.includes("full_body")) return true;
  if (targetMuscles.includes("full_body")) return true;
  return primaryMuscles.some((m) => targetMuscles.includes(m));
}

// Ejercicios de un día cuyo grupo principal no coincide con el objetivo del día. Un catalogId
// desconocido se ignora (esa validación la hace el loop de IDs de generate.ts, no ésta).
export function exercisesOutOfScope(
  workout: Workout,
  lookup: (id: string) => CatalogExercise | undefined,
): ProgramExercise[] {
  return workout.exercises.filter((exercise) => {
    const cat = lookup(exercise.catalogId);
    if (!cat) return false;
    return !exerciseInScope(cat.primaryMuscles, workout.targetMuscles);
  });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `bun test shared/src/schemas/programScope.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Verificación por mutación**

Romper temporalmente en `programScope.ts` el comodín: cambiar `if (primaryMuscles.includes("full_body")) return true;` por `if (false) return true;`. Correr el test → debe fallar el de peso muerto. Revertir. Luego romper `.some((m) => targetMuscles.includes(m))` por `.every(...)` → debe fallar algún caso. Revertir.

Run: `bun test shared/src/schemas/programScope.test.ts` (con y sin la mutación)
Expected: con mutación FAIL; revertido PASS.

- [ ] **Step 6: Exportar desde el índice**

En `shared/src/index.ts`, agregar tras la línea `export * from "./schemas/program";`:

```ts
export * from "./schemas/programScope";
```

- [ ] **Step 7: Correr shared completo**

Run: `bun test shared`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add shared/src/schemas/programScope.ts shared/src/schemas/programScope.test.ts shared/src/index.ts
git commit -S -m "feat(gen-1): función pura de coherencia día↔músculo (exercisesOutOfScope)"
```

---

## Task 3: El prompt del entreno puntual emite `targetMuscles`

**Files:**
- Modify: `backend/src/ai/oneoff.ts`
- Modify: `backend/src/ai/oneoff.test.ts`

- [ ] **Step 1: Escribir/actualizar el assert del prompt (falla)**

En `backend/src/ai/oneoff.test.ts`, en el test que verifica el contenido del prompt para varios grupos (el que usa `focus: ["chest", "triceps", "shoulders"]`), agregar un assert:

```ts
  expect(prompt).toContain('targetMuscles');
```

Si ningún test arma el prompt con múltiples grupos, agregar uno:

```ts
test("el prompt pide emitir targetMuscles con TODOS los grupos del día", () => {
  const prompt = buildOneOffPrompt(profile, { location: "gym", focus: ["back", "biceps"], sessionMinutes: 60, equipment: ["dumbbell"] });
  expect(prompt).toContain('targetMuscles');
  expect(prompt).toContain('back');
  expect(prompt).toContain('biceps');
});
```

(Reusar el `profile` y el import de `buildOneOffPrompt` ya presentes en el archivo.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test backend/src/ai/oneoff.test.ts`
Expected: FAIL (el prompt dice `focus="..."`, no `targetMuscles`).

- [ ] **Step 3: Actualizar el prompt**

En `backend/src/ai/oneoff.ts`, en el array de reglas, reemplazar la regla 2:

```ts
    `2. Devolvé un programa (schema Program) con EXACTAMENTE 1 semana (weekNumber 1) y 1 workout, location=${args.location}, focus="${args.focus[0]}".`,
```

por:

```ts
    `2. Devolvé un programa (schema Program) con EXACTAMENTE 1 semana (weekNumber 1) y 1 workout, location=${args.location}, y el campo targetMuscles con TODOS los grupos pedidos: [${args.focus.join(", ")}].`,
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `bun test backend/src/ai/oneoff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/oneoff.ts backend/src/ai/oneoff.test.ts
git commit -S -m "feat(gen-1): el prompt de entreno puntual emite targetMuscles"
```

---

## Task 4: El prompt de generación endurece la coherencia

**Files:**
- Modify: `backend/src/ai/prompt.ts`
- Modify/Create: `backend/src/ai/prompt.test.ts`

- [ ] **Step 1: Escribir el test de contenido (falla)**

Si existe `backend/src/ai/prompt.test.ts`, agregar un test; si no, crearlo:

```ts
import { test, expect } from "bun:test";
import { buildGenerationPrompt } from "./prompt";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "beginner", goal: "hypertrophy", daysPerWeek: 3, sessionMinutes: 60,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

test("el prompt pide targetMuscles por día y coherencia ejercicio↔objetivo", () => {
  const p = buildGenerationPrompt(profile);
  expect(p).toContain("targetMuscles");
  expect(p.toLowerCase()).toContain("objetivo del día");
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test backend/src/ai/prompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Endurecer el prompt**

En `backend/src/ai/prompt.ts`, en el array de `buildGenerationPrompt`, reemplazar la regla 5:

```ts
    "5. Generá un programa de 2 semanas, con un máximo de 5 ejercicios por día.",
```

por:

```ts
    "5. Generá un programa de 2 semanas, con un máximo de 5 ejercicios por día.",
    "6. Cada día representa un OBJETIVO de entrenamiento. Por cada día emití el campo targetMuscles con los grupos musculares que entrena ese día (p.ej. un día de espalda y bíceps: [\"back\",\"biceps\"]). Cada ejercicio del día debe entrenar principalmente al menos uno de esos grupos (su primaryMuscles). No mezcles grupos ajenos al objetivo del día (p.ej. no pongas un ejercicio de pierna en un día de espalda/bíceps). Los ejercicios full_body pueden ir en cualquier día.",
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `bun test backend/src/ai/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/prompt.ts backend/src/ai/prompt.test.ts
git commit -S -m "feat(gen-1): el prompt de generación exige coherencia día↔objetivo"
```

---

## Task 5: Fase B — reparación por día en `generate.ts`

**Files:**
- Modify: `backend/src/ai/generate.ts`
- Modify: `backend/src/ai/generate.test.ts`

- [ ] **Step 1: Escribir los tests de Fase B (fallan)**

En `backend/src/ai/generate.test.ts`, agregar (arriba, junto a los fixtures, definir un programa con un día MALO y un día reparado):

```ts
// Día con ejercicio de pierna en objetivo de espalda/bíceps.
const programBadDay: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "Espalda y Bíceps", location: "gym", targetMuscles: ["back", "biceps"], exercises: [
      { catalogId: "barbell_row", garminName: "Barbell Row", sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
      { catalogId: "barbell_front_squat", garminName: "Barbell Front Squat", sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 90, notes: "" }, // PIERNA (quads) — fuera de objetivo
    ] },
  ] }],
};
```

Nota: ids verificados contra `shared/src/catalog/exercises.data.ts` — `barbell_row` primary `["back"]`, `barbell_front_squat` primary `["quads"]`. El día reparado devuelve solo ejercicios en objetivo:

```ts
const repairedDayProgram: Program = {
  name: "Reparado", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "x", location: "gym", targetMuscles: ["back", "biceps"], exercises: [
      { catalogId: "barbell_row", garminName: "Barbell Row", sets: 3, reps: "8", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};
```

Tests:

```ts
test("Fase B: programa sin días fuera de objetivo → cero reparaciones", async () => {
  let repairs = 0;
  const ai: AiClient = { generateProgram: async (input) => { if (input.oneOff) { repairs++; return repairedDayProgram; } return validProgram; } };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(repairs).toBe(0);
  expect(result).toEqual(validProgram);
});

test("Fase B: un día malo → 1 reparación; reemplaza ejercicios y preserva metadatos del día", async () => {
  let repairs = 0;
  const ai: AiClient = { generateProgram: async (input) => { if (input.oneOff) { repairs++; return repairedDayProgram; } return programBadDay; } };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(repairs).toBe(1);
  const day = result.weeks[0].workouts[0];
  expect(day.dayLabel).toBe("Espalda y Bíceps"); // metadato preservado
  expect(day.targetMuscles).toEqual(["back", "biceps"]); // preservado
  expect(day.exercises.map((e) => e.catalogId)).toEqual(["barbell_row"]); // reparado (sin la pierna)
});

test("Fase B: reparación que mete un catalogId inexistente → conserva el día original", async () => {
  const repairedBad: Program = JSON.parse(JSON.stringify(repairedDayProgram));
  repairedBad.weeks[0].workouts[0].exercises[0].catalogId = "no_existe";
  const ai: AiClient = { generateProgram: async (input) => (input.oneOff ? repairedBad : programBadDay) };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  // el día original queda tal cual (con sus 2 ejercicios, incluida la pierna): el usuario lo ajusta en la app
  expect(result.weeks[0].workouts[0].exercises.map((e) => e.catalogId)).toEqual(["barbell_row", "barbell_squat"]);
});

test("Fase B: si la reparación lanza (error IA) → conserva el día original, no falla la generación", async () => {
  const ai: AiClient = { generateProgram: async (input) => { if (input.oneOff) throw new Error("IA caída"); return programBadDay; } };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(result.weeks[0].workouts[0].exercises.length).toBe(2);
});

test("Fase B: no corre para generaciones oneOff (el pedido ya fija el objetivo)", async () => {
  let calls = 0;
  const ai: AiClient = { generateProgram: async () => { calls++; return programBadDay; } };
  await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai, oneOff: { location: "gym", focus: ["back"], sessionMinutes: 60, equipment: [] } });
  expect(calls).toBe(1); // solo la generación inicial, sin Fase B
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `bun test backend/src/ai/generate.test.ts`
Expected: FAIL (Fase B no existe todavía).

- [ ] **Step 3: Implementar Fase B**

Reescribir `backend/src/ai/generate.ts`:

```ts
import { getExerciseById, exercisesOutOfScope, type Program, type TrainingProfile, type Workout, type ProgramExercise } from "@pulsia/shared";
import type { AiClient } from "./client";
import type { OneOffArgs } from "./oneoff";

function unknownCatalogIds(program: Program): string[] {
  const bad: string[] = [];
  for (const w of program.weeks)
    for (const day of w.workouts)
      for (const ex of day.exercises)
        if (!getExerciseById(ex.catalogId)) bad.push(ex.catalogId);
  return bad;
}

// Re-planea UN día vía IA (reusa la maquinaria del entreno puntual), enfocado en los targetMuscles
// del día. Devuelve los ejercicios reparados, o null si la llamada falla o introduce un catalogId
// inexistente (en ese caso el caller conserva el día original — nunca se despacha un ID inválido).
async function repairDayExercises(input: {
  workout: Workout;
  profile: TrainingProfile;
  apiKey: string;
  model: string;
  ai: AiClient;
}): Promise<ProgramExercise[] | null> {
  const { workout, profile, apiKey, model, ai } = input;
  try {
    const repaired = await ai.generateProgram({
      profile, apiKey, model,
      oneOff: {
        location: workout.location,
        focus: workout.targetMuscles,
        sessionMinutes: profile.sessionMinutes,
        equipment: [], // cae al equipo del perfil según location (ver buildOneOffPrompt)
      },
    });
    const day = repaired.weeks[0]?.workouts[0];
    if (!day) return null;
    if (day.exercises.some((ex) => !getExerciseById(ex.catalogId))) return null;
    return day.exercises;
  } catch {
    return null;
  }
}

export async function generateProgramForProfile(input: {
  profile: TrainingProfile;
  apiKey: string;
  model: string;
  ai: AiClient;
  historySummary?: string;
  memory?: string;
  progressSummary?: string;
  ecgSummary?: string;
  oneOff?: OneOffArgs;
}): Promise<Program> {
  const { profile, apiKey, model, ai, historySummary, memory, progressSummary, ecgSummary, oneOff } = input;

  // Fase A: generación con reintento por catalogIds inexistentes (invariante: todos los IDs válidos).
  let program: Program | null = null;
  let lastBad: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidate = await ai.generateProgram({ profile, apiKey, model, historySummary, memory, progressSummary, ecgSummary, oneOff });
    lastBad = unknownCatalogIds(candidate);
    if (lastBad.length === 0) { program = candidate; break; }
  }
  if (!program) throw new Error(`La IA usó ejercicios fuera del catálogo: ${lastBad.join(", ")}`);

  // Fase B: coherencia día↔objetivo. No corre para oneOff (el pedido ya fija el objetivo del día).
  // Por cada día con ejercicios fuera de objetivo, re-planea SOLO ese día (best-effort). Si la
  // reparación falla o mete un ID inexistente, conserva el día original: el usuario puede ajustar
  // el ejercicio con el selector de alternativas de la app.
  if (!oneOff) {
    for (const week of program.weeks) {
      for (const workout of week.workouts) {
        if (exercisesOutOfScope(workout, getExerciseById).length === 0) continue;
        const repaired = await repairDayExercises({ workout, profile, apiKey, model, ai });
        if (repaired) workout.exercises = repaired;
      }
    }
  }

  return program;
}
```

- [ ] **Step 4: Correr generate.test.ts y verificar verde**

Run: `bun test backend/src/ai/generate.test.ts`
Expected: PASS (los 3 tests originales + los 5 de Fase B).

- [ ] **Step 5: Verificación por mutación de un test clave**

En `generate.ts`, romper temporalmente el guardado del reparado: cambiar `if (repaired) workout.exercises = repaired;` por `if (repaired) { /* no-op */ }`. Correr → el test "un día malo → reemplaza ejercicios" debe fallar. Revertir. Luego romper el invariante de ID: quitar la línea `if (day.exercises.some((ex) => !getExerciseById(ex.catalogId))) return null;` → el test "reparación con ID inexistente conserva el día original" debe fallar. Revertir.

Run: `bun test backend/src/ai/generate.test.ts`
Expected: con cada mutación FAIL; revertido PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/generate.ts backend/src/ai/generate.test.ts
git commit -S -m "feat(gen-1): Fase B — re-planea por IA solo el día con ejercicio fuera de objetivo"
```

---

## Task 6: Verificación integral

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa shared + backend**

Run: `bun test shared backend`
Expected: PASS, sin fallos nuevos.

- [ ] **Step 2: Typecheck del backend y shared (si hay script)**

Run: `bun run -F @pulsia/backend typecheck 2>/dev/null || cd backend && bunx tsc --noEmit; cd ..`
Expected: sin errores de tipos relacionados a `focus`/`targetMuscles`. Si el proyecto no tiene script de typecheck, correr `bunx tsc --noEmit -p backend/tsconfig.json` y `-p shared/tsconfig.json` según existan.

- [ ] **Step 3: Grep de residuos**

Run: `grep -rn "\.focus\b\|focus:" backend/src shared/src --include=*.ts | grep -v oneoff | grep -v OneOff`
Expected: sin apariciones de `focus` sobre un **workout** (las de `OneOffArgs`/`OneOffRequestSchema` quedan y son correctas). Revisar manualmente que lo que quede sea solo del entreno puntual.

- [ ] **Step 4: Commit final (si hubo ajustes)**

```bash
git add -A
git commit -S -m "chore(gen-1): verificación integral (typecheck + suite)" || echo "nada que commitear"
```

---

## Self-Review del plan (hecho al escribirlo)

- **Cobertura del spec:** ① schema (Task 1) · ② función pura (Task 2) · ③ reparación por día (Task 5) · ④ prompt (Task 4) · oneoff emite targetMuscles (Task 3). ✅
- **Sin placeholders:** todos los pasos traen código/comandos reales. ✅
- **Consistencia de tipos:** `targetMuscles: MuscleGroup[]`, `exercisesOutOfScope(workout, lookup)`, `repairDayExercises(...)`, `OneOffArgs.focus` (array) intactos. ✅
- **Riesgo abierto (para el implementador):** confirmar los catalogIds usados en los fixtures de `generate.test.ts` contra `exercises.data.ts` (que `barbell_row`≈back y `barbell_squat`≈quads existan; si no, sustituir por ids reales de esos grupos).
