# C5 · PR3 — Sustitución de ejercicio (program-wide) + nota por-ejercicio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **NOTA para el orquestador:** los subagentes de este repo a veces re-delegan y no terminan. Pasar a cada implementador la instrucción explícita "IMPLEMENTÁ VOS, NO delegues ni spawnees subagentes". Verificar el estado real (git log/tests) tras cada tarea.

**Goal:** Permitir cambiar un ejercicio que no se puede hacer por una alternativa (mismo músculo + equipo disponible), con una nota del motivo. El cambio se registra en la sesión (log real) y se aplica a **todo el programa vigente** (mutación del programa local en mobile).

**Architecture:** Full-stack. `shared`: nuevos campos `note`/`substitutedFromId` en `SessionExerciseSchema` + helper puro `alternativesFor`. `backend`: migración drizzle que agrega 2 columnas a `session_exercise` + persistencia. `mobile`: funciones puras `substituteExercise` (sesión) y `substituteInProgram` (programa local) + UI de picker en `sesion.tsx`. La copia del programa en el backend queda desactualizada (nadie la lee — aceptado en v1).

**Tech Stack:** TypeScript, Zod, Drizzle (postgres), Bun (shared/backend tests), jest (`jest-expo`, mobile, `--runInBand`).

**Entorno / convenciones:**
- shared/backend tests: `cd shared && bun test` / `cd backend && bun test`. mobile: `cd mobile && npm test -- --runInBand <patrón>`, typecheck `npm run typecheck`.
- Commits firmados `git commit -S`, sin atribución a Claude.
- Rama de trabajo: `feat/c5-sustitucion` (ya creada, desde `main`).
- `zod` no resuelve desde `mobile/` → usar tipos de `@pulsia/shared`.

---

## Task 1: Campos `note` / `substitutedFromId` en `SessionExerciseSchema` (+ arreglar `startSession`)

**Files:**
- Modify: `shared/src/schemas/session.ts` (`SessionExerciseSchema`, ~línea 25)
- Modify: `mobile/src/session/engine.ts` (`startSession`, ~línea 31 — inicializa los nuevos campos)
- Test: `shared/src/schemas/session.test.ts`, `mobile/__tests__/session-engine.test.ts`

