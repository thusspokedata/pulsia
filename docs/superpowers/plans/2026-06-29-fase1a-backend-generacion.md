# Pulsia Fase 1A — Backend core de generación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el backend que, a partir de un perfil de entrenamiento, genera con Claude un programa multi-semana con ejercicios de nombres compatibles con Garmin, expuesto vía una API HTTP testeable.

**Architecture:** Monorepo con Bun workspaces. Un paquete `shared` con los schemas Zod (fuente de verdad de tipos y validación) y el catálogo de ejercicios Garmin. Un paquete `backend` (Hono sobre Bun) que persiste en Postgres+pgvector (Drizzle ORM, dockerizado), guarda la API key de IA encriptada, y llama a Claude con structured output para devolver un programa validado. El cliente de Claude está detrás de una interfaz para poder inyectar un fake en los tests.

**Tech Stack:** Bun, TypeScript, Hono, Zod, Drizzle ORM, postgres.js, Postgres 16 + pgvector (Docker), `@anthropic-ai/sdk`, `zod-to-json-schema`, `bun test`.

---

## Notas previas (workflow)

- **Trabajo por PRs revisados con CodeRabbit.** Cada grupo "PR N" de abajo termina con la creación de un PR. Trabajar en una rama por PR; nunca commitear directo a `main`.
- **Commits firmados:** todos los commits con `git commit -S`. Sin atribución a Claude/Anthropic.
- **Acción externa a confirmar:** crear el repo en GitHub (`gh repo create`) y agregar el remote es una operación mutante sobre un servicio externo. **Pedir confirmación explícita al usuario** antes de ejecutarla (Task 1.4). CodeRabbit necesita el repo en GitHub para revisar.
- **Convención de ramas:** `feat/fase1a-<slug>` por PR. **Convención de commits:** Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`).

---

## File Structure

```
pulsia/
├── package.json                      # root, Bun workspaces
├── tsconfig.base.json                # TS config compartida
├── .gitignore
├── docker-compose.yml                # Postgres 16 + pgvector
├── shared/
│   ├── package.json                  # @pulsia/shared
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                  # re-exports
│       ├── schemas/
│       │   ├── profile.ts            # Zod: TrainingProfile
│       │   ├── program.ts            # Zod: Program, Workout, ProgramExercise
│       │   └── catalog.ts            # Zod: CatalogExercise + tipos de grupos/equipamiento
│       └── catalog/
│           ├── exercises.ts          # catálogo curado (Garmin-compat)
│           └── exercises.test.ts     # invariantes del catálogo
└── backend/
    ├── package.json                  # @pulsia/backend
    ├── tsconfig.json
    ├── drizzle.config.ts
    ├── .env.example
    └── src/
        ├── index.ts                  # arranque del server Hono
        ├── app.ts                    # construcción de la app Hono (rutas) — testeable
        ├── db/
        │   ├── client.ts             # conexión postgres.js + drizzle
        │   ├── schema.ts             # tablas Drizzle
        │   └── seed.ts               # seed del catálogo en DB
        ├── crypto/
        │   ├── secrets.ts            # encrypt/decrypt AES-256-GCM
        │   └── secrets.test.ts
        ├── ai/
        │   ├── client.ts            # interfaz AiClient + impl Anthropic
        │   ├── prompt.ts            # armado del prompt desde el perfil
        │   ├── prompt.test.ts
        │   ├── generate.ts          # servicio: perfil -> programa validado
        │   └── generate.test.ts     # con AiClient fake
        └── routes/
            ├── settings.ts          # POST/GET /settings
            ├── settings.test.ts
            ├── programs.ts          # POST /programs/generate, GET /programs(/:id)
            └── programs.test.ts
```

---

## PR 1 — Scaffold del monorepo y schemas compartidos

### Task 1.1: Inicializar repo y workspace root

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`

- [ ] **Step 1: Verificar Bun instalado**

Run: `bun --version`
Expected: imprime una versión (ej. `1.x.x`). Si falla, instalar Bun antes de seguir.

- [ ] **Step 2: Crear `.gitignore`**

```gitignore
node_modules/
dist/
*.log
.env
.env.local
backend/.env
.DS_Store
```

- [ ] **Step 3: Crear `package.json` root (workspaces)**

```json
{
  "name": "pulsia",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "backend"],
  "scripts": {
    "test": "bun test",
    "typecheck": "bun run --filter '*' typecheck"
  }
}
```

- [ ] **Step 4: Crear `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["bun-types"]
  }
}
```

- [ ] **Step 5: Inicializar git y primer commit**

```bash
git init
git add .
git commit -S -m "chore: init monorepo workspace"
```

### Task 1.2: Crear paquete `shared` con schema de perfil (TDD)

**Files:**
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/schemas/profile.ts`, `shared/src/index.ts`
- Test: `shared/src/schemas/profile.test.ts`

- [ ] **Step 1: Crear `shared/package.json`**

```json
{
  "name": "@pulsia/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Crear `shared/tsconfig.json`**

```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Instalar dependencias**

Run: `bun install`
Expected: instala `zod` sin errores.

- [ ] **Step 4: Escribir el test que falla** (`shared/src/schemas/profile.test.ts`)

```ts
import { test, expect } from "bun:test";
import { TrainingProfileSchema } from "./profile";

test("acepta un perfil válido", () => {
  const profile = {
    experience: "intermediate",
    goal: "hypertrophy",
    daysPerWeek: 4,
    sessionMinutes: 60,
    gymEquipment: ["barbell", "dumbbell", "cable_machine"],
    homeEquipment: ["bodyweight", "dumbbell", "resistance_band"],
    limitations: ["dolor lumbar leve"],
  };
  const parsed = TrainingProfileSchema.parse(profile);
  expect(parsed.daysPerWeek).toBe(4);
});

test("rechaza daysPerWeek fuera de rango", () => {
  expect(() =>
    TrainingProfileSchema.parse({
      experience: "beginner",
      goal: "strength",
      daysPerWeek: 8,
      sessionMinutes: 45,
      gymEquipment: [],
      homeEquipment: ["bodyweight"],
      limitations: [],
    }),
  ).toThrow();
});
```

- [ ] **Step 5: Correr el test y verificar que falla**

Run: `bun test shared/src/schemas/profile.test.ts`
Expected: FAIL — `Cannot find module "./profile"`.

- [ ] **Step 6: Implementar `shared/src/schemas/profile.ts`**

```ts
import { z } from "zod";

export const ExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const GoalSchema = z.enum(["hypertrophy", "strength", "endurance", "fat_loss", "general_fitness"]);

export const EquipmentSchema = z.enum([
  "bodyweight",
  "dumbbell",
  "barbell",
  "kettlebell",
  "resistance_band",
  "pull_up_bar",
  "bench",
  "cable_machine",
  "machine",
  "trx",
]);

export const TrainingProfileSchema = z.object({
  experience: ExperienceSchema,
  goal: GoalSchema,
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180),
  gymEquipment: z.array(EquipmentSchema),
  homeEquipment: z.array(EquipmentSchema),
  limitations: z.array(z.string()).default([]),
});

