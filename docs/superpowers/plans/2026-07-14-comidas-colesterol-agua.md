# Comidas — colesterol + agua — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar colesterol (`cholesterol_mg`) y aporte de agua (`water_ml`) a los alimentos/comidas, mostrar el colesterol del día con referencia 300 mg, y un tracker de líquido del día (aporte de alimentos + agua tomada con botón de vaso/ml libre).

**Architecture:** Dos campos opcionales por-100 nuevos que reutilizan la máquina de micros ya existente (schema shared → escalado `foodMacrosForQuantity` → snapshot backend → totales mobile). Más un store nuevo chico `water_log` (tabla + `POST/GET/DELETE /nutrition/water`) para el agua tomada. Backend + una migración; mobile todo JS (OTA a vc10).

**Tech Stack:** Bun monorepo. `shared` (Zod), `backend` (Hono + Drizzle + Postgres, tests con `bun:test`), `mobile` (Expo/expo-router, tests con jest). Migraciones drizzle-kit en `backend/drizzle/`.

**Referencia:** spec `docs/superpowers/specs/2026-07-14-comidas-colesterol-agua-design.md`.

## File structure

- `shared/src/schemas/nutrition.ts` — 2 campos en `microsPer100`; schemas `WaterLogInput`/`WaterLog`.
- `shared/src/nutrition/macros.ts` — escalar los 2 campos.
- `backend/src/db/schema.ts` — 2 columnas en `food` y `meal_item`; tabla `water_log`.
- `backend/drizzle/0013_*.sql` — migración generada.
- `backend/src/nutrition/repository.ts` — mapping de los 2 campos + `insertWater`/`listWater`/`deleteWater`.
- `backend/src/routes/nutrition.ts` — endpoints `/water`.
- `backend/src/ai/nutrition.ts` — prompt: colesterol + agua.
- `mobile/src/api/nutrition.ts` — `logWater`/`listWater`/`deleteWater`.
- `mobile/src/nutrition/mealForm.ts` — `mealTotals` suma los 2 campos.
- `mobile/app/nutricion/agregar-alimento.tsx` — inputs colesterol + agua.
- `mobile/src/theme/tokens.ts` — token `warning` (ámbar).
- `mobile/app/(tabs)/nutricion.tsx` — línea de colesterol + tarjeta de líquido.

---

### Task 1: Shared — campos `cholesterol_mg` + `water_ml` y su escalado

**Files:**
- Modify: `shared/src/schemas/nutrition.ts`
- Modify: `shared/src/nutrition/macros.ts`
- Test: `shared/src/nutrition/macros.test.ts`

- [ ] **Step 1: Escribir el test que falla (escalado de los 2 campos)**

En `shared/src/nutrition/macros.test.ts`, agregá al final:

```ts
const yema = {
  basis: "per_100g" as const, kcal: 322, protein_g: 16, carbs_g: 3.6, fat_g: 27, unitWeightG: 17,
  cholesterol_mg: 1085, water_ml: 50,
};

test("escala colesterol y agua cuando el alimento los tiene", () => {
  const r = foodMacrosForQuantity(yema, 100, "g");
  expect(r.cholesterol_mg).toBe(1085);
  expect(r.water_ml).toBe(50);
  const half = foodMacrosForQuantity(yema, 50, "g");
  expect(half.cholesterol_mg).toBe(542.5); // 1085 * 0.5
  expect(half.water_ml).toBe(25);
});

test("colesterol y agua ausentes → null (alimento legacy)", () => {
  const legacy = { basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: null };
  const r = foodMacrosForQuantity(legacy, 100, "g");
  expect(r.cholesterol_mg).toBeNull();
  expect(r.water_ml).toBeNull();
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd shared && bun test src/nutrition/macros.test.ts`
Expected: FAIL — `cholesterol_mg`/`water_ml` no existen en `ScaledMacros` (o son `undefined`, no `null`).

- [ ] **Step 3: Agregar los campos al schema**

En `shared/src/schemas/nutrition.ts`, en el objeto `microsPer100`, agregá las 2 líneas nuevas al final:

```ts
const microsPer100 = {
  saturated_fat_g: z.number().nonnegative().nullable().optional(),
  sugars_g: z.number().nonnegative().nullable().optional(),
  fiber_g: z.number().nonnegative().nullable().optional(),
  salt_g: z.number().nonnegative().nullable().optional(),
  cholesterol_mg: z.number().nonnegative().nullable().optional(), // mg (no g)
  water_ml: z.number().nonnegative().nullable().optional(),        // aporte de agua por 100g/ml
};
```

- [ ] **Step 4: Escalar los campos en `foodMacrosForQuantity`**

En `shared/src/nutrition/macros.ts`:

En `interface MacroSource`, agregá tras `salt_g?`:
```ts
  cholesterol_mg?: number | null;
  water_ml?: number | null;
```

