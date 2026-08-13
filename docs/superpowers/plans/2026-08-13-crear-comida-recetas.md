# Crear comida (recetas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear una receta reutilizable (ingredientes + pesos) que queda guardada como un `Food` per-100g del catálogo, con peso cocido opcional; registrar una porción reusa el flujo "+ nueva comida" existente.

**Architecture:** Una receta ES un `Food` (`basis: per_100g`, `sourceMacros: "recipe"`) con una columna JSONB `recipe` que guarda la composición viva `{items, cookedWeightG}`. La derivación receta→per-100g es una función pura en `shared` (usada por el constructor móvil para el preview y para armar el `FoodInput`). El backend persiste el `recipe` JSONB y la per-100g ya calculada — igual que hoy `POST /foods` confía en los macros que manda el cliente en el alta normal.

**Tech Stack:** TypeScript, Zod (shared), Drizzle + Postgres + Hono (backend, `bun test`), Expo Router + React Native (mobile, `jest`).

---

## File Structure

- `shared/src/schemas/nutrition.ts` — MODIFY: `RecipeItemInputSchema`, `RecipeSchema`, `"recipe"` en `SourceMacrosSchema`, `recipe` en `FoodInputSchema`.
- `shared/src/nutrition/recipe.ts` — CREATE: `deriveRecipe()` puro (receta → totales + per-100g).
- `shared/src/nutrition/recipe.test.ts` — CREATE.
- `shared/src/index.ts` — MODIFY: exportar `./nutrition/recipe`.
- `backend/src/db/schema.ts` — MODIFY: columna `recipe` jsonb en `food`.
- `backend/drizzle/0028_*.sql` — GENERATED por drizzle-kit.
- `backend/src/nutrition/repository.ts` — MODIFY: threading de `recipe` en `toFood`/`insertFood`/`updateFoodRow`.
- `backend/src/nutrition/repository.test.ts` — MODIFY: round-trip de un recipe-food.
- `mobile/src/nutrition/recipeForm.ts` — CREATE: `recipeTotals()` + `buildRecipeFoodInput()` (reusa `MealRow`).
- `mobile/__tests__/recipeForm.test.ts` — CREATE.
- `mobile/app/nutricion/crear-comida.tsx` — CREATE: pantalla constructor (+ edición vía `?id=`).
- `mobile/app/nutricion/catalogo.tsx` — MODIFY: botón "Crear comida".
- `mobile/app/nutricion/alimento.tsx` — MODIFY: "Editar" de una receta rutea al constructor.
- `mobile/src/nutrition/SourceChip.tsx` — MODIFY: etiqueta "receta" para `sourceMacros: "recipe"`.

---

## Task 1: Schema shared — `recipe` + fuente `"recipe"`

**Files:**
- Modify: `shared/src/schemas/nutrition.ts`
- Test: `shared/src/schemas/nutrition.test.ts`

- [ ] **Step 1: Write the failing test**

Agregar al final de `shared/src/schemas/nutrition.test.ts`:

```ts
import {
  SourceMacrosSchema,
  FoodInputSchema,
  RecipeSchema,
} from "./nutrition";

test("SourceMacrosSchema acepta 'recipe'", () => {
  expect(SourceMacrosSchema.parse("recipe")).toBe("recipe");
});

test("RecipeSchema exige al menos un ítem y cookedWeightG nullable", () => {
  const ok = RecipeSchema.parse({
    items: [{ foodId: "11111111-1111-1111-1111-111111111111", quantity: 150, unit: "g" }],
    cookedWeightG: null,
  });
  expect(ok.items).toHaveLength(1);
  expect(() => RecipeSchema.parse({ items: [], cookedWeightG: null })).toThrow();
  expect(() => RecipeSchema.parse({ items: [{ foodId: "11111111-1111-1111-1111-111111111111", quantity: 150, unit: "g" }], cookedWeightG: 0 })).toThrow();
});

test("FoodInputSchema acepta recipe opcional y lo omite cuando no está", () => {
  const base = {
    name: "Cazuela de pollo", basis: "per_100g" as const,
    kcal: 120, protein_g: 10, carbs_g: 5, fat_g: 6,
    unitWeightG: null, sourceMacros: "recipe" as const, sourceMicros: null,
  };
  expect(FoodInputSchema.parse(base).recipe).toBeUndefined();
  const withRecipe = FoodInputSchema.parse({
    ...base,
    recipe: { items: [{ foodId: "11111111-1111-1111-1111-111111111111", quantity: 200, unit: "g" }], cookedWeightG: 500 },
  });
  expect(withRecipe.recipe?.cookedWeightG).toBe(500);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && bun test src/schemas/nutrition.test.ts`
