# Balance energético #2a — Metas + Restante — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Calcular la meta calórica + de macros desde el perfil (BMR Mifflin-St Jeor × actividad, ajustada por objetivo nutricional) y mostrar Meta / Comido / Restante en el tab de Nutrición.

**Architecture:** La meta la **computa el móvil** con una función pura de `shared` (`computeNutritionGoal`), porque el perfil vive en AsyncStorage del móvil, no en el backend. El backend solo persiste los **inputs** del objetivo (objetivo/ritmo/manual) en una tabla `nutrition_goal`. Peso canónico = último `weight_kg` de métricas ?? `profile.weightKg`. Sin gasto de entrenamiento (eso es #2b): `Restante = Meta − Comido`.

**Tech Stack:** Bun monorepo. `shared` (Zod + funciones puras, tests `bun:test`), `backend` (Hono + Drizzle + Postgres, tests `bun:test` con fakeDb), `mobile` (Expo/expo-router, jest). Reusa `ChipGroup`, `getLatestMetrics`, `getProfile`.

**Referencia:** spec `docs/superpowers/specs/2026-07-14-balance-energetico-2a-metas-design.md`.

## File structure

- `shared/src/schemas/profile.ts` — `ActivityLevelSchema` + `activityLevel` en `TrainingProfile`; exportar `Sex`.
- `shared/src/schemas/nutrition.ts` — `NutritionObjectiveSchema`, `NutritionGoalInputSchema`.
- `shared/src/nutrition/goal.ts` — `computeNutritionGoal` (pura) + tipos.
- `shared/src/index.ts` — barrel `export * from "./nutrition/goal"`.
- `backend/src/db/schema.ts` — tabla `nutrition_goal`; migración 0014.
- `backend/src/nutrition/repository.ts` — `getGoalInput`/`upsertGoalInput`.
- `backend/src/routes/nutrition.ts` — `GET/PUT /nutrition/goal`.
- `mobile/src/api/nutrition.ts` — `getNutritionGoal`/`putNutritionGoal`.
- `mobile/app/(tabs)/perfil.tsx` — selector de nivel de actividad.
- `mobile/src/nutrition/goalView.ts` — helper puro Meta/Comido/Restante + barras.
- `mobile/app/nutricion/objetivo.tsx` — pantalla "Objetivo nutricional" (nueva).
- `mobile/app/(tabs)/nutricion.tsx` — tarjeta Meta/Comido/Restante + botón Objetivo.

---

### Task 1: Shared — schemas de actividad y objetivo

**Files:**
- Modify: `shared/src/schemas/profile.ts`
- Modify: `shared/src/schemas/nutrition.ts`
- Test: `shared/src/schemas/profile.test.ts`
- Test: `shared/src/schemas/nutrition.test.ts`

- [ ] **Step 1: Tests que fallan**

En `shared/src/schemas/profile.test.ts`, agregá al final:
```ts
test("acepta activityLevel y lo deja opcional", () => {
  const base = { experience: "beginner", goal: "strength", daysPerWeek: 3, sessionMinutes: 45, gymEquipment: [], homeEquipment: ["bodyweight"], limitations: [] };
  expect(TrainingProfileSchema.parse({ ...base, activityLevel: "moderate" }).activityLevel).toBe("moderate");
  expect(TrainingProfileSchema.parse(base).activityLevel).toBeUndefined();
  expect(TrainingProfileSchema.safeParse({ ...base, activityLevel: "extreme" }).success).toBe(false);
});
```
En `shared/src/schemas/nutrition.test.ts`, agregá al import de `./nutrition` los símbolos `NutritionObjectiveSchema, NutritionGoalInputSchema` y al final:
```ts
test("NutritionGoalInputSchema acepta objetivo + ritmo, rechaza objetivo inválido", () => {
  expect(NutritionGoalInputSchema.safeParse({ objective: "lose", rateKgPerWeek: 0.5 }).success).toBe(true);
  expect(NutritionGoalInputSchema.safeParse({ objective: "maintain", rateKgPerWeek: 0, manualKcal: 2200 }).success).toBe(true);
  expect(NutritionGoalInputSchema.safeParse({ objective: "bulk", rateKgPerWeek: 0.5 }).success).toBe(false);
  expect(NutritionGoalInputSchema.safeParse({ objective: "gain", rateKgPerWeek: 5 }).success).toBe(false); // rate > 1
  expect(NutritionGoalInputSchema.safeParse({ objective: "lose", rateKgPerWeek: 0.25, manualKcal: -5 }).success).toBe(false);
});
```

- [ ] **Step 2: Verlos fallar**

Run: `cd shared && bun test src/schemas/profile.test.ts src/schemas/nutrition.test.ts`
Expected: FAIL (`activityLevel`/`NutritionObjectiveSchema`/`NutritionGoalInputSchema` no existen).

- [ ] **Step 3: profile.ts**

En `shared/src/schemas/profile.ts`:
- Después de `export const SexSchema = ...`, agregá el tipo faltante:
```ts
export type Sex = z.infer<typeof SexSchema>;
```
- Antes de `export const TrainingProfileSchema`, agregá:
```ts
export const ActivityLevelSchema = z.enum(["sedentary", "light", "moderate", "active"]);
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;
```
- Dentro de `TrainingProfileSchema`, agregá (junto a los antropométricos opcionales, p.ej. tras `heightCm: ...`):
```ts
  activityLevel: ActivityLevelSchema.optional(), // actividad base SIN contar entrenamientos (semilla del TDEE)
```

- [ ] **Step 4: nutrition.ts**

En `shared/src/schemas/nutrition.ts`, al final del archivo:
```ts
// Objetivo nutricional (input del usuario para calcular la meta calórica). El cálculo vive en nutrition/goal.ts.
export const NutritionObjectiveSchema = z.enum(["lose", "maintain", "gain"]);
export type NutritionObjective = z.infer<typeof NutritionObjectiveSchema>;

export const NutritionGoalInputSchema = z.object({
  objective: NutritionObjectiveSchema,
  rateKgPerWeek: z.number().min(0).max(1),                 // la UI usa 0.25 / 0.5; ignorado si maintain
  manualKcal: z.number().int().positive().max(10000).nullable().optional(), // override total (fallback)
});
export type NutritionGoalInput = z.infer<typeof NutritionGoalInputSchema>;
```

- [ ] **Step 5: Verlos pasar + typecheck**

Run: `cd shared && bun test src/schemas/profile.test.ts src/schemas/nutrition.test.ts && bunx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 6: Commit**

IMPORTANT: firmar con `-S`, SIN Co-Authored-By.
```bash
git add shared/src/schemas/profile.ts shared/src/schemas/nutrition.ts shared/src/schemas/profile.test.ts shared/src/schemas/nutrition.test.ts
git commit -S -m "feat(shared): activityLevel en el perfil + schema de objetivo nutricional"
```

---

### Task 2: Shared — `computeNutritionGoal` (función pura)

**Files:**
- Create: `shared/src/nutrition/goal.ts`
- Create: `shared/src/nutrition/goal.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Test que falla**

Creá `shared/src/nutrition/goal.test.ts`:
```ts
import { test, expect } from "bun:test";
import { computeNutritionGoal } from "./goal";

const base = { sex: "male" as const, age: 40, heightCm: 178, weightKg: 80, activityLevel: "light" as const };

test("meta auto para mantenimiento (BMR Mifflin × actividad)", () => {
  const r = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  // BMR = 10*80 + 6.25*178 - 5*40 + 5 = 1717.5 ; TDEE = *1.375 = 2361 (redondeo)
  expect(r.bmr).toBe(1718);
  expect(r.kcal).toBe(2361);
  expect(r.source).toBe("auto");
});

test("perder aplica déficit por ritmo (0.5 kg/sem ≈ -550)", () => {
  const r = computeNutritionGoal({ ...base, objective: "lose", rateKgPerWeek: 0.5 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(2361 - 550); // 1811
  expect(r.protein_g).toBe(160);   // 80 * 2.0 en déficit
});

test("ganar aplica superávit; proteína 1.8 g/kg fuera de déficit", () => {
  const r = computeNutritionGoal({ ...base, objective: "gain", rateKgPerWeek: 0.25 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(2361 + 275);
  expect(r.protein_g).toBe(144);   // 80 * 1.8
});

test("piso de 1500 kcal", () => {
  const r = computeNutritionGoal({ sex: "female", age: 30, heightCm: 155, weightKg: 50, activityLevel: "sedentary", objective: "lose", rateKgPerWeek: 0.5 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(1500);
});

test("manualKcal pisa el cálculo (source manual, sin piso)", () => {
  const r = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0, manualKcal: 1400 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.kcal).toBe(1400);
  expect(r.source).toBe("manual");
});

test("carbos = resto y nunca negativos", () => {
  const r = computeNutritionGoal({ ...base, objective: "maintain", rateKgPerWeek: 0 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  // kcal 2361, prot 144g(576), grasa round(2361*0.27/9)=71g(639) → carbos=(2361-576-639)/4=286.5→287
  expect(r.fat_g).toBe(71);
  expect(r.carbs_g).toBe(287);
});

test("sexo other usa constante promedio (-78)", () => {
  const r = computeNutritionGoal({ ...base, sex: "other", objective: "maintain", rateKgPerWeek: 0 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  // BMR = 1717.5 - 5 (male era +5) ... other = -78 → 1634.5 → round 1635
  expect(r.bmr).toBe(1635);
});

test("incompleto lista lo que falta (sin manual)", () => {
  const r = computeNutritionGoal({ sex: "male", objective: "maintain", rateKgPerWeek: 0 });
  expect(r.status).toBe("incomplete");
  if (r.status !== "incomplete") throw new Error("");
  expect(r.missing).toEqual(["edad", "altura", "peso"]);
});

test("manual sin peso: macros por % (no rompe)", () => {
  const r = computeNutritionGoal({ objective: "maintain", rateKgPerWeek: 0, manualKcal: 2000 });
  if (r.status !== "ok") throw new Error("esperaba ok");
  expect(r.protein_g).toBe(125); // 2000*0.25/4
});
```

- [ ] **Step 2: Verlo fallar**

Run: `cd shared && bun test src/nutrition/goal.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `goal.ts`**

Creá `shared/src/nutrition/goal.ts`:
```ts
import type { Sex, ActivityLevel } from "../schemas/profile";
import type { NutritionObjective } from "../schemas/nutrition";

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725,
};
const KCAL_FLOOR = 1500;
const KCAL_PER_KG = 7700; // 1 kg de masa corporal ≈ 7700 kcal → /7 por día

