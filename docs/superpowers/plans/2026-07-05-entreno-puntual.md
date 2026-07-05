# Entrenamiento · C6 — Entreno puntual (one-off) — spec + Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.
> **NOTA orquestador:** "IMPLEMENTÁ VOS, NO delegues ni spawnees subagentes". Verificar git/tests reales tras cada tarea. Diseño decidido autónomamente (delegado); documentado abajo.

**Goal:** Generar un **entreno de un día** eligiendo **un grupo muscular + gym/casa**, reusando el perfil, **sin tocar el plan vigente**. Para viaje/vacaciones.

## Decisiones de diseño (autónomas)
- **Alcance:** un `focus` (un `MuscleGroup`) + `location` (gym/home). Múltiples músculos = v-next.
- **Backend:** `POST /programs/generate-oneoff` genera un `Program` de **1 semana / 1 workout** (schema `Program` reutilizado) con un **prompt one-off** (sin progresión, solo el equipo de esa location) y lo **inserta** (fila real en `programs`, no toca el plan del mobile). Sin history/memory (es descartable).
- **Mobile:** slot de storage **separado** (`pulsia.oneOffProgram`/`pulsia.oneOffProgramId`) — el plan vigente (`pulsia.program`) no se toca. Pantalla "Entreno puntual" → elegís músculo + lugar → genera → navega a `/sesion?oneOff=true`. La pantalla de sesión, con `oneOff=true`, carga el programa del slot one-off. Al terminar/cancelar se limpia el slot.
- **Entrada:** botón "Entreno puntual" en la tab Programa (`index.tsx`).

**Tech Stack:** Backend Hono+Bun+Drizzle+Anthropic (`bun test`, fakes). Mobile Expo (jest `--runInBand`).
**Entorno:** `cd backend && bun test`; `cd mobile && npm test -- --runInBand`. Commits firmados. Rama `feat/entreno-puntual`.

**Contexto (verificado):**
- `buildGenerationPrompt(profile, historySummary?, memory?)` (`backend/src/ai/prompt.ts`). `AiClient.generateProgram({ profile, apiKey, model, historySummary?, memory? })` (`client.ts`, usa `buildGenerationPrompt`, tool `return_program` → `ProgramSchema`). `generateProgramForProfile({ profile, apiKey, model, ai, historySummary?, memory? })` (`generate.ts`, valida catálogo, reintenta 1 vez). `POST /generate` (`routes/programs.ts`) inserta y devuelve `{ id, program }`.
- `MuscleGroup` = `chest|back|shoulders|biceps|triceps|forearms|quads|hamstrings|glutes|calves|abs|full_body` (`shared/src/schemas/catalog.ts`). `Workout` = `{ dayLabel, location, focus: MuscleGroup, exercises }`. `catalogForEquipment(equipment)` filtra el catálogo.
- Mobile: `mobile/src/storage/program.ts` (`get/setStoredProgram`, key `pulsia.program`), `programId.ts` (`get/setStoredProgramId`). `mobile/src/api/programs.ts` (`generateProgram(baseUrl, profile)` POST `/programs/generate`, timeout 240s). `mobile/app/generando.tsx` (flujo de generación). `mobile/app/sesion.tsx` — effect de carga (~línea 141-165): `getStoredProgram()`+`getStoredProgramId()` → `startSession(...)`. `mobile/app/(tabs)/index.tsx` — tab Programa. `mobile/src/storage/profile.ts` `getProfile()`.

---

## Task 1: backend — one-off prompt + `POST /programs/generate-oneoff`

**Files:**
- Create: `backend/src/ai/oneoff.ts`, `backend/src/ai/oneoff.test.ts`
- Modify: `backend/src/ai/client.ts`, `backend/src/ai/generate.ts`, `backend/src/routes/programs.ts`
- Test: `backend/src/routes/programs.test.ts` (extender)