Expected: FAIL (`RecipeSchema` no existe / `"recipe"` no es válido en `SourceMacrosSchema`).

- [ ] **Step 3: Write minimal implementation**

En `shared/src/schemas/nutrition.ts`:

1. Cambiar el enum (línea ~17):

```ts
export const SourceMacrosSchema = z.enum(["label", "ai", "manual", "usda", "recipe"]);
```

Y actualizar el comentario de arriba agregando: `` `recipe` = macros COMPUESTOS desde los ingredientes de una receta (no de etiqueta/USDA/IA/manual). ``

2. Antes de `FoodInputSchema` (línea ~92), agregar:

```ts
// Un ingrediente de una receta: referencia a un Food del catálogo + cantidad cruda en su unidad.
export const RecipeItemInputSchema = z.object({
  foodId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: QuantityUnitSchema,
});
export type RecipeItemInput = z.infer<typeof RecipeItemInputSchema>;

// La composición viva de una receta. Se guarda en el Food (JSONB) para poder editar y recalcular.
// cookedWeightG = peso del plato terminado; null = usar la suma de los pesos de los ingredientes.
// El agua agregada/evaporada queda capturada por cookedWeightG cuando el usuario pesa el plato.
export const RecipeSchema = z.object({
  items: z.array(RecipeItemInputSchema).min(1),
  cookedWeightG: z.number().positive().nullable(),
});
export type Recipe = z.infer<typeof RecipeSchema>;
```

3. Reemplazar el alias `FoodInputSchema` (línea ~93) por una extensión:

```ts
// Alta/edición de un alimento del catálogo (lo que confirma el usuario). `recipe` presente = el
// Food es una receta (sus macros/micros per-100g se derivan de los ingredientes); ausente = un
// alimento común. La IA nunca lo emite (FoodExtractionSchema no lo tiene).
export const FoodInputSchema = FoodExtractionSchema.extend({
  recipe: RecipeSchema.nullable().optional(),
});
export type FoodInput = z.infer<typeof FoodInputSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shared && bun test src/schemas/nutrition.test.ts`
Expected: PASS. También correr `cd shared && bun test` para no romper el resto.

- [ ] **Step 5: Commit**

```bash
git add shared/src/schemas/nutrition.ts shared/src/schemas/nutrition.test.ts
git commit -S -m "feat(nutrition): schema de receta (Recipe + sourceMacros 'recipe')"
```

---

## Task 2: `deriveRecipe` puro (shared) + tests

**Files:**
- Create: `shared/src/nutrition/recipe.ts`
- Create: `shared/src/nutrition/recipe.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Crear `shared/src/nutrition/recipe.test.ts`:

```ts
import { test, expect } from "bun:test";
import { deriveRecipe } from "./recipe";

// Pollo (per_100g) con algo de hierro; agua (per_100ml) sin micros.
const pollo = { basis: "per_100g" as const, kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, unitWeightG: null, iron_mg: 1 };
const agua = { basis: "per_100ml" as const, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null };

test("sin cookedWeight: peso efectivo = suma de gramos (ml cuenta como g)", () => {
  const d = deriveRecipe([
    { food: pollo, quantity: 200, unit: "g" },
    { food: agua, quantity: 300, unit: "ml" },
  ], null);
  expect(d.sumGrams).toBe(500);
  expect(d.effectiveWeightG).toBe(500);
  // Total: 2 * 165 = 330 kcal; per 100 g sobre 500 g = 66 kcal.
  expect(d.total.kcal).toBe(330);
  expect(d.per100.kcal).toBe(66);
  // Proteína total 62 g → 12.4 /100g.
  expect(d.per100.protein_g).toBeCloseTo(12.4, 5);
});

test("cookedWeight recalibra la densidad (evaporación concentra)", () => {
  const d = deriveRecipe([{ food: pollo, quantity: 200, unit: "g" }], 100);
  // Mismos nutrientes totales, pero sobre 100 g: 330 kcal /100g.
  expect(d.effectiveWeightG).toBe(100);
  expect(d.per100.kcal).toBe(330);
});

test("micro que NINGÚN ingrediente tiene → null; el que alguno tiene → sumado y escalado", () => {
  const d = deriveRecipe([
    { food: pollo, quantity: 200, unit: "g" },  // iron_mg presente
    { food: agua, quantity: 300, unit: "ml" },  // iron_mg ausente
  ], null);
  // hierro total 2 mg → 0.4 /100g; calcio: nadie lo tiene → null.
  expect(d.per100.iron_mg).toBeCloseTo(0.4, 5);
  expect(d.per100.calcium_mg).toBeNull();
});

