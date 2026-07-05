# Entreno Puntual Expandido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandir el entreno puntual (one-off) para aceptar varios músculos, tiempo elegible, equipo explícito y notas libres, alimentando todo eso al prompt de la IA.

**Architecture:** El contrato `POST /programs/generate-oneoff` se amplía con `focus[]`, `sessionMinutes`, `equipment[]`, `notes`, con fallbacks para tolerar version-skew (app vieja ↔ backend nuevo). La cadena backend es route (`programs.ts`) → `generateProgramForProfile` (`generate.ts`) → `ai.generateProgram` (`client.ts`) → `buildOneOffPrompt` (`oneoff.ts`); el tipo `OneOffArgs` fluye por las tres. El mobile arma el payload desde un formulario multi-select.

**Tech Stack:** Bun + Hono + Zod (backend/shared, tests con `bun:test`), Expo + React Native + jest-expo + @testing-library/react-native (mobile).

---

## File Structure

**PR-A (shared + backend):**
- Create: `shared/src/schemas/oneoff.ts` — `OneOffRequestSchema` + `OneOffRequest` type (contrato tolerante).
- Create: `shared/src/schemas/oneoff.test.ts` — tests del schema.
- Modify: `shared/src/index.ts` — exportar `./schemas/oneoff`.
- Modify: `backend/src/ai/oneoff.ts` — `OneOffArgs` type + `buildOneOffPrompt` expandido.
- Modify: `backend/src/ai/oneoff.test.ts` — tests del prompt nuevo.
- Modify: `backend/src/ai/client.ts` — `oneOff?: OneOffArgs`.
- Modify: `backend/src/ai/generate.ts` — `oneOff?: OneOffArgs`.
- Modify: `backend/src/routes/programs.ts` — parseo + fallbacks del payload nuevo.
- Modify: `backend/src/routes/programs.test.ts` — tests de la route.

**PR-B (mobile):**
- Modify: `mobile/src/api/programs.ts` — firma de `generateOneOff`.
- Modify: `mobile/app/entreno-puntual.tsx` — formulario multi-select.
- Modify: `mobile/__tests__/entreno-puntual.test.tsx` — test del formulario nuevo.

---

# PHASE 1 — PR-A (shared + backend)

Rama: `feat/oneoff-expanded-backend` (ya creada, spec ya commiteado).

## Task 1: `OneOffRequestSchema` en shared

**Files:**
- Create: `shared/src/schemas/oneoff.ts`
- Create: `shared/src/schemas/oneoff.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/src/schemas/oneoff.test.ts`:

```ts
import { test, expect } from "bun:test";
import { OneOffRequestSchema } from "./oneoff";

const profile = {
  experience: "intermediate", goal: "hypertrophy", daysPerWeek: 4, sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell"], homeEquipment: ["dumbbell"], limitations: [],
};

test("acepta el payload nuevo completo", () => {
  const r = OneOffRequestSchema.safeParse({
    profile, location: "gym", focus: ["chest", "triceps"],
    sessionMinutes: 45, equipment: ["dumbbell"], notes: "me duele la cintura",
  });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.focus).toEqual(["chest", "triceps"]);
    expect(r.data.sessionMinutes).toBe(45);
    expect(r.data.equipment).toEqual(["dumbbell"]);
    expect(r.data.notes).toBe("me duele la cintura");
  }
});

test("back-compat: focus single string se coacciona a array", () => {
  const r = OneOffRequestSchema.safeParse({ profile, location: "home", focus: "chest" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.focus).toEqual(["chest"]);
    expect(r.data.sessionMinutes).toBeUndefined();
    expect(r.data.equipment).toEqual([]);
  }
});

test("focus vacío falla", () => {
  const r = OneOffRequestSchema.safeParse({ profile, location: "gym", focus: [] });
  expect(r.success).toBe(false);
});

test("sessionMinutes fuera de rango falla", () => {
  const r = OneOffRequestSchema.safeParse({ profile, location: "gym", focus: ["chest"], sessionMinutes: 5 });
  expect(r.success).toBe(false);
});

test("location inválida falla", () => {
  const r = OneOffRequestSchema.safeParse({ profile, location: "beach", focus: ["chest"] });
  expect(r.success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && bun test src/schemas/oneoff.test.ts`