- [ ] **Step 1: Test que falla (prompt puro).** Crear `backend/src/ai/oneoff.test.ts`:
```ts
import { test, expect } from "bun:test";
import { buildOneOffPrompt } from "./oneoff";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate", goal: "hypertrophy", daysPerWeek: 4, sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell", "bench"], homeEquipment: ["dumbbell"], limitations: [],
} as TrainingProfile;

test("pide UN entreno del músculo y location elegidos, sin progresión", () => {
  const p = buildOneOffPrompt(profile, { location: "home", focus: "chest" });
  expect(p.toLowerCase()).toContain("un entrenamiento");
  expect(p).toContain("chest");
  expect(p.toLowerCase()).toContain("casa"); // location home
  expect(p.toLowerCase()).not.toContain("progresión"); // one-off no progresa
});

test("usa solo el equipo de la location (home → homeEquipment)", () => {
  const p = buildOneOffPrompt(profile, { location: "home", focus: "chest" });
  // el catálogo listado debe restringirse al equipo de casa (dumbbell); barbell no debería figurar como equip disponible
  expect(p).toContain("dumbbell");
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd backend && bun test src/ai/oneoff.test.ts`

- [ ] **Step 3: Implementar** `backend/src/ai/oneoff.ts`:
```ts
import { catalogForEquipment, type TrainingProfile, type Equipment, type MuscleGroup } from "@pulsia/shared";

export function buildOneOffPrompt(
  profile: TrainingProfile,
  args: { location: "gym" | "home"; focus: MuscleGroup },
): string {
  const equipment: Equipment[] = args.location === "home" ? profile.homeEquipment : profile.gymEquipment;
  const catalogList = catalogForEquipment(equipment)
    .map((e) => `- ${e.id} | ${e.garminName} | músculos: ${e.primaryMuscles.join(",")} | equip: ${e.equipment.join(",")}`)
    .join("\n");
  const lugar = args.location === "home" ? "casa" : "gimnasio";

  return [
    "Sos un entrenador de fuerza experto. Diseñá UN ENTRENAMIENTO de un solo día (puntual, para viaje/vacaciones).",
    "",
    "Perfil del atleta:",
    `- Experiencia: ${profile.experience}`,
    `- Objetivo: ${profile.goal}`,
    `- Minutos por sesión: ${profile.sessionMinutes}`,
    `- Limitaciones: ${profile.limitations.join("; ") || "ninguna"}`,
    "",
    `Entrenamiento pedido: enfoque en el grupo muscular "${args.focus}", en ${lugar} (location=${args.location}).`,
    "",
    "Reglas:",
    "1. Usá ÚNICAMENTE ejercicios de este catálogo (catalogId = id; garminName = nombre exacto):",
    catalogList,
    `2. Devolvé un programa (schema Program) con EXACTAMENTE 1 semana (weekNumber 1) y 1 workout, location=${args.location}, focus="${args.focus}", máximo 5 ejercicios.`,
    "3. NO apliques progresión (es un solo día). Elegí cargas/series/reps razonables para el nivel.",
    "4. Respetá las limitaciones del atleta.",
    "Devolvé el resultado llamando a la herramienta provista.",
  ].join("\n");
}
```

- [ ] **Step 4: Correr, confirmar PASS.** `cd backend && bun test src/ai/oneoff.test.ts`

- [ ] **Step 5: Threading `oneOff`.**
  - `backend/src/ai/client.ts`: agregar `oneOff?: { location: "gym" | "home"; focus: string }` al input de `generateProgram` (interfaz + impl). En el impl, importar `buildOneOffPrompt` de `./oneoff` y elegir el prompt: `const content = oneOff ? buildOneOffPrompt(profile, oneOff as any) : buildGenerationPrompt(profile, historySummary, memory);` (el `as any` sólo si el tipo de focus no calza; preferible tipar `focus` como `MuscleGroup` importándolo).
  - `backend/src/ai/generate.ts`: agregar `oneOff?: { location: "gym" | "home"; focus: string }` al input y pasarlo: `ai.generateProgram({ profile, apiKey, model, historySummary, memory, oneOff })`.