En `interface ScaledMacros`, agregá tras `salt_g: number | null;`:
```ts
  cholesterol_mg: number | null;
  water_ml: number | null;
```

En el `return` de `foodMacrosForQuantity`, agregá tras `salt_g: scaleMicro(food.salt_g, factor),`:
```ts
    cholesterol_mg: scaleMicro(food.cholesterol_mg, factor),
    water_ml: scaleMicro(food.water_ml, factor),
```

- [ ] **Step 5: Correr el test para verlo pasar**

Run: `cd shared && bun test src/nutrition/macros.test.ts`
Expected: PASS (todos, incluidos los nuevos).

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas/nutrition.ts shared/src/nutrition/macros.ts shared/src/nutrition/macros.test.ts
git commit -S -m "feat(shared): campos cholesterol_mg + water_ml por 100 y su escalado"
```

---

### Task 2: Shared — schemas `WaterLogInput` / `WaterLog`

**Files:**
- Modify: `shared/src/schemas/nutrition.ts`
- Test: `shared/src/schemas/nutrition.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `shared/src/schemas/nutrition.test.ts`, agregá al final (ajustá el import de arriba para incluir `WaterLogInputSchema`, `WaterLogSchema`):

```ts
test("WaterLogInputSchema acepta ml positivo + loggedAt, rechaza ml <= 0", () => {
  expect(WaterLogInputSchema.safeParse({ ml: 250, loggedAt: 1_700_000_000_000 }).success).toBe(true);
  expect(WaterLogInputSchema.safeParse({ ml: 0, loggedAt: 1 }).success).toBe(false);
  expect(WaterLogInputSchema.safeParse({ ml: -5, loggedAt: 1 }).success).toBe(false);
});

test("WaterLogSchema exige id uuid", () => {
  const ok = WaterLogSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", ml: 250, loggedAt: 1 });
  expect(ok.success).toBe(true);
  expect(WaterLogSchema.safeParse({ id: "no-uuid", ml: 250, loggedAt: 1 }).success).toBe(false);
});
```

Asegurate que la primera línea del archivo importe los nuevos símbolos, p.ej.:
```ts
import { WaterLogInputSchema, WaterLogSchema /* , …los que ya estaban */ } from "./nutrition";
```
(si el test importa con `import * as N` o similar, adaptá; el patrón real del archivo manda.)

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd shared && bun test src/schemas/nutrition.test.ts`
Expected: FAIL — `WaterLogInputSchema`/`WaterLogSchema` no existen.

- [ ] **Step 3: Agregar los schemas**

En `shared/src/schemas/nutrition.ts`, al final del archivo:

```ts
// Agua tomada (registro rápido): ml + momento. El aporte de agua de los alimentos va aparte (water_ml del ítem).
export const WaterLogInputSchema = z.object({
  ml: z.number().positive(),
  loggedAt: z.number().int(),
});
export type WaterLogInput = z.infer<typeof WaterLogInputSchema>;

export const WaterLogSchema = WaterLogInputSchema.extend({
  id: z.string().uuid(),
});
export type WaterLog = z.infer<typeof WaterLogSchema>;
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd shared && bun test src/schemas/nutrition.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar que shared re-exporta los tipos**

Los tipos `Food`/`Meal` ya se importan desde `@pulsia/shared`, así que el barrel re-exporta `schemas/nutrition`. Confirmá que `WaterLog` es visible:

Run: `cd shared && bunx tsc --noEmit`
Expected: sin errores. (Si hubiera un barrel que lista exports uno por uno, agregá `WaterLog`/`WaterLogInput`/`WaterLogInputSchema`/`WaterLogSchema` ahí — buscá dónde se exporta `MealSchema`.)

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas/nutrition.ts shared/src/schemas/nutrition.test.ts
git commit -S -m "feat(shared): schemas WaterLogInput/WaterLog para el agua tomada"
```

---

### Task 3: Backend — columnas + tabla `water_log` + migración

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0013_*.sql` (generada)

- [ ] **Step 1: Agregar las columnas a `food` y `meal_item`**

En `backend/src/db/schema.ts`, en `export const food = pgTable("food", {...})`, tras `saltG: real("salt_g"),`:
```ts
  cholesterolMg: real("cholesterol_mg"), // nullable
  waterMl: real("water_ml"),             // nullable
```

En `export const mealItem = pgTable("meal_item", {...})`, tras `saltG: real("salt_g"),`:
```ts
  cholesterolMg: real("cholesterol_mg"),
  waterMl: real("water_ml"),
```

- [ ] **Step 2: Agregar la tabla `water_log`**

En `backend/src/db/schema.ts`, después del bloque de `mealItemRelations` (o junto a las otras tablas de nutrición), agregá:
```ts
export const waterLog = pgTable("water_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  ml: real("ml").notNull(),
  loggedAt: bigint("logged_at", { mode: "number" }).notNull(), // epoch ms
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUserTime: index("water_log_user_time_idx").on(t.userId, t.loggedAt),
}));
```
(`pgTable`, `uuid`, `real`, `bigint`, `timestamp`, `index` ya están importados arriba del archivo.)