export type TrainingProfile = z.infer<typeof TrainingProfileSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
```

- [ ] **Step 7: Crear `shared/src/index.ts`**

```ts
export * from "./schemas/profile";
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Run: `bun test shared/src/schemas/profile.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add shared package.json bun.lock
git commit -S -m "feat(shared): add training profile schema"
```

### Task 1.3: Schemas de catálogo y de programa (TDD)

**Files:**
- Create: `shared/src/schemas/catalog.ts`, `shared/src/schemas/program.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/schemas/program.test.ts`

- [ ] **Step 1: Implementar `shared/src/schemas/catalog.ts`**

```ts
import { z } from "zod";
import { EquipmentSchema } from "./profile";

export const MuscleGroupSchema = z.enum([
  "chest", "back", "shoulders", "biceps", "triceps", "forearms",
  "quads", "hamstrings", "glutes", "calves", "abs", "full_body",
]);

// `garminCategory` y `garminName` reflejan la taxonomía de fuerza del FIT SDK.
export const CatalogExerciseSchema = z.object({
  id: z.string(),                       // slug estable, ej. "barbell_bench_press"
  garminCategory: z.string(),           // ej. "BENCH_PRESS"
  garminName: z.string(),               // ej. "Barbell Bench Press"
  displayName: z.string(),              // nombre legible para la UI
  primaryMuscles: z.array(MuscleGroupSchema).min(1),
  secondaryMuscles: z.array(MuscleGroupSchema).default([]),
  equipment: z.array(EquipmentSchema).min(1),
});

export type CatalogExercise = z.infer<typeof CatalogExerciseSchema>;
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;
```

- [ ] **Step 2: Escribir el test que falla** (`shared/src/schemas/program.test.ts`)

```ts
import { test, expect } from "bun:test";
import { ProgramSchema } from "./program";

test("acepta un programa válido de 1 semana", () => {
  const program = {
    name: "Hipertrofia 4 días",
    weeks: [
      {
        weekNumber: 1,
        workouts: [
          {
            dayLabel: "Día 1 - Empuje",
            location: "gym",
            focus: "chest",
            exercises: [
              {
                catalogId: "barbell_bench_press",
                garminName: "Barbell Bench Press",
                sets: 4,
                reps: "8-10",
                targetLoad: "RPE 8",
                restSeconds: 120,
                notes: "",
              },
            ],
          },
        ],
      },
    ],
  };
  const parsed = ProgramSchema.parse(program);
  expect(parsed.weeks[0].workouts[0].location).toBe("gym");
});

test("rechaza location inválida", () => {
  expect(() =>
    ProgramSchema.parse({
      name: "x",
      weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "d", location: "park", focus: "back", exercises: [] }] }],
    }),
  ).toThrow();
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `bun test shared/src/schemas/program.test.ts`
Expected: FAIL — `Cannot find module "./program"`.

- [ ] **Step 4: Implementar `shared/src/schemas/program.ts`**

```ts
import { z } from "zod";
import { MuscleGroupSchema } from "./catalog";

export const ProgramExerciseSchema = z.object({
  catalogId: z.string(),
  garminName: z.string(),
  sets: z.number().int().min(1).max(10),
  reps: z.string(),                 // "8-10", "5", "AMRAP"
  targetLoad: z.string(),           // "RPE 8", "70% 1RM", "peso corporal"
  restSeconds: z.number().int().min(0).max(600),
  notes: z.string().default(""),
});

export const WorkoutSchema = z.object({
  dayLabel: z.string(),
  location: z.enum(["gym", "home"]),
  focus: MuscleGroupSchema,
  exercises: z.array(ProgramExerciseSchema),
});

export const WeekSchema = z.object({
  weekNumber: z.number().int().min(1),
  workouts: z.array(WorkoutSchema),
});

export const ProgramSchema = z.object({
  name: z.string(),
  weeks: z.array(WeekSchema).min(1),
});

export type Program = z.infer<typeof ProgramSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;
export type ProgramExercise = z.infer<typeof ProgramExerciseSchema>;
```

- [ ] **Step 5: Actualizar `shared/src/index.ts`**

```ts
export * from "./schemas/profile";
export * from "./schemas/catalog";
export * from "./schemas/program";
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `bun test shared/src/schemas/program.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add shared
git commit -S -m "feat(shared): add catalog and program schemas"
```

### Task 1.4: Crear repo en GitHub y abrir PR 1

- [ ] **Step 1: Confirmar con el usuario** (acción externa mutante)

Preguntar explícitamente: "voy a hacer `gh repo create pulsia --private --source . --remote origin` para crear el repo en GitHub y poder usar CodeRabbit, ¿confirmás?" No continuar sin un sí.

- [ ] **Step 2: Crear el repo y push de la rama** (solo tras confirmación)

```bash
git checkout -b feat/fase1a-scaffold
gh repo create pulsia --private --source . --remote origin --push
git push -u origin feat/fase1a-scaffold
```

- [ ] **Step 3: Abrir el PR**

```bash
gh pr create --title "Fase 1A — scaffold y schemas compartidos" \
  --body "Monorepo Bun, schemas Zod de perfil/catálogo/programa con tests."
```
Expected: CodeRabbit comienza a revisar el PR. Atender sus comentarios antes de mergear.