- [ ] **Step 1: Test que falla (shared).** Agregar a `shared/src/schemas/session.test.ts`:
```ts
test("SessionExercise tiene note y substitutedFromId con defaults", () => {
  const parsed = SessionExerciseSchema.parse({
    catalogId: "x", garminName: "X", order: 0,
    planned: { sets: 2, reps: "8", targetLoad: "RPE 8", restSeconds: 60 },
    sets: [],
  });
  expect(parsed.note).toBe("");
  expect(parsed.substitutedFromId).toBe(null);
});
```
(Verificar que `SessionExerciseSchema` esté importado en ese test; si no, importarlo.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd shared && bun test src/schemas/session.test.ts` → falla (`note`/`substitutedFromId` undefined).

- [ ] **Step 3: Agregar los campos al schema.** En `shared/src/schemas/session.ts`, dentro de `SessionExerciseSchema` (después de `skipped`):
```ts
export const SessionExerciseSchema = z.object({
  catalogId: z.string().min(1),
  garminName: z.string().min(1),
  order: z.number().int().min(0),
  planned: PlannedExerciseSchema,
  skipped: z.boolean().default(false),
  note: z.string().default(""),
  substitutedFromId: z.string().nullable().default(null),
  sets: z.array(SetLogSchema),
});
```

- [ ] **Step 4: Correr shared, confirmar PASS.** `cd shared && bun test`

- [ ] **Step 5: Test que falla (mobile engine).** En `mobile/__tests__/session-engine.test.ts`, agregar (o extender un test de `startSession` existente) que verifique que los ejercicios armados traen los defaults:
```ts
test("startSession inicializa note='' y substitutedFromId=null por ejercicio", () => {
  // reusar el `program`/args con que otros tests llaman startSession en este archivo
  const s = startSession({ program, programId: "p", weekNumber: 1, dayLabel: "Día 1", location: "gym", id: "11111111-1111-4111-8111-111111111111", nowMs: 1000 });
  expect(s.exercises[0].note).toBe("");
  expect(s.exercises[0].substitutedFromId).toBe(null);
});
```
(Adaptar `program`/args al harness real del archivo. Leer el archivo primero.)

- [ ] **Step 6: Correr mobile, confirmar FAIL** (`cd mobile && npm test -- --runInBand session-engine`): el objeto no trae los campos → o falla el assert o falla typecheck.

- [ ] **Step 7: Inicializar en `startSession`.** En `mobile/src/session/engine.ts` (~línea 31), agregar los campos al literal:
```ts
  const exercises: SessionExercise[] = (workout?.exercises ?? []).map((e, i) => ({
    catalogId: e.catalogId,
    garminName: e.garminName,
    order: i,
    planned: { sets: e.sets, reps: e.reps, targetLoad: e.targetLoad, restSeconds: e.restSeconds },
    skipped: false,
    note: "",
    substitutedFromId: null,
    sets: [],
  }));
```

- [ ] **Step 8: Correr mobile (session-engine) + typecheck + suite completa.** `cd mobile && npm test -- --runInBand session-engine && npm run typecheck && npm test -- --runInBand`. Todo verde (el typecheck valida que ninguna otra construcción de `SessionExercise` quedó incompleta).

- [ ] **Step 9: Commit.**
```bash
git add shared/src/schemas/session.ts shared/src/schemas/session.test.ts mobile/src/session/engine.ts mobile/__tests__/session-engine.test.ts
git commit -S -m "feat(shared): note y substitutedFromId por ejercicio de sesión"
```

---

## Task 2: Helper puro `alternativesFor` (shared)

**Files:**
- Modify: `shared/src/catalog/exercises.ts`
- Test: `shared/src/catalog/exercises.test.ts`

- [ ] **Step 1: Test que falla.** Agregar a `shared/src/catalog/exercises.test.ts`:
```ts
import { alternativesFor } from "./exercises";

test("alternativesFor: mismo músculo primario, equipo disponible, excluye el actual", () => {
  // band_assisted_pull_up: primary back, equipment [resistance_band, pull_up_bar]
  const alts = alternativesFor("band_assisted_pull_up", ["dumbbell"]);
  // Todas comparten al menos un músculo primario con el actual (back) y usan solo dumbbell.
  expect(alts.every((e) => e.primaryMuscles.includes("back"))).toBe(true);
  expect(alts.every((e) => e.equipment.every((eq) => eq === "dumbbell"))).toBe(true);
  expect(alts.some((e) => e.id === "band_assisted_pull_up")).toBe(false); // excluye el actual
  expect(alts.length).toBeGreaterThan(0);
});

test("alternativesFor: catalogId inexistente → []", () => {
  expect(alternativesFor("no_existe", ["dumbbell"])).toEqual([]);
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd shared && bun test src/catalog/exercises.test.ts` → `alternativesFor` no existe.

- [ ] **Step 3: Implementar.** Agregar a `shared/src/catalog/exercises.ts`:
```ts
import type { CatalogExercise, Equipment } from "../index";
// (getExerciseById y EXERCISE_CATALOG ya están en este archivo)

export function alternativesFor(catalogId: string, availableEquipment: Equipment[]): CatalogExercise[] {
  const current = getExerciseById(catalogId);
  if (!current) return [];
  const avail = new Set(availableEquipment);
  const targetMuscles = new Set(current.primaryMuscles);
  return EXERCISE_CATALOG.filter(
    (e) =>
      e.id !== catalogId &&
      e.primaryMuscles.some((m) => targetMuscles.has(m)) &&
      e.equipment.every((eq) => avail.has(eq)),
  );
}
```
(No duplicar imports ya existentes; `Equipment` puede necesitar agregarse al import de tipos existente.)

- [ ] **Step 4: Correr, confirmar PASS.** `cd shared && bun test`

- [ ] **Step 5: Commit.**
```bash
git add shared/src/catalog/exercises.ts shared/src/catalog/exercises.test.ts
git commit -S -m "feat(shared): alternativesFor (alternativas por músculo + equipo)"
```

---

## Task 3: Migración + persistencia backend

**Files:**
- Modify: `backend/src/db/schema.ts` (`sessionExercise`, ~línea 66)
- Modify: `backend/src/sessions/repository.ts` (`upsertSession` ~línea 51, `rowsToSession` ~línea 18)
- Create: `backend/drizzle/000X_*.sql` (+ `meta/` actualizado) vía `db:generate`
- Test: `backend/src/sessions/repository.test.ts`

- [ ] **Step 1: Test que falla (rowsToSession round-trip).** En `backend/src/sessions/repository.test.ts`, extender el `nestedRow` de fixture para incluir `note`/`substitutedFromId` en el exercise y assert que `rowsToSession` los mapea:
```ts
// en el ejercicio del nestedRow agregar: note: "no tengo barra", substitutedFromId: "band_assisted_pull_up"
test("rowsToSession mapea note y substitutedFromId", () => {
  const s = rowsToSession(nestedRow as any);
  expect(s.exercises[0].note).toBe("no tengo barra");
  expect(s.exercises[0].substitutedFromId).toBe("band_assisted_pull_up");
});
```
(Leer el archivo primero para ubicar `nestedRow` y su forma.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/sessions/repository.test.ts`

- [ ] **Step 3: Agregar columnas al schema drizzle.** En `backend/src/db/schema.ts`, en `sessionExercise` (después de `skipped`):
```ts
  skipped: boolean("skipped").default(false).notNull(),
  note: text("note").default("").notNull(),
  substitutedFromId: text("substituted_from_id"),
```
(`substituted_from_id` sin `.notNull()` = nullable.)

- [ ] **Step 4: Persistir en `upsertSession`.** En `backend/src/sessions/repository.ts`, en el `.insert(sessionExercise).values({...})` agregar:
```ts
        note: ex.note,
        substitutedFromId: ex.substitutedFromId,
```

- [ ] **Step 5: Hidratar en `rowsToSession`.** En el `.map((ex) => ({...}))` de exercises agregar:
```ts
        note: ex.note,
        substitutedFromId: ex.substitutedFromId,
```

- [ ] **Step 6: Correr backend tests, confirmar PASS.** `cd backend && bun test`

- [ ] **Step 7: Generar la migración.** `cd backend && npm run db:generate` (drizzle-kit diffea el schema contra los snapshots; no necesita DB viva). Debe crear `backend/drizzle/000X_<nombre>.sql` con `ALTER TABLE "session_exercise" ADD COLUMN "note" text DEFAULT '' NOT NULL;` y `ADD COLUMN "substituted_from_id" text;`, más los cambios en `backend/drizzle/meta/`. Verificar el SQL generado abriendo el archivo nuevo.

- [ ] **Step 8: Commit (schema + migración + persistencia).**
```bash
git add backend/src/db/schema.ts backend/src/sessions/repository.ts backend/src/sessions/repository.test.ts backend/drizzle/
git commit -S -m "feat(backend): persistir note/substituted_from_id en session_exercise (+ migración)"
```
> Deploy: la migración se aplica en la Pi con `npm run db:migrate` en el próximo despliegue (fuera de este PR).

---

## Task 4: `substituteExercise` y `substituteInProgram` (mobile engine, puras)

**Files:**
- Modify: `mobile/src/session/engine.ts`
- Test: `mobile/__tests__/session-engine.test.ts`

- [ ] **Step 1: Tests que fallan.** Agregar a `mobile/__tests__/session-engine.test.ts`:
```ts
import { substituteExercise, substituteInProgram } from "../src/session/engine";

test("substituteExercise cambia el ejercicio en ese order, setea note y substitutedFromId, preserva sets", () => {
  const base = startSession({ program, programId: "p", weekNumber: 1, dayLabel: "Día 1", location: "gym", id: "11111111-1111-4111-8111-111111111111", nowMs: 1000 });
  const withSet = { ...base, exercises: base.exercises.map((e, i) => i === 0 ? { ...e, sets: [{ setNumber: 1, reps: 5, weightKg: null, rpe: null, startedAt: 1, endedAt: 2, durationMs: 1, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false }] } : e) };
  const next = substituteExercise(withSet, { order: 0, newCatalogId: "dumbbell_row", newGarminName: "Dumbbell Row", note: "no tengo barra" });
  const ex = next.exercises.find((e) => e.order === 0)!;
  expect(ex.catalogId).toBe("dumbbell_row");
  expect(ex.garminName).toBe("Dumbbell Row");
  expect(ex.note).toBe("no tengo barra");
  expect(ex.substitutedFromId).toBe(withSet.exercises[0].catalogId);
  expect(ex.sets.length).toBe(1); // preserva sets logrados
});

test("substituteInProgram reemplaza todas las apariciones del catalogId viejo", () => {
  const next = substituteInProgram(program, program.weeks[0].workouts[0].exercises[0].catalogId, { catalogId: "dumbbell_row", garminName: "Dumbbell Row" }, "no tengo barra");
  const all = next.weeks.flatMap((w) => w.workouts.flatMap((wo) => wo.exercises));
  expect(all.some((e) => e.catalogId === program.weeks[0].workouts[0].exercises[0].catalogId)).toBe(false);
  const swapped = all.find((e) => e.catalogId === "dumbbell_row")!;
  expect(swapped.garminName).toBe("Dumbbell Row");
  expect(swapped.notes).toBe("no tengo barra"); // motivo en ProgramExercise.notes
});
```
(Adaptar `program` al harness del archivo.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd mobile && npm test -- --runInBand session-engine`

- [ ] **Step 3: Implementar.** Agregar a `mobile/src/session/engine.ts` (importar `Program` si hace falta — ya está importado como tipo):
```ts
export function substituteExercise(
  session: WorkoutSession,
  args: { order: number; newCatalogId: string; newGarminName: string; note: string },
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((e) =>
      e.order === args.order
        ? { ...e, catalogId: args.newCatalogId, garminName: args.newGarminName, note: args.note, substitutedFromId: e.substitutedFromId ?? e.catalogId }
        : e,
    ),
  };
}

export function substituteInProgram(
  program: Program,
  oldCatalogId: string,
  next: { catalogId: string; garminName: string },
  note: string,
): Program {
  return {
    ...program,
    weeks: program.weeks.map((w) => ({
      ...w,
      workouts: w.workouts.map((wo) => ({
        ...wo,
        exercises: wo.exercises.map((e) =>
          e.catalogId === oldCatalogId ? { ...e, catalogId: next.catalogId, garminName: next.garminName, notes: note } : e,
        ),
      })),
    })),
  };
}
```
(`substitutedFromId: e.substitutedFromId ?? e.catalogId` conserva el ORIGINAL si ya hubo una sustitución previa.)

- [ ] **Step 4: Correr, confirmar PASS + typecheck.** `cd mobile && npm test -- --runInBand session-engine && npm run typecheck`

- [ ] **Step 5: Commit.**
```bash
git add mobile/src/session/engine.ts mobile/__tests__/session-engine.test.ts
git commit -S -m "feat(mobile): substituteExercise (sesión) y substituteInProgram (programa)"
```

---

## Task 5: UI "Cambiar ejercicio" en `sesion.tsx`

**Files:**
- Modify: `mobile/app/sesion.tsx`
- Test: `mobile/__tests__/sesion.test.tsx`

Contexto: el ejercicio activo es `current` (un `SessionExercise`). El equipo disponible sale del perfil local (`getProfile()` de `../src/storage/profile`) según `session.location` (`gym` → `gymEquipment`, `home` → `homeEquipment`). Al confirmar un cambio: `apply(substituteExercise(sess, {...}))` (sesión) **y** `setStoredProgram(substituteInProgram(program, ...))` (`../src/storage/program`). El programa local se lee con `getStoredProgram()`.

- [ ] **Step 1: Read `mobile/app/sesion.tsx` y `mobile/__tests__/sesion.test.tsx`** para ubicar el bloque del ejercicio activo (cerca del botón `skip` / "Saltar ejercicio") y el harness de test (mocks de `program`, `getStoredProgram`, agregar mock de `../src/storage/profile` → `getProfile`).

- [ ] **Step 2: Test que falla.** Agregar a `sesion.test.tsx` un test que: renderiza, abre el picker ("cambiar-ejercicio"), elige una alternativa, escribe una nota, confirma, y verifica que `mockSetActive` fue llamado con un ejercicio cuyo `catalogId` cambió y `note` es la escrita, y que el programa se re-guardó. Añadir al harness el mock de perfil:
```ts
jest.mock("../src/storage/profile", () => ({ getProfile: async () => ({ gymEquipment: ["dumbbell"], homeEquipment: ["dumbbell"] }) }));
const mockSetProgram = jest.fn();
jest.mock("../src/storage/program", () => ({ getStoredProgram: async () => program, setStoredProgram: async (p: any) => mockSetProgram(p) }));
```
Test (adaptar testIDs a los que definas en Step 3):
```ts
test("cambiar ejercicio: elige alternativa + nota y aplica a sesión y programa", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("cambiar-ejercicio"));
  const alt = await screen.findByTestId(/^alt-/); // primera alternativa
  await fireEvent.press(alt);
  await fireEvent.changeText(screen.getByTestId("cambio-nota"), "no tengo barra");
  await fireEvent.press(screen.getByTestId("confirmar-cambio"));
  await waitFor(() => {
    const last = mockSetActive.mock.calls.at(-1)?.[0];
    expect(last.exercises[0].note).toBe("no tengo barra");
    expect(last.exercises[0].catalogId).not.toBe("barbell_bench_press");
  });
  await waitFor(() => expect(mockSetProgram).toHaveBeenCalled());
});
```

- [ ] **Step 3: Correr, confirmar FAIL.** `cd mobile && npm test -- --runInBand sesion`

- [ ] **Step 4: Implementar la UI.** En `mobile/app/sesion.tsx`:
1. Imports: `import { getProfile } from "../src/storage/profile";`, `import { getStoredProgram, setStoredProgram } from "../src/storage/program";`, `import { alternativesFor } from "@pulsia/shared";` (helper), y `substituteExercise, substituteInProgram` al import de `../src/session/engine`. `EXERCISE_CATALOG`/`getExerciseById` de `@pulsia/shared` si hace falta el garminName de la alternativa (usar el `garminName` del `CatalogExercise` elegido).
2. Estado: `const [showPicker, setShowPicker] = useState(false); const [pickChoice, setPickChoice] = useState<null | { catalogId: string; garminName: string }>(null); const [changeNote, setChangeNote] = useState(""); const [equipment, setEquipment] = useState<string[]>([]);`
3. Cargar equipo del perfil al montar:
```tsx
useEffect(() => { void getProfile().then((p) => { if (p) setEquipment(session?.location === "home" ? p.homeEquipment : p.gymEquipment); }); }, [session?.location]);
```
4. Handler de confirmación:
```tsx
async function confirmChange() {
  if (!current || !pickChoice) return;
  apply(substituteExercise(sess, { order: current.order, newCatalogId: pickChoice.catalogId, newGarminName: pickChoice.garminName, note: changeNote }));
  const prog = await getStoredProgram();
  if (prog) await setStoredProgram(substituteInProgram(prog, current.catalogId, pickChoice, changeNote));
  setShowPicker(false); setPickChoice(null); setChangeNote("");
}
```
5. UI: cerca de "Saltar ejercicio", un `Pressable testID="cambiar-ejercicio"` que hace `setShowPicker(true)`. Cuando `showPicker`, renderizar la lista `alternativesFor(current.catalogId, equipment as any)` mapeada a `Pressable testID={\`alt-${e.id}\`}` (al presionar: `setPickChoice({ catalogId: e.id, garminName: e.garminName })`), un `NotesEditor`/`TextInput testID="cambio-nota"` (label "Motivo del cambio") bindeado a `changeNote`, y un `Pressable testID="confirmar-cambio"` (deshabilitado si `!pickChoice`) que llama `confirmChange`. Si `alternativesFor(...)` es `[]`, mostrar un texto "No hay alternativas con tu equipo — podés saltar el ejercicio".

- [ ] **Step 5: Correr, confirmar PASS + typecheck + suite completa.** `cd mobile && npm test -- --runInBand sesion && npm run typecheck && npm test -- --runInBand`

- [ ] **Step 6: Commit.**
```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(mobile): UI para cambiar ejercicio (alternativa por músculo+equipo) + nota, program-wide"
```

---

## Cierre del PR
- `cd shared && bun test`, `cd backend && bun test`, `cd mobile && npm run typecheck && npm test -- --runInBand` — todo verde.
- Push + PR → review (poll con timer; escalar a `@claude review` si CodeRabbit tarda) → aplicar hallazgos → merge con OK del usuario.
- Nativo/UI nueva → se ve recién en el próximo preview build. La migración se aplica en la Pi al deployar.
- Cierra la iniciativa C5 (PR1 catálogo, PR2 notas, PR3 sustitución). El "feed a la generación" (notas+rendimiento+sustituciones → prompt) era PR4 en el spec — confirmar con el usuario si va ahora o después.