Expected: FAIL — `Cannot find module "./oneoff"`.

- [ ] **Step 3: Write minimal implementation**

Create `shared/src/schemas/oneoff.ts`:

```ts
import { z } from "zod";
import { TrainingProfileSchema, EquipmentSchema } from "./profile";
import { MuscleGroupSchema } from "./catalog";

export const LocationSchema = z.enum(["gym", "home"]);

// Contrato tolerante a version-skew: `focus` acepta string legacy o array;
// `sessionMinutes`/`equipment`/`notes` son opcionales (el backend aplica fallbacks).
export const OneOffRequestSchema = z.object({
  profile: TrainingProfileSchema,
  location: LocationSchema,
  focus: z.preprocess(
    (v) => (typeof v === "string" ? [v] : v),
    z.array(MuscleGroupSchema).min(1),
  ),
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  equipment: z.array(EquipmentSchema).default([]),
  notes: z.string().max(500).optional(),
});

export type OneOffRequest = z.infer<typeof OneOffRequestSchema>;
export type Location = z.infer<typeof LocationSchema>;
```

Modify `shared/src/index.ts` — agregar tras la línea `export * from "./schemas/catalog";`:

```ts
export * from "./schemas/oneoff";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shared && bun test src/schemas/oneoff.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add shared/src/schemas/oneoff.ts shared/src/schemas/oneoff.test.ts shared/src/index.ts
git commit -S -m "feat(shared): OneOffRequestSchema (multi-músculo, tiempo, equipo, notas)"
```

---

## Task 2: `buildOneOffPrompt` expandido

**Files:**
- Modify: `backend/src/ai/oneoff.ts`
- Modify: `backend/src/ai/oneoff.test.ts`

- [ ] **Step 1: Write the failing test**

Reemplazar TODO el contenido de `backend/src/ai/oneoff.test.ts` por:

```ts
import { test, expect } from "bun:test";
import { buildOneOffPrompt } from "./oneoff";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate", goal: "hypertrophy", daysPerWeek: 4, sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell", "bench"], homeEquipment: ["dumbbell"], limitations: [],
} as TrainingProfile;

test("pide UN entreno, sin progresión", () => {
  const p = buildOneOffPrompt(profile, {
    location: "home", focus: ["chest"], sessionMinutes: 60, equipment: ["dumbbell"],
  });
  expect(p.toLowerCase()).toContain("un entrenamiento");
  expect(p.toLowerCase()).toContain("casa");
  expect(p.toLowerCase()).not.toContain("progresión");
});

test("incluye TODOS los músculos pedidos", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest", "triceps", "shoulders"], sessionMinutes: 60, equipment: ["dumbbell"],
  });
  expect(p).toContain("chest");
  expect(p).toContain("triceps");
  expect(p).toContain("shoulders");
});

test("usa el equipo explícito para armar el catálogo (dumbbell), no el del profile", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest"], sessionMinutes: 60, equipment: ["dumbbell"],
  });
  expect(p).toContain("dumbbell");
  // No debería incluir un ejercicio que exige barbell (equipo no disponible)
  expect(p).not.toContain("barbell_bench_press");
});

test("si equipment viene vacío, cae al equipo del location", () => {
  const p = buildOneOffPrompt(profile, {
    location: "home", focus: ["chest"], sessionMinutes: 60, equipment: [],
  });
  // homeEquipment = ["dumbbell"] → algún ejercicio de dumbbell en el catálogo
  expect(p).toContain("dumbbell");
});

test("usa los minutos override en el prompt", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest"], sessionMinutes: 30, equipment: ["dumbbell"],
  });
  expect(p).toContain("30");
});

test("incluye las notas del atleta cuando existen", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest"], sessionMinutes: 60, equipment: ["dumbbell"],
    notes: "no puedo hacer burpees",
  });
  expect(p.toLowerCase()).toContain("notas del atleta");
  expect(p).toContain("no puedo hacer burpees");
});

test("sin notas, no incluye la sección de notas", () => {
  const p = buildOneOffPrompt(profile, {
    location: "gym", focus: ["chest"], sessionMinutes: 60, equipment: ["dumbbell"],
  });
  expect(p.toLowerCase()).not.toContain("notas del atleta");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/ai/oneoff.test.ts`
