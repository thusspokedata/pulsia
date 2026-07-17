# Cardio — Fase 1 (shared + backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modelar las actividades de cardio (caminata/running/elíptica/…) en `shared/` y el backend, con CRUD completo y cálculo de gasto calórico correcto por tipo de actividad.

**Architecture:** Entidad nueva `cardio_activity` (tabla propia, migración 0017), independiente de `workout_session` — extenderla exigiría hacer nullable el FK real a `programs` y romper invariantes sanas de fuerza. Las kcal del reloj (cuando existan) ganan sobre cualquier estimación nuestra; el fallback parametriza el MET por tipo (hoy `MET_STRENGTH = 5` está hardcodeado y sobrestima ~40% una caminata).

**Tech Stack:** Bun · Zod 4 · Drizzle ORM + Postgres · Hono. Tests con `bun test`.

**Spec:** `docs/superpowers/specs/2026-07-17-cardio-actividades-import-fit-design.md`

**Alcance de esta fase:** NO incluye el parser `.FIT` (fase 3), ni móvil (fase 2), ni migrar los call-sites del balance (fase 4). Al terminar, el backend acepta y devuelve actividades de cardio, y `shared/` sabe calcular su gasto — pero nada las consume todavía.

---

## Convenciones que NO se negocian

- **TDD**: el test se escribe primero y se lo ve fallar antes de implementar.
- **⚠️ Verificación por mutación**: después de que un test pase, **romper a propósito el código que prueba y confirmar que el test se queja**; después revertir. Cuesta ~30s por test. Es la lección de 2026-07-16/17: aparecieron 5 tests en verde que no probaban nada, 2 llevaban meses en `main`, y ningún review los encontró. Un test que pasa con el código roto es peor que no tener test.
- **Commits firmados**: `git commit -S`. **Nunca** `Co-Authored-By` ni atribución a Claude/Anthropic.
- Tiempos en **epoch ms** (números), nunca `Date`.
- Todo route scopeado por `c.get("userId")`, **nunca** `SINGLE_USER_ID`.

## File Structure

| archivo | responsabilidad |
|---|---|
| `shared/src/schemas/cardio.ts` (crear) | `CARDIO_TYPES`, `CARDIO_LABELS`, `CardioActivitySchema` |
| `shared/src/schemas/cardio.test.ts` (crear) | tests del schema |
| `shared/src/nutrition/exerciseBurn.ts` (modificar) | `MET_BY_CARDIO`, `estimateCardioBurn`, `dayExerciseBurn` |
| `shared/src/nutrition/exerciseBurn.test.ts` (modificar) | tests nuevos + regresión de fuerza |
| `shared/src/index.ts` (modificar) | export del schema nuevo |
| `backend/src/db/schema.ts` (modificar) | tabla `cardioActivity` |
| `backend/drizzle/0017_*.sql` (generado) | migración |
| `backend/src/cardio/repository.ts` (crear) | acceso a datos |
| `backend/src/cardio/repository.test.ts` (crear) | tests del dedupe (puro) |
| `backend/src/routes/cardio.ts` (crear) | rutas HTTP |
| `backend/src/app.ts` (modificar) | montaje + `auth` |

---

## Task 1: Schema de la actividad de cardio (`shared/`)

**Files:**
- Create: `shared/src/schemas/cardio.ts`
- Create: `shared/src/schemas/cardio.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Crear `shared/src/schemas/cardio.test.ts`:

```ts
import { test, expect } from "bun:test";
import { CardioActivitySchema, CARDIO_TYPES, CARDIO_LABELS } from "./cardio";

const valid = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  type: "walk" as const,
  startedAt: 1784000000000,
  durationMs: 1800_000,
  distanceM: 2500,
  avgHr: 105,
  maxHr: 128,
  elevationGainM: 30,
  kcal: 140,
  kcalSource: "device" as const,
  source: "fit" as const,
  notes: "",
};

test("acepta una actividad válida completa", () => {
  expect(CardioActivitySchema.safeParse(valid).success).toBe(true);
});

test("los opcionales son nullable y notes tiene default", () => {
  const r = CardioActivitySchema.safeParse({
    id: valid.id, type: "elliptical", startedAt: valid.startedAt, durationMs: 600_000,
    distanceM: null, avgHr: null, maxHr: null, elevationGainM: null, kcal: null,
    kcalSource: "estimate", source: "manual",
  });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.notes).toBe("");
});

test("rechaza un tipo de actividad desconocido", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, type: "yoga" }).success).toBe(false);
});

test("rechaza duración <= 0", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, durationMs: 0 }).success).toBe(false);
  expect(CardioActivitySchema.safeParse({ ...valid, durationMs: -1 }).success).toBe(false);
});

test("rechaza distancia y kcal negativas", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, distanceM: -1 }).success).toBe(false);
  expect(CardioActivitySchema.safeParse({ ...valid, kcal: -1 }).success).toBe(false);
});