---

## PR 2 — Catálogo de ejercicios Garmin

### Task 2.1: Catálogo curado de ejercicios (TDD de invariantes)

**Files:**
- Create: `shared/src/catalog/exercises.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/catalog/exercises.test.ts`

> El catálogo es la fuente de verdad de los nombres compatibles con Garmin. Se parte de un set curado de ejercicios de fuerza comunes con su categoría/nombre del FIT SDK y se puede ampliar luego extrayéndolo completo del FIT SDK. Cada entrada se valida contra `CatalogExerciseSchema`.

- [ ] **Step 1: Escribir el test que falla** (`shared/src/catalog/exercises.test.ts`)

```ts
import { test, expect } from "bun:test";
import { CatalogExerciseSchema } from "../schemas/catalog";
import { EXERCISE_CATALOG, getExerciseById, catalogForEquipment } from "./exercises";

test("todas las entradas son válidas según el schema", () => {
  for (const ex of EXERCISE_CATALOG) {
    expect(() => CatalogExerciseSchema.parse(ex)).not.toThrow();
  }
});

test("los ids son únicos", () => {
  const ids = EXERCISE_CATALOG.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("cubre todos los grupos musculares principales", () => {
  const covered = new Set(EXERCISE_CATALOG.flatMap((e) => e.primaryMuscles));
  for (const m of ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "abs"]) {
    expect(covered.has(m as any)).toBe(true);
  }
});

test("getExerciseById devuelve la entrada correcta", () => {
  expect(getExerciseById("barbell_bench_press")?.garminName).toBe("Barbell Bench Press");
});

test("catalogForEquipment filtra por equipamiento disponible", () => {
  const home = catalogForEquipment(["bodyweight"]);
  expect(home.every((e) => e.equipment.includes("bodyweight"))).toBe(true);
  expect(home.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test shared/src/catalog/exercises.test.ts`
Expected: FAIL — `Cannot find module "./exercises"`.

- [ ] **Step 3: Implementar `shared/src/catalog/exercises.ts`**

```ts
import type { CatalogExercise, Equipment } from "../index";

export const EXERCISE_CATALOG: CatalogExercise[] = [
  // ----- Pecho -----
  { id: "barbell_bench_press", garminCategory: "BENCH_PRESS", garminName: "Barbell Bench Press",
    displayName: "Press banca con barra", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"],
    equipment: ["barbell", "bench"] },
  { id: "dumbbell_bench_press", garminCategory: "BENCH_PRESS", garminName: "Dumbbell Bench Press",
    displayName: "Press banca con mancuernas", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"],
    equipment: ["dumbbell", "bench"] },
  { id: "push_up", garminCategory: "PUSH_UP", garminName: "Push-Up",
    displayName: "Flexiones", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"],
    equipment: ["bodyweight"] },
  // ----- Espalda -----
  { id: "pull_up", garminCategory: "PULL_UP", garminName: "Pull-Up",
    displayName: "Dominadas", primaryMuscles: ["back"], secondaryMuscles: ["biceps"],
    equipment: ["pull_up_bar"] },
  { id: "barbell_row", garminCategory: "ROW", garminName: "Barbell Row",
    displayName: "Remo con barra", primaryMuscles: ["back"], secondaryMuscles: ["biceps"],
    equipment: ["barbell"] },
  { id: "dumbbell_row", garminCategory: "ROW", garminName: "Dumbbell Row",
    displayName: "Remo con mancuerna", primaryMuscles: ["back"], secondaryMuscles: ["biceps"],
    equipment: ["dumbbell"] },
  { id: "band_pull_apart", garminCategory: "ROW", garminName: "Band Pull-Apart",
    displayName: "Aperturas con banda", primaryMuscles: ["back"], secondaryMuscles: ["shoulders"],
    equipment: ["resistance_band"] },
  // ----- Hombros -----
  { id: "overhead_press", garminCategory: "SHOULDER_PRESS", garminName: "Overhead Press",
    displayName: "Press militar", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"],
    equipment: ["barbell"] },
  { id: "dumbbell_shoulder_press", garminCategory: "SHOULDER_PRESS", garminName: "Dumbbell Shoulder Press",
    displayName: "Press de hombro con mancuernas", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"],
    equipment: ["dumbbell"] },
  { id: "lateral_raise", garminCategory: "LATERAL_RAISE", garminName: "Lateral Raise",
    displayName: "Elevaciones laterales", primaryMuscles: ["shoulders"], secondaryMuscles: [],
    equipment: ["dumbbell"] },
  // ----- Bíceps / Tríceps -----
  { id: "dumbbell_curl", garminCategory: "CURL", garminName: "Dumbbell Curl",
    displayName: "Curl con mancuernas", primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    equipment: ["dumbbell"] },
  { id: "band_curl", garminCategory: "CURL", garminName: "Band Curl",
    displayName: "Curl con banda", primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    equipment: ["resistance_band"] },
  { id: "triceps_dip", garminCategory: "TRICEPS_EXTENSION", garminName: "Triceps Dip",
    displayName: "Fondos de tríceps", primaryMuscles: ["triceps"], secondaryMuscles: ["chest"],
    equipment: ["bodyweight"] },
  // ----- Cuádriceps / Glúteos / Femoral -----
  { id: "barbell_back_squat", garminCategory: "SQUAT", garminName: "Barbell Back Squat",
    displayName: "Sentadilla con barra", primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"],
    equipment: ["barbell"] },
  { id: "goblet_squat", garminCategory: "SQUAT", garminName: "Goblet Squat",
    displayName: "Sentadilla goblet", primaryMuscles: ["quads"], secondaryMuscles: ["glutes"],
    equipment: ["dumbbell"] },
  { id: "bodyweight_squat", garminCategory: "SQUAT", garminName: "Air Squat",
    displayName: "Sentadilla libre", primaryMuscles: ["quads"], secondaryMuscles: ["glutes"],
    equipment: ["bodyweight"] },
  { id: "romanian_deadlift", garminCategory: "DEADLIFT", garminName: "Romanian Deadlift",
    displayName: "Peso muerto rumano", primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "back"],
    equipment: ["barbell"] },
  { id: "dumbbell_rdl", garminCategory: "DEADLIFT", garminName: "Dumbbell Romanian Deadlift",
    displayName: "Peso muerto rumano con mancuernas", primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes"],
    equipment: ["dumbbell"] },
  { id: "glute_bridge", garminCategory: "HIP_RAISE", garminName: "Glute Bridge",
    displayName: "Puente de glúteos", primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"],
    equipment: ["bodyweight"] },
  { id: "walking_lunge", garminCategory: "LUNGE", garminName: "Walking Lunge",
    displayName: "Zancadas", primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"],
    equipment: ["bodyweight"] },
  // ----- Pantorrillas -----
  { id: "standing_calf_raise", garminCategory: "CALF_RAISE", garminName: "Standing Calf Raise",
    displayName: "Elevación de talones", primaryMuscles: ["calves"], secondaryMuscles: [],
    equipment: ["bodyweight"] },
  // ----- Core -----
  { id: "plank", garminCategory: "PLANK", garminName: "Plank",
    displayName: "Plancha", primaryMuscles: ["abs"], secondaryMuscles: ["full_body"],
    equipment: ["bodyweight"] },
  { id: "hanging_leg_raise", garminCategory: "LEG_RAISE", garminName: "Hanging Leg Raise",
    displayName: "Elevación de piernas colgado", primaryMuscles: ["abs"], secondaryMuscles: [],
    equipment: ["pull_up_bar"] },
  { id: "crunch", garminCategory: "CRUNCH", garminName: "Crunch",
    displayName: "Abdominales", primaryMuscles: ["abs"], secondaryMuscles: [],
    equipment: ["bodyweight"] },
];

export function getExerciseById(id: string): CatalogExercise | undefined {
  return EXERCISE_CATALOG.find((e) => e.id === id);
}

export function catalogForEquipment(available: Equipment[]): CatalogExercise[] {
  const set = new Set(available);
  return EXERCISE_CATALOG.filter((e) => e.equipment.every((eq) => set.has(eq)));
}
```