test("peso efectivo 0 tira (receta vacía / sin peso)", () => {
  expect(() => deriveRecipe([], null)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && bun test src/nutrition/recipe.test.ts`
Expected: FAIL (`Cannot find module './recipe'`).

- [ ] **Step 3: Write minimal implementation**

Crear `shared/src/nutrition/recipe.ts`:

```ts
import { NUTRIENTS, type NutrientKey } from "./nutrients";
import { foodMacrosForQuantity, sumNutrientByKey, type MacroSource } from "./macros";
import type { QuantityUnit } from "../schemas/nutrition";

export interface RecipeIngredient {
  food: MacroSource;
  quantity: number;
  unit: QuantityUnit;
}

type MacroBlock = { kcal: number; protein_g: number; carbs_g: number; fat_g: number } & Record<NutrientKey, number | null>;

export interface DerivedRecipe {
  sumGrams: number;          // suma de gramos de los ingredientes (ml cuenta como g 1:1)
  effectiveWeightG: number;  // cookedWeightG ?? sumGrams
  total: MacroBlock;         // totales absolutos de toda la receta (para el preview)
  per100: MacroBlock;        // por 100 g (lo que se guarda como Food)
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

// Deriva una receta a sus totales y a los valores por 100 g. Reusa la MISMA fuente de escalado que
// el diario (foodMacrosForQuantity) y la MISMA semántica de null que las sumas del día
// (sumNutrientByKey): un micro que ningún ingrediente tiene queda null, nunca 0.
export function deriveRecipe(ingredients: RecipeIngredient[], cookedWeightG: number | null): DerivedRecipe {
  const scaled = ingredients.map((i) => foodMacrosForQuantity(i.food, i.quantity, i.unit));
  const sumGrams = scaled.reduce((a, m) => a + m.grams, 0);
  const effectiveWeightG = cookedWeightG ?? sumGrams;
  if (effectiveWeightG <= 0) throw new Error("La receta necesita al menos un ingrediente con peso.");
  const factor = 100 / effectiveWeightG;

  const totalKcal = scaled.reduce((a, m) => a + m.kcal, 0);
  const totalProtein = round1(scaled.reduce((a, m) => a + m.protein_g, 0));
  const totalCarbs = round1(scaled.reduce((a, m) => a + m.carbs_g, 0));
  const totalFat = round1(scaled.reduce((a, m) => a + m.fat_g, 0));

  const total = { kcal: totalKcal, protein_g: totalProtein, carbs_g: totalCarbs, fat_g: totalFat } as MacroBlock;
  const per100 = {
    kcal: Math.round(totalKcal * factor),
    protein_g: round1(totalProtein * factor),
    carbs_g: round1(totalCarbs * factor),
    fat_g: round1(totalFat * factor),
  } as MacroBlock;

  for (const n of NUTRIENTS) {
    const sum = sumNutrientByKey(scaled.map((m) => m[n.key]), n.key).value; // null si ninguno tenía dato
    total[n.key] = sum;
    per100[n.key] = sum == null ? null : roundTo(sum * factor, n.decimals);
  }
  return { sumGrams, effectiveWeightG, total, per100 };
}
```

Agregar a `shared/src/index.ts` después de la línea `export * from "./nutrition/nutrientFilter";`:

```ts
export * from "./nutrition/recipe";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shared && bun test src/nutrition/recipe.test.ts && cd ../shared && bun test`
Expected: PASS (toda la suite de shared verde).

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/recipe.ts shared/src/nutrition/recipe.test.ts shared/src/index.ts
git commit -S -m "feat(nutrition): deriveRecipe puro (receta → totales + per-100g)"
```

---

## Task 3: Columna `recipe` jsonb + migración (backend)

**Files:**
- Modify: `backend/src/db/schema.ts:140` (tabla `food`)
- Generated: `backend/drizzle/0028_*.sql`

- [ ] **Step 1: Add the column to the schema**

En `backend/src/db/schema.ts`, dentro de `pgTable("food", …)`, justo antes de `createdAt: timestamp("created_at")…` (línea ~142), agregar:

```ts
  // Composición de una receta: { items:[{foodId,quantity,unit}], cookedWeightG }. null = alimento
  // común (no receta). La per-100g del Food ya está derivada en las columnas de macros/micros; esto
  // guarda la receta viva para poder editarla y recalcular. Ver shared/src/nutrition/recipe.ts.
  recipe: jsonb("recipe"),
```

Verificar que `jsonb` esté importado de `drizzle-orm/pg-core` al tope de `schema.ts` (buscar `jsonb` en los imports; si no está, agregarlo a la lista de imports de `drizzle-orm/pg-core`).

- [ ] **Step 2: Generar la migración**

Run: `cd backend && bunx drizzle-kit generate`
Expected: crea `backend/drizzle/0028_*.sql` con `ALTER TABLE "food" ADD COLUMN "recipe" jsonb;` (y actualiza `backend/drizzle/meta/`).

Verificar el contenido: `cat backend/drizzle/0028_*.sql` → debe ser solo el `ADD COLUMN "recipe" jsonb`. Si arrastró otros cambios no relacionados, descartar y revisar el schema.

- [ ] **Step 3: Aplicar la migración local y verificar**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL bunx drizzle-kit migrate` (o el mecanismo local del proyecto; si los tests levantan su propia DB, saltear y confiar en el Step 4).
Expected: aplica sin error.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -S -m "feat(nutrition): columna recipe jsonb en food (migración 0028)"
```

---

## Task 4: Persistencia del `recipe` en el repositorio (backend)

**Files:**
- Modify: `backend/src/nutrition/repository.ts` (`toFood`, `insertFood`, `updateFoodRow`)
- Test: `backend/src/nutrition/repository.test.ts`

- [ ] **Step 1: Write the failing test**

Agregar a `backend/src/nutrition/repository.test.ts` (seguir el patrón de setup de DB que ya usa el archivo; reusar el helper de inserción de un food que exista arriba). Test:

```ts
test("insertFood/getFood round-trip de una receta (recipe jsonb + sourceMacros 'recipe')", async () => {
  const { db, userId } = await freshDb(); // usar el helper de setup existente del archivo
  const created = await insertFood(db, userId, {
    name: "Cazuela de pollo", basis: "per_100g",
    kcal: 66, protein_g: 12.4, carbs_g: 0, fat_g: 1.4,
    unitWeightG: null, sourceMacros: "recipe", sourceMicros: null,
    iron_mg: 0.4,
    recipe: { items: [{ foodId: created_ingredient_id, quantity: 200, unit: "g" }], cookedWeightG: 500 },
  } as any);
  expect(created.sourceMacros).toBe("recipe");
  expect(created.recipe?.cookedWeightG).toBe(500);
  const fetched = await getFood(db, userId, created.id);
  expect(fetched?.recipe?.items[0].quantity).toBe(200);
});

test("un alimento común NO trae la clave recipe", async () => {
  const { db, userId } = await freshDb();
  const created = await insertFood(db, userId, {
    name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3,
    unitWeightG: 120, sourceMacros: "ai", sourceMicros: "usda",
  } as any);
  expect("recipe" in created).toBe(false);
});
```

> Nota para el implementador: adaptá `freshDb()` / `created_ingredient_id` al setup real del archivo (mirá cómo los otros tests obtienen `db`, `userId` y crean un food previo). Si el archivo usa un `foodId` fijo del ingrediente, reusalo.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/nutrition/repository.test.ts`
Expected: FAIL (`recipe` es `undefined` / no se persiste).

- [ ] **Step 3: Write minimal implementation**

En `backend/src/nutrition/repository.ts`:

1. Import del tipo (línea ~5, agregar `Recipe` a la lista de imports de `@pulsia/shared`):

```ts
import type { Food, FoodInput, Meal, MealItem, MealItemInput, MealInput, NutritionGoalInput, QuantityUnit, Recipe, WaterLog, WaterLogInput } from "@pulsia/shared";
```

2. En `toFood` (línea ~15), agregar `recipe` SOLO cuando existe (así las respuestas de alimentos comunes quedan byte-idénticas y no rompen tests de igualdad exacta):

```ts
export function toFood(row: FoodRow): Food {
  return {
    id: row.id, name: row.name, basis: row.basis as Food["basis"],
    kcal: row.kcal, protein_g: row.proteinG, carbs_g: row.carbsG, fat_g: row.fatG,
    unitWeightG: row.unitWeightG,
    ...nutrientsFromRow(row),
    sourceMacros: row.sourceMacros as Food["sourceMacros"],
    sourceMicros: row.sourceMicros as Food["sourceMicros"],
    usdaFdcId: row.usdaFdcId ?? null,
    createdAt: new Date(row.createdAt).getTime(),
    ...(row.recipe ? { recipe: row.recipe as Recipe } : {}),
  };
}
```

3. En `insertFood` (`.values({…})`, línea ~70), agregar antes de `...nutrientsToColumns(input),`:

```ts
    recipe: input.recipe ?? null,
```

4. En `updateFoodRow` (`.set({…})`, línea ~113), agregar la misma línea:

```ts
    recipe: input.recipe ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/nutrition/repository.test.ts src/nutrition/columns.test.ts src/routes/nutrition.test.ts`
Expected: PASS (el round-trip anda y no se rompió la paridad de columnas ni las rutas de foods).

- [ ] **Step 5: Commit**

```bash
git add backend/src/nutrition/repository.ts backend/src/nutrition/repository.test.ts
git commit -S -m "feat(nutrition): persistir recipe jsonb en insert/update/toFood"
```

---

## Task 5: Helper del constructor (mobile) — `recipeForm.ts`

**Files:**
- Create: `mobile/src/nutrition/recipeForm.ts`
- Create: `mobile/__tests__/recipeForm.test.ts`

- [ ] **Step 1: Write the failing test**

Crear `mobile/__tests__/recipeForm.test.ts`:

```ts
import { recipeTotals, buildRecipeFoodInput } from "../src/nutrition/recipeForm";

const pollo = { id: "f1", name: "Pollo", basis: "per_100g" as const, kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, unitWeightG: null, sourceMacros: "usda" as const, sourceMicros: "usda" as const, createdAt: 0, iron_mg: 1 };
const agua = { id: "f2", name: "Agua", basis: "per_100ml" as const, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, sourceMacros: "manual" as const, sourceMicros: null, createdAt: 0 };

test("recipeTotals expone total y per100 y peso efectivo", () => {
  const t = recipeTotals([
    { food: pollo, quantity: 200, unit: "g" },
    { food: agua, quantity: 300, unit: "ml" },
  ], null);
  expect(t.effectiveWeightG).toBe(500);
  expect(t.total.kcal).toBe(330);
  expect(t.per100.kcal).toBe(66);
});

test("buildRecipeFoodInput arma un FoodInput per-100g con recipe y sourceMacros 'recipe'", () => {
  const input = buildRecipeFoodInput({
    name: "  Cazuela  ",
    rows: [{ food: pollo, quantity: 200, unit: "g" }, { food: agua, quantity: 300, unit: "ml" }],
    cookedWeightG: 500,
  });
  expect(input.name).toBe("Cazuela");
  expect(input.basis).toBe("per_100g");
  expect(input.sourceMacros).toBe("recipe");
  expect(input.sourceMicros).toBeNull();
  expect(input.unitWeightG).toBeNull();
  expect(input.kcal).toBe(66);
  expect(input.recipe?.items).toEqual([
    { foodId: "f1", quantity: 200, unit: "g" },
    { foodId: "f2", quantity: 300, unit: "ml" },
  ]);
  expect(input.recipe?.cookedWeightG).toBe(500);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/recipeForm.test.ts`
Expected: FAIL (`Cannot find module '../src/nutrition/recipeForm'`).

- [ ] **Step 3: Write minimal implementation**

Crear `mobile/src/nutrition/recipeForm.ts`:

```ts
import { deriveRecipe } from "@pulsia/shared";
import type { FoodInput } from "@pulsia/shared";
import type { MealRow } from "./mealForm";

// Reusa MealRow ({food, quantity, unit}) del constructor de comidas: un ingrediente de receta se
// pesa igual que un ítem de una comida.
export function recipeTotals(rows: MealRow[], cookedWeightG: number | null) {
  return deriveRecipe(
    rows.map((r) => ({ food: r.food, quantity: r.quantity, unit: r.unit })),
    cookedWeightG,
  );
}

// Arma el FoodInput que persiste la receta como un Food per-100g. sourceMicros = null: los micros
// son compuestos (no de un único USDA/IA); el chip "receta" de los macros ya comunica la procedencia.
export function buildRecipeFoodInput(args: {
  name: string;
  rows: MealRow[];
  cookedWeightG: number | null;
}): FoodInput {
  const d = recipeTotals(args.rows, args.cookedWeightG);
  return {
    name: args.name.trim(),
    basis: "per_100g",
    ...d.per100, // kcal + protein_g/carbs_g/fat_g + los 30 nutrientes por 100 g
    unitWeightG: null,
    sourceMacros: "recipe",
    sourceMicros: null,
    usdaFdcId: null,
    recipe: {
      items: args.rows.map((r) => ({ foodId: r.food.id, quantity: r.quantity, unit: r.unit })),
      cookedWeightG: args.cookedWeightG,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/recipeForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/recipeForm.ts mobile/__tests__/recipeForm.test.ts
git commit -S -m "feat(nutrition): recipeForm móvil (totales + buildRecipeFoodInput)"
```

---

## Task 6: Chip "receta" en `SourceChip`

**Files:**
- Modify: `mobile/src/nutrition/SourceChip.tsx`
- Test: `mobile/__tests__/` (crear `sourceChip.test.tsx` si no existe uno)

- [ ] **Step 1: Write the failing test**

Crear `mobile/__tests__/sourceChip.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import { SourceChip } from "../src/nutrition/SourceChip";

test("sourceMacros 'recipe' muestra el chip 'receta'", async () => {
  const { getByTestId } = render(<SourceChip sourceMacros="recipe" sourceMicros={null} />);
  const chip = getByTestId("source-chip-recipe");
  expect(chip).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/sourceChip.test.tsx`
Expected: FAIL (no existe la clave `recipe` en `MACROS_LABEL` → TS/render error o testID ausente).

- [ ] **Step 3: Write minimal implementation**

En `mobile/src/nutrition/SourceChip.tsx`:

1. En `MACROS_LABEL` agregar:

```ts
  recipe: "receta",
```

2. En `MACROS_STRONG` agregar (destacada: es una fuente real, un plato que armaste, no una estimación):

```ts
  recipe: true,
```

3. Actualizar el comentario de bloque agregando la línea:
`//                 "recipe" = macros compuestos desde los ingredientes de una receta → chip "receta"`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/sourceChip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/SourceChip.tsx mobile/__tests__/sourceChip.test.tsx
git commit -S -m "feat(nutrition): chip 'receta' en SourceChip"
```

---

## Task 7: Pantalla "Crear comida" (constructor) + edición

**Files:**
- Create: `mobile/app/nutricion/crear-comida.tsx`

Reusa el patrón de `mobile/app/nutricion/nueva-comida.tsx` (buscador de catálogo, filas de ítems con cantidad/unidad, re-fetch del catálogo en `useFocusEffect`), pero produce un Food (create/update) en vez de un Meal, y agrega el campo "peso cocido".

- [ ] **Step 1: Crear la pantalla**

Crear `mobile/app/nutricion/crear-comida.tsx`:

```tsx
import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listFoods, createFood, updateFood, getFood, deleteFood } from "../../src/api/nutrition";
import { allowedUnits, type MealRow } from "../../src/nutrition/mealForm";
import { recipeTotals, buildRecipeFoodInput } from "../../src/nutrition/recipeForm";
import type { Food, QuantityUnit } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { NutrientFlags } from "../../src/nutrition/NutrientFlags";

export default function CrearComidaScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const params = useLocalSearchParams<{ id?: string }>();
  const foodId = params.id;
  const baseUrl = useRef<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<MealRow[]>([]);
  const [cookedWeight, setCookedWeight] = useState(""); // texto; "" = usar suma de ingredientes
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notEditable, setNotEditable] = useState(false);
  const [loading, setLoading] = useState(!!foodId);
  const initedRef = useRef(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      let cat: Food[] = [];
      let catOk = false;
      try { cat = await listFoods(url); setFoods(cat); catOk = true; } catch (e) { setError((e as Error).message); }
      if (foodId && !initedRef.current && catOk) {
        initedRef.current = true;
        try {
          const f = await getFood(url, foodId);
          setName(f.name);
          setCookedWeight(f.recipe?.cookedWeightG != null ? String(f.recipe.cookedWeightG) : "");
          const reconstructed = (f.recipe?.items ?? []).map((it) => {
            const ing = cat.find((c) => c.id === it.foodId);
            return ing && allowedUnits(ing).includes(it.unit)
              ? { food: ing, quantity: it.quantity, unit: it.unit }
              : null;
          });
          if (reconstructed.some((r) => r === null)) setNotEditable(true);
          else setRows(reconstructed as MealRow[]);
        } catch (e) { setError((e as Error).message); initedRef.current = false; }
      }
      setLoading(false);
    })();
  }, [foodId]));

  function addFood(food: Food) {
    const unit = allowedUnits(food)[0];
    setRows((rs) => [...rs, { food, quantity: unit === "unit" ? 1 : 100, unit }]);
    setQ("");
  }
  function setQty(i: number, v: string) {
    const n = Number(v.replace(",", "."));
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, quantity: Number.isNaN(n) ? 0 : n } : r)));
  }
  function setUnit(i: number, unit: QuantityUnit) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, unit } : r)));
  }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  function parsedCookedWeight(): number | null {
    const t = cookedWeight.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function save() {
    setError(null);
    if (notEditable) { setError("Esta receta no se puede editar: uno de sus ingredientes fue borrado del catálogo o cambió de unidad. Borrala y volvé a crearla."); return; }
    if (name.trim() === "") { setError("Ponele un nombre a la comida."); return; }
    if (rows.length === 0) { setError("Agregá al menos un ingrediente."); return; }
    if (rows.some((r) => r.quantity <= 0)) { setError("Los pesos tienen que ser mayores a 0."); return; }
    if (cookedWeight.trim() !== "" && parsedCookedWeight() == null) { setError("El peso cocido tiene que ser un número mayor a 0 (o dejalo vacío)."); return; }
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      const input = buildRecipeFoodInput({ name, rows, cookedWeightG: parsedCookedWeight() });
      if (foodId) await updateFood(baseUrl.current, foodId, input);
      else await createFood(baseUrl.current, input);
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  function confirmDelete() {
    if (!foodId) return;
    Alert.alert("Borrar comida", "¿Borrar esta receta del catálogo?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
        try { await deleteFood(baseUrl.current, foodId); router.back(); }
        catch (e) { setError((e as Error).message); }
      } },
    ]);
  }

  const totals = rows.length > 0 ? recipeTotals(rows, parsedCookedWeight()) : null;
  const matches = q.trim() ? foods.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())) : [];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>Cargando receta…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{foodId ? "Editar comida" : "Crear comida"}</Text>
      {notEditable && (
        <Text style={{ color: colors.danger, fontSize: 13 }}>
          Esta receta no se puede editar: uno de sus ingredientes fue borrado del catálogo o cambió de unidad. Borrala y volvé a crearla.
        </Text>
      )}

      <TextInput value={name} onChangeText={setName} placeholder="Nombre de la comida (ej: Cazuela de pollo)" placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />

      {/* Ingredientes agregados */}
      {rows.map((r, i) => (
        <View key={`${r.food.id}-${i}`} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontWeight: "600", flex: 1 }}>{r.food.name}</Text>
            <Pressable onPress={() => removeRow(i)}><Text style={{ color: colors.danger }}>Quitar</Text></Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <TextInput value={String(r.quantity)} onChangeText={(v) => setQty(i, v)} keyboardType="numeric"
              style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text, width: 80 }} />
            {allowedUnits(r.food).map((u) => (
              <Pressable key={u} onPress={() => setUnit(i, u)} style={{
                paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill,
                backgroundColor: r.unit === u ? colors.accent : colors.surfaceMuted,
              }}>
                <Text style={{ color: r.unit === u ? "#fff" : colors.text }}>{u === "unit" ? "unidad" : u}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {/* Buscador del catálogo */}
      <TextInput value={q} onChangeText={setQ} placeholder="Buscar ingrediente del catálogo…" placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />
      {matches.map((f) => (
        <Pressable key={f.id} onPress={() => addFood(f)} style={{ padding: spacing.sm, backgroundColor: colors.accentSoft, borderRadius: radius.sm }}>
          <Text style={{ color: colors.accentText }}>+ {f.name}</Text>
          <NutrientFlags food={f} />
        </Pressable>
      ))}
      {q.trim() !== "" && matches.length === 0 && (
        <Pressable onPress={() => router.push("/nutricion/agregar-alimento")}>
          <Text style={{ color: colors.accent }}>No está en el catálogo — agregarlo (foto / nombre / USDA)</Text>
        </Pressable>
      )}

      {/* Peso cocido opcional */}
      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>Peso del plato terminado (opcional)</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Pesá la olla/fuente cocida para capturar el agua/caldo que se agrega o evapora. Si lo dejás vacío, se usa la suma de los ingredientes.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <TextInput value={cookedWeight} onChangeText={setCookedWeight} keyboardType="numeric" placeholder="ej: 1200" placeholderTextColor={colors.icon}
            style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text, width: 120 }} />
          <Text style={{ color: colors.textMuted }}>g</Text>
        </View>
      </View>

      {/* Totales + por 100 g */}
      {totals && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>Total: {totals.total.kcal} kcal · {totals.effectiveWeightG} g</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>P {totals.total.protein_g}g · C {totals.total.carbs_g}g · G {totals.total.fat_g}g</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Por 100 g: {totals.per100.kcal} kcal · P {totals.per100.protein_g} C {totals.per100.carbs_g} G {totals.per100.fat_g}</Text>
        </View>
      )}

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={save} disabled={saving || notEditable || rows.length === 0} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving || notEditable || rows.length === 0 ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : foodId ? "Guardar cambios" : "Guardar comida"}</Text>
      </Pressable>
      {foodId && (
        <Pressable onPress={confirmDelete} style={{ backgroundColor: colors.danger, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Borrar comida</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Verificar compilación/typecheck del móvil**

Run: `cd mobile && npx tsc --noEmit`
Expected: sin errores (verifica que `f.recipe`, `createFood`/`updateFood`/`getFood` y `recipeTotals` tipan bien).

- [ ] **Step 3: Commit**

```bash
git add mobile/app/nutricion/crear-comida.tsx
git commit -S -m "feat(nutrition): pantalla 'Crear comida' (constructor de recetas)"
```

---

## Task 8: Entradas de navegación (catálogo + edición de receta)

**Files:**
- Modify: `mobile/app/nutricion/catalogo.tsx` (botón "Crear comida")
- Modify: `mobile/app/nutricion/alimento.tsx:223` (Editar de una receta → constructor)

- [ ] **Step 1: Botón "Crear comida" en el catálogo**

En `mobile/app/nutricion/catalogo.tsx`, junto al botón "+ Agregar alimento" (línea ~91), agregar un segundo botón. Envolver los dos en un `View` con `flexDirection: "row", gap`:

```tsx
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable onPress={() => router.push("/nutricion/agregar-alimento")} style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>+ Agregar alimento</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/nutricion/crear-comida")} style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>+ Crear comida</Text>
        </Pressable>
      </View>
```

(Reemplaza el `Pressable` suelto de "+ Agregar alimento" existente por este bloque.)

- [ ] **Step 2: Editar una receta rutea al constructor**

En `mobile/app/nutricion/alimento.tsx`, el botón "Editar" (línea ~223) hoy hace:

```tsx
onPress={() => router.push(`/nutricion/agregar-alimento?foodId=${food.id}`)}
```

Cambiarlo para que una receta abra el constructor:

```tsx
onPress={() => router.push(food.recipe ? `/nutricion/crear-comida?id=${food.id}` : `/nutricion/agregar-alimento?foodId=${food.id}`)}
```

- [ ] **Step 3: Verificar typecheck + suite móvil**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: sin errores de tipos; toda la suite jest verde.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/nutricion/catalogo.tsx mobile/app/nutricion/alimento.tsx
git commit -S -m "feat(nutrition): entradas de nav para Crear/Editar comida (receta)"
```

---

## Task 9: Verificación de la costura (end-to-end manual + suites)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Correr TODAS las suites tocadas**

```bash
cd shared && bun test
cd ../backend && bun test
cd ../mobile && npx jest
```
Expected: todo verde.

- [ ] **Step 2: Typecheck de los tres workspaces**

```bash
cd shared && npx tsc --noEmit
cd ../backend && npx tsc --noEmit
cd ../mobile && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Checklist manual (en el device / dev build) — la costura que ningún unit test cubre**

- [ ] Crear una receta con 2 ingredientes del catálogo + 1 que NO está (ir a "agregar-alimento", guardarlo, volver, buscarlo y agregarlo).
- [ ] Dejar el peso cocido vacío → el "Por 100 g" usa la suma de ingredientes.
- [ ] Cargar un peso cocido menor a la suma → el "Por 100 g" sube (densidad concentrada). Guardar.
- [ ] En "+ nueva comida", buscar la receta por nombre, agregarla, poner los gramos de una porción → el kcal escala proporcional al peso cocido.
- [ ] En el catálogo, la receta muestra el chip "receta"; abrir su detalle muestra los 30 nutrientes; "Editar" abre el constructor con los ingredientes precargados.
- [ ] El semáforo (NutrientFlags) aparece sobre la receta como sobre cualquier alimento.

- [ ] **Step 4: Publicar el OTA (JS-only) — seguir la regla del proyecto**

Este arco es **JS-only** (shared+mobile) salvo la migración de backend. Tras mergear: deployar backend (auto-deploy en merge a `main`) y **publicar el OTA verificando el runtime `"11"`** en la salida de `eas update` (ver [[ota-fingerprint-gotcha]] / [[ota-always-publish]]). La migración 0028 se aplica en el arranque del backend (`db:migrate` en el Dockerfile).

---

## Notas de alcance (v1)

- **Server confía en la per-100g del cliente** para la receta, igual que hoy `POST /foods` confía en los macros del alta normal. La re-derivación server-side (fetch de ingredientes + `deriveRecipe` en el backend) queda como hardening futuro, no v1.
- **Sin resnapshot al editar**: editar una receta actualiza la per-100g del Food; las porciones ya registradas conservan su snapshot — idéntico a editar cualquier alimento hoy (el `PATCH /foods/:id` no resnapshotea).
- **Fuera de alcance**: "porciones" numéricas (loguear "1 porción" en vez de gramos), recetas anidadas como ingrediente de primera clase, tabla relacional de ingredientes (se eligió JSONB).