- [ ] **Step 3: Generar la migración**

Run: `cd backend && bun run db:generate`
Expected: crea `backend/drizzle/0013_*.sql`. NO necesita base de datos (drizzle-kit diffea contra el snapshot en `drizzle/meta`).

- [ ] **Step 4: Revisar la migración generada**

Run: `cat backend/drizzle/0013_*.sql`
Expected: contiene `ALTER TABLE "food" ADD COLUMN "cholesterol_mg"`, `"water_ml"`, lo mismo en `"meal_item"`, `CREATE TABLE ... "water_log"` con `ml`, `logged_at`, y el `CREATE INDEX "water_log_user_time_idx"`. Si drizzle-kit pregunta algo interactivo, no debería (solo add columns/tabla). Si generó dos archivos, está bien igual; el objetivo es que el SQL cubra todo.

- [ ] **Step 5: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: sin errores (las columnas nuevas todavía no se usan; la tabla tampoco).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle
git commit -S -m "feat(backend): columnas cholesterol_mg/water_ml + tabla water_log (migración 0013)"
```

---

### Task 4: Backend — mapping de colesterol/agua en food/meal + snapshot

**Files:**
- Modify: `backend/src/nutrition/repository.ts`
- Test: `backend/src/nutrition/repository.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/src/nutrition/repository.test.ts`, extendé el objeto `banana` (arriba) agregando las 2 propiedades:
```ts
const banana = {
  id: "11111111-1111-4111-8111-111111111111", userId: "u", name: "Banana", basis: "per_100g",
  kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, unitWeightG: 120, source: "estimate", createdAt: new Date(0),
  saturatedFatG: 0.1, sugarsG: 12, fiberG: 2.6, saltG: 0,
  cholesterolMg: 0, waterMl: 75,
};
```
Y agregá al final del archivo:
```ts
test("toFood mapea colesterol y agua (y null si faltan)", () => {
  expect(toFood(banana as any)).toMatchObject({ cholesterol_mg: 0, water_ml: 75 });
  const legacy = { ...banana, cholesterolMg: null, waterMl: null };
  expect(toFood(legacy as any)).toMatchObject({ cholesterol_mg: null, water_ml: null });
});