export interface NutritionGoalArgs {
  sex?: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number; // resuelto por quien llama: último weight_kg ?? profile.weightKg
  activityLevel?: ActivityLevel;
  objective: NutritionObjective;
  rateKgPerWeek: number;
  manualKcal?: number | null;
}

export type NutritionGoalResult =
  | { status: "ok"; source: "auto" | "manual"; kcal: number; protein_g: number; carbs_g: number; fat_g: number; bmr: number | null; tdee: number | null }
  | { status: "incomplete"; missing: string[] };

const round = (n: number) => Math.round(n);

// Proteína por peso (más alta en déficit); si no hay peso (solo camino manual) → 25% de las kcal.
function macros(kcal: number, weightKg: number | undefined, objective: NutritionObjective) {
  const protein_g = weightKg != null
    ? round(weightKg * (objective === "lose" ? 2.0 : 1.8))
    : round((kcal * 0.25) / 4);
  const fat_g = round((kcal * 0.27) / 9);
  const carbs_g = Math.max(0, round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, carbs_g, fat_g };
}

export function computeNutritionGoal(args: NutritionGoalArgs): NutritionGoalResult {
  const { sex, age, heightCm, weightKg, activityLevel, objective, rateKgPerWeek, manualKcal } = args;

  // Camino manual: el usuario fija las kcal; pisa el cálculo y no fuerza el piso.
  if (manualKcal != null) {
    return { status: "ok", source: "manual", kcal: manualKcal, ...macros(manualKcal, weightKg, objective), bmr: null, tdee: null };
  }

  const missing: string[] = [];
  if (age == null) missing.push("edad");
  if (heightCm == null) missing.push("altura");
  if (weightKg == null) missing.push("peso");
  if (missing.length > 0) return { status: "incomplete", missing };

  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78; // other/sin sexo → promedio
  const bmr = 10 * (weightKg as number) + 6.25 * (heightCm as number) - 5 * (age as number) + s;
  const tdee = bmr * ACTIVITY_FACTOR[activityLevel ?? "light"];
  const adj = (rateKgPerWeek * KCAL_PER_KG) / 7;
  const raw = objective === "lose" ? tdee - adj : objective === "gain" ? tdee + adj : tdee;
  const kcal = Math.max(KCAL_FLOOR, round(raw));
  return { status: "ok", source: "auto", kcal, ...macros(kcal, weightKg, objective), bmr: round(bmr), tdee: round(tdee) };
}
```

- [ ] **Step 4: Barrel**

En `shared/src/index.ts`, agregá junto a las otras líneas de nutrition:
```ts
export * from "./nutrition/goal";
```

- [ ] **Step 5: Verlo pasar + typecheck**

Run: `cd shared && bun test src/nutrition/goal.test.ts && bunx tsc --noEmit`
Expected: PASS, sin errores. Si algún número esperado del test no matchea por redondeo, NO cambies la fórmula: verificá el cálculo a mano y ajustá el valor esperado del test al real (documentá el redondeo). Los pasos intermedios: BMR 1717.5→1718, TDEE 1717.5*1.375=2361.56→2362? **Verificá**: si `round(bmr)` da 1718 pero `tdee` usa el bmr sin redondear (1717.5*1.375=2361.5625→2362), ajustá el esperado a 2362 y los derivados (lose 2362-550=1812, etc.). Usá el valor que produce la fórmula tal como está escrita (tdee desde bmr sin redondear).

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/goal.ts shared/src/nutrition/goal.test.ts shared/src/index.ts
git commit -S -m "feat(shared): computeNutritionGoal (BMR Mifflin-St Jeor × actividad + objetivo → kcal + macros)"
```