Expected: FAIL — la firma vieja `{ location, focus }` no matchea; errores de tipo/aserción.

- [ ] **Step 3: Write minimal implementation**

Reemplazar TODO el contenido de `backend/src/ai/oneoff.ts` por:

```ts
import { catalogForEquipment, type TrainingProfile, type Equipment, type MuscleGroup } from "@pulsia/shared";

export type OneOffArgs = {
  location: "gym" | "home";
  focus: MuscleGroup[];
  sessionMinutes: number;
  equipment: Equipment[];
  notes?: string;
};

export function buildOneOffPrompt(profile: TrainingProfile, args: OneOffArgs): string {
  // Equipo explícito de la sesión; si viene vacío, cae al equipo del location del perfil.
  const equipment: Equipment[] =
    args.equipment.length > 0
      ? args.equipment
      : args.location === "home"
        ? profile.homeEquipment
        : profile.gymEquipment;

  const catalogList = catalogForEquipment(equipment)
    .map((e) => `- ${e.id} | ${e.garminName} | músculos: ${e.primaryMuscles.join(",")} | equip: ${e.equipment.join(",")}`)
    .join("\n");
  const lugar = args.location === "home" ? "casa" : "gimnasio";
  const musculos = args.focus.join(", ");

  const lines = [
    "Sos un entrenador de fuerza experto. Diseñá UN ENTRENAMIENTO de un solo día (puntual, para viaje/vacaciones).",
    "",
    "Perfil del atleta:",
    `- Experiencia: ${profile.experience}`,
    `- Objetivo: ${profile.goal}`,
    `- Minutos disponibles para esta sesión: ${args.sessionMinutes}`,
    `- Limitaciones: ${profile.limitations.join("; ") || "ninguna"}`,
    "",
    `Entrenamiento pedido: enfoque en los grupos musculares: ${musculos}. En ${lugar} (location=${args.location}).`,
  ];

  if (args.notes && args.notes.trim().length > 0) {
    lines.push(
      "",
      `Notas del atleta para HOY (respetalas estrictamente): ${args.notes.trim()}`,
    );
  }

  lines.push(
    "",
    "Reglas:",
    "1. Usá ÚNICAMENTE ejercicios de este catálogo (catalogId = id; garminName = nombre exacto):",
    catalogList,
    `2. Devolvé un programa (schema Program) con EXACTAMENTE 1 semana (weekNumber 1) y 1 workout, location=${args.location}, focus="${args.focus[0]}".`,
    `3. Cubrí de forma balanceada TODOS los grupos pedidos (${musculos}). Ajustá la cantidad de ejercicios al tiempo disponible (~1 ejercicio cada 10 minutos, con un mínimo de 3).`,
    "4. Es un entrenamiento de un único día: no encadenes ni ajustes semana a semana. Elegí cargas/series/reps razonables para el nivel.",
    "5. Respetá las limitaciones del atleta y las notas de hoy.",
    "Devolvé el resultado llamando a la herramienta provista.",
  );

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/ai/oneoff.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/ai/oneoff.ts backend/src/ai/oneoff.test.ts
git commit -S -m "feat(backend): buildOneOffPrompt con multi-músculo, tiempo, equipo explícito y notas"
```

---

## Task 3: Propagar `OneOffArgs` por la cadena (client + generate)

**Files:**
- Modify: `backend/src/ai/client.ts`
- Modify: `backend/src/ai/generate.ts`

- [ ] **Step 1: Update the type in `client.ts`**

En `backend/src/ai/client.ts`:

(a) Agregar el import de `OneOffArgs` a la línea que importa de `./oneoff`:

```ts
import { buildOneOffPrompt, type OneOffArgs } from "./oneoff";
```

(b) Reemplazar las DOS ocurrencias de `oneOff?: { location: "gym" | "home"; focus: MuscleGroup };` (una en la interface `AiClient.generateProgram`, otra en la firma de `AnthropicAiClient.generateProgram`) por:

```ts
    oneOff?: OneOffArgs;
```

(c) Si tras el cambio `MuscleGroup` queda sin usar en el import de la línea 2, quitarlo de ese import para no romper el typecheck (dejar `import type { Program, TrainingProfile } from "@pulsia/shared";`).

- [ ] **Step 2: Update the type in `generate.ts`**

En `backend/src/ai/generate.ts`:

(a) Agregar el import:

```ts
import type { OneOffArgs } from "./oneoff";
```

(b) Reemplazar `oneOff?: { location: "gym" | "home"; focus: MuscleGroup };` por:

```ts
  oneOff?: OneOffArgs;
```

(c) Si `MuscleGroup` queda sin uso en el import de `@pulsia/shared` de la línea 1, quitarlo (dejar `import { getExerciseById, type Program, type TrainingProfile } from "@pulsia/shared";`).

- [ ] **Step 3: Run the type check + existing tests**

Run: `cd backend && bunx tsc --noEmit && bun test src/ai/`
Expected: PASS — typecheck limpio y los tests de `generate`/`oneoff` verdes.

- [ ] **Step 4: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/ai/client.ts backend/src/ai/generate.ts
git commit -S -m "refactor(backend): propagar OneOffArgs por la cadena de generación"
```

---

## Task 4: Route `/generate-oneoff` con parseo + fallbacks

**Files:**
- Modify: `backend/src/routes/programs.ts`
- Modify: `backend/src/routes/programs.test.ts`

- [ ] **Step 1: Write the failing test**

En `backend/src/routes/programs.test.ts`, REEMPLAZAR el último test (`"POST /programs/generate-oneoff genera un programa..."`, líneas ~151-165) por estos tests:

```ts
test("POST /programs/generate-oneoff (payload nuevo) pasa focus[], minutos, equipo y notas a la IA", async () => {
  lastAiInput = null;
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-oneoff", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({
      profile: validProfileBody, location: "gym",
      focus: ["chest", "triceps"], sessionMinutes: 30, equipment: ["dumbbell"], notes: "sin barra",
    }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.program.weeks.length).toBe(1);
  expect(lastAiInput.oneOff).toEqual({
    location: "gym", focus: ["chest", "triceps"], sessionMinutes: 30, equipment: ["dumbbell"], notes: "sin barra",
  });
});

test("POST /programs/generate-oneoff back-compat: focus single legacy → array", async () => {
  lastAiInput = null;
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-oneoff", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ profile: validProfileBody, location: "home", focus: "chest" }),
  });
  expect(res.status).toBe(200);
  expect(lastAiInput.oneOff.focus).toEqual(["chest"]);
  // Fallbacks: sessionMinutes del profile (45), equipment del homeEquipment (["bodyweight"])
  expect(lastAiInput.oneOff.sessionMinutes).toBe(45);
  expect(lastAiInput.oneOff.equipment).toEqual(["bodyweight"]);
});