test("snapshotItems escala y persiste colesterol y agua", () => {
  const items = snapshotItems(
    [{ foodId: banana.id, quantity: 1, quantityUnit: "unit" }],
    new Map([[banana.id, banana as any]]),
  );
  // 1 unidad = 120g → factor 1.2 ; agua 75*1.2 = 90
  expect(items[0]).toMatchObject({ cholesterolMg: 0, waterMl: 90 });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd backend && bun test src/nutrition/repository.test.ts`
Expected: FAIL — `toFood` no devuelve `cholesterol_mg`/`water_ml`; `snapshotItems` no devuelve `cholesterolMg`/`waterMl`.

- [ ] **Step 3: Mapear en `toFood`**

En `backend/src/nutrition/repository.ts`, en `toFood`, dentro del objeto devuelto, tras `fiber_g: row.fiberG ?? null, salt_g: row.saltG ?? null,`:
```ts
    cholesterol_mg: row.cholesterolMg ?? null, water_ml: row.waterMl ?? null,
```

- [ ] **Step 4: Mapear en `toMeal`**

En `toMeal`, dentro del `.map` de items, tras `fiber_g: it.fiberG ?? null, salt_g: it.saltG ?? null,`:
```ts
      cholesterol_mg: it.cholesterolMg ?? null, water_ml: it.waterMl ?? null,
```

- [ ] **Step 5: Pasar los campos a `foodMacrosForQuantity` y persistir en `snapshotItems`**

En `snapshotItems`, en el objeto que se pasa a `foodMacrosForQuantity`, tras `saturated_fat_g: f.saturatedFatG, sugars_g: f.sugarsG, fiber_g: f.fiberG, salt_g: f.saltG,`:
```ts
          cholesterol_mg: f.cholesterolMg, water_ml: f.waterMl,
```
Y en el objeto que devuelve el `.map`, tras `saturatedFatG: m.saturated_fat_g, sugarsG: m.sugars_g, fiberG: m.fiber_g, saltG: m.salt_g,`:
```ts
      cholesterolMg: m.cholesterol_mg, waterMl: m.water_ml,
```

- [ ] **Step 6: Persistir en `insertFood` y `updateFood`**

En `insertFood`, en el objeto de `.values({...})`, tras `fiberG: input.fiber_g ?? null, saltG: input.salt_g ?? null,`:
```ts
    cholesterolMg: input.cholesterol_mg ?? null, waterMl: input.water_ml ?? null,
```
En `updateFood`, en el objeto de `.set({...})`, tras `fiberG: input.fiber_g ?? null, saltG: input.salt_g ?? null,`:
```ts
    cholesterolMg: input.cholesterol_mg ?? null, waterMl: input.water_ml ?? null,
```

- [ ] **Step 7: Correr los tests para verlos pasar**

Run: `cd backend && bun test src/nutrition/repository.test.ts`
Expected: PASS (todos).

- [ ] **Step 8: Commit**

```bash
git add backend/src/nutrition/repository.ts backend/src/nutrition/repository.test.ts
git commit -S -m "feat(backend): snapshot y mapping de cholesterol_mg/water_ml en food y meal_item"
```

---

### Task 5: Backend — repo del agua + endpoints `/water`

**Files:**
- Modify: `backend/src/nutrition/repository.ts`
- Modify: `backend/src/routes/nutrition.ts`
- Test: `backend/src/nutrition/repository.test.ts`
- Test: `backend/src/routes/nutrition.test.ts`

- [ ] **Step 1: Test de repo que falla (insert/delete del agua)**

En `backend/src/nutrition/repository.test.ts`, agregá al final:
```ts
import { insertWater, deleteWater } from "./repository";

test("insertWater mapea ml + loggedAt y devuelve WaterLog", async () => {
  const inserted: any[] = [];
  const db: any = {
    insert: () => ({ values(v: any) { const row = { id: "w1", ...v }; inserted.push(row); const p: any = Promise.resolve([row]); p.returning = async () => [row]; return p; } }),
  };
  const w = await insertWater(db, "u", { ml: 250, loggedAt: 1700 });
  expect(w).toEqual({ id: "w1", ml: 250, loggedAt: 1700 });
  expect(inserted[0]).toMatchObject({ userId: "u", ml: 250, loggedAt: 1700 });
});

test("deleteWater devuelve true si borró, false si no", async () => {
  const dbHit: any = { delete: () => ({ where: () => { const p: any = Promise.resolve(undefined); p.returning = async () => [{ id: "w1" }]; return p; } }) };
  const dbMiss: any = { delete: () => ({ where: () => { const p: any = Promise.resolve(undefined); p.returning = async () => []; return p; } }) };
  expect(await deleteWater(dbHit, "u", "w1")).toBe(true);
  expect(await deleteWater(dbMiss, "u", "w1")).toBe(false);
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `cd backend && bun test src/nutrition/repository.test.ts`
Expected: FAIL — `insertWater`/`deleteWater` no existen.

- [ ] **Step 3: Implementar las funciones del agua**

En `backend/src/nutrition/repository.ts`:

Agregá `waterLog` al import de tablas y `desc` NO hace falta; asegurá `asc`, `gte`, `lte`, `and`, `eq` (ya están). Cambiá:
```ts
import { food, meal, mealItem } from "../db/schema";
```
por:
```ts
import { food, meal, mealItem, waterLog } from "../db/schema";
```
Y agregá el tipo del shared al import de tipos:
```ts
import type { Food, FoodInput, Meal, MealItem, MealItemInput, MealInput, QuantityUnit, WaterLog, WaterLogInput } from "@pulsia/shared";
```

Al final del archivo:
```ts
// ---- Water log (agua tomada) ----
type WaterRow = typeof waterLog.$inferSelect;
function toWaterLog(row: WaterRow): WaterLog {
  return { id: row.id, ml: row.ml, loggedAt: row.loggedAt };
}

export async function insertWater(db: Db, userId: string, input: WaterLogInput): Promise<WaterLog> {
  const [row] = await db.insert(waterLog).values({ userId, ml: input.ml, loggedAt: input.loggedAt }).returning();
  return toWaterLog(row);
}

export async function listWater(db: Db, userId: string, from?: number, to?: number): Promise<WaterLog[]> {
  const conds = [eq(waterLog.userId, userId)];
  if (from != null) conds.push(gte(waterLog.loggedAt, from));
  if (to != null) conds.push(lte(waterLog.loggedAt, to));
  const rows = await db.select().from(waterLog).where(and(...conds)).orderBy(asc(waterLog.loggedAt));
  return rows.map(toWaterLog);
}

export async function deleteWater(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(waterLog).where(and(eq(waterLog.id, id), eq(waterLog.userId, userId))).returning({ id: waterLog.id });
  return rows.length > 0;
}
```

- [ ] **Step 4: Correr el test de repo para verlo pasar**

Run: `cd backend && bun test src/nutrition/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Test de rutas que falla**

En `backend/src/routes/nutrition.test.ts`, primero extendé el helper `fakeDb` para que `select().orderBy()` pueda devolver filas de agua: cambiá la línea de `select:`
```ts
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => opts.foods ?? [], then: (r: any) => r(opts.foods ?? []) }) }) }),
```
por:
```ts
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => opts.water ?? opts.foods ?? [], then: (r: any) => r(opts.foods ?? []) }) }) }),
```
Y agregá al final del archivo:
```ts
test("POST /nutrition/water registra agua y devuelve la fila", async () => {
  const db = fakeDb();
  const app = createApp(deps(db));
  const res = await app.request("/nutrition/water", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ml: 250, loggedAt: 1_700_000_000_000 }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ml: 250, loggedAt: 1_700_000_000_000 });
});