---

### Task 3: Backend — tabla `nutrition_goal` + migración

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0014_*.sql` (generada)

- [ ] **Step 1: Tabla**

En `backend/src/db/schema.ts`, junto a las otras tablas de nutrición (después de `waterLog`), agregá:
```ts
export const nutritionGoal = pgTable("nutrition_goal", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  objective: text("objective").notNull(),            // 'lose' | 'maintain' | 'gain'
  rateKgPerWeek: real("rate_kg_per_week").notNull(), // 0 | 0.25 | 0.5
  manualKcal: integer("manual_kcal"),                // nullable: override total
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```
(`pgTable`, `uuid`, `text`, `real`, `integer`, `timestamp` ya están importados.)

- [ ] **Step 2: Generar la migración**

Run: `cd backend && bun run db:generate`
Expected: crea `backend/drizzle/0014_*.sql`. Sin DB (diffea contra el snapshot).

- [ ] **Step 3: Revisar**

Run: `cat backend/drizzle/0014_*.sql`
Expected: `CREATE TABLE "nutrition_goal"` con `user_id` (pk, FK cascade), `objective`, `rate_kg_per_week`, `manual_kcal`, `updated_at`.

- [ ] **Step 4: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle
git commit -S -m "feat(backend): tabla nutrition_goal (migración 0014)"
```

---

### Task 4: Backend — repo + endpoints `/nutrition/goal`

**Files:**
- Modify: `backend/src/nutrition/repository.ts`
- Modify: `backend/src/routes/nutrition.ts`
- Test: `backend/src/nutrition/repository.test.ts`
- Test: `backend/src/routes/nutrition.test.ts`

- [ ] **Step 1: Test de repo que falla**

En `backend/src/nutrition/repository.test.ts`, agregá al final:
```ts
import { getGoalInput, upsertGoalInput } from "./repository";

test("getGoalInput devuelve mantenimiento por defecto si no hay fila", async () => {
  const db: any = { query: { nutritionGoal: { findFirst: async () => null } } };
  expect(await getGoalInput(db, "u")).toEqual({ objective: "maintain", rateKgPerWeek: 0, manualKcal: null });
});

test("getGoalInput mapea la fila guardada", async () => {
  const db: any = { query: { nutritionGoal: { findFirst: async () => ({ userId: "u", objective: "lose", rateKgPerWeek: 0.5, manualKcal: null }) } } };
  expect(await getGoalInput(db, "u")).toEqual({ objective: "lose", rateKgPerWeek: 0.5, manualKcal: null });
});

test("upsertGoalInput inserta con onConflict y devuelve el input", async () => {
  const calls: any[] = [];
  const db: any = { insert: () => ({ values(v: any) { calls.push(v); return { onConflictDoUpdate: async () => {} }; } }) };
  const out = await upsertGoalInput(db, "u", { objective: "gain", rateKgPerWeek: 0.25, manualKcal: null });
  expect(out).toEqual({ objective: "gain", rateKgPerWeek: 0.25, manualKcal: null });
  expect(calls[0]).toMatchObject({ userId: "u", objective: "gain", rateKgPerWeek: 0.25 });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `cd backend && bun test src/nutrition/repository.test.ts`
Expected: FAIL (`getGoalInput`/`upsertGoalInput` no existen).

- [ ] **Step 3: Implementar en `repository.ts`**

En `backend/src/nutrition/repository.ts`:
- Agregá `nutritionGoal` al import de tablas: `import { food, meal, mealItem, waterLog, nutritionGoal } from "../db/schema";`
- Agregá `NutritionGoalInput` al import de tipos del shared.
- Al final del archivo:
```ts
// ---- Objetivo nutricional (metas) ----
const DEFAULT_GOAL: NutritionGoalInput = { objective: "maintain", rateKgPerWeek: 0, manualKcal: null };

export async function getGoalInput(db: Db, userId: string): Promise<NutritionGoalInput> {
  const row = await db.query.nutritionGoal.findFirst({ where: eq(nutritionGoal.userId, userId) });
  if (!row) return DEFAULT_GOAL;
  return {
    objective: row.objective as NutritionGoalInput["objective"],
    rateKgPerWeek: row.rateKgPerWeek,
    manualKcal: row.manualKcal ?? null,
  };
}

export async function upsertGoalInput(db: Db, userId: string, input: NutritionGoalInput): Promise<NutritionGoalInput> {
  const values = { objective: input.objective, rateKgPerWeek: input.rateKgPerWeek, manualKcal: input.manualKcal ?? null };
  await db.insert(nutritionGoal)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: nutritionGoal.userId, set: { ...values, updatedAt: new Date() } });
  return values;
}
```

- [ ] **Step 4: Verlo pasar**

Run: `cd backend && bun test src/nutrition/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Test de rutas que falla**

