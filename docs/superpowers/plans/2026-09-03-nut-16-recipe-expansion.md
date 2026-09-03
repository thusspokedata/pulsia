# NUT-16 — Expandir receta a ingredientes en el desglose · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En los rankings "qué alimentos aportan &lt;macro/nutriente&gt;", poder expandir una fila que es una receta para ver el aporte por ingrediente.

**Architecture:** Motor puro `expandRecipe` en `@pulsia/shared` que reparte por fracción reutilizando `foodMacrosRaw`; `FoodRank` gana un `foodId` para reconocer recetas; las pantallas `macro.tsx` y `nutriente.tsx` bajan el catálogo (`useFoodCatalog`) y muestran un acordeón inline. Sin backend, sin migración, entrega OTA runtime `11`.

**Tech Stack:** TypeScript, `@pulsia/shared` (bun:test), React Native / Expo (jest-expo `--runInBand`).

**Spec:** `docs/superpowers/specs/2026-09-03-nut-16-recipe-expansion-design.md`

---

## File Structure

- `shared/src/nutrition/recipeBreakdown.ts` — **crear**: motor puro `expandRecipe`.
- `shared/src/nutrition/recipeBreakdown.test.ts` — **crear**: tests del motor.
- `shared/src/nutrition/breakdown.ts` — **modificar**: `FoodRank.foodId`, tracking de id en `rankFoods`, helpers `macroValueOf`/`nutrientValueOf` exportados; `foodsByMacro`/`foodsHighestIn` los reutilizan.
- `shared/src/nutrition/breakdown.test.ts` — **modificar**: tests de `foodId` + regresión.
- `shared/src/index.ts` — **modificar**: export de `recipeBreakdown`.
- `mobile/src/nutrition/useFoodCatalog.ts` — **crear**: hook plano `Map<string, Food>`.
- `mobile/app/nutricion/macro.tsx` — **modificar**: acordeón inline.
- `mobile/app/nutricion/nutriente.tsx` — **modificar**: acordeón inline (filas de comida).
- `mobile/__tests__/recipeExpansion.test.tsx` — **crear**: test de una pantalla (acordeón).

---

## Task 1: Helpers de valueOf en breakdown.ts (DRY para ranking + expansión)

**Files:**
- Modify: `shared/src/nutrition/breakdown.ts`
- Test: `shared/src/nutrition/breakdown.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `shared/src/nutrition/breakdown.test.ts`:

```ts
import { macroValueOf, nutrientValueOf } from "./breakdown";

test("macroValueOf devuelve el campo del macro", () => {
  expect(macroValueOf("protein_g")({ protein_g: 12, carbs_g: 3, fat_g: 1 } as any)).toBe(12);
});