- [ ] **Step 4: Exportar desde `shared/src/index.ts`**

```ts
export * from "./schemas/profile";
export * from "./schemas/catalog";
export * from "./schemas/program";
export * from "./catalog/exercises";
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `bun test shared/src/catalog/exercises.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit + PR**

```bash
git checkout -b feat/fase1a-catalog
git add shared
git commit -S -m "feat(shared): add curated Garmin-compatible exercise catalog"
git push -u origin feat/fase1a-catalog
gh pr create --title "Fase 1A — catálogo de ejercicios Garmin" --body "Catálogo curado con grupos musculares y equipamiento, validado por tests de invariantes."
```

---

## PR 3 — Base de datos (Docker + Drizzle)

### Task 3.1: Docker compose con Postgres + pgvector

**Files:**
- Create: `docker-compose.yml`, `backend/.env.example`

- [ ] **Step 1: Crear `docker-compose.yml`**

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: pulsia
      POSTGRES_PASSWORD: pulsia
      POSTGRES_DB: pulsia
    ports:
      - "5432:5432"
    volumes:
      - pulsia_pgdata:/var/lib/postgresql/data
volumes:
  pulsia_pgdata:
```

> Nota: `pgvector/pgvector:pg16` publica imágenes multi-arch (incluye arm64), por lo que corre en la Raspberry Pi.

- [ ] **Step 2: Crear `backend/.env.example`**

```dotenv
DATABASE_URL=postgres://pulsia:pulsia@localhost:5432/pulsia
# Clave de 32 bytes en hex (64 chars) para AES-256-GCM. Generar con:
# openssl rand -hex 32
ENCRYPTION_KEY=replace_me_64_hex_chars
PORT=8787
```

- [ ] **Step 3: Levantar la DB y verificar**

Run: `docker compose up -d && docker compose ps`
Expected: el servicio `db` aparece `running`/`healthy`.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/fase1a-db
git add docker-compose.yml backend/.env.example
git commit -S -m "chore(backend): add postgres+pgvector docker compose"
```