En `backend/src/routes/nutrition.test.ts`:
- En el helper `fakeDb`, sumá al objeto `query` la entrada `nutritionGoal`:
```ts
      nutritionGoal: { findFirst: async () => opts.goal ?? null },
```
- En el `insert` del fakeDb, el chain `.values()` hoy devuelve una promesa con `.returning`. Agregá también `.onConflictDoUpdate` a ese objeto para soportar el upsert. Es decir, dentro de `values(v)`, antes del `return p`, sumá:
```ts
        p.onConflictDoUpdate = async () => undefined;
```
- Agregá al final del archivo:
```ts
test("GET /nutrition/goal devuelve mantenimiento por defecto", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/goal");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ objective: "maintain", rateKgPerWeek: 0, manualKcal: null });
});

test("PUT /nutrition/goal guarda y devuelve el objetivo", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/goal", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ objective: "lose", rateKgPerWeek: 0.5, manualKcal: null }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ objective: "lose", rateKgPerWeek: 0.5 });
});

test("PUT /nutrition/goal rechaza objetivo inválido", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/goal", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ objective: "bulk", rateKgPerWeek: 0.5 }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 6: Verlo fallar**

Run: `cd backend && bun test src/routes/nutrition.test.ts`
Expected: FAIL (rutas `/goal` no existen → 404).

- [ ] **Step 7: Rutas**

En `backend/src/routes/nutrition.ts`:
- Sumá `NutritionGoalInputSchema` al import del shared.
- Sumá `getGoalInput, upsertGoalInput` al import del repo.
- Antes del `return r;`:
```ts
  // ---- Objetivo nutricional (metas) ----
  r.get("/goal", async (c) => {
    return c.json(await getGoalInput(deps.db, c.get("userId")));
  });

  r.put("/goal", async (c) => {
    const parsed = NutritionGoalInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Objetivo inválido", detail: parsed.error.issues }, 400);
    return c.json(await upsertGoalInput(deps.db, c.get("userId"), parsed.data));
  });