test("POST /nutrition/water rechaza ml <= 0", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/water", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ml: 0, loggedAt: 1 }),
  });
  expect(res.status).toBe(400);
});

test("GET /nutrition/water lista las cargas del rango", async () => {
  const db = fakeDb({ water: [{ id: "w1", ml: 250, loggedAt: 1_700_000_000_000 }] });
  const res = await createApp(deps(db)).request("/nutrition/water?from=0&to=9999999999999");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([{ id: "w1", ml: 250, loggedAt: 1_700_000_000_000 }]);
});

test("DELETE /nutrition/water/:id → 200", async () => {
  const res = await createApp(deps(fakeDb())).request("/nutrition/water/11111111-1111-4111-8111-111111111111", { method: "DELETE" });
  expect(res.status).toBe(200);
});
```

- [ ] **Step 6: Correr el test de rutas para verlo fallar**

Run: `cd backend && bun test src/routes/nutrition.test.ts`
Expected: FAIL — las rutas `/water` no existen (404).

- [ ] **Step 7: Agregar las rutas**

En `backend/src/routes/nutrition.ts`:

Sumá al import del schema:
```ts
import { FoodInputSchema, MealInputSchema, WaterLogInputSchema } from "@pulsia/shared";
```
Sumá al import del repo `insertWater, listWater, deleteWater`:
```ts
import {
  insertFood, listFoods, getFood, updateFood, deleteFood,
  createMeal, listMeals, updateMeal, deleteMeal, getMealById,
  insertWater, listWater, deleteWater,
  MealValidationError,
} from "../nutrition/repository";
```
Antes del `return r;` final, agregá:
```ts
  // ---- Water log (agua tomada) ----
  r.post("/water", async (c) => {
    const parsed = WaterLogInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Registro de agua inválido", detail: parsed.error.issues }, 400);
    return c.json(await insertWater(deps.db, c.get("userId"), parsed.data));
  });

  r.get("/water", async (c) => {
    const from = parseQueryNumber(c.req.query("from"));
    const to = parseQueryNumber(c.req.query("to"));
    return c.json(await listWater(deps.db, c.get("userId"), from, to));
  });

  r.delete("/water/:id", async (c) => {
    const ok = await deleteWater(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrado" }, 404);
  });
```

- [ ] **Step 8: Correr ambos suites para verlos pasar**

Run: `cd backend && bun test src/routes/nutrition.test.ts src/nutrition/repository.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/nutrition/repository.ts backend/src/nutrition/repository.test.ts backend/src/routes/nutrition.ts backend/src/routes/nutrition.test.ts
git commit -S -m "feat(backend): endpoints POST/GET/DELETE /nutrition/water"
```

---

### Task 6: Backend — prompt de IA para colesterol + agua

**Files:**
- Modify: `backend/src/ai/nutrition.ts`
- Test: `backend/src/ai/nutrition.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `backend/src/ai/nutrition.test.ts`, agregá al final:
```ts
test("el prompt pide colesterol (mg) y aporte de agua", () => {
  const p = buildFoodPrompt();
  expect(p).toMatch(/cholesterol_mg/);
  expect(p).toMatch(/water_ml/);
  expect(p).toMatch(/mg/); // colesterol en mg
  expect(p).toMatch(/agua/i); // aporte de agua
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `cd backend && bun test src/ai/nutrition.test.ts`
Expected: FAIL — el prompt no menciona `cholesterol_mg`/`water_ml`.

- [ ] **Step 3: Extender el prompt**

En `backend/src/ai/nutrition.ts`, dentro del array de `buildFoodPrompt`, insertá estas dos líneas justo después de la línea 3 (la de saturadas/azúcares/fibra/sal), antes de la de `unitWeightG`:
```ts
    "3b. COLESTEROL (`cholesterol_mg`): en MILIGRAMOS por 100 g/ml. Si la etiqueta lo muestra, usá ese valor (convertí si viene por porción). Si estás estimando y es un alimento con colesterol conocido y relevante (huevo, mariscos, vísceras, quesos, carnes, manteca), dá un valor típico; si no tenés certeza, `null`.",
    "3c. AGUA (`water_ml`): SIEMPRE estimá el contenido de agua por 100 g/ml (café con leche ~90, banana ~75, pan ~35, aceite ~0). Es una estimación esperable, no lo dejes en null salvo que sea imposible.",
```

- [ ] **Step 4: Correr para verlo pasar**

Run: `cd backend && bun test src/ai/nutrition.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/nutrition.ts backend/src/ai/nutrition.test.ts
git commit -S -m "feat(backend): prompt IA extrae colesterol (mg) y estima aporte de agua"
```

---

### Task 7: Mobile — cliente API del agua

**Files:**
- Modify: `mobile/src/api/nutrition.ts`

- [ ] **Step 1: Agregar las 3 funciones**

En `mobile/src/api/nutrition.ts`:

Ampliá el import de tipos:
```ts
import type { Food, FoodInput, FoodExtraction, Meal, MealInput, WaterLog, WaterLogInput } from "@pulsia/shared";
```
Antes de `async function errorMessage(...)`, agregá:
```ts
export async function logWater(baseUrl: string, input: WaterLogInput): Promise<WaterLog> {
  const res = await apiFetch(baseUrl, "/nutrition/water", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo registrar el agua."));
  return (await res.json()) as WaterLog;
}

export async function listWater(baseUrl: string, from: number, to: number): Promise<WaterLog[]> {
  const res = await apiFetch(baseUrl, `/nutrition/water?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el agua."));
  return (await res.json()) as WaterLog[];
}

export async function deleteWater(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/nutrition/water/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo borrar el registro de agua."));
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/nutrition.ts
git commit -S -m "feat(mobile): cliente logWater/listWater/deleteWater"
```

---

### Task 8: Mobile — `mealTotals` suma colesterol + agua

**Files:**
- Modify: `mobile/src/nutrition/mealForm.ts`
- Test: `mobile/__tests__/mealForm.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `mobile/__tests__/mealForm.test.ts`, extendé `banana` y `leche` (arriba) con los 2 campos:
```ts
const banana = { id: "f1", name: "Banana", basis: "per_100g" as const, kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, source: "estimate" as const, createdAt: 0, saturated_fat_g: 0.1, sugars_g: 12, fiber_g: 2.6, salt_g: 0, cholesterol_mg: 0, water_ml: 75 };
const leche = { id: "f2", name: "Leche", basis: "per_100ml" as const, kcal: 42, protein_g: 3.4, carbs_g: 5, fat_g: 1, unitWeightG: null, source: "label" as const, createdAt: 0, saturated_fat_g: 0.6, sugars_g: 5, fiber_g: null, salt_g: 0.1, cholesterol_mg: 10, water_ml: 88 };
```
Y agregá el test:
```ts
test("mealTotals suma colesterol y agua", () => {
  const t = mealTotals([{ food: banana, quantity: 1, unit: "unit" }, { food: leche, quantity: 200, unit: "ml" }]);
  // banana 1u=120g: chol 0, agua 90 ; leche 200ml: chol 20, agua 176
  expect(t.cholesterol_mg).toBeCloseTo(20, 1);
  expect(t.water_ml).toBeCloseTo(266, 0);
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `cd mobile && npm test -- mealForm --runInBand`
Expected: FAIL — `t.cholesterol_mg`/`t.water_ml` son `undefined`.

- [ ] **Step 3: Extender `mealTotals`**

En `mobile/src/nutrition/mealForm.ts`, cambiá la firma del helper `micro` para incluir las 2 claves nuevas:
```ts
  const micro = (key: "saturated_fat_g" | "sugars_g" | "fiber_g" | "salt_g" | "cholesterol_mg" | "water_ml"): number | null =>
    sumNullableMicro(scaled.map((m) => m[key]));
```
Y agregá al objeto devuelto, tras `salt_g: micro("salt_g"),`:
```ts
    cholesterol_mg: micro("cholesterol_mg"),
    water_ml: micro("water_ml"),
```

- [ ] **Step 4: Correr para verlo pasar**

Run: `cd mobile && npm test -- mealForm --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/mealForm.ts mobile/__tests__/mealForm.test.ts
git commit -S -m "feat(mobile): mealTotals suma colesterol y agua"
```

---

### Task 9: Mobile — inputs de colesterol + agua en el form de alimento

**Files:**
- Modify: `mobile/app/nutricion/agregar-alimento.tsx`

- [ ] **Step 1: Agregar los campos al tipo `Form` y a `EMPTY`**

En `mobile/app/nutricion/agregar-alimento.tsx`, en `type Form`, tras `saturated_fat_g: string; sugars_g: string; fiber_g: string; salt_g: string;`:
```ts
  cholesterol_mg: string; water_ml: string;
```
En `const EMPTY: Form = {...}`, tras `saturated_fat_g: "", sugars_g: "", fiber_g: "", salt_g: "",`:
```ts
  cholesterol_mg: "", water_ml: "",
```

- [ ] **Step 2: Precargar en modo edición y tras extraer**

En el bloque `if (foodId)` (dentro del `useEffect`), en el `setForm({...})`, tras `fiber_g: numStr(f.fiber_g), salt_g: numStr(f.salt_g),`:
```ts
            cholesterol_mg: numStr(f.cholesterol_mg), water_ml: numStr(f.water_ml),
```
En `pickAndExtract`, en el `setForm({...})`, tras `fiber_g: numStr(ex.fiber_g), salt_g: numStr(ex.salt_g),`:
```ts
        cholesterol_mg: numStr(ex.cholesterol_mg), water_ml: numStr(ex.water_ml),
```

- [ ] **Step 3: Incluir los campos en el input de `save` + validarlos**

En `save`, en el objeto `input`, tras `fiber_g: optNum(form.fiber_g), salt_g: optNum(form.salt_g),`:
```ts
      cholesterol_mg: optNum(form.cholesterol_mg), water_ml: optNum(form.water_ml),
```
En el `for` de validación de micros opcionales, extendé el array con los 2 campos:
```ts
    for (const [label, v, raw] of [["saturadas", input.saturated_fat_g, form.saturated_fat_g], ["azúcares", input.sugars_g, form.sugars_g], ["fibra", input.fiber_g, form.fiber_g], ["sal", input.salt_g, form.salt_g], ["colesterol", input.cholesterol_mg, form.cholesterol_mg], ["agua", input.water_ml, form.water_ml]] as const) {
```

- [ ] **Step 4: Renderizar los 2 inputs**

En el JSX, después de la línea del sodio derivado (el bloque `{form.salt_g.trim() !== "" && ...}` que termina en `)}`), y antes de `{field("Peso por unidad (opcional)", "unitWeightG", "numeric")}`:
```tsx
      {field(`Colesterol (mg, opcional)`, "cholesterol_mg", "numeric")}
      {field(`Agua (ml por 100${form.basis === "per_100ml" ? "ml" : "g"}, opcional)`, "water_ml", "numeric")}
```

- [ ] **Step 5: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/nutricion/agregar-alimento.tsx
git commit -S -m "feat(mobile): inputs de colesterol (mg) y agua (ml/100) en el alta/edición de alimento"
```

---

### Task 10: Mobile — línea de colesterol + tarjeta de líquido en el tab

**Files:**
- Modify: `mobile/src/theme/tokens.ts`
- Modify: `mobile/app/(tabs)/nutricion.tsx`

- [ ] **Step 1: Agregar el token `warning` (ámbar)**

En `mobile/src/theme/tokens.ts`, dentro de `export const colors = {...}`, tras `danger: "#C0392B", // rojo semántico (errores)`:
```ts
  warning: "#B45309", // ámbar — sobre un límite recomendado (no es un error)
```

- [ ] **Step 2: Importar los helpers/tipos del agua y sumar estado**

En `mobile/app/(tabs)/nutricion.tsx`:

Ampliá el import de la API:
```ts
import { listMeals, deleteMeal, listWater, logWater, deleteWater } from "../../src/api/nutrition";
```
Ampliá el import de tipos:
```ts
import type { Meal, WaterLog } from "@pulsia/shared";
```
Agregá `TextInput` al import de `react-native`:
```ts
import { ScrollView, View, Text, Pressable, Alert, TextInput } from "react-native";
```
Dentro del componente, junto a los otros `useState`:
```ts
  const [water, setWater] = useState<WaterLog[]>([]);
  const [mlInput, setMlInput] = useState("");
```

- [ ] **Step 3: Cargar el agua en `load`**

En la función `load`, dentro del `try`, sumá la carga del agua (usando el mismo `from`/`to`):
```ts
    try {
      const { from, to } = dayBounds(off);
      const [ms, ws] = await Promise.all([listMeals(url, from, to), listWater(url, from, to)]);
      setMeals(ms); setWater(ws); setError(null);
    } catch (e) { setError((e as Error).message); }
```
(Reemplazá el `try { setMeals(await listMeals(url, from, to)); setError(null); } catch ...` existente; notá que ahora `from`/`to` se calculan dentro del try. Quitá la línea previa `const { from, to } = dayBounds(off);` de arriba del try para no duplicar, o dejá una sola declaración — asegurate de no declarar `from`/`to` dos veces.)

- [ ] **Step 4: Calcular totales de colesterol y líquido**

Debajo del bloque `const dayTotals = {...}`, agregá:
```ts
  const cholesterolMg = sumNullableMicro(items.map((it) => it.cholesterol_mg));
  const waterFromFood = sumNullableMicro(items.map((it) => it.water_ml)) ?? 0;
  const waterDrank = water.reduce((a, w) => a + w.ml, 0);
  const liquidTotal = Math.round(waterFromFood + waterDrank);
```

- [ ] **Step 5: Handlers del agua**

Junto a la función `remove`, agregá:
```ts
  function waterLoggedAt(): number { return offset === 0 ? Date.now() : dayBounds(offset).noon; }

  async function addWater(ml: number) {
    if (!baseUrl.current || !Number.isFinite(ml) || ml <= 0) return;
    try { await logWater(baseUrl.current, { ml, loggedAt: waterLoggedAt() }); await load(offset); }
    catch (e) { setError((e as Error).message); }
  }

  async function undoLastWater() {
    if (!baseUrl.current || water.length === 0) return;
    const last = water[water.length - 1]; // listWater viene ordenado asc por loggedAt
    try { await deleteWater(baseUrl.current, last.id); await load(offset); }
    catch (e) { setError((e as Error).message); }
  }
```

- [ ] **Step 6: Mostrar la línea de colesterol en la tarjeta de totales**

Dentro de la `View` de "Totales del día", después del bloque de micros (el `{(dayTotals.sugars_g != null || ...) && (...)}`), agregá:
```tsx
        {cholesterolMg != null && (
          <Text style={{ color: cholesterolMg > 300 ? colors.warning : colors.textMuted, fontSize: 12, marginTop: 2 }}>
            Colesterol {Math.round(cholesterolMg)} / 300 mg
          </Text>
        )}
```

- [ ] **Step 7: Tarjeta de líquido**

Después de la `View` de "Totales del día" (antes de la fila de botones "Nueva comida / Catálogo"), agregá:
```tsx
      {/* Líquido del día */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>💧 Líquido {liquidTotal} ml</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          tomada {Math.round(waterDrank)} + alimentos {Math.round(waterFromFood)}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <Pressable onPress={() => addWater(250)} style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
            <Text style={{ color: colors.accentText, fontWeight: "600" }}>+1 vaso (250 ml)</Text>
          </Pressable>
          <TextInput
            value={mlInput} onChangeText={setMlInput} keyboardType="numeric" placeholder="ml" placeholderTextColor={colors.icon}
            style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }}
          />
          <Pressable onPress={() => { const n = Number(mlInput.replace(",", ".")); if (Number.isFinite(n) && n > 0) { void addWater(n); setMlInput(""); } }}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Agregar</Text>
          </Pressable>
        </View>
        {water.length > 0 && (
          <Pressable onPress={undoLastWater}>
            <Text style={{ color: colors.accentText, fontSize: 12 }}>Deshacer último ({Math.round(water[water.length - 1].ml)} ml)</Text>
          </Pressable>
        )}
      </View>
```

- [ ] **Step 8: Typecheck + sweep de tests mobile**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.
Run: `cd mobile && npm test -- --runInBand`
Expected: verde (el flake pre-existente `generando.test.tsx` se ignora si aparece).

- [ ] **Step 9: Commit**

```bash
git add mobile/src/theme/tokens.ts "mobile/app/(tabs)/nutricion.tsx"
git commit -S -m "feat(mobile): colesterol del día (ref 300 mg) + tarjeta de líquido con botón de agua"
```

---

## Self-Review

**Spec coverage:**
- Campos `cholesterol_mg`/`water_ml` por 100 + escalado → Task 1. ✅
- Store de agua (schemas) → Task 2; (tabla/migración) → Task 3; (repo+rutas) → Task 5. ✅
- Snapshot/mapping en food+meal_item → Task 3 (columnas) + Task 4 (mapping). ✅
- Prompt IA (colesterol mg + agua siempre) → Task 6. ✅
- Cliente mobile del agua → Task 7. ✅
- `mealTotals` → Task 8. ✅
- Inputs en el form de alimento → Task 9. ✅
- Línea de colesterol con ref 300 mg (ámbar si >300) + tarjeta de líquido (aporte+tomada, +1 vaso, ml libre, deshacer último) → Task 10. ✅
- Entrega: backend+migración deployan; mobile todo JS → OTA vc10 (`784872cb…`). Sin dep nativa nueva (TextInput/Pressable son RN puro). ✅

**Placeholder scan:** sin TBD/TODO; todo el código está inline.

**Type consistency:**
- `cholesterol_mg`/`water_ml` (snake, shared) ↔ `cholesterolMg`/`waterMl` (camel, columnas drizzle) — consistente en toFood/toMeal/snapshotItems/insertFood/updateFood (Task 4) y schema (Task 3).
- `WaterLog { id, ml, loggedAt }` — mismo shape en shared (Task 2), `toWaterLog` (Task 5), cliente mobile (Task 7), estado del tab (Task 10).
- `insertWater/listWater/deleteWater` — firmas iguales en repo (Task 5) y uso en rutas (Task 5) y mobile (Task 7/10).
- `logWater(baseUrl, { ml, loggedAt })` — el input matchea `WaterLogInput`.

**Notas de riesgo para el ejecutor:**
- En Task 10 Step 3, cuidar de NO declarar `from`/`to` dos veces (mover el `dayBounds(off)` adentro del try). El `noon` para el navegador de fecha se sigue calculando aparte con `const { noon } = dayBounds(offset);` como ya estaba.
- `sumNullableMicro` ya está importado en `nutricion.tsx` (se usa para los micros del día) — no re-importar.
- La migración (Task 3) se aplica sola en el deploy de la Pi; no hay Postgres local (los tests usan fakeDb), así que NO correr `db:migrate` localmente.