test("POST /programs/generate-oneoff con focus vacío devuelve 400", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate-oneoff", {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ profile: validProfileBody, location: "gym", focus: [] }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/routes/programs.test.ts`
Expected: FAIL — `lastAiInput.oneOff` sigue siendo `{ location, focus }` (single), no matchea.

- [ ] **Step 3: Write minimal implementation**

En `backend/src/routes/programs.ts`, en el handler `r.post("/generate-oneoff", ...)`:

(a) Agregar el import de `OneOffRequestSchema` al import de `@pulsia/shared` que ya exista en el archivo (o agregar una línea nueva):

```ts
import { OneOffRequestSchema } from "@pulsia/shared";
```

(b) Reemplazar el bloque de parseo/validación actual (desde `const body = await c.req.json()...` hasta el `if (!parsed.success || !location || !focusOk.success) { ... return 400 }`) por:

```ts
    const parsed = OneOffRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "profile, location (gym|home) y focus (≥1 MuscleGroup) requeridos" }, 400);
    }
    const { profile: reqProfile, location, focus, notes } = parsed.data;
    const sessionMinutes = parsed.data.sessionMinutes ?? reqProfile.sessionMinutes;
    const equipment = parsed.data.equipment.length > 0
      ? parsed.data.equipment
      : (location === "home" ? reqProfile.homeEquipment : reqProfile.gymEquipment);
```

(c) Donde antes se usaba `parsed.data` (el profile) para buscar settings y para `generateProgramForProfile`, ahora usar `reqProfile`. Reemplazar la llamada a `generateProgramForProfile`:

```ts
      program = await generateProgramForProfile({
        profile: reqProfile,
        apiKey,
        model,
        ai: deps.aiClient,
        oneOff: { location, focus, sessionMinutes, equipment, notes },
      });
```

(d) En el `insert` de `programs`, usar `reqProfile` como `profileSnapshot`:

```ts
      .values({ userId, name: program.name, data: program, profileSnapshot: reqProfile })
```

(e) Quitar imports que queden sin uso (`MuscleGroupSchema` si ya no se usa; `TrainingProfileSchema` sigue usándose en `/generate`, no tocar ahí).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/routes/programs.test.ts && bunx tsc --noEmit`
Expected: PASS — los 3 tests nuevos verdes, typecheck limpio.

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add backend/src/routes/programs.ts backend/src/routes/programs.test.ts
git commit -S -m "feat(backend): /generate-oneoff acepta focus[], tiempo, equipo y notas con fallbacks"
```

---

## Task 5: Verificación PR-A + push + PR

- [ ] **Step 1: Full test suite + typecheck (shared + backend)**

Run:
```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test && bunx tsc --noEmit
cd /Users/kilo/desarrollo26/pulsia/backend && bun test && bunx tsc --noEmit
```
Expected: TODOS los tests verdes, sin errores de tipo.

- [ ] **Step 2: Push + abrir PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git push -u origin feat/oneoff-expanded-backend
gh pr create --title "feat: entreno puntual expandido — backend (multi-músculo, tiempo, equipo, notas)" \
  --body "$(cat <<'EOF'
## Qué

Expande el contrato `POST /programs/generate-oneoff` (PR-A de 2, solo backend+shared):
- `focus` ahora es array (mín 1) — varios músculos por sesión.
- `sessionMinutes` override opcional (fallback: `profile.sessionMinutes`).
- `equipment` explícito opcional (fallback: equipo del `location`).
- `notes` texto libre opcional → se inyecta en el prompt ("respetalas estrictamente").

## Compatibilidad

`OneOffRequestSchema` es tolerante a version-skew: `focus` acepta string legacy → `[focus]`, y los campos nuevos son opcionales. La app vieja sigue funcionando contra este backend.

## Spec

`docs/superpowers/specs/2026-07-06-oneoff-expanded-design.md`

## Tests

Schema (shared), prompt, cadena de tipos y route — todos con `bun:test`.
EOF
)"
```

- [ ] **Step 3: Code review (protocolo)**

Seguir el protocolo de review: esperar CodeRabbit con timer; si no revisa → `@claude review`; comentarios menores → corregir + mergear; mayores → corregir + nuevo review. (Ver la skill de code-review-polling.) Tras mergear, **verificar la salud del auto-deploy en la Pi por SSH** (`ssh nextcloud 'curl -s localhost:3011/health'`).

---

# PHASE 2 — PR-B (mobile)

Rama: `feat/oneoff-expanded-mobile` (crear off `origin/main` DESPUÉS de mergear PR-A, para tener el `OneOffRequest` type disponible).

## Task 6: `generateOneOff` — firma nueva en el api client

**Files:**
- Modify: `mobile/src/api/programs.ts`

- [ ] **Step 1: Update the signature**

En `mobile/src/api/programs.ts`, reemplazar la firma de `generateOneOff`:

```ts
export async function generateOneOff(
  baseUrl: string,
  args: {
    profile: TrainingProfile;
    location: "gym" | "home";
    focus: string[];
    sessionMinutes: number;
    equipment: string[];
    notes?: string;
  },
): Promise<{ id: string; program: Program }> {
  const res = await apiFetch(baseUrl, "/programs/generate-oneoff", {
    method: "POST",
    body: JSON.stringify(args),
    timeoutMs: GENERATION_TIMEOUT_MS,
  });
  if (!res.ok) throw new Error("No se pudo generar el entreno puntual");
  const data = await res.json();
  return { id: data.id, program: ProgramSchema.parse(data.program) };
}
```

- [ ] **Step 2: Type check**

Run: `cd mobile && bunx tsc --noEmit`
Expected: FALLA en `entreno-puntual.tsx` (todavía llama con la firma vieja) — se arregla en Task 7. Confirmar que el error es SOLO en `entreno-puntual.tsx`.

- [ ] **Step 3: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/api/programs.ts
git commit -S -m "feat(mobile): generateOneOff acepta focus[], tiempo, equipo y notas"
```

---