- [ ] **Step 6: Ruta `POST /generate-oneoff`.** En `backend/src/routes/programs.ts`, agregar (importar `MuscleGroupSchema` de `@pulsia/shared` y `z` — o validar simple):
```ts
  r.post("/generate-oneoff", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => null);
    const parsed = TrainingProfileSchema.safeParse(body?.profile);
    const location = body?.location === "home" ? "home" : body?.location === "gym" ? "gym" : null;
    const focusOk = MuscleGroupSchema.safeParse(body?.focus);
    if (!parsed.success || !location || !focusOk.success) return c.json({ error: "profile, location (gym|home) y focus (MuscleGroup) requeridos" }, 400);

    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    if (!row?.aiApiKeyEncrypted) return c.json({ error: "No hay API key de IA configurada." }, 400);
    const apiKey = decryptSecret(row.aiApiKeyEncrypted, deps.config.encryptionKey);
    const model = row.aiModel ?? deps.config.defaultModel;

    let program;
    try {
      program = await generateProgramForProfile({ profile: parsed.data, apiKey, model, ai: deps.aiClient, oneOff: { location, focus: focusOk.data } });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
    const inserted = await deps.db.insert(programs).values({ userId, name: program.name, data: program, profileSnapshot: parsed.data }).returning();
    return c.json({ id: inserted[0].id, program });
  });
```
(Importar `MuscleGroupSchema` de `@pulsia/shared`. `programs`, `settings`, `eq`, `decryptSecret`, `TrainingProfileSchema`, `generateProgramForProfile` ya están importados.)

- [ ] **Step 7: Test de la ruta.** En `backend/src/routes/programs.test.ts`, agregar un test que POSTee `/programs/generate-oneoff` con `{ profile, location: "home", focus: "chest" }` y verifique 200 + que el `aiClient.generateProgram` recibió `oneOff` (extender el fake para capturar input, ya existe `lastAiInput`). El fake `aiClient.generateProgram` debe devolver un Program válido de 1 workout.

- [ ] **Step 8: Backend completo + typecheck.** `cd backend && bun test && npx tsc --noEmit`

- [ ] **Step 9: Commit.**
```bash
git add backend/src/ai/oneoff.ts backend/src/ai/oneoff.test.ts backend/src/ai/client.ts backend/src/ai/generate.ts backend/src/routes/programs.ts backend/src/routes/programs.test.ts
git commit -S -m "feat(backend): POST /programs/generate-oneoff (entreno puntual de un día)"
```

---

## Task 2: mobile — storage one-off + api `generateOneOff`

**Files:**
- Create: `mobile/src/storage/oneOffProgram.ts`, test
- Modify: `mobile/src/api/programs.ts`
- Test: `mobile/__tests__/programs-api.test.ts` (o nuevo)

- [ ] **Step 1: Storage.** Crear `mobile/src/storage/oneOffProgram.ts` espejando `storage/program.ts` + `programId.ts` pero con keys `pulsia.oneOffProgram`/`pulsia.oneOffProgramId`: `getStoredOneOffProgram()`, `setStoredOneOffProgram(p)`, `getStoredOneOffProgramId()`, `setStoredOneOffProgramId(id)`, `clearOneOff()` (borra ambas keys). Test con el mock de AsyncStorage que usan los otros storage tests (ver `mobile/__tests__/program-storage.test.ts`).

- [ ] **Step 2: API.** En `mobile/src/api/programs.ts` agregar:
```ts
export async function generateOneOff(
  baseUrl: string,
  args: { profile: TrainingProfile; location: "gym" | "home"; focus: string },
): Promise<{ id: string; program: Program }> {
  const res = await apiFetch(baseUrl, "/programs/generate-oneoff", { method: "POST", body: JSON.stringify(args), timeoutMs: 240000 });
  if (!res.ok) throw new Error("No se pudo generar el entreno puntual");
  const data = await res.json();
  return { id: data.id, program: ProgramSchema.parse(data.program) };
}
```
(Reusar los imports de `programs.ts` — `apiFetch`, `ProgramSchema`, tipos.)