test("nutrientValueOf convierte sodio a sal para salt_g", () => {
  // saltGFromSodiumMg(1000) = 2.5 g
  expect(nutrientValueOf("salt_g")({ sodium_mg: 1000 } as any)).toBeCloseTo(2.5, 5);
  expect(nutrientValueOf("calcium_mg")({ calcium_mg: 40 } as any)).toBe(40);
  expect(nutrientValueOf("calcium_mg")({ calcium_mg: null } as any)).toBe(null);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd shared && bun test src/nutrition/breakdown.test.ts`
Expected: FAIL — `macroValueOf is not a function` / `nutrientValueOf is not a function`.

- [ ] **Step 3: Implementar los helpers**

En `shared/src/nutrition/breakdown.ts`, reemplazar la función privada `rankAmount` y agregar los
helpers públicos. Definir un tipo laxo de fuente (lo cumplen `MealItem` y `ScaledMacros`):

```ts
// Fuente mínima para extraer un aporte: los campos de macro/micro + sodio. La cumplen tanto
// MealItem (snapshot del día) como ScaledMacros (un ingrediente escalado). Se usa para rankear
// (foodsByMacro/foodsHighestIn) y para expandir recetas (expandRecipe), con la MISMA semántica.
type NutrientRecord = Partial<Record<NutrientKey | MacroRankKey, number | null | undefined>>;

// Extractor de un MACRO. `foodsByMacro` y `expandRecipe` lo comparten.
export function macroValueOf(macro: MacroRankKey): (m: NutrientRecord) => number | null {
  return (m) => m[macro] ?? null;
}

// Extractor de un micro (o sal, derivada del sodio). `foodsHighestIn` y `expandRecipe` lo comparten.
// `salt_g` no es una columna: se habla en sal pero el dato guardado es sodio (mismo criterio que
// nutrientLevel.ts).
export function nutrientValueOf(nutrient: RankNutrient): (m: NutrientRecord) => number | null {
  if (nutrient === "salt_g") return (m) => saltGFromSodiumMg(m.sodium_mg ?? null);
  return (m) => m[nutrient] ?? null;
}
```

Actualizar `foodsByMacro` y `foodsHighestIn` para reusarlos:

```ts
export function foodsHighestIn(meals: Meal[], nutrient: RankNutrient): FoodRank[] {
  return rankFoods(meals, nutrientValueOf(nutrient));
}

export function foodsByMacro(meals: Meal[], macro: MacroRankKey): FoodRank[] {
  return rankFoods(meals, macroValueOf(macro));
}
```

Nota: mover la declaración de `MacroRankKey` arriba de estos helpers si hace falta por orden. Borrar
la función `rankAmount` ya inlineada en `nutrientValueOf`. `saltGFromSodiumMg` acepta
`number | null | undefined` — verificar su firma; si sólo acepta `number | null`, pasar `?? null`.

- [ ] **Step 4: Correr y verificar que pasa (incluye regresión del resto)**

Run: `cd shared && bun test src/nutrition/breakdown.test.ts`
Expected: PASS (los helpers + todos los tests viejos de foodsByMacro/foodsHighestIn siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/breakdown.ts shared/src/nutrition/breakdown.test.ts
git commit -S -m "refactor(nut-16): extraer macroValueOf/nutrientValueOf en breakdown"
```

---

## Task 2: `FoodRank.foodId` — id inequívoco por grupo

**Files:**
- Modify: `shared/src/nutrition/breakdown.ts`
- Test: `shared/src/nutrition/breakdown.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `breakdown.test.ts` (el helper `meal` del archivo castea a `any`, así que se pueden pasar
`foodId`/`foodName`/`grams` en los items):

```ts
const mealItems = (items: any[]): Meal =>
  ({ id: "m", eatenAt: 1, mealType: "almuerzo", note: null, items }) as any;

test("foodId se setea cuando el grupo mapea a un único foodId", () => {
  const meals = [mealItems([
    { foodId: "f1", foodName: "empanada", grams: 100, protein_g: 10 },
    { foodId: "f1", foodName: "empanada", grams: 50, protein_g: 5 },
  ])];
  const [row] = foodsByMacro(meals, "protein_g");
  expect(row.name).toBe("empanada");
  expect(row.foodId).toBe("f1");
});

test("foodId es null si el mismo nombre viene de dos foodId distintos", () => {
  const meals = [mealItems([
    { foodId: "f1", foodName: "arroz", grams: 100, protein_g: 3 },
    { foodId: "f2", foodName: "arroz", grams: 100, protein_g: 3 },
  ])];
  const [row] = foodsByMacro(meals, "protein_g");
  expect(row.foodId).toBe(null);
});

test("foodId es null si el item no trae foodId", () => {
  const meals = [mealItems([{ foodName: "queso", grams: 30, protein_g: 8 }])];
  expect(foodsByMacro(meals, "protein_g")[0].foodId).toBe(null);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd shared && bun test src/nutrition/breakdown.test.ts`
Expected: FAIL — `row.foodId` es `undefined` (la propiedad no existe todavía).

- [ ] **Step 3: Implementar**

En `breakdown.ts`, agregar el campo a la interfaz:

```ts
export interface FoodRank {
  name: string;
  amount: number;
  grams: number;
  pctOfTotal: number;
  source: "food" | "supplement";
  // El id del Food cuando TODO el grupo (mismo nombre) viene de un único foodId no-nulo; null si es
  // ambiguo (dos Foods distintos con el mismo nombre) o si los items no traen foodId. Sólo con un id
  // inequívoco se puede mirar si la fila es una receta y ofrecer su expansión (NUT-16).
  foodId: string | null;
}
```

Actualizar `rankFoods` para trackear el conjunto de ids por nombre y resolver el único:

```ts
function rankFoods(meals: Meal[], valueOf: (item: MealItem) => number | null): FoodRank[] {
  const by = new Map<string, { amount: number; grams: number; ids: Set<string> }>();
  for (const m of meals) {
    for (const item of m.items) {
      const v = valueOf(item);
      if (v == null || v <= 0) continue;
      const acc = by.get(item.foodName) ?? { amount: 0, grams: 0, ids: new Set<string>() };
      acc.amount += v;
      acc.grams += item.grams;
      if (item.foodId != null) acc.ids.add(item.foodId);
      by.set(item.foodName, acc);
    }
  }
  const total = [...by.values()].reduce((a, v) => a + v.amount, 0);
  if (total <= 0) return [];
  return [...by.entries()]
    .map(([name, v]) => ({
      name,
      amount: Math.round(v.amount * 10) / 10,
      grams: Math.round(v.grams),
      pctOfTotal: pct(v.amount, total),
      source: "food" as const,
      foodId: v.ids.size === 1 ? [...v.ids][0] : null,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd shared && bun test src/nutrition/breakdown.test.ts`
Expected: PASS (los 3 nuevos + toda la regresión).

- [ ] **Step 5: Verificación por mutación**

Cambiar `v.ids.size === 1` por `>= 1` temporalmente → el test "foodId es null si el mismo nombre
viene de dos foodId distintos" debe fallar. Revertir.

- [ ] **Step 6: Actualizar las filas de suplemento (no rompe compilación)**

En `mobile/app/nutricion/nutriente.tsx`, la construcción de filas de suplemento
(`useSupplementRanks`) crea objetos `FoodRank` a mano → agregar `foodId: null` a ese literal para
que el tipo cierre. (Se hace acá para que el proyecto compile; el resto del wiring es Task 5-6.)

```ts
next.push({
  name: e.supplementName,
  amount: Math.round(amount * 10) / 10,
  grams: 0,
  pctOfTotal: 0,
  source: "supplement",
  foodId: null,
});
```

- [ ] **Step 7: Commit**

```bash
git add shared/src/nutrition/breakdown.ts shared/src/nutrition/breakdown.test.ts mobile/app/nutricion/nutriente.tsx
git commit -S -m "feat(nut-16): FoodRank.foodId (id inequívoco por grupo)"
```

---

## Task 3: Motor puro `expandRecipe`

**Files:**
- Create: `shared/src/nutrition/recipeBreakdown.ts`
- Create: `shared/src/nutrition/recipeBreakdown.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `shared/src/nutrition/recipeBreakdown.test.ts`:

```ts
import { test, expect } from "bun:test";
import { expandRecipe } from "./recipeBreakdown";
import { macroValueOf, nutrientValueOf } from "./breakdown";
import type { MacroSource } from "./macros";
import type { RecipeItemInput } from "../schemas/nutrition";

// Food de ayuda: per_100g, sólo los campos que el test necesita.
const food = (name: string, per100: Partial<MacroSource>): MacroSource & { name: string } =>
  ({ name, basis: "per_100g", kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, ...per100 } as any);

const item = (foodId: string, quantity: number): RecipeItemInput => ({ foodId, quantity, unit: "g" });

test("reparte el aporte por ingrediente, mayor a menor", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    carne: food("Carne", { protein_g: 26 }),
    cebolla: food("Cebolla", { protein_g: 1 }),
  };
  const items = [item("carne", 100), item("cebolla", 50)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.complete).toBe(true);
  // Carne: 26 g · Cebolla: 0.5 g
  expect(r.contributions.map((c) => [c.name, Math.round(c.value * 10) / 10])).toEqual([
    ["Carne", 26],
    ["Cebolla", 0.5],
  ]);
});

test("complete=false si un ingrediente no resuelve, pero computa los demás", () => {
  const catalog: Record<string, MacroSource & { name: string }> = { carne: food("Carne", { protein_g: 26 }) };
  const items = [item("carne", 100), item("desaparecida", 50)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.complete).toBe(false);
  expect(r.contributions.map((c) => c.name)).toEqual(["Carne"]);
});

test("descarta ingredientes con aporte null o 0", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    carne: food("Carne", { protein_g: 26 }),
    agua: food("Agua", { protein_g: 0 }),
  };
  const items = [item("carne", 100), item("agua", 200)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.contributions.map((c) => c.name)).toEqual(["Carne"]);
});

test("salt_g reparte por sodio", () => {
  const catalog: Record<string, MacroSource & { name: string }> = {
    salsa: food("Salsa", { sodium_mg: 400 }),
    pasta: food("Pasta", { sodium_mg: 5 }),
  };
  const items = [item("salsa", 100), item("pasta", 100)];
  const r = expandRecipe(items, (id) => catalog[id] ?? null, nutrientValueOf("salt_g"));
  expect(r.contributions.map((c) => c.name)).toEqual(["Salsa", "Pasta"]);
  // saltGFromSodiumMg(400)=1.0 g, saltGFromSodiumMg(5)=0.0125 g
  expect(r.contributions[0].value).toBeCloseTo(1.0, 3);
});

test("Σ=0 → sin contribuciones", () => {
  const catalog: Record<string, MacroSource & { name: string }> = { agua: food("Agua", { protein_g: 0 }) };
  const r = expandRecipe([item("agua", 100)], (id) => catalog[id] ?? null, macroValueOf("protein_g"));
  expect(r.contributions).toEqual([]);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd shared && bun test src/nutrition/recipeBreakdown.test.ts`
Expected: FAIL — `Cannot find module './recipeBreakdown'` / `expandRecipe is not a function`.

- [ ] **Step 3: Implementar el motor**

Crear `shared/src/nutrition/recipeBreakdown.ts`:

```ts
import { foodMacrosRaw, type MacroSource, type ScaledMacros } from "./macros";
import type { RecipeItemInput } from "../schemas/nutrition";

// Un ingrediente de una receta con su aporte crudo al nutriente/macro elegido.
export interface RecipeContribution {
  foodId: string;
  name: string;
  value: number; // aporte SIN redondear (la pantalla reparte el amount de la fila por fracción)
}

export interface RecipeExpansion {
  // Ingredientes que resuelven Y aportan > 0, de mayor a menor. Desempate por nombre, igual que
  // rankFoods, para que la lista no baile entre renders.
  contributions: RecipeContribution[];
  // false si ALGÚN item de la receta no resolvió (borrado/no está en el catálogo). La pantalla
  // usa esto para NO expandir (decisión d del owner): nunca reparte sobre un total incompleto.
  complete: boolean;
}

// Reparte una receta a sus ingredientes para un macro/micro. `resolve` mapea foodId → el Food del
// ingrediente (per-100g + nombre); `valueOf` es el MISMO extractor que usa el ranking de la pantalla
// (macroValueOf / nutrientValueOf), así comida y expansión hablan la misma unidad (incl. sal→sodio).
// Aplana un solo nivel: si un ingrediente es a su vez una receta, se usa su per-100g tal cual (no se
// recursea). No se usa cookedWeightG ni redondeo: el reparto de la pantalla es por FRACCIÓN, y la
// fracción entre ingredientes es invariante a la escala.
export function expandRecipe(
  items: RecipeItemInput[],
  resolve: (foodId: string) => (MacroSource & { name: string }) | null,
  valueOf: (m: ScaledMacros) => number | null,
): RecipeExpansion {
  let complete = true;
  const contributions: RecipeContribution[] = [];
  for (const it of items) {
    const food = resolve(it.foodId);
    if (food == null) {
      complete = false;
      continue; // seguimos: no depender del orden para marcar incompleto
    }
    let scaled: ScaledMacros;
    try {
      scaled = foodMacrosRaw(food, it.quantity, it.unit);
    } catch {
      // Unidad incoherente con el basis del ingrediente (dato viejo/corrupto): tratamos como faltante.
      complete = false;
      continue;
    }
    const value = valueOf(scaled);
    if (value == null || value <= 0) continue; // no aporta: no enseña nada (igual que rankFoods)
    contributions.push({ foodId: it.foodId, name: food.name, value });
  }
  contributions.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return { contributions, complete };
}
```

`valueOf` está tipado como `(m: ScaledMacros) => number | null`; `macroValueOf`/`nutrientValueOf`
devuelven `(m: NutrientRecord) => number | null` y `ScaledMacros` satisface `NutrientRecord`, así que
son compatibles al pasarlos.

- [ ] **Step 4: Exportar desde el índice**

En `shared/src/index.ts`, agregar junto a los otros export de nutrition:

```ts
export * from "./nutrition/recipeBreakdown";
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd shared && bun test src/nutrition/recipeBreakdown.test.ts`
Expected: PASS (los 5 tests).

- [ ] **Step 6: Verificación por mutación**

Cambiar `if (food == null)` para NO setear `complete = false` (dejar `complete` en true) → el test
"complete=false si un ingrediente no resuelve" debe fallar. Revertir.

- [ ] **Step 7: Suite completa de shared**

Run: `cd shared && bun test`
Expected: PASS (todo verde).

- [ ] **Step 8: Commit**

```bash
git add shared/src/nutrition/recipeBreakdown.ts shared/src/nutrition/recipeBreakdown.test.ts shared/src/index.ts
git commit -S -m "feat(nut-16): motor puro expandRecipe (reparte receta por ingrediente)"
```

---

## Task 4: Hook `useFoodCatalog`

**Files:**
- Create: `mobile/src/nutrition/useFoodCatalog.ts`

- [ ] **Step 1: Implementar el hook (patrón useState/useEffect, como useMealsRange)**

Crear `mobile/src/nutrition/useFoodCatalog.ts`:

```ts
import { useEffect, useState } from "react";
import { getBackendUrl } from "../storage/config";
import { listFoods } from "../api/nutrition";
import type { Food } from "@pulsia/shared";

// Baja el catálogo entero una vez y lo indexa por id. Lo usan las pantallas de ranking para resolver
// los ingredientes de una receta (NUT-16). Degradación limpia: si falla, devuelve un Map vacío —
// ninguna fila será expandible, pero la pantalla sigue funcionando con los rankings.
export function useFoodCatalog(): Map<string, Food> {
  const [byId, setById] = useState<Map<string, Food>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getBackendUrl();
        const foods = await listFoods(url);
        if (cancelled) return;
        setById(new Map(foods.map((f) => [f.id, f])));
      } catch {
        if (!cancelled) setById(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return byId;
}
```

- [ ] **Step 2: Typecheck del móvil**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores nuevos por este archivo. (Si el proyecto no tiene ese script, saltar; se
valida al compilar en Task 5.)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/nutrition/useFoodCatalog.ts
git commit -S -m "feat(nut-16): hook useFoodCatalog (catálogo indexado por id)"
```

---

## Task 5: Acordeón inline en `macro.tsx`

**Files:**
- Modify: `mobile/app/nutricion/macro.tsx`

- [ ] **Step 1: Implementar el acordeón**

Reemplazar el cuerpo de `MacroScreen` para: bajar el catálogo, calcular por fila si es una receta
expandible, y renderizar el acordeón. Cambios clave (mantener imports/estructura existentes):

```tsx
import { useState } from "react";
import { foodsByMacro, macroValueOf, expandRecipe, type MacroRankKey, type Food } from "@pulsia/shared";
import { useFoodCatalog } from "../../src/nutrition/useFoodCatalog";
// ...resto de imports igual...

export default function MacroScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { macro, offset: offsetParam } = useLocalSearchParams<{ macro?: string; offset?: string }>();
  const { field, label } = MACROS[macro ?? ""] ?? MACROS.protein;
  const offset = Number(offsetParam ?? 0) || 0;
  const { meals, loading, error } = useMealsRange(1, offset);
  const catalog = useFoodCatalog();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const ranked = foodsByMacro(meals, field);
  const maxAmount = ranked[0]?.amount || 1;

  // Devuelve las sub-filas de una receta expandible, o null si la fila no es expandible.
  const expansionFor = (foodId: string | null, rowAmount: number) => {
    if (foodId == null) return null;
    const food = catalog.get(foodId);
    if (!food?.recipe) return null;
    const { contributions, complete } = expandRecipe(food.recipe.items, (id) => {
      const f = catalog.get(id);
      return f ? { ...f, name: f.name } : null;
    }, macroValueOf(field));
    if (!complete || contributions.length === 0) return null;
    const sum = contributions.reduce((a, c) => a + c.value, 0);
    if (sum <= 0) return null;
    return contributions.map((c) => ({
      name: c.name,
      amount: Math.round((c.value / sum) * rowAmount * 10) / 10,
      pct: Math.round((c.value / sum) * 100),
    }));
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Alimentos con más {label}</Text>

      {loading && <ActivityIndicator color={colors.accent} />}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {!loading && !error && ranked.length === 0 && (
        <Card><EmptyState>Todavía no registraste comidas con {label} este día.</EmptyState></Card>
      )}

      {!loading && !error && ranked.length > 0 && (
        <Card>
          <SectionTitle>De mayor a menor aporte</SectionTitle>
          {ranked.map((f) => {
            const sub = expansionFor(f.foodId, f.amount);
            const isOpen = f.foodId != null && open.has(f.foodId);
            return (
              <View key={f.name} style={{ gap: 4, marginTop: spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                    {sub && (
                      <Pressable
                        testID={`macro-expand-${f.name}`}
                        onPress={() => setOpen((prev) => {
                          const next = new Set(prev);
                          if (f.foodId != null) (next.has(f.foodId) ? next.delete(f.foodId) : next.add(f.foodId));
                          return next;
                        })}
                        hitSlop={8}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{isOpen ? "▾" : "▸"}</Text>
                      </Pressable>
                    )}
                    <Text style={{ color: colors.text, fontSize: 14, flexShrink: 1 }}>{f.name}</Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{f.amount} g · {f.pctOfTotal}%</Text>
                </View>
                <Bar value={f.amount} target={maxAmount} testID={`macro-rank-${f.name}-bar`} />
                <Text style={{ color: colors.icon, fontSize: 11 }}>{f.grams} g comidos</Text>
                {sub && isOpen && (
                  <View style={{ marginLeft: spacing.lg, marginTop: 2, gap: 2 }}>
                    {sub.map((s) => (
                      <View key={s.name} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{s.name}</Text>
                        <Text style={{ color: colors.icon, fontSize: 12 }}>{s.amount} g · {s.pct}%</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Verificar compilación / lint**

Run: `cd mobile && bunx tsc --noEmit` (o el typecheck del repo).
Expected: sin errores. (`Food` debe exportarse desde `@pulsia/shared` — ya lo está.)

- [ ] **Step 3: Commit**

```bash
git add mobile/app/nutricion/macro.tsx
git commit -S -m "feat(nut-16): acordeón de ingredientes en el desglose por macro"
```

---

## Task 6: Acordeón inline en `nutriente.tsx` (filas de comida)

**Files:**
- Modify: `mobile/app/nutricion/nutriente.tsx`

- [ ] **Step 1: Implementar**

En `nutriente.tsx` (que ya combina comida + suplemento y ordena en `ranked`), agregar catálogo,
estado de abiertos, y la expansión SÓLO para filas `source === "food"` con `foodId` de receta. El
extractor es `nutrientValueOf(nutrient)`.

Imports:

```tsx
import { foodsHighestIn, nutrientValueOf, expandRecipe, /* ...existing... */ } from "@pulsia/shared";
import { useFoodCatalog } from "../../src/nutrition/useFoodCatalog";
```

Dentro del componente, junto a los otros hooks:

```tsx
const catalog = useFoodCatalog();
const [open, setOpen] = useState<Set<string>>(new Set());

const expansionFor = (f: FoodRank) => {
  if (f.source !== "food" || f.foodId == null) return null;
  const food = catalog.get(f.foodId);
  if (!food?.recipe) return null;
  const { contributions, complete } = expandRecipe(
    food.recipe.items,
    (id) => { const g = catalog.get(id); return g ? { ...g, name: g.name } : null; },
    nutrientValueOf(nutrient),
  );
  if (!complete || contributions.length === 0) return null;
  const sum = contributions.reduce((a, c) => a + c.value, 0);
  if (sum <= 0) return null;
  return contributions.map((c) => ({
    name: c.name,
    amount: Math.round((c.value / sum) * f.amount * 10) / 10,
    pct: Math.round((c.value / sum) * 100),
  }));
};
```

En el `.map` de `ranked`, dentro del bloque de cada fila, agregar el chevron a la izquierda del
nombre (sólo cuando `expansionFor(f)` no es null) y las sub-filas indentadas cuando está abierta,
espejando exactamente lo de `macro.tsx` (usar `unit` en vez de `"g"` para los montos). El estado se
llavea por `f.foodId`. Reusar `testID={`rank-expand-${f.name}`}` para el Pressable del chevron.

Sub-filas (bajo `Bar` / el texto de gramos de la fila):

```tsx
{(() => { const sub = expansionFor(f); const isOpen = f.foodId != null && open.has(f.foodId);
  return sub && isOpen ? (
    <View style={{ marginLeft: spacing.lg, marginTop: 2, gap: 2 }}>
      {sub.map((s) => (
        <View key={s.name} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{s.name}</Text>
          <Text style={{ color: colors.icon, fontSize: 12 }}>{s.amount} {unit} · {s.pct}%</Text>
        </View>
      ))}
    </View>
  ) : null; })()}
```

Y el chevron en la fila del nombre (dentro del `View` que ya envuelve el nombre + chip de
suplemento), condicionado a `expansionFor(f) != null`, con el mismo `onPress` toggler que en
`macro.tsx`. Nota: llamar `expansionFor(f)` una sola vez por fila (guardar en `const sub` al inicio
del render de la fila) para no recomputarlo.

- [ ] **Step 2: Verificar compilación**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/nutricion/nutriente.tsx
git commit -S -m "feat(nut-16): acordeón de ingredientes en el desglose por nutriente"
```

---

## Task 7: Test de pantalla (acordeón)

**Files:**
- Create: `mobile/__tests__/recipeExpansion.test.tsx`

- [ ] **Step 1: Escribir el test**

Crear `mobile/__tests__/recipeExpansion.test.tsx`. Mockear `useMealsRange` y `useFoodCatalog` para
inyectar una receta y su catálogo; renderizar `MacroScreen`; verificar que aparece el chevron, que al
presionarlo se ven las sub-filas de ingredientes, y que una receta con ingrediente faltante NO
muestra chevron. Seguir el patrón de los tests existentes en `mobile/__tests__/` (mock de
`expo-router` con vars `mock*`, `@testing-library/react-native`).

```tsx
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ macro: "protein", offset: "0" }),
}));

const mockMeals = [{
  id: "m", eatenAt: 1, mealType: "almuerzo", note: null,
  items: [{ id: "i1", foodId: "empanada", foodName: "Empanada", quantity: 100, quantityUnit: "g", grams: 100,
            kcal: 250, protein_g: 12, carbs_g: 20, fat_g: 12 }],
}];
jest.mock("../src/nutrition/useMealsRange", () => ({
  useMealsRange: () => ({ meals: mockMeals, loading: false, error: null }),
}));

const carne = { id: "carne", name: "Carne", basis: "per_100g", kcal: 200, protein_g: 26, carbs_g: 0, fat_g: 10, unitWeightG: null };
const cebolla = { id: "cebolla", name: "Cebolla", basis: "per_100g", kcal: 40, protein_g: 1, carbs_g: 9, fat_g: 0, unitWeightG: null };
const empanada = { id: "empanada", name: "Empanada", basis: "per_100g", kcal: 250, protein_g: 12, carbs_g: 20, fat_g: 12,
                   unitWeightG: null, sourceMacros: "recipe",
                   recipe: { items: [{ foodId: "carne", quantity: 60, unit: "g" }, { foodId: "cebolla", quantity: 40, unit: "g" }], cookedWeightG: null } };
let mockCatalog = new Map<string, any>([["empanada", empanada], ["carne", carne], ["cebolla", cebolla]]);
jest.mock("../src/nutrition/useFoodCatalog", () => ({ useFoodCatalog: () => mockCatalog }));

import MacroScreen from "../app/nutricion/macro";

test("expande una receta a sus ingredientes al tocar el chevron", () => {
  const { getByTestId, queryByText, getByText } = render(<MacroScreen />);
  expect(queryByText("Carne")).toBeNull(); // colapsado al inicio
  fireEvent.press(getByTestId("macro-expand-Empanada"));
  expect(getByText("Carne")).toBeTruthy();
  expect(getByText("Cebolla")).toBeTruthy();
});

test("una receta con ingrediente faltante no muestra chevron", () => {
  mockCatalog = new Map<string, any>([["empanada", empanada], ["carne", carne]]); // falta cebolla
  const { queryByTestId } = render(<MacroScreen />);
  expect(queryByTestId("macro-expand-Empanada")).toBeNull();
});
```

- [ ] **Step 2: Correr**

Run: `cd mobile && npm test -- --runInBand recipeExpansion`
Expected: PASS los 2 tests. (Ajustar los mocks/campos requeridos por los schemas si RN se queja;
mantener la intención.)

- [ ] **Step 3: Commit**

```bash
git add mobile/__tests__/recipeExpansion.test.tsx
git commit -S -m "test(nut-16): acordeón de expansión de receta en el ranking"
```

---

## Task 8: Verificación final

- [ ] **Step 1: Suites completas**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared backend`
Run: `cd mobile && npm test -- --runInBand`
Expected: todo verde.

- [ ] **Step 2: Revisar el diff completo**

Run: `git diff origin/main --stat` y una lectura del diff. Confirmar: sin migración, sin cambios de
backend, sólo shared + mobile.

- [ ] **Step 3:** Handoff para PR + `@claude review` + (tras review limpio) merge + OTA runtime `11`,
según el flujo del owner. NO deployar backend (no hay cambios de backend) y verificar el runtime en
la salida de `eas update`.