## Task 7: Formulario multi-select en `entreno-puntual.tsx`

**Files:**
- Modify: `mobile/app/entreno-puntual.tsx`
- Modify: `mobile/__tests__/entreno-puntual.test.tsx`

- [ ] **Step 1: Write the failing test**

Reemplazar TODO el contenido de `mobile/__tests__/entreno-puntual.test.tsx` por:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import EntrenoPuntualScreen from "../app/entreno-puntual";
import { generateOneOff } from "../src/api/programs";
import { router } from "expo-router";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/storage/profile", () => ({
  getProfile: async () => ({
    experience: "intermediate", goal: "hypertrophy", daysPerWeek: 4, sessionMinutes: 60,
    gymEquipment: ["barbell", "dumbbell"], homeEquipment: ["dumbbell"], limitations: [],
  }),
}));
jest.mock("../src/storage/oneOffProgram", () => ({
  setStoredOneOffProgram: jest.fn(),
  setStoredOneOffProgramId: jest.fn(),
}));
jest.mock("../src/api/programs", () => ({
  generateOneOff: jest.fn(async () => ({
    id: "oid",
    program: {
      name: "Puntual",
      weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "Puntual: Pecho", location: "home", focus: "chest", exercises: [] }] }],
    },
  })),
}));

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
  (generateOneOff as jest.Mock).mockClear();
});

test("multi-músculo + lugar (siembra equipo) + tiempo → arma el payload nuevo y navega", async () => {
  await render(<EntrenoPuntualScreen />);
  // Esperar a que cargue el profile (siembra el equipo del lugar por default = gym)
  await waitFor(() => expect(screen.getByTestId("equip-dumbbell")).toBeTruthy());

  // Elegir dos músculos
  await fireEvent.press(screen.getByTestId("focus-chest"));
  await fireEvent.press(screen.getByTestId("focus-triceps"));
  // Elegir tiempo 30
  await fireEvent.press(screen.getByTestId("time-30"));
  // Generar
  await fireEvent.press(screen.getByTestId("generar-puntual"));

  await waitFor(() =>
    expect(generateOneOff).toHaveBeenCalledWith(
      "http://b.test",
      expect.objectContaining({
        location: "gym",
        focus: ["chest", "triceps"],
        sessionMinutes: 30,
        equipment: expect.arrayContaining(["barbell", "dumbbell"]),
      }),
    ),
  );
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/sesion",
        params: expect.objectContaining({ oneOff: "true", location: "gym", week: "1" }),
      }),
    ),
  );
});