- [ ] **Step 3: Tests + typecheck + commit.** Test del storage (round-trip + clear) y del api (mock apiFetch → devuelve `{ id, program }`). `cd mobile && npm test -- --runInBand oneoff programs-api && npm run typecheck`. Commit:
```bash
git commit -S -m "feat(mobile): storage y api para el entreno puntual (one-off)"
```

---

## Task 3: mobile — pantalla "Entreno puntual"

**Files:** Create `mobile/app/entreno-puntual.tsx`, test `mobile/__tests__/entreno-puntual.test.tsx`.

- [ ] Pantalla-ruta: selector de **grupo muscular** (lista de `MuscleGroup`, chips) + **location** (SegmentToggle gym/casa, ya existe `mobile/src/components/SegmentToggle.tsx`) + botón "Generar entreno". Al generar: `getProfile()` + `getBackendUrl()` → `generateOneOff(url, { profile, location, focus })` → `setStoredOneOffProgram(program)` + `setStoredOneOffProgramId(id)` → `router.push({ pathname: "/sesion", params: { week: "1", dayLabel: program.weeks[0].workouts[0].dayLabel, location, oneOff: "true" } })`. Estados loading/error (la generación tarda ~2 min — mostrar "Generando…"). Test: elegir músculo + location + generar → llama `generateOneOff` y navega con `oneOff: "true"`.
- [ ] Commit: `feat(mobile): pantalla Entreno puntual (elegir músculo + lugar → generar)`.

---

## Task 4: mobile — integración en la sesión (cargar one-off, sin pisar el plan)

**Files:** Modify `mobile/app/sesion.tsx`, test `mobile/__tests__/sesion.test.tsx`.

- [ ] En el effect de carga de `sesion.tsx` (donde hace `getStoredProgram()`/`getStoredProgramId()`): si `params.oneOff === "true"`, usar `getStoredOneOffProgram()`/`getStoredOneOffProgramId()` en su lugar. El resto de `startSession(...)` igual.
- [ ] Al **terminar** (`onFinish`, tras persistir) y al **cancelar** (`onCancel`): si la sesión es one-off (guardar el flag, ej. un ref seteado desde params), llamar `clearOneOff()`. (El plan vigente `pulsia.program` nunca se toca.)
- [ ] Test: montar `SesionScreen` con `useLocalSearchParams` devolviendo `oneOff: "true"` + mock de `getStoredOneOffProgram` → arma la sesión desde el programa one-off (no del stored normal).
- [ ] Commit: `feat(mobile): la sesión puede correr un entreno puntual sin tocar el plan vigente`.

---

## Task 5: mobile — botón de entrada en la tab Programa

**Files:** Modify `mobile/app/(tabs)/index.tsx`, test `mobile/__tests__/*`.

- [ ] Agregar un botón/link "Entreno puntual" (para viaje/vacaciones) que `router.push("/entreno-puntual")`. Ubicarlo de forma coherente (ej. header o debajo del programa).
- [ ] Test: el botón navega a `/entreno-puntual`.
- [ ] `cd mobile && npm run typecheck && npm test -- --runInBand`. Commit: `feat(mobile): entrada a Entreno puntual desde la tab Programa`.

---

## Cierre del PR
- `cd backend && bun test && npx tsc --noEmit`, `cd mobile && npm run typecheck && npm test -- --runInBand` — verde.
- Push + PR → review (timer + escalado a `@claude`) → aplicar → merge (con comentarios corregidos).
- Backend + nativo/UI → requiere redeploy Pi + nuevo preview build para producción (queda para el usuario).