```

- [ ] **Step 8: Verlo pasar + typecheck**

Run: `cd backend && bun test src/routes/nutrition.test.ts src/nutrition/repository.test.ts && bunx tsc --noEmit`
Expected: PASS, sin errores.

- [ ] **Step 9: Commit**

```bash
git add backend/src/nutrition/repository.ts backend/src/routes/nutrition.ts backend/src/nutrition/repository.test.ts backend/src/routes/nutrition.test.ts
git commit -S -m "feat(backend): store + endpoints GET/PUT /nutrition/goal (inputs del objetivo)"
```

---

### Task 5: Mobile — cliente API del objetivo

**Files:**
- Modify: `mobile/src/api/nutrition.ts`

- [ ] **Step 1: Funciones**

En `mobile/src/api/nutrition.ts`:
- Ampliá el import de tipos con `NutritionGoalInput`.
- Antes de `async function errorMessage(...)`:
```ts
export async function getNutritionGoal(baseUrl: string): Promise<NutritionGoalInput> {
  const res = await apiFetch(baseUrl, "/nutrition/goal");
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el objetivo."));
  return (await res.json()) as NutritionGoalInput;
}

export async function putNutritionGoal(baseUrl: string, input: NutritionGoalInput): Promise<NutritionGoalInput> {
  const res = await apiFetch(baseUrl, "/nutrition/goal", { method: "PUT", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo guardar el objetivo."));
  return (await res.json()) as NutritionGoalInput;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/nutrition.ts
git commit -S -m "feat(mobile): cliente getNutritionGoal/putNutritionGoal"
```

---

### Task 6: Mobile — nivel de actividad en el perfil

**Files:**
- Modify: `mobile/app/(tabs)/perfil.tsx`

- [ ] **Step 1: Constante + estado**

En `mobile/app/(tabs)/perfil.tsx`:
- Después de la const `SEX = [...]`, agregá:
```ts
const ACTIVITY = [
  { value: "sedentary", label: "Sedentario" },
  { value: "light", label: "Ligero" },
  { value: "moderate", label: "Moderado" },
  { value: "active", label: "Activo" },
];
```
- Junto a los otros `useState`, agregá:
```ts
  const [activityLevel, setActivityLevel] = useState<string | undefined>(undefined);
```

- [ ] **Step 2: Cargar + guardar**

- En el `useEffect` de carga, dentro de `if (p) {...}`, agregá:
```ts
        setActivityLevel(p.activityLevel);
```
- En `onSave`, dentro del objeto `candidate`, agregá (junto a `sex`):
```ts
      activityLevel: activityLevel as TrainingProfile["activityLevel"],
```

- [ ] **Step 3: Render del selector**

En el JSX, después del bloque de `Sexo` (`<View><Text style={label}>Sexo</Text>...</View>`), agregá:
```tsx
      <View>
        <Text style={label}>Nivel de actividad (sin contar entrenamientos)</Text>
        <ChipGroup single options={ACTIVITY} selected={activityLevel ? [activityLevel] : []} onChange={(v) => setActivityLevel(v[0])} />
      </View>
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/perfil.tsx"
git commit -S -m "feat(mobile): selector de nivel de actividad en el perfil"
```

---

### Task 7: Mobile — helper puro `goalView`

**Files:**
- Create: `mobile/src/nutrition/goalView.ts`
- Test: `mobile/__tests__/goalView.test.ts`

- [ ] **Step 1: Test que falla**

Creá `mobile/__tests__/goalView.test.ts`:
```ts
import { buildGoalView } from "../src/nutrition/goalView";
import type { NutritionGoalResult } from "@pulsia/shared";

const comido = { kcal: 1200, protein_g: 90, carbs_g: 120, fat_g: 40 };

test("ok: arma meta/comido/restante + barras por macro", () => {
  const goal: NutritionGoalResult = { status: "ok", source: "auto", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, bmr: 1600, tdee: 2000 };
  const v = buildGoalView(goal, comido);
  expect(v.status).toBe("ok");
  expect(v.kcal).toEqual({ meta: 2000, comido: 1200, restante: 800 });
  const prot = v.macros!.find((m) => m.key === "protein")!;
  expect(prot).toMatchObject({ comido: 90, meta: 150, restante: 60, pct: 60 });
});

test("restante negativo si comido supera la meta; pct clamp a 100", () => {
  const goal: NutritionGoalResult = { status: "ok", source: "auto", kcal: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, bmr: 900, tdee: 1000 };
  const v = buildGoalView(goal, comido);
  expect(v.kcal!.restante).toBe(-200);
  expect(v.macros!.find((m) => m.key === "protein")!.pct).toBe(100);
});

test("incompleto propaga missing", () => {
  const v = buildGoalView({ status: "incomplete", missing: ["edad", "peso"] }, comido);
  expect(v.status).toBe("incomplete");
  expect(v.missing).toEqual(["edad", "peso"]);
});
```

- [ ] **Step 2: Verlo fallar**

Run: `cd mobile && npm test -- goalView --runInBand`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

Creá `mobile/src/nutrition/goalView.ts`:
```ts
import type { NutritionGoalResult } from "@pulsia/shared";

export interface MacroBar {
  key: "protein" | "carbs" | "fat";
  label: string;
  comido: number;
  meta: number;
  restante: number;
  pct: number; // 0–100, clamp
}
export interface GoalView {
  status: "ok" | "incomplete";
  missing?: string[];
  kcal?: { meta: number; comido: number; restante: number };
  macros?: MacroBar[];
}

const clampPct = (comido: number, meta: number): number =>
  meta <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((comido / meta) * 100)));

export function buildGoalView(
  goal: NutritionGoalResult,
  comido: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
): GoalView {
  if (goal.status === "incomplete") return { status: "incomplete", missing: goal.missing };
  const bar = (key: MacroBar["key"], label: string, c: number, meta: number): MacroBar => ({
    key, label, comido: Math.round(c), meta, restante: Math.round(meta - c), pct: clampPct(c, meta),
  });
  return {
    status: "ok",
    kcal: { meta: goal.kcal, comido: Math.round(comido.kcal), restante: Math.round(goal.kcal - comido.kcal) },
    macros: [
      bar("protein", "P", comido.protein_g, goal.protein_g),
      bar("carbs", "C", comido.carbs_g, goal.carbs_g),
      bar("fat", "G", comido.fat_g, goal.fat_g),
    ],
  };
}
```

- [ ] **Step 4: Verlo pasar + typecheck**

Run: `cd mobile && npm test -- goalView --runInBand && bunx tsc --noEmit`
Expected: PASS, sin errores.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/goalView.ts mobile/__tests__/goalView.test.ts
git commit -S -m "feat(mobile): helper puro goalView (meta/comido/restante + barras por macro)"
```

---

### Task 8: Mobile — pantalla "Objetivo nutricional"

**Files:**
- Create: `mobile/app/nutricion/objetivo.tsx`

- [ ] **Step 1: Crear la pantalla**

Creá `mobile/app/nutricion/objetivo.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { computeNutritionGoal, type NutritionObjective } from "@pulsia/shared";
import { getProfile } from "../../src/storage/profile";
import { getBackendUrl } from "../../src/storage/config";
import { getLatestMetrics } from "../../src/api/metrics";
import { getNutritionGoal, putNutritionGoal } from "../../src/api/nutrition";
import { ChipGroup } from "../../src/components/ChipGroup";
import { colors, radius, spacing } from "../../src/theme/tokens";
import type { TrainingProfile } from "@pulsia/shared";

const OBJECTIVES = [
  { value: "lose", label: "Perder" },
  { value: "maintain", label: "Mantener" },
  { value: "gain", label: "Ganar" },
];
const RATES = [
  { value: "0.25", label: "0,25 kg/sem" },
  { value: "0.5", label: "0,5 kg/sem" },
];

export default function ObjetivoScreen() {
  const baseUrl = useRef<string | null>(null);
  const [profile, setProfileState] = useState<TrainingProfile | null>(null);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [objective, setObjective] = useState<NutritionObjective>("maintain");
  const [rate, setRate] = useState("0.5");
  const [manualKcal, setManualKcal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      setProfileState(p);
      setWeightKg(p?.weightKg);
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (url) {
        try {
          const latest = await getLatestMetrics(url);
          if (latest.weight_kg?.value != null) setWeightKg(latest.weight_kg.value);
        } catch { /* offline: peso del perfil */ }
        try {
          const g = await getNutritionGoal(url);
          setObjective(g.objective);
          setRate(String(g.rateKgPerWeek === 0 ? 0.5 : g.rateKgPerWeek));
          setManualKcal(g.manualKcal != null ? String(g.manualKcal) : "");
        } catch (e) { setError((e as Error).message); }
      }
    })();
  }, []);

  const manual = manualKcal.trim() === "" ? null : Number(manualKcal.replace(",", "."));
  const result = computeNutritionGoal({
    sex: profile?.sex, age: profile?.age, heightCm: profile?.heightCm, weightKg,
    activityLevel: profile?.activityLevel,
    objective, rateKgPerWeek: objective === "maintain" ? 0 : Number(rate),
    manualKcal: manual != null && Number.isFinite(manual) && manual > 0 ? manual : null,
  });

  async function save() {
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      await putNutritionGoal(baseUrl.current, {
        objective, rateKgPerWeek: objective === "maintain" ? 0 : Number(rate),
        manualKcal: manual != null && Number.isFinite(manual) && manual > 0 ? Math.round(manual) : null,
      });
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Objetivo nutricional</Text>

      <View><Text style={{ color: colors.textMuted, marginBottom: spacing.xs }}>Objetivo</Text>
        <ChipGroup single options={OBJECTIVES} selected={[objective]} onChange={(v) => setObjective(v[0] as NutritionObjective)} />
      </View>
      {objective !== "maintain" && (
        <View><Text style={{ color: colors.textMuted, marginBottom: spacing.xs }}>Ritmo</Text>
          <ChipGroup single options={RATES} selected={[rate]} onChange={(v) => setRate(v[0])} />
        </View>
      )}
      <View><Text style={{ color: colors.textMuted, marginBottom: spacing.xs }}>Meta calórica manual (opcional, pisa el cálculo)</Text>
        <TextInput value={manualKcal} onChangeText={setManualKcal} keyboardType="numeric" placeholder="kcal" placeholderTextColor={colors.icon}
          style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />
      </View>

      {/* Vista previa de la meta */}
      <View style={card}>
        {result.status === "ok" ? (
          <>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{result.kcal} kcal / día</Text>
            <Text style={{ color: colors.textMuted }}>P {result.protein_g}g · C {result.carbs_g}g · G {result.fat_g}g</Text>
            <Text style={{ color: colors.icon, fontSize: 12 }}>
              {result.source === "manual" ? "meta manual" : `BMR ${result.bmr} · TDEE ${result.tdee}`}
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Faltan datos del perfil para calcular la meta:</Text>
            <Text style={{ color: colors.textMuted }}>{result.missing.join(", ")}</Text>
            <Pressable onPress={() => router.push("/(tabs)/perfil")}>
              <Text style={{ color: colors.accentText, fontWeight: "600" }}>Completar perfil →</Text>
            </Pressable>
          </>
        )}
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={save} disabled={saving} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : "Guardar objetivo"}</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores. (Si `router.push("/(tabs)/perfil")` se queja por el tipado de rutas de expo-router, usá `router.push("/perfil" as any)` o la ruta correcta que exista para el tab de perfil — verificá con los otros `router.push` del repo.)

- [ ] **Step 3: Commit**

```bash
git add mobile/app/nutricion/objetivo.tsx
git commit -S -m "feat(mobile): pantalla Objetivo nutricional (objetivo/ritmo/manual + preview de la meta)"
```

---

### Task 9: Mobile — Meta/Comido/Restante en el tab de Nutrición

**Files:**
- Modify: `mobile/app/(tabs)/nutricion.tsx`

- [ ] **Step 1: Imports + estado**

En `mobile/app/(tabs)/nutricion.tsx`:
- Ampliá el import de la API:
```ts
import { listMeals, deleteMeal, listWater, logWater, deleteWater, getNutritionGoal } from "../../src/api/nutrition";
```
- Sumá imports:
```ts
import { getProfile } from "../../src/storage/profile";
import { getLatestMetrics } from "../../src/api/metrics";
import { computeNutritionGoal } from "@pulsia/shared";
import { buildGoalView } from "../../src/nutrition/goalView";
import type { NutritionGoalInput, TrainingProfile } from "@pulsia/shared";
```
(Ya se importa `sumNullableMicro` y `type { Meal, WaterLog }` de `@pulsia/shared` — extendé ese type-import con `NutritionGoalInput, TrainingProfile` o agregá una línea nueva.)
- Junto a los otros `useState`:
```ts
  const [goalInput, setGoalInput] = useState<NutritionGoalInput | null>(null);
  const [profile, setProfileState] = useState<TrainingProfile | null>(null);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
```

- [ ] **Step 2: Cargar perfil + peso + objetivo en `load`**

Reemplazá el cuerpo del `try` de `load` para cargar también el objetivo, el perfil y el último peso:
```ts
    try {
      const [ms, ws, gi, p] = await Promise.all([
        listMeals(url, from, to), listWater(url, from, to), getNutritionGoal(url), getProfile(),
      ]);
      setMeals(ms); setWater(ws); setGoalInput(gi); setProfileState(p);
      let w = p?.weightKg;
      try { const latest = await getLatestMetrics(url); if (latest.weight_kg?.value != null) w = latest.weight_kg.value; } catch { /* offline */ }
      setWeightKg(w);
      setError(null);
    } catch (e) { setError((e as Error).message); }
```
(Nota: `getProfile()` no necesita `url`; se resuelve local. Dejá la firma de `load` igual.)

- [ ] **Step 3: Calcular la vista de la meta**

Después del bloque `const dayTotals = {...}` y los cálculos de colesterol/agua, agregá:
```ts
  const goalResult = goalInput
    ? computeNutritionGoal({
        sex: profile?.sex, age: profile?.age, heightCm: profile?.heightCm, weightKg,
        activityLevel: profile?.activityLevel,
        objective: goalInput.objective, rateKgPerWeek: goalInput.rateKgPerWeek, manualKcal: goalInput.manualKcal,
      })
    : null;
  const goalView = goalResult
    ? buildGoalView(goalResult, { kcal: dayTotals.kcal, protein_g: dayTotals.p, carbs_g: dayTotals.c, fat_g: dayTotals.g })
    : null;
```

- [ ] **Step 4: Reemplazar el encabezado de la tarjeta de totales**

Buscá, dentro de la `View` de "Totales del día", estas dos líneas:
```tsx
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{dayTotals.kcal} kcal</Text>
        <Text style={{ color: colors.textMuted }}>P {Math.round(dayTotals.p)}g · C {Math.round(dayTotals.c)}g · G {Math.round(dayTotals.g)}g</Text>
```
y reemplazalas por (bloque con meta si hay, si no el fallback de siempre):
```tsx
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          {goalView?.status === "ok" ? (
            <View>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{goalView.kcal!.comido} / {goalView.kcal!.meta} kcal</Text>
              <Text style={{ color: goalView.kcal!.restante < 0 ? colors.warning : colors.textMuted }}>
                Restante {goalView.kcal!.restante} kcal
              </Text>
            </View>
          ) : (
            <View>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{dayTotals.kcal} kcal</Text>
              <Text style={{ color: colors.textMuted }}>P {Math.round(dayTotals.p)}g · C {Math.round(dayTotals.c)}g · G {Math.round(dayTotals.g)}g</Text>
            </View>
          )}
          <Pressable onPress={() => router.push("/nutricion/objetivo")}>
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "600" }}>Objetivo ⚙</Text>
          </Pressable>
        </View>
        {goalView?.status === "ok" && (
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            {goalView.macros!.map((m) => (
              <View key={m.key} style={{ gap: 2 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{m.label} {m.comido} / {m.meta} g · resta {m.restante}</Text>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
                  <View style={{ width: `${m.pct}%`, height: 6, backgroundColor: colors.accent }} />
                </View>
              </View>
            ))}
          </View>
        )}
        {goalView?.status === "incomplete" && (
          <Pressable onPress={() => router.push("/nutricion/objetivo")} style={{ marginTop: spacing.xs }}>
            <Text style={{ color: colors.accentText, fontSize: 12 }}>Definí tu objetivo / completá tu perfil para ver tu meta →</Text>
          </Pressable>
        )}
```
(Los bloques de micros y colesterol que siguen dentro de la tarjeta quedan igual, debajo.)

- [ ] **Step 5: Typecheck + sweep de tests**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.
Run: `cd mobile && npm test -- --runInBand`
Expected: verde (el flake pre-existente `generando.test.tsx` se ignora si aparece).

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(tabs)/nutricion.tsx"
git commit -S -m "feat(mobile): tab Nutrición muestra Meta/Comido/Restante + barras por macro"
```

---

## Self-Review

**Spec coverage:**
- Bloque 1 (activityLevel en perfil) → Task 1 (schema) + Task 6 (UI). ✅
- Bloque 2 (objetivo store) → Task 1 (schema) + Task 3 (tabla/migración) + Task 4 (repo/rutas). ✅
- Bloque 3 (cálculo puro) → Task 2. ✅
- Bloque 4 (backend store de inputs, no computa) → Task 3/4. ✅
- Bloque 5 (móvil computa: api, perfil, objetivo screen, tab, goalView) → Tasks 5–9. ✅
- Testabilidad: shared goal.test (Task 2), backend repo+rutas (Task 4), mobile goalView (Task 7). ✅
- Entrega: shared+backend (migración 0014) + mobile todo JS → OTA vc10. Sin dep nativa. ✅

**Placeholder scan:** sin TBD/TODO; todo el código inline. Nota deliberada en Task 2 Step 5 sobre verificar el redondeo BMR/TDEE (la fórmula manda; ajustar el número esperado del test al real).

**Type consistency:**
- `NutritionGoalInput { objective, rateKgPerWeek, manualKcal? }` — igual en shared (Task 1), repo (Task 4), api (Task 5), tab/objetivo (Tasks 8/9).
- `computeNutritionGoal(args) → NutritionGoalResult` — firma/consumo consistentes (Task 2) en objetivo (Task 8) y tab (Task 9) y goalView (Task 7).
- `ActivityLevel`/`Sex` exportados de `shared/schemas/profile` (Task 1) y usados por `goal.ts` (Task 2) y el perfil (Task 6).
- Peso resuelto igual en objetivo (Task 8) y tab (Task 9): `getLatestMetrics().weight_kg?.value ?? profile.weightKg`.

**Riesgos para el ejecutor:**
- Task 2 Step 5: los esperados de BMR/TDEE dependen de si `tdee` usa el `bmr` redondeado o crudo. La implementación usa `bmr` **crudo** para `tdee`. Recalcular y fijar los esperados del test a lo que devuelve la fórmula (no tocar la fórmula).
- Task 4: el `fakeDb` de rutas necesita `query.nutritionGoal.findFirst` **y** que `insert().values()` soporte `.onConflictDoUpdate`. Ambos van en el Step 5.
- Task 9: no romper la carga de meals/water existente (una sola declaración de `from`/`to`; el `noon` sigue calculándose aparte). Los bloques de micros/colesterol/tarjeta de líquido quedan intactos.
- `router.push("/nutricion/objetivo")` y `.../perfil`: verificar el tipado de rutas de expo-router; si se queja, castear como hacen otros `router.push` del repo.