test("rechaza un id que no es uuid", () => {
  expect(CardioActivitySchema.safeParse({ ...valid, id: "abc" }).success).toBe(false);
});

test("hrSeries es opcional y usa el mismo shape que workout_session", () => {
  const r = CardioActivitySchema.safeParse({ ...valid, hrSeries: [{ t: 0, bpm: 90 }, { t: 5000, bpm: 95 }] });
  expect(r.success).toBe(true);
});

test("CARDIO_LABELS cubre todos los tipos (exhaustividad)", () => {
  for (const t of CARDIO_TYPES) {
    expect(typeof CARDIO_LABELS[t]).toBe("string");
    expect(CARDIO_LABELS[t].length).toBeGreaterThan(0);
  }
  expect(Object.keys(CARDIO_LABELS).length).toBe(CARDIO_TYPES.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test shared/src/schemas/cardio.test.ts`
Expected: FAIL — `Cannot find module './cardio'`

- [ ] **Step 3: Write minimal implementation**

Crear `shared/src/schemas/cardio.ts`:

```ts
import { z } from "zod";

export const CARDIO_TYPES = ["walk", "run", "elliptical", "bike", "swim", "rowing", "other"] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

// `satisfies` (no `Record<...> =`): agregar un tipo a CARDIO_TYPES rompe la compilación acá
// en vez de renderizar `undefined` en la UI. Mismo patrón que MEAL_LABELS.
export const CARDIO_LABELS = {
  walk: "Caminata",
  run: "Running",
  elliptical: "Elíptica",
  bike: "Bici",
  swim: "Natación",
  rowing: "Remo",
  other: "Otro",
} satisfies Record<CardioType, string>;

export const CardioTypeSchema = z.enum(CARDIO_TYPES);
export const KcalSourceSchema = z.enum(["device", "estimate"]);
export const CardioSourceSchema = z.enum(["manual", "fit"]);

// Mismo shape que HrSeriesPointSchema de session.ts: `t` es ms RELATIVO a startedAt.
export const CardioHrPointSchema = z.object({
  t: z.number().int().min(0),
  bpm: z.number().int().min(0),
});

export const CardioActivitySchema = z.object({
  id: z.string().uuid(),
  type: CardioTypeSchema,
  startedAt: z.number().int(),
  durationMs: z.number().int().positive(),
  distanceM: z.number().int().min(0).nullable(),
  avgHr: z.number().int().min(0).nullable(),
  maxHr: z.number().int().min(0).nullable(),
  elevationGainM: z.number().int().nullable(),
  kcal: z.number().int().min(0).nullable(),
  kcalSource: KcalSourceSchema,
  source: CardioSourceSchema,
  hrSeries: z.array(CardioHrPointSchema).optional(),
  notes: z.string().default(""),
});
export type CardioActivity = z.infer<typeof CardioActivitySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test shared/src/schemas/cardio.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Verificar los tests por mutación**

Uno por uno, romper y confirmar que el test correspondiente falla, **revirtiendo después de cada uno**:

1. `durationMs: z.number().int().positive()` → `.int()` a secas. Esperado: falla "rechaza duración <= 0". Revertir.
2. `distanceM: ... .min(0)` → sacar el `.min(0)`. Esperado: falla "rechaza distancia y kcal negativas". Revertir.
3. En `CARDIO_LABELS`, cambiar `walk: "Caminata"` → `walk: ""`. Esperado: falla "CARDIO_LABELS cubre todos los tipos". Revertir.

Si alguno **no** falla, el test no prueba lo que dice: arreglarlo antes de seguir.

- [ ] **Step 6: Exportar desde el índice**

En `shared/src/index.ts`, agregar después de la línea `export * from "./schemas/session";`:

```ts
export * from "./schemas/cardio";
```

- [ ] **Step 7: Typecheck + suite completa de shared**

Run: `bun test shared`
Expected: PASS, sin regresiones.

- [ ] **Step 8: Commit**

```bash
git add shared/src/schemas/cardio.ts shared/src/schemas/cardio.test.ts shared/src/index.ts
git commit -S -m "feat(cardio): schema de actividad de cardio

CARDIO_LABELS usa satisfies Record<CardioType,string>: agregar un tipo
rompe la compilación en vez de renderizar undefined."
```

---

## Task 2: MET por tipo + gasto de cardio (`shared/`)

**Files:**
- Modify: `shared/src/nutrition/exerciseBurn.ts`
- Modify: `shared/src/nutrition/exerciseBurn.test.ts`

**Contexto:** hoy `MET_STRENGTH = 5` (línea 3) es el único fallback sin FC. Para caminata (MET real ~3.5) sobrestima ~40%; para running (~9.8) subestima a la mitad. Se parametriza **sin cambiar el comportamiento de fuerza**.

`dayExerciseBurn` se **agrega** en esta fase; `sumDayExerciseBurn` sigue viva hasta la fase 4 (cuando migran los dos call-sites y se la borra). Conviven solo durante las fases 2-3.

- [ ] **Step 1: Write the failing test**

Agregar al final de `shared/src/nutrition/exerciseBurn.test.ts`:

```ts
import { estimateCardioBurn, dayExerciseBurn, MET_BY_CARDIO } from "./exerciseBurn";

test("REGRESIÓN: fuerza sigue usando MET 5 (no cambia por el refactor)", () => {
  // Mismo caso que "MET fallback sin FC (5 MET) y neto": 5*80*1h = 400; neto 400 - 71.58 = 328
  const r = estimateSessionBurn({ durationMs: HOUR, avgHr: null, weightKg: 80, age: 40, sex: "male", bmr: 1718 });
  expect(r.kcal).toBe(328);
});

test("MET_BY_CARDIO: caminata pesa menos que running", () => {
  expect(MET_BY_CARDIO.walk).toBeLessThan(MET_BY_CARDIO.run);
  expect(MET_BY_CARDIO.walk).toBe(3.5);
  expect(MET_BY_CARDIO.run).toBe(9.8);
});

test("cardio con kcal del reloj: se usa tal cual, sin estimar", () => {
  // 140 kcal aunque la fórmula daría cualquier otra cosa (y aunque no haya peso).
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: 105, kcal: 140 },
    { weightKg: 80, age: 40, sex: "male", bmr: 1718 },
  );
  expect(r).toEqual({ kcal: 140, method: "device" });
});

test("cardio sin kcal y sin FC: MET del tipo, neto de BMR", () => {
  // walk: 3.5*80*1h = 280 gross; neto 280 - (1718/1440)*60 = 280 - 71.58 = 208.42 → 208
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: null, kcal: null },
    { weightKg: 80, age: 40, sex: "male", bmr: 1718 },
  );
  expect(r).toEqual({ kcal: 208, method: "met" });
});

test("cardio sin kcal: running usa su propio MET (no el de fuerza)", () => {
  // run: 9.8*80*1h = 784 bruto
  const r = estimateCardioBurn(
    { type: "run", durationMs: HOUR, avgHr: null, kcal: null },
    { weightKg: 80, age: 40, sex: "male", bmr: null },
  );
  expect(r.kcal).toBe(784);
});

test("cardio sin kcal pero con FC: Keytel gana al MET", () => {
  // Mismo caso Keytel male del test de arriba: 749 con bmr 1718
  const r = estimateCardioBurn(
    { type: "walk", durationMs: HOUR, avgHr: 140, kcal: null },
    { weightKg: 80, age: 40, sex: "male", bmr: 1718 },
  );
  expect(r).toEqual({ kcal: 749, method: "hr" });
});

test("cardio sin peso y sin kcal del reloj → 0/none", () => {
  const r = estimateCardioBurn({ type: "walk", durationMs: HOUR, avgHr: null, kcal: null }, { age: 40 });
  expect(r).toEqual({ kcal: 0, method: "none" });
});

test("dayExerciseBurn suma sesiones de fuerza + actividades de cardio", () => {
  const athlete = { weightKg: 80, age: 40, sex: "male" as const, bmr: null };
  const total = dayExerciseBurn(
    [{ totalDurationMs: HOUR, avgHr: null }],                                   // fuerza: 5*80 = 400
    [{ type: "walk", durationMs: HOUR, avgHr: null, kcal: null },               // walk:  3.5*80 = 280
     { type: "run", durationMs: HOUR, avgHr: null, kcal: 500 }],                // device: 500
    athlete,
  );
  expect(total).toBe(400 + 280 + 500);
});

test("dayExerciseBurn con listas vacías da 0", () => {
  expect(dayExerciseBurn([], [], { weightKg: 80 })).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test shared/src/nutrition/exerciseBurn.test.ts`
Expected: FAIL — `estimateCardioBurn is not a function` / no export `MET_BY_CARDIO`

- [ ] **Step 3: Write minimal implementation**

En `shared/src/nutrition/exerciseBurn.ts`:

1. Agregar el import del tipo, arriba de todo:

```ts
import type { Sex } from "../schemas/profile";
import type { CardioType } from "../schemas/cardio";
```

2. Debajo de `const MET_STRENGTH = 5;`, agregar:

```ts
// MET por tipo de actividad (Compendium of Physical Activities). El fallback sin FC:
// una caminata a 3.5 MET gasta ~40% menos que los 5 MET genéricos de fuerza.
export const MET_BY_CARDIO = {
  walk: 3.5,
  run: 9.8,
  elliptical: 5.0,
  bike: 7.5,
  swim: 7.0,
  rowing: 7.0,
  other: 5.0,
} satisfies Record<CardioType, number>;
```

3. Refactorizar el núcleo de `estimateSessionBurn` para compartirlo, **sin cambiar su firma ni su resultado**. Reemplazar el cuerpo de `estimateSessionBurn` (líneas 23-38) por:

```ts
// Núcleo compartido: Keytel si hay FC+edad, si no MET (el MET lo elige el llamador).
function burnFrom(
  args: { durationMs: number | null; avgHr: number | null; met: number } & Omit<SessionBurnArgs, "durationMs" | "avgHr">,
): SessionBurn {
  const { durationMs, avgHr, met, weightKg, age, sex, bmr } = args;
  if (durationMs == null || durationMs <= 0 || weightKg == null) return { kcal: 0, method: "none" };
  const minutes = durationMs / 60000;
  let gross: number;
  let method: "hr" | "met";
  if (avgHr != null && age != null) {
    gross = keytelPerMin(avgHr, weightKg, age, sex) * minutes;
    method = "hr";
  } else {
    gross = met * weightKg * (minutes / 60);
    method = "met";
  }
  const kcal = bmr != null ? Math.max(0, gross - (bmr / 1440) * minutes) : gross;
  return { kcal: Math.round(kcal), method };
}

export function estimateSessionBurn(args: SessionBurnArgs): SessionBurn {
  return burnFrom({ ...args, met: MET_STRENGTH });
}
```

4. Agregar al final del archivo:

```ts
export interface CardioBurn { kcal: number; method: "device" | "hr" | "met" | "none" }
export interface CardioBurnInput {
  type: CardioType;
  durationMs: number;
  avgHr: number | null;
  kcal: number | null; // kcal del reloj (.FIT); si está, manda
}
export type AthleteBurnArgs = { weightKg?: number; age?: number; sex?: Sex; bmr?: number | null };

// El reloj le gana a la fórmula: mide con acelerómetro + FC + perfil.
export function estimateCardioBurn(a: CardioBurnInput, athlete: AthleteBurnArgs): CardioBurn {
  if (a.kcal != null) return { kcal: a.kcal, method: "device" };
  return burnFrom({ durationMs: a.durationMs, avgHr: a.avgHr, met: MET_BY_CARDIO[a.type], ...athlete });
}

// Gasto del día = fuerza + cardio. Reemplaza a sumDayExerciseBurn (que se borra en la fase 4,
// cuando migren los dos call-sites): dos funciones que suman gasto es cómo la pantalla y los
// informes terminan discrepando.
export function dayExerciseBurn(
  sessions: { totalDurationMs: number | null; avgHr: number | null }[],
  activities: CardioBurnInput[],
  athlete: AthleteBurnArgs,
): number {
  const strength = sessions.reduce(
    (a, s) => a + estimateSessionBurn({ durationMs: s.totalDurationMs, avgHr: s.avgHr, ...athlete }).kcal,
    0,
  );
  return activities.reduce((a, act) => a + estimateCardioBurn(act, athlete).kcal, strength);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test shared/src/nutrition/exerciseBurn.test.ts`
Expected: PASS — los 9 tests viejos + los 9 nuevos. **El test de regresión de fuerza (328) debe seguir verde**: si se rompió, el refactor cambió el comportamiento.

- [ ] **Step 5: Verificar los tests por mutación**

1. En `MET_BY_CARDIO`, `walk: 3.5` → `walk: 5`. Esperado: fallan "MET_BY_CARDIO: caminata pesa menos" y "cardio sin kcal y sin FC". Revertir.
2. En `estimateCardioBurn`, sacar el early-return `if (a.kcal != null)`. Esperado: falla "cardio con kcal del reloj: se usa tal cual". Revertir.
3. En `dayExerciseBurn`, cambiar el valor inicial del segundo `reduce` de `strength` a `0`. Esperado: falla "dayExerciseBurn suma sesiones de fuerza + actividades". Revertir.
4. En `estimateCardioBurn`, invertir la precedencia: usar el MET aunque haya FC. Esperado: falla "Keytel gana al MET". Revertir.

- [ ] **Step 6: Suite completa**

Run: `bun test shared`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/src/nutrition/exerciseBurn.ts shared/src/nutrition/exerciseBurn.test.ts
git commit -S -m "feat(cardio): MET por tipo de actividad + dayExerciseBurn

MET_STRENGTH=5 era el único fallback sin FC: sobrestimaba ~40% una
caminata (3.5) y subestimaba a la mitad un running (9.8). El núcleo se
comparte en burnFrom(); fuerza no cambia (test de regresión).

Las kcal del reloj ganan sobre la estimación (method: device)."
```

---

## Task 3: Tabla `cardio_activity` + migración 0017

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create (generado): `backend/drizzle/0017_*.sql`

- [ ] **Step 1: Agregar la tabla**

En `backend/src/db/schema.ts`, después de la tabla `setLog` (que termina cerca de la línea 302), agregar:

```ts
// Cardio (caminata/running/elíptica/…). Tabla propia, NO workout_session: esa exige
// program_id (FK real a programs), week_number y day_label — una caminata no cuelga de
// ningún programa de fuerza. Ver docs/superpowers/specs/2026-07-17-cardio-*.
export const cardioActivity = pgTable("cardio_activity", {
  id: uuid("id").primaryKey(), // generado en el cliente, como workout_session
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(), // CardioType (enum en Zod; text en PG, como location)
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  distanceM: integer("distance_m"),
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),
  elevationGainM: integer("elevation_gain_m"),
  kcal: integer("kcal"),
  kcalSource: text("kcal_source").notNull(), // 'device' | 'estimate' — lo fuerza el server
  source: text("source").notNull(),          // 'manual' | 'fit'
  hrSeries: jsonb("hr_series").$type<{ t: number; bpm: number }[]>(),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  // Toda lectura es "las actividades de este usuario en este rango".
  byUserStarted: index("cardio_activity_user_started_idx").on(t.userId, t.startedAt),
}));
```

Verificar que `index`, `bigint`, `integer`, `jsonb`, `timestamp`, `text`, `uuid` ya estén en el import de `drizzle-orm/pg-core` al tope del archivo; agregar los que falten.

- [ ] **Step 2: Generar la migración**

Run: `cd backend && bun run db:generate`
Expected: crea `backend/drizzle/0017_<nombre>.sql` y agrega la entrada `"idx": 17` a `drizzle/meta/_journal.json`.

- [ ] **Step 3: Verificar el SQL generado**

Run: `cat backend/drizzle/0017_*.sql`
Expected: un `CREATE TABLE "cardio_activity"` con las 16 columnas, el FK a `users` con `ON DELETE cascade`, y el `CREATE INDEX "cardio_activity_user_started_idx"`.

**Si el archivo toca cualquier otra tabla, PARAR**: significa que el schema local divergió de las migraciones. No commitear; reportar.

- [ ] **Step 4: Aplicar la migración local**

Run: `docker compose up -d && cd backend && bun run db:migrate`
Expected: aplica 0017 sin error.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -S -m "feat(cardio): tabla cardio_activity (migración 0017)

Tabla propia y no workout_session: esa exige program_id (FK real a
programs), week_number y day_label, que no aplican a una caminata.
Índice por (user_id, started_at): toda lectura es por usuario y rango."
```

---

## Task 4: Repositorio + dedupe

**Files:**
- Create: `backend/src/cardio/repository.ts`
- Create: `backend/src/cardio/repository.test.ts`

El dedupe es lógica pura y se testea sin DB. El resto del repositorio (queries) se cubre por los tests de rutas de la Task 5.

- [ ] **Step 1: Write the failing test**

Crear `backend/src/cardio/repository.test.ts`:

```ts
import { test, expect } from "bun:test";
import { sameSecond } from "./repository";

test("sameSecond: dos timestamps del mismo segundo son el mismo", () => {
  expect(sameSecond(1784000000000, 1784000000999)).toBe(true);
  expect(sameSecond(1784000000000, 1784000000000)).toBe(true);
});

test("sameSecond: un segundo de diferencia NO es el mismo", () => {
  expect(sameSecond(1784000000000, 1784000001000)).toBe(false);
  expect(sameSecond(1784000000999, 1784000001000)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test backend/src/cardio/repository.test.ts`
Expected: FAIL — `Cannot find module './repository'`

- [ ] **Step 3: Write minimal implementation**

Crear `backend/src/cardio/repository.ts`:

```ts
import { and, eq, gte, lte, desc } from "drizzle-orm";
import type { CardioActivity } from "@pulsia/shared";
import { cardioActivity } from "../db/schema";
import type { Db } from "../db/client";

// El .FIT guarda el timestamp en segundos, así que dos parseos del mismo archivo dan el mismo
// valor exacto. Dos actividades reales distintas no arrancan en el mismo segundo.
export const sameSecond = (a: number, b: number): boolean => Math.floor(a / 1000) === Math.floor(b / 1000);

export type CardioRow = typeof cardioActivity.$inferSelect;

const toActivity = (r: CardioRow): CardioActivity => ({
  id: r.id,
  type: r.type as CardioActivity["type"],
  startedAt: r.startedAt,
  durationMs: r.durationMs,
  distanceM: r.distanceM,
  avgHr: r.avgHr,
  maxHr: r.maxHr,
  elevationGainM: r.elevationGainM,
  kcal: r.kcal,
  kcalSource: r.kcalSource as CardioActivity["kcalSource"],
  source: r.source as CardioActivity["source"],
  ...(r.hrSeries ? { hrSeries: r.hrSeries } : {}),
  notes: r.notes,
});

export async function insertCardio(db: Db, userId: string, a: CardioActivity): Promise<void> {
  await db.insert(cardioActivity).values({
    id: a.id, userId, type: a.type, startedAt: a.startedAt, durationMs: a.durationMs,
    distanceM: a.distanceM, avgHr: a.avgHr, maxHr: a.maxHr, elevationGainM: a.elevationGainM,
    kcal: a.kcal, kcalSource: a.kcalSource, source: a.source,
    hrSeries: a.hrSeries ?? null, notes: a.notes,
  });
}

// Para el dedupe del import: la actividad del mismo segundo, si existe.
export async function findCardioAtSecond(db: Db, userId: string, startedAt: number): Promise<CardioActivity | null> {
  const from = Math.floor(startedAt / 1000) * 1000;
  const rows = await db.select().from(cardioActivity).where(
    and(eq(cardioActivity.userId, userId), gte(cardioActivity.startedAt, from), lte(cardioActivity.startedAt, from + 999)),
  );
  return rows[0] ? toActivity(rows[0]) : null;
}

export async function listCardio(db: Db, userId: string, from?: number, to?: number): Promise<CardioActivity[]> {
  const filters = [eq(cardioActivity.userId, userId)];
  if (from != null) filters.push(gte(cardioActivity.startedAt, from));
  if (to != null) filters.push(lte(cardioActivity.startedAt, to));
  const rows = await db.select().from(cardioActivity)
    .where(and(...filters)).orderBy(desc(cardioActivity.startedAt));
  return rows.map(toActivity);
}

export async function getCardio(db: Db, id: string, userId: string): Promise<CardioActivity | null> {
  const rows = await db.select().from(cardioActivity)
    .where(and(eq(cardioActivity.id, id), eq(cardioActivity.userId, userId)));
  return rows[0] ? toActivity(rows[0]) : null;
}

export async function getCardioOwnerId(db: Db, id: string): Promise<string | null> {
  const rows = await db.select({ userId: cardioActivity.userId }).from(cardioActivity)
    .where(eq(cardioActivity.id, id));
  return rows[0]?.userId ?? null;
}

export async function updateCardio(
  db: Db, id: string, userId: string,
  patch: Partial<Pick<CardioActivity, "type" | "durationMs" | "distanceM" | "notes">>,
): Promise<boolean> {
  const res = await db.update(cardioActivity).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(cardioActivity.id, id), eq(cardioActivity.userId, userId))).returning({ id: cardioActivity.id });
  return res.length > 0;
}

export async function deleteCardio(db: Db, id: string, userId: string): Promise<boolean> {
  const res = await db.delete(cardioActivity)
    .where(and(eq(cardioActivity.id, id), eq(cardioActivity.userId, userId))).returning({ id: cardioActivity.id });
  return res.length > 0;
}
```

**Nota:** verificar el tipo `Db` y su path de import mirando `backend/src/sessions/repository.ts` (línea 1-6) y usar exactamente el mismo. Si ahí se importa distinto, seguir ese patrón, no este.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test backend/src/cardio/repository.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Verificar por mutación**

En `sameSecond`, cambiar `Math.floor(a / 1000) === Math.floor(b / 1000)` por `a === b`. Esperado: falla "dos timestamps del mismo segundo". Revertir.

- [ ] **Step 6: Commit**

```bash
git add backend/src/cardio/
git commit -S -m "feat(cardio): repositorio de actividades + dedupe por segundo"
```

---

## Task 5: Rutas HTTP + montaje

**Files:**
- Create: `backend/src/routes/cardio.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write the failing test**

Crear `backend/src/routes/cardio.test.ts`. **Antes de escribirlo**, mirar un test de rutas existente (`ls backend/src/routes/*.test.ts`) y copiar su forma de montar la app y de mockear `deps`/`userId`. Si no hay ninguno, usar esta forma con la app real y un `db` mock:

```ts
import { test, expect } from "bun:test";
import { cardioRoutes } from "./cardio";

const activity = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  type: "walk", startedAt: 1784000000000, durationMs: 1800_000,
  distanceM: 2500, avgHr: 105, maxHr: 128, elevationGainM: 30,
  kcal: 140, kcalSource: "device", source: "fit", notes: "",
};

// Monta el router con un userId fijo, como hace el middleware auth en producción.
const mount = (deps: any, userId = "u1") => {
  const r = cardioRoutes(deps);
  const app = new (require("hono").Hono)();
  app.use("*", async (c: any, next: any) => { c.set("userId", userId); await next(); });
  app.route("/cardio", r);
  return app;
};

test("POST /cardio rechaza un body inválido con 400", async () => {
  const app = mount({ db: {} });
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...activity, type: "yoga" }),
  });
  expect(res.status).toBe(400);
});

test("POST /cardio fuerza kcalSource=estimate cuando el cliente miente diciendo device sin kcal", async () => {
  let saved: any = null;
  const deps = { db: {}, repo: { insertCardio: async (_db: any, _u: string, a: any) => { saved = a; },
    findCardioAtSecond: async () => null } };
  const app = mount(deps);
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...activity, kcal: null, kcalSource: "device", source: "manual" }),
  });
  expect(res.status).toBe(200);
  expect(saved.kcalSource).toBe("estimate");
});

test("POST /cardio con source=fit y startedAt duplicado → 409", async () => {
  const deps = { db: {}, repo: { insertCardio: async () => {}, findCardioAtSecond: async () => activity } };
  const app = mount(deps);
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(activity),
  });
  expect(res.status).toBe(409);
});

test("POST /cardio manual NO dedupea (dos actividades cortas seguidas son válidas)", async () => {
  const deps = { db: {}, repo: { insertCardio: async () => {}, findCardioAtSecond: async () => activity } };
  const app = mount(deps);
  const res = await app.request("/cardio", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...activity, source: "manual", kcal: null, kcalSource: "estimate" }),
  });
  expect(res.status).toBe(200);
});

test("GET /cardio/:id de otro usuario → 409, no 404 (no filtra existencia)", async () => {
  const deps = { db: {}, repo: { getCardio: async () => null, getCardioOwnerId: async () => "otro-user" } };
  const app = mount(deps);
  const res = await app.request(`/cardio/${activity.id}`);
  expect(res.status).toBe(409);
});
```

**Nota sobre `deps.repo`:** para que las rutas sean testeables sin DB, el router recibe las funciones del repositorio por `deps` (patrón de `backend/src/reports/collect.ts`, que inyecta `listSessions`). Si `AppDeps` no tiene `repo`, agregarlo con default a las funciones reales — mirar cómo lo hace `collect.ts:43,52` y seguir ese patrón.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test backend/src/routes/cardio.test.ts`
Expected: FAIL — `Cannot find module './cardio'`

- [ ] **Step 3: Write minimal implementation**

Crear `backend/src/routes/cardio.ts`:

```ts
import { Hono } from "hono";
import { CardioActivitySchema } from "@pulsia/shared";
import * as realRepo from "../cardio/repository";
import type { AppDeps } from "../app";

export function cardioRoutes(deps: AppDeps & { repo?: Partial<typeof realRepo> }) {
  const repo = { ...realRepo, ...(deps.repo ?? {}) };
  const r = new Hono<{ Variables: { userId: string } }>();

  r.post("/", async (c) => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { return c.json({ error: "JSON inválido" }, 400); }
    const parsed = CardioActivitySchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const a = parsed.data;
    const userId = c.get("userId");

    // El server DERIVA kcalSource, no lo acepta del cliente: sin kcal no hay medición del reloj.
    // Mismo criterio que el source:"estimate" forzado en /foods/describe.
    const kcalSource = a.kcal != null && a.source === "fit" ? "device" : "estimate";

    // El dedupe aplica solo al import: reimportar el mismo .FIT no debe crear dos caminatas.
    // La carga manual no lo chequea (dos actividades cortas seguidas son asunto del usuario).
    if (a.source === "fit") {
      const dup = await repo.findCardioAtSecond!(deps.db, userId, a.startedAt);
      if (dup) return c.json({ error: "Ya importaste esta actividad" }, 409);
    }
    await repo.insertCardio!(deps.db, userId, { ...a, kcalSource });
    return c.json({ id: a.id }, 200);
  });

  r.get("/", async (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    return c.json(await repo.listCardio!(
      deps.db, c.get("userId"),
      from ? Number(from) : undefined, to ? Number(to) : undefined,
    ));
  });

  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const a = await repo.getCardio!(deps.db, id, userId);
    if (a) return c.json(a);
    const owner = await repo.getCardioOwnerId!(deps.db, id);
    if (owner && owner !== userId) return c.json({ error: "esa actividad pertenece a otro usuario" }, 409);
    return c.json({ error: "actividad no encontrada" }, 404);
  });

  r.patch("/:id", async (c) => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { return c.json({ error: "JSON inválido" }, 400); }
    const PatchSchema = CardioActivitySchema.pick({ type: true, durationMs: true, distanceM: true, notes: true }).partial();
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const ok = await repo.updateCardio!(deps.db, c.req.param("id"), c.get("userId"), parsed.data);
    return ok ? c.json({ id: c.req.param("id") }) : c.json({ error: "actividad no encontrada" }, 404);
  });

  r.delete("/:id", async (c) => {
    const ok = await repo.deleteCardio!(deps.db, c.req.param("id"), c.get("userId"));
    return ok ? c.json({ id: c.req.param("id") }) : c.json({ error: "actividad no encontrada" }, 404);
  });

  return r;
}
```

⚠️ **Cuando llegue `POST /cardio/parse` (fase 3), debe declararse ANTES de `/:id`** o el param la captura — el mismo cuidado que `/sessions/last-weights`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test backend/src/routes/cardio.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Verificar por mutación**

1. En la línea de `kcalSource`, forzar `const kcalSource = a.kcalSource;` (aceptar lo del cliente). Esperado: falla "fuerza kcalSource=estimate cuando el cliente miente". Revertir.
2. Sacar el guard `if (a.source === "fit")` del dedupe (dedupear siempre). Esperado: falla "manual NO dedupea". Revertir.
3. En `GET /:id`, devolver 404 en vez de 409 para el dueño ajeno. Esperado: falla "de otro usuario → 409". Revertir.

- [ ] **Step 6: Montar el router**

En `backend/src/app.ts`:

1. Agregar el import junto a los otros routers:
```ts
import { cardioRoutes } from "./routes/cardio";
```
2. Después de la línea `app.use("/nutrition/*", auth);`, agregar:
```ts
  app.use("/cardio", auth);
  app.use("/cardio/*", auth);
```
3. Después de `app.route("/nutrition", nutritionRoutes(deps));`, agregar:
```ts
  app.route("/cardio", cardioRoutes(deps));
```

**Las dos líneas de `auth` son obligatorias.** La lección del bug #79: `/sessions` quedó fuera de `auth` y al exponer el backend a internet fue público. Un route sin `auth` es un agujero, no un detalle.

- [ ] **Step 7: Suite completa + typecheck**

Run: `bun test shared backend && cd backend && bun run typecheck`
Expected: PASS, sin regresiones.

- [ ] **Step 8: Verificar que el route está protegido**

Run: `cd backend && bun run start` (en otra terminal) y luego:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/cardio
```
Expected: **401** (no 200). Si devuelve 200, el `auth` no quedó montado.

- [ ] **Step 9: Commit**

```bash
git add backend/src/routes/cardio.ts backend/src/routes/cardio.test.ts backend/src/app.ts
git commit -S -m "feat(cardio): rutas CRUD de actividades

El server deriva kcalSource (no lo acepta del cliente): sin kcal no hay
medición del reloj. El dedupe por segundo aplica solo al import.
Montado bajo auth (lección del bug #79)."
```

---

## Task 6: PR

- [ ] **Step 1: Push + PR**

```bash
git push -u origin feat/cardio-actividades-import-fit
gh pr create --title "feat(cardio): fase 1 — modelo de actividades + gasto por tipo (shared + backend)" --body "$(cat <<'EOF'
## Qué

Fase 1 de las actividades de cardio: modelo, tabla y CRUD. Todavía no lo consume nadie (el móvil es la fase 2, el import .FIT la 3, el balance la 4).

Spec: `docs/superpowers/specs/2026-07-17-cardio-actividades-import-fit-design.md`

## Decisiones

- **Tabla propia `cardio_activity`, no extender `workout_session`**: esa exige `program_id` (FK real a `programs`), `week_number` y `day_label`. Una caminata no cuelga de ningún programa de fuerza; hacerlos nullable rompería invariantes sanas.
- **Bug arreglado**: `MET_STRENGTH = 5` era el único fallback sin FC → sobrestimaba ~40% una caminata (MET 3.5) y subestimaba a la mitad un running (9.8). Ahora el MET va por tipo. Fuerza no cambia (hay test de regresión).
- **Las kcal del reloj mandan** (`kcalSource: device`): mide con acelerómetro + FC + perfil, le gana a la fórmula. El server **deriva** `kcalSource`, no lo acepta del cliente (mismo criterio que el `source:"estimate"` forzado en `/foods/describe`).
- **Dedupe solo en el import** (`source: "fit"`), por segundo: el `.FIT` guarda el timestamp en segundos, así que reimportar el mismo archivo da el mismo valor exacto.

## Notas de review

- `dayExerciseBurn` convive con `sumDayExerciseBurn` **solo hasta la fase 4**, donde migran los dos call-sites (`useNutritionDay.ts:63`, `reports/collect.ts:97`) y la vieja se borra.
- Migración **0017**, aplicada y verificada local.
- Todos los tests nuevos verificados **por mutación** (romper el código y ver que el test se queja).
EOF
)"
```

- [ ] **Step 2: Disparar el review**

```bash
gh pr comment --body "@claude review"
```

Esperar el review de CodeRabbit + `@claude`. **Menores** → fix + merge. **Mayores** → fix + **nuevo** review. Nunca mergear sin al menos un review real (el aviso de rate-limit no cuenta).

---

## Self-review de este plan

**Cobertura del spec (§ por §):**
- §3 tabla `cardio_activity` → Task 3 ✓
- §4 schemas + `satisfies` → Task 1 ✓
- §5 kcal device/estimate + MET + server fuerza → Tasks 2, 5 ✓
- §6 `dayExerciseBurn` → Task 2 ✓ (los call-sites son fase 4, fuera de alcance, declarado)
- §7 import → **fase 3, fuera de alcance** (declarado arriba)
- §8 endpoints → Task 5 ✓ (`/parse` es fase 3)
- §9 UI → **fase 2, fuera de alcance**
- §10 errores → Tasks 1 (Zod), 5 (400/409/404) ✓
- §11 testing + mutación → todas las tasks ✓

**Consistencia de tipos:** `CardioType`/`CardioActivity` (Task 1) se usan igual en Tasks 2, 4, 5. `CardioBurnInput` (Task 2) es lo que consume `dayExerciseBurn` y lo que la fase 4 tendrá que construir desde las filas. `sameSecond` (Task 4) es la única definición del criterio de dedupe.

**Sin placeholders:** cada step tiene el código o el comando exacto. Los dos puntos donde el plan manda a mirar el código existente (el tipo `Db` en Task 4, la forma de los tests de rutas en Task 5) son deliberados: es más seguro que copien el patrón real del repo que inventar uno.