### Task 3.2: Paquete backend + esquema Drizzle

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/drizzle.config.ts`, `backend/src/db/schema.ts`, `backend/src/db/client.ts`

- [ ] **Step 1: Crear `backend/package.json`**

```json
{
  "name": "@pulsia/backend",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "bun run src/db/seed.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.1",
    "@pulsia/shared": "workspace:*",
    "drizzle-orm": "^0.36.4",
    "hono": "^4.6.14",
    "postgres": "^3.4.5",
    "zod": "^3.23.8",
    "zod-to-json-schema": "^3.23.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.1"
  }
}
```

- [ ] **Step 2: Crear `backend/tsconfig.json`**

```json
{ "extends": "../tsconfig.base.json", "include": ["src", "drizzle.config.ts"] }
```

- [ ] **Step 3: Instalar dependencias**

Run: `bun install`
Expected: instala todo sin errores; `@pulsia/shared` se resuelve como workspace.

- [ ] **Step 4: Crear `backend/src/db/schema.ts`**

```ts
import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { TrainingProfile, Program } from "@pulsia/shared";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  aiApiKeyEncrypted: text("ai_api_key_encrypted"),   // ciphertext (nunca plano)
  aiModel: text("ai_model").default("claude-sonnet-4-6").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  data: jsonb("data").$type<TrainingProfile>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const programs = pgTable("programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  data: jsonb("data").$type<Program>().notNull(),
  profileSnapshot: jsonb("profile_snapshot").$type<TrainingProfile>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const exerciseCatalog = pgTable("exercise_catalog", {
  id: text("id").primaryKey(),
  garminCategory: text("garmin_category").notNull(),
  garminName: text("garmin_name").notNull(),
  displayName: text("display_name").notNull(),
  primaryMuscles: jsonb("primary_muscles").$type<string[]>().notNull(),
  secondaryMuscles: jsonb("secondary_muscles").$type<string[]>().notNull(),
  equipment: jsonb("equipment").$type<string[]>().notNull(),
});
```

- [ ] **Step 5: Crear `backend/src/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string) {
  const sql = postgres(url, { max: 5 });
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>["db"];
```

- [ ] **Step 6: Crear `backend/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 7: Generar y aplicar la migración**

```bash
cp backend/.env.example backend/.env   # editar ENCRYPTION_KEY con: openssl rand -hex 32
cd backend && bun run db:generate && bun run db:migrate && cd ..
```
Expected: crea archivos en `backend/drizzle/` y aplica las tablas sin error.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -S -m "feat(backend): add drizzle schema, db client and initial migration"
```

### Task 3.3: Seed del catálogo (TDD)

**Files:**
- Create: `backend/src/db/seed.ts`
- Test: `backend/src/db/seed.test.ts`

- [ ] **Step 1: Escribir el test que falla** (`backend/src/db/seed.test.ts`)

```ts
import { test, expect } from "bun:test";
import { EXERCISE_CATALOG } from "@pulsia/shared";
import { buildCatalogRows } from "./seed";

test("convierte el catálogo a filas insertables", () => {
  const rows = buildCatalogRows();
  expect(rows.length).toBe(EXERCISE_CATALOG.length);
  const bench = rows.find((r) => r.id === "barbell_bench_press");
  expect(bench?.garminName).toBe("Barbell Bench Press");
  expect(Array.isArray(bench?.primaryMuscles)).toBe(true);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test backend/src/db/seed.test.ts`
Expected: FAIL — `buildCatalogRows` no existe.

- [ ] **Step 3: Implementar `backend/src/db/seed.ts`**

```ts
import { EXERCISE_CATALOG } from "@pulsia/shared";
import { createDb } from "./client";
import { exerciseCatalog } from "./schema";

export function buildCatalogRows() {
  return EXERCISE_CATALOG.map((e) => ({
    id: e.id,
    garminCategory: e.garminCategory,
    garminName: e.garminName,
    displayName: e.displayName,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
  }));
}

if (import.meta.main) {
  const { db, sql } = createDb(process.env.DATABASE_URL!);
  const rows = buildCatalogRows();
  await db.insert(exerciseCatalog).values(rows).onConflictDoNothing();
  console.log(`Seeded ${rows.length} exercises`);
  await sql.end();
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `bun test backend/src/db/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Ejecutar el seed contra la DB**

Run: `cd backend && bun run db:seed && cd ..`
Expected: imprime `Seeded N exercises`.

- [ ] **Step 6: Commit + PR**

```bash
git add backend
git commit -S -m "feat(backend): seed exercise catalog into db"
git push -u origin feat/fase1a-db
gh pr create --title "Fase 1A — base de datos (Postgres+pgvector, Drizzle, seed)" --body "Docker compose, esquema Drizzle, migración inicial y seed del catálogo."
```

---

## PR 4 — Settings y BYO API key encriptada

### Task 4.1: Encriptado de secretos (TDD)

**Files:**
- Create: `backend/src/crypto/secrets.ts`
- Test: `backend/src/crypto/secrets.test.ts`

- [ ] **Step 1: Escribir el test que falla** (`backend/src/crypto/secrets.test.ts`)

```ts
import { test, expect } from "bun:test";
import { encryptSecret, decryptSecret } from "./secrets";

const KEY = "a".repeat(64); // 32 bytes en hex

test("round-trip encrypt/decrypt devuelve el original", () => {
  const plain = "sk-ant-xxxxxxxxxxxxxxxx";
  const cipher = encryptSecret(plain, KEY);
  expect(cipher).not.toContain(plain);
  expect(decryptSecret(cipher, KEY)).toBe(plain);
});

test("ciphertext distinto en cada llamada (IV aleatorio)", () => {
  expect(encryptSecret("hola", KEY)).not.toBe(encryptSecret("hola", KEY));
});

test("decrypt con clave incorrecta lanza error", () => {
  const cipher = encryptSecret("hola", KEY);
  expect(() => decryptSecret(cipher, "b".repeat(64))).toThrow();
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test backend/src/crypto/secrets.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `backend/src/crypto/secrets.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Formato: ivHex:authTagHex:cipherHex
export function encryptSecret(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decryptSecret(payload: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("ciphertext inválido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `bun test backend/src/crypto/secrets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/fase1a-settings
git add backend/src/crypto
git commit -S -m "feat(backend): add AES-256-GCM secret encryption"
```

### Task 4.2: App Hono base + healthcheck (TDD)

**Files:**
- Create: `backend/src/app.ts`, `backend/src/index.ts`
- Test: `backend/src/app.test.ts`

> `createApp(deps)` recibe sus dependencias (db, config, aiClient) por inyección para poder testear con fakes. `index.ts` solo arma deps reales y arranca el server.

- [ ] **Step 1: Escribir el test que falla** (`backend/src/app.test.ts`)

```ts
import { test, expect } from "bun:test";
import { createApp } from "./app";

const deps = {
  db: {} as any,
  config: { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6" },
  aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
};

test("GET /health responde ok", async () => {
  const app = createApp(deps as any);
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test backend/src/app.test.ts`
Expected: FAIL — `createApp` no existe.

- [ ] **Step 3: Implementar `backend/src/app.ts`**

```ts
import { Hono } from "hono";
import type { Db } from "./db/client";
import type { AiClient } from "./ai/client";

export interface AppConfig {
  encryptionKey: string;
  defaultModel: string;
}

export interface AppDeps {
  db: Db;
  config: AppConfig;
  aiClient: AiClient;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  return app;
}
```

- [ ] **Step 4: Crear `backend/src/index.ts`**

```ts
import { createApp } from "./app";
import { createDb } from "./db/client";
import { AnthropicAiClient } from "./ai/client";

const { db } = createDb(process.env.DATABASE_URL!);
const app = createApp({
  db,
  config: {
    encryptionKey: process.env.ENCRYPTION_KEY!,
    defaultModel: "claude-sonnet-4-6",
  },
  aiClient: new AnthropicAiClient(),
});

const port = Number(process.env.PORT ?? 8787);
console.log(`Pulsia backend en :${port}`);
export default { port, fetch: app.fetch };
```

> `index.ts` no se importa en tests; depende de `AnthropicAiClient` que se crea en PR 5. Si se ejecuta este paso antes del PR 5, dejar el import comentado hasta entonces. El test usa solo `app.ts`.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `bun test backend/src/app.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/app.ts
git commit -S -m "feat(backend): add Hono app factory with health route"
```

### Task 4.3: Endpoints de settings (TDD)

**Files:**
- Create: `backend/src/routes/settings.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/settings.test.ts`

> Para los tests de rutas con DB se usa un fake mínimo de `db` que implementa solo lo que la ruta llama. Se asegura que la API key se guarda encriptada y nunca se devuelve en claro (la respuesta solo indica si está configurada).

- [ ] **Step 1: Escribir el test que falla** (`backend/src/routes/settings.test.ts`)

```ts
import { test, expect } from "bun:test";
import { createApp } from "../app";
import { decryptSecret } from "../crypto/secrets";

function fakeDb() {
  const store: Record<string, any> = {};
  return {
    _store: store,
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: any) => { store["settings"] = { ...v, ...set }; },
      }),
    }),
    query: {
      settings: { findFirst: async () => store["settings"] ?? null },
    },
  };
}

const KEY = "a".repeat(64);
const baseDeps = (db: any) => ({
  db,
  config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6" },
  aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
});

test("POST /settings guarda la API key encriptada", async () => {
  const db = fakeDb();
  const app = createApp(baseDeps(db) as any);
  const res = await app.request("/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ aiApiKey: "sk-ant-secret", aiModel: "claude-sonnet-4-6" }),
  });
  expect(res.status).toBe(200);
  const stored = db._store["settings"];
  expect(stored.aiApiKeyEncrypted).not.toContain("sk-ant-secret");
  expect(decryptSecret(stored.aiApiKeyEncrypted, KEY)).toBe("sk-ant-secret");
});

test("GET /settings no devuelve la key en claro", async () => {
  const db = fakeDb();
  const app = createApp(baseDeps(db) as any);
  await app.request("/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ aiApiKey: "sk-ant-secret", aiModel: "claude-sonnet-4-6" }),
  });
  const res = await app.request("/settings");
  const body = await res.json();
  expect(body.hasApiKey).toBe(true);
  expect(JSON.stringify(body)).not.toContain("sk-ant-secret");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test backend/src/routes/settings.test.ts`
Expected: FAIL — ruta `/settings` inexistente (404).

- [ ] **Step 3: Implementar `backend/src/routes/settings.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { settings } from "../db/schema";
import { encryptSecret } from "../crypto/secrets";
import type { AppDeps } from "../app";

const BodySchema = z.object({
  aiApiKey: z.string().min(1),
  aiModel: z.string().default("claude-sonnet-4-6"),
});

// userId fijo en v1 (single-user); se reemplaza por auth real más adelante.
export const SINGLE_USER_ID = "00000000-0000-0000-0000-000000000001";

export function settingsRoutes(deps: AppDeps) {
  const r = new Hono();

  r.post("/", async (c) => {
    const parsed = BodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const encrypted = encryptSecret(parsed.data.aiApiKey, deps.config.encryptionKey);
    await deps.db
      .insert(settings)
      .values({ userId: SINGLE_USER_ID, aiApiKeyEncrypted: encrypted, aiModel: parsed.data.aiModel })
      .onConflictDoUpdate({
        target: settings.userId,
        set: { aiApiKeyEncrypted: encrypted, aiModel: parsed.data.aiModel },
      });
    return c.json({ ok: true });
  });

  r.get("/", async (c) => {
    const row = await deps.db.query.settings.findFirst();
    return c.json({ hasApiKey: !!row?.aiApiKeyEncrypted, aiModel: row?.aiModel ?? deps.config.defaultModel });
  });

  return r;
}
```

- [ ] **Step 4: Montar las rutas en `backend/src/app.ts`**

Modificar `createApp` para montar el router (agregar dentro de la función, antes del `return app`):

```ts
import { settingsRoutes } from "./routes/settings";
// ...
  app.route("/settings", settingsRoutes(deps));
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `bun test backend/src/routes/settings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit + PR**

```bash
git add backend/src
git commit -S -m "feat(backend): add settings endpoints with encrypted BYO api key"
git push -u origin feat/fase1a-settings
gh pr create --title "Fase 1A — settings y BYO API key encriptada" --body "Encriptado AES-256-GCM, endpoints POST/GET /settings, app factory Hono."
```

---

## PR 5 — Generación de programa con Claude

### Task 5.1: Interfaz AiClient + builder de prompt (TDD)

**Files:**
- Create: `backend/src/ai/client.ts`, `backend/src/ai/prompt.ts`
- Test: `backend/src/ai/prompt.test.ts`

- [ ] **Step 1: Escribir el test que falla** (`backend/src/ai/prompt.test.ts`)

```ts
import { test, expect } from "bun:test";
import { buildGenerationPrompt } from "./prompt";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate",
  goal: "hypertrophy",
  daysPerWeek: 4,
  sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell", "bench"],
  homeEquipment: ["bodyweight", "resistance_band"],
  limitations: ["dolor lumbar leve"],
};

test("el prompt incluye los parámetros del perfil", () => {
  const prompt = buildGenerationPrompt(profile);
  expect(prompt).toContain("hypertrophy");
  expect(prompt).toContain("4");
  expect(prompt).toContain("dolor lumbar leve");
});

test("el prompt solo ofrece ejercicios del catálogo permitidos por el equipamiento", () => {
  const prompt = buildGenerationPrompt(profile);
  // barbell_bench_press requiere barbell+bench (disponibles) -> presente
  expect(prompt).toContain("barbell_bench_press");
  // pull_up requiere pull_up_bar (no disponible en gym ni casa) -> ausente
  expect(prompt).not.toContain("pull_up");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test backend/src/ai/prompt.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `backend/src/ai/prompt.ts`**

```ts
import { catalogForEquipment, type TrainingProfile, type Equipment } from "@pulsia/shared";

export function buildGenerationPrompt(profile: TrainingProfile): string {
  const allEquipment = Array.from(
    new Set<Equipment>([...profile.gymEquipment, ...profile.homeEquipment]),
  );
  const allowed = catalogForEquipment(allEquipment);
  const catalogList = allowed
    .map((e) => `- ${e.id} | ${e.garminName} | músculos: ${e.primaryMuscles.join(",")} | equip: ${e.equipment.join(",")}`)
    .join("\n");

  return [
    "Sos un entrenador de fuerza experto. Diseñá un programa multi-semana.",
    "",
    "Perfil del atleta:",
    `- Experiencia: ${profile.experience}`,
    `- Objetivo: ${profile.goal}`,
    `- Días por semana: ${profile.daysPerWeek}`,
    `- Minutos por sesión: ${profile.sessionMinutes}`,
    `- Equipamiento gimnasio: ${profile.gymEquipment.join(", ") || "ninguno"}`,
    `- Equipamiento casa: ${profile.homeEquipment.join(", ") || "ninguno"}`,
    `- Limitaciones: ${profile.limitations.join("; ") || "ninguna"}`,
    "",
    "Reglas:",
    "1. Usá ÚNICAMENTE ejercicios de este catálogo (campo catalogId = id; garminName = nombre exacto):",
    catalogList,
    "2. Por cada día de gimnasio (location=gym) incluí también un día equivalente para casa (location=home) usando solo el equipamiento de casa.",
    "3. Aplicá progresión semana a semana (cargas/series/reps).",
    "4. Respetá las limitaciones del atleta.",
    "Devolvé el resultado llamando a la herramienta provista.",
  ].join("\n");
}
```

- [ ] **Step 4: Implementar `backend/src/ai/client.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ProgramSchema, type Program, type TrainingProfile } from "@pulsia/shared";
import { buildGenerationPrompt } from "./prompt";

export interface AiClient {
  generateProgram(input: {
    profile: TrainingProfile;
    apiKey: string;
    model: string;
  }): Promise<Program>;
}

export class AnthropicAiClient implements AiClient {
  async generateProgram({ profile, apiKey, model }: {
    profile: TrainingProfile; apiKey: string; model: string;
  }): Promise<Program> {
    const client = new Anthropic({ apiKey });
    const tool = {
      name: "return_program",
      description: "Devuelve el programa de entrenamiento generado.",
      input_schema: zodToJsonSchema(ProgramSchema, { target: "openApi3" }) as any,
    };

    const res = await client.messages.create({
      model,
      max_tokens: 8000,
      tools: [tool],
      tool_choice: { type: "tool", name: "return_program" },
      messages: [{ role: "user", content: buildGenerationPrompt(profile) }],
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("La IA no devolvió un programa estructurado");
    }
    return ProgramSchema.parse(block.input);
  }
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `bun test backend/src/ai/prompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/fase1a-generation
git add backend/src/ai
git commit -S -m "feat(backend): add AiClient interface, Anthropic impl and prompt builder"
```

### Task 5.2: Servicio de generación con validación y retry (TDD)

**Files:**
- Create: `backend/src/ai/generate.ts`
- Test: `backend/src/ai/generate.test.ts`

> El servicio orquesta: tomar perfil + key + modelo, llamar al `AiClient`, y si el programa devuelto referencia un `catalogId` inexistente, reintentar una vez con feedback; si vuelve a fallar, lanzar error. Se testea con un `AiClient` fake.

- [ ] **Step 1: Escribir el test que falla** (`backend/src/ai/generate.test.ts`)

```ts
import { test, expect } from "bun:test";
import { generateProgramForProfile } from "./generate";
import type { AiClient } from "./client";
import type { Program, TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

const validProgram: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", focus: "chest", exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

test("devuelve el programa cuando es válido y usa catalogIds reales", async () => {
  const ai: AiClient = { generateProgram: async () => validProgram };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(result.name).toBe("Plan");
});

test("reintenta una vez si hay un catalogId inexistente, y luego acepta el válido", async () => {
  let call = 0;
  const bad: Program = JSON.parse(JSON.stringify(validProgram));
  bad.weeks[0].workouts[0].exercises[0].catalogId = "no_existe";
  const ai: AiClient = { generateProgram: async () => (call++ === 0 ? bad : validProgram) };
  const result = await generateProgramForProfile({ profile, apiKey: "k", model: "m", ai });
  expect(call).toBe(2);
  expect(result.name).toBe("Plan");
});

test("lanza si tras el retry sigue habiendo catalogId inexistente", async () => {
  const bad: Program = JSON.parse(JSON.stringify(validProgram));
  bad.weeks[0].workouts[0].exercises[0].catalogId = "no_existe";
  const ai: AiClient = { generateProgram: async () => bad };
  await expect(generateProgramForProfile({ profile, apiKey: "k", model: "m", ai })).rejects.toThrow();
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test backend/src/ai/generate.test.ts`
Expected: FAIL — `generateProgramForProfile` no existe.

- [ ] **Step 3: Implementar `backend/src/ai/generate.ts`**

```ts
import { getExerciseById, type Program, type TrainingProfile } from "@pulsia/shared";
import type { AiClient } from "./client";

function unknownCatalogIds(program: Program): string[] {
  const bad: string[] = [];
  for (const w of program.weeks)
    for (const day of w.workouts)
      for (const ex of day.exercises)
        if (!getExerciseById(ex.catalogId)) bad.push(ex.catalogId);
  return bad;
}

export async function generateProgramForProfile(input: {
  profile: TrainingProfile;
  apiKey: string;
  model: string;
  ai: AiClient;
}): Promise<Program> {
  const { profile, apiKey, model, ai } = input;
  let lastBad: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const program = await ai.generateProgram({ profile, apiKey, model });
    lastBad = unknownCatalogIds(program);
    if (lastBad.length === 0) return program;
  }
  throw new Error(`La IA usó ejercicios fuera del catálogo: ${lastBad.join(", ")}`);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `bun test backend/src/ai/generate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/generate.ts
git commit -S -m "feat(backend): add generation service with catalog validation and retry"
```

### Task 5.3: Endpoint POST /programs/generate y GET /programs (TDD)

**Files:**
- Create: `backend/src/routes/programs.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/programs.test.ts`

> El endpoint: valida el body como `TrainingProfile`, busca la API key encriptada en settings, la desencripta, llama al servicio de generación con `deps.aiClient`, guarda el `Program` y lo devuelve. Si no hay API key configurada → 400 con mensaje claro.

- [ ] **Step 1: Escribir el test que falla** (`backend/src/routes/programs.test.ts`)

```ts
import { test, expect } from "bun:test";
import { createApp } from "../app";
import { encryptSecret } from "../crypto/secrets";
import type { Program } from "@pulsia/shared";

const KEY = "a".repeat(64);
const validProgram: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", focus: "chest", exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

function fakeDb(withKey: boolean) {
  const saved: any[] = [];
  return {
    _saved: saved,
    query: {
      settings: {
        findFirst: async () => withKey
          ? { aiApiKeyEncrypted: encryptSecret("sk-ant-real", KEY), aiModel: "claude-sonnet-4-6" }
          : null,
      },
    },
    insert: () => ({ values: (v: any) => ({ returning: async () => { saved.push(v); return [{ ...v, id: "prog-1" }]; } }) }),
  };
}

const validProfileBody = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

function deps(db: any) {
  return {
    db,
    config: { encryptionKey: KEY, defaultModel: "claude-sonnet-4-6" },
    aiClient: { generateProgram: async () => validProgram },
  };
}

test("POST /programs/generate genera y guarda el programa", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.program.name).toBe("Plan");
  expect(db._saved.length).toBe(1);
});

test("POST /programs/generate sin API key configurada devuelve 400", async () => {
  const db = fakeDb(false);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(validProfileBody),
  });
  expect(res.status).toBe(400);
});

test("POST /programs/generate con perfil inválido devuelve 400", async () => {
  const db = fakeDb(true);
  const app = createApp(deps(db) as any);
  const res = await app.request("/programs/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validProfileBody, daysPerWeek: 99 }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test backend/src/routes/programs.test.ts`
Expected: FAIL — ruta inexistente (404).

- [ ] **Step 3: Implementar `backend/src/routes/programs.ts`**

```ts
import { Hono } from "hono";
import { TrainingProfileSchema } from "@pulsia/shared";
import { programs } from "../db/schema";
import { decryptSecret } from "../crypto/secrets";
import { generateProgramForProfile } from "../ai/generate";
import { SINGLE_USER_ID } from "./settings";
import type { AppDeps } from "../app";

export function programsRoutes(deps: AppDeps) {
  const r = new Hono();

  r.post("/generate", async (c) => {
    const parsed = TrainingProfileSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const row = await deps.db.query.settings.findFirst();
    if (!row?.aiApiKeyEncrypted) {
      return c.json({ error: "No hay API key de IA configurada. Cargala en Configuración." }, 400);
    }
    const apiKey = decryptSecret(row.aiApiKeyEncrypted, deps.config.encryptionKey);
    const model = row.aiModel ?? deps.config.defaultModel;

    let program;
    try {
      program = await generateProgramForProfile({ profile: parsed.data, apiKey, model, ai: deps.aiClient });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }

    const inserted = await deps.db
      .insert(programs)
      .values({ userId: SINGLE_USER_ID, name: program.name, data: program, profileSnapshot: parsed.data })
      .returning();

    return c.json({ id: inserted[0].id, program });
  });

  return r;
}
```

- [ ] **Step 4: Montar las rutas en `backend/src/app.ts`**

Agregar dentro de `createApp`, antes del `return app`:

```ts
import { programsRoutes } from "./routes/programs";
// ...
  app.route("/programs", programsRoutes(deps));
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `bun test backend/src/routes/programs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Correr toda la suite y typecheck**

Run: `bun test && bun run --filter '*' typecheck`
Expected: todos los tests PASS, sin errores de tipos.

- [ ] **Step 7: Smoke test manual end-to-end** (opcional, requiere API key real)

```bash
# Con la DB levantada, seed corrido y backend en marcha (bun run --filter @pulsia/backend dev):
curl -s -X POST localhost:8787/settings -H 'content-type: application/json' \
  -d '{"aiApiKey":"sk-ant-REAL","aiModel":"claude-sonnet-4-6"}'
curl -s -X POST localhost:8787/programs/generate -H 'content-type: application/json' \
  -d '{"experience":"intermediate","goal":"hypertrophy","daysPerWeek":4,"sessionMinutes":60,"gymEquipment":["barbell","dumbbell","bench"],"homeEquipment":["bodyweight","resistance_band"],"limitations":[]}' | head -c 800
```
Expected: devuelve un JSON con `program.weeks` y ejercicios con `garminName` del catálogo.

- [ ] **Step 8: Commit + PR**

```bash
git add backend/src
git commit -S -m "feat(backend): add program generation endpoint"
git push -u origin feat/fase1a-generation
gh pr create --title "Fase 1A — endpoint de generación de programa" --body "POST /programs/generate: valida perfil, usa BYO key, genera con Claude (structured output) y persiste."
```

---

## Self-Review (cubierto por este plan)

- **Schemas (spec §8):** profile, catalog, program — Tasks 1.2, 1.3. ✅
- **Catálogo Garmin (spec §4):** Task 2.1 (curado, extensible desde FIT SDK luego). ✅
- **DB Postgres+pgvector en Docker (spec §3):** Tasks 3.1–3.3. ✅
- **BYO API key encriptada (spec §2.8, §11):** Tasks 4.1, 4.3. ✅
- **Generación con structured output + validación + retry (spec §3, §5, §11):** Tasks 5.1–5.3. ✅
- **Día de gym + equivalente en casa (spec §2):** regla en el prompt (Task 5.1). ✅

**Fuera de este plan (van en planes siguientes):** ajuste conversacional (spec §5, Fase 4), WorkoutLog editable (Fase 2), import .FIT (Fase 3), memoria a largo plazo + dashboard (Fase 5), y toda la app mobile (Plan B). La extensión del catálogo a partir del FIT SDK completo queda como mejora incremental sobre el catálogo curado.