test("no se puede generar sin músculo elegido", async () => {
  await render(<EntrenoPuntualScreen />);
  await waitFor(() => expect(screen.getByTestId("generar-puntual")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("generar-puntual"));
  await waitFor(() => expect(generateOneOff).not.toHaveBeenCalled());
});

test("cambiar de lugar a Casa resiembra el equipo (dumbbell, sin barbell)", async () => {
  await render(<EntrenoPuntualScreen />);
  await waitFor(() => expect(screen.getByTestId("equip-barbell")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("loc-home"));
  await waitFor(() => expect(screen.queryByTestId("equip-barbell")).toBeNull());
  // dumbbell sigue disponible en homeEquipment
  expect(screen.getByTestId("equip-dumbbell")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && bun test __tests__/entreno-puntual.test.tsx` (o `npx jest __tests__/entreno-puntual.test.tsx`)
Expected: FAIL — no existen los testIDs `equip-*`, `time-*`, ni el multi-select.

- [ ] **Step 3: Write the implementation**

Reemplazar TODO el contenido de `mobile/app/entreno-puntual.tsx` por:

```tsx
import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView, TextInput } from "react-native";
import { router } from "expo-router";
import type { MuscleGroup, Equipment, TrainingProfile } from "@pulsia/shared";
import { getBackendUrl } from "../src/storage/config";
import { getProfile } from "../src/storage/profile";
import { setStoredOneOffProgram, setStoredOneOffProgramId } from "../src/storage/oneOffProgram";
import { generateOneOff } from "../src/api/programs";
import { colors, radius, spacing } from "../src/theme/tokens";

const FOCUS_OPTIONS: { value: MuscleGroup; label: string }[] = [
  { value: "chest", label: "Pecho" },
  { value: "back", label: "Espalda" },
  { value: "shoulders", label: "Hombros" },
  { value: "biceps", label: "Bíceps" },
  { value: "triceps", label: "Tríceps" },
  { value: "quads", label: "Cuádriceps" },
  { value: "hamstrings", label: "Isquios" },
  { value: "glutes", label: "Glúteos" },
  { value: "abs", label: "Abdominales" },
];

const LOCATION_OPTIONS: { value: "gym" | "home"; label: string }[] = [
  { value: "gym", label: "Gimnasio" },
  { value: "home", label: "Casa" },
];

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: "bodyweight", label: "Peso corporal" },
  { value: "dumbbell", label: "Mancuerna" },
  { value: "barbell", label: "Barra" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "resistance_band", label: "Banda" },
  { value: "pull_up_bar", label: "Barra dominadas" },
  { value: "bench", label: "Banco" },
  { value: "cable_machine", label: "Polea" },
  { value: "machine", label: "Máquina" },
  { value: "trx", label: "TRX" },
];

const TIME_OPTIONS = [20, 30, 45, 60, 90];

function Chip({ label, on, testID, onPress }: { label: string; on: boolean; testID: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: on ? colors.accent : colors.border,
        backgroundColor: on ? colors.accent : colors.bg,
      }}
    >
      <Text style={{ color: on ? "#fff" : colors.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function EntrenoPuntualScreen() {
  const [profile, setProfile] = useState<TrainingProfile | null>(null);
  const [focus, setFocus] = useState<MuscleGroup[]>([]);
  const [location, setLocation] = useState<"gym" | "home">("gym");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [minutes, setMinutes] = useState<number>(60);
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar el profile y sembrar minutos + equipo del lugar inicial (gym).
  useEffect(() => {
    (async () => {
      const p = await getProfile();
      if (!p) return;
      setProfile(p);
      setMinutes(p.sessionMinutes);
      setEquipment(location === "home" ? p.homeEquipment : p.gymEquipment);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChangeLocation(next: "gym" | "home") {
    setLocation(next);
    if (profile) setEquipment(next === "home" ? profile.homeEquipment : profile.gymEquipment);
  }

  function toggleFocus(m: MuscleGroup) {
    setFocus((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }
  function toggleEquipment(e: Equipment) {
    setEquipment((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  function effectiveMinutes(): number {
    const custom = parseInt(customMinutes, 10);
    if (customMinutes.trim() !== "" && Number.isFinite(custom)) {
      return Math.min(180, Math.max(15, custom));
    }
    return minutes;
  }

  async function onGenerate() {
    if (focus.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const url = await getBackendUrl();
      if (!url || !profile) {
        setError("Configurá backend y perfil primero");
        setLoading(false);
        return;
      }
      const { id, program } = await generateOneOff(url, {
        profile,
        location,
        focus,
        sessionMinutes: effectiveMinutes(),
        equipment,
        notes: notes.trim() || undefined,
      });
      await setStoredOneOffProgram(program);
      await setStoredOneOffProgramId(id);
      const wk = program.weeks[0].workouts[0];
      router.push({
        pathname: "/sesion",
        params: { week: "1", dayLabel: wk.dayLabel, location, oneOff: "true" },
      });
    } catch {
      setError("No se pudo generar el entreno");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ fontSize: 16, color: colors.text }}>Generando…</Text>
        <Text style={{ color: colors.textMuted, textAlign: "center" }}>Esto puede tardar hasta un par de minutos.</Text>
      </View>
    );
  }

  const customOn = customMinutes.trim() !== "";

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg }}>
      <Text style={{ fontSize: 18, fontWeight: "500", color: colors.text }}>Entreno puntual</Text>
      <Text style={{ color: colors.textMuted }}>Elegí qué músculos, cuánto tiempo, con qué equipo y cualquier nota para hoy.</Text>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Músculos</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {FOCUS_OPTIONS.map((o) => (
            <Chip key={o.value} testID={`focus-${o.value}`} label={o.label} on={focus.includes(o.value)} onPress={() => toggleFocus(o.value)} />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Lugar</Text>
        <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, overflow: "hidden" }}>
          {LOCATION_OPTIONS.map((o) => {
            const on = o.value === location;
            return (
              <Pressable
                key={o.value}
                testID={`loc-${o.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onChangeLocation(o.value)}
                style={{ flex: 1, paddingVertical: spacing.sm, alignItems: "center", backgroundColor: on ? colors.accent : colors.bg }}
              >
                <Text style={{ color: on ? "#fff" : colors.textMuted, fontSize: 13 }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Equipo disponible</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {EQUIPMENT_OPTIONS.map((o) => (
            <Chip key={o.value} testID={`equip-${o.value}`} label={o.label} on={equipment.includes(o.value)} onPress={() => toggleEquipment(o.value)} />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Tiempo (min)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" }}>
          {TIME_OPTIONS.map((t) => (
            <Chip
              key={t}
              testID={`time-${t}`}
              label={String(t)}
              on={!customOn && minutes === t}
              onPress={() => { setCustomMinutes(""); setMinutes(t); }}
            />
          ))}
          <TextInput
            testID="time-custom"
            value={customMinutes}
            onChangeText={setCustomMinutes}
            placeholder="Otro"
            keyboardType="number-pad"
            style={{
              minWidth: 64, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
              borderRadius: radius.pill, borderWidth: 1,
              borderColor: customOn ? colors.accent : colors.border, color: colors.text,
            }}
          />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Notas para hoy (opcional)</Text>
        <TextInput
          testID="oneoff-notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="ej: me duele la cintura, no puedo hacer burpees"
          multiline
          style={{
            minHeight: 64, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1,
            borderColor: colors.border, color: colors.text, textAlignVertical: "top",
          }}
        />
      </View>

      <Pressable
        testID="generar-puntual"
        disabled={focus.length === 0 || loading}
        onPress={onGenerate}
        style={{
          backgroundColor: focus.length === 0 || loading ? colors.border : colors.accent,
          borderRadius: radius.sm,
          padding: spacing.md,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff" }}>Generar entreno</Text>
      </Pressable>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && bun test __tests__/entreno-puntual.test.tsx && bunx tsc --noEmit`
Expected: PASS (3 tests) y typecheck limpio.

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/entreno-puntual.tsx mobile/__tests__/entreno-puntual.test.tsx
git commit -S -m "feat(mobile): entreno puntual con multi-músculo, tiempo, equipo y notas"
```

---

## Task 8: Verificación PR-B + push + PR

- [ ] **Step 1: Full mobile test suite + typecheck**

Run:
```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun test && bunx tsc --noEmit
```
Expected: TODOS los tests verdes, sin errores de tipo.

- [ ] **Step 2: Push + abrir PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git push -u origin feat/oneoff-expanded-mobile
gh pr create --title "feat: entreno puntual expandido — mobile (multi-músculo, tiempo, equipo, notas)" \
  --body "$(cat <<'EOF'
## Qué

Formulario de entreno puntual (PR-B de 2, mobile):
- Músculos: multi-select (varios por sesión).
- Lugar: el toggle Gym/Casa siembra el equipo, editable.
- Equipo: multi-select en español.
- Tiempo: chips 20/30/45/60/90 + "Otro" (custom).
- Notas: texto libre para hoy.

Depende del contrato de PR-A (ya mergeado).

## Spec

`docs/superpowers/specs/2026-07-06-oneoff-expanded-design.md`
EOF
)"
```

- [ ] **Step 3: Code review (protocolo)**

Mismo protocolo que PR-A. (PR-B no auto-deploya nada — el mobile se distribuye por OTA/APK manual.)

---

## Self-Review (hecho al escribir el plan)

- **Spec coverage:** multi-músculo (T1 focus[], T7 UI) ✓; tiempo (T1 sessionMinutes, T2 prompt, T7 chips+custom) ✓; equipo explícito (T1, T2 catálogo, T7 multi-select sembrado) ✓; notas (T1, T2 sección prompt, T7 TextInput) ✓; fallbacks/back-compat (T1 preprocess, T4 route) ✓; `workout.focus=focus[0]` sin migración (T2) ✓.
- **Type consistency:** `OneOffArgs` (focus: MuscleGroup[], sessionMinutes: number, equipment: Equipment[], notes?: string) idéntico en oneoff.ts/client.ts/generate.ts; el route arma exactamente ese objeto; `OneOffRequestSchema` produce el request que el mobile manda. ✓
- **Placeholders:** ninguno — todo el código está escrito. ✓
