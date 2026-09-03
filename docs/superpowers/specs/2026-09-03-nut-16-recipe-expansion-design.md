# NUT-16 — Expandir una receta a sus ingredientes en el desglose por macro/nutriente

> Spec de diseño · 2026-09-03 · ticket Kan `iscjalbmjv4x`

## Problema

Cuando un ítem del día es una **receta** (ej. *empanada* = carne + cebolla), el desglose "qué
alimentos aportan &lt;macro/nutriente&gt;" la muestra como una sola fila opaca **"empanada"**. El
owner quiere poder ver **qué ingrediente específico** aportó ese nutriente (la carne aportó la
proteína), no la receta como un bloque.

## Contexto del código (estado actual)

- Una receta se guarda como un `Food` con `sourceMacros:"recipe"` + JSONB
  `recipe = {items:[{foodId, quantity, unit}], cookedWeightG}`
  (`shared/src/schemas/nutrition.ts`). Los `items` guardan **solo `foodId` + cantidad + unidad** —
  NO el nombre ni los macros del ingrediente.
- El `MealItem` del día **sí trae `foodId`** (nullable si el Food se borró después) pero **no** trae
  `recipe`: la receta vive en el `Food` del catálogo, que se baja entero con `listFoods()`.
- Hay **dos** pantallas de ranking "qué alimentos aportan", ambas sobre el mismo núcleo
  `rankFoods(meals, valueOf)` de `shared/src/nutrition/breakdown.ts`:
  - `mobile/app/nutricion/macro.tsx` → `foodsByMacro(meals, field)` (proteína/carbos/grasa, NUT-13).
  - `mobile/app/nutricion/nutriente.tsx` → `foodsHighestIn(meals, nutrient)` (todos los micros +
    sal + los tipos de grasa de NUT-14 + combina suplementos).
- `mobile/app/nutricion/grasas.tsx` (NUT-14) **no tiene** lista propia de "qué alimentos aportan":
  al tocar un tipo de grasa **navega a `nutriente.tsx`**. Por eso cubrir `macro.tsx` + `nutriente.tsx`
  cubre también grasa-por-tipo.
- `rankFoods` agrupa por `foodName` y **descarta el `foodId`**.
- `foodMacrosRaw` (`shared/src/nutrition/macros.ts`) es el núcleo sin redondear que escala un Food a
  una cantidad; ya lo reutiliza `deriveRecipe`.

## Decisiones del owner (cerradas)

- **(a) UI:** acordeón **inline** bajo la fila de la receta (no navegar a otra pantalla).
- **(b) Recetas anidadas:** **aplanar un solo nivel**. Si un ingrediente es a su vez una receta, se
  muestra como una fila de ingrediente más — sin recursión.
- **(c) Alcance:** las **dos** pantallas (`macro.tsx` + `nutriente.tsx`) vía motor compartido. Cubre
  macros, micros y grasa-por-tipo.
- **(d) Ingrediente faltante:** si **algún** ingrediente no resuelve (borrado del catálogo), la
  receta **no se expande** (fila opaca, sin chevron). Nunca reparte sobre un total incompleto ni
  rompe.

## Diseño

### 1. Motor puro (shared) — `expandRecipe`

Nuevo archivo `shared/src/nutrition/recipeBreakdown.ts` exportado desde `shared/src/index.ts`.

```ts
export interface RecipeContribution {
  foodId: string;
  name: string;
  value: number; // aporte crudo (sin redondear) del ingrediente al nutriente/macro seleccionado
}

export interface RecipeExpansion {
  contributions: RecipeContribution[]; // ingredientes que resuelven Y aportan > 0, mayor→menor
  complete: boolean; // false si ALGÚN item no resolvió (→ la pantalla no expande)
}

export function expandRecipe(
  items: RecipeItemInput[],
  resolve: (foodId: string) => (MacroSource & { name: string }) | null,
  valueOf: (m: ScaledMacros) => number | null,
): RecipeExpansion;
```

- Por cada `item`: `resolve(item.foodId)`. Si devuelve `null` → `complete = false` (pero se sigue
  recorriendo para no depender del orden).
- Para los que resuelven: `scaled = foodMacrosRaw(food, item.quantity, item.unit)` y
  `value = valueOf(scaled)`. Se descartan los `value == null || value <= 0` (igual criterio que
  `rankFoods`).
- `contributions` ordenado por `value` desc, desempate por `name` (misma regla que `rankFoods`, para
  que la lista no baile).
- **No** aplica `cookedWeightG` ni redondeo: el reparto es por **fracción** (ver §2), y la fracción
  es invariante a la escala. `cookedWeightG` afecta la per-100g de la receta (ya reflejada en el
  `amount` de la fila), no las proporciones entre ingredientes.
- Aplana un solo nivel: `resolve` devuelve el `Food` del ingrediente y usamos su per-100g tal cual;
  si ese Food es a su vez una receta, se trata como un ingrediente atómico (no se recursea).

### 2. Reparto proporcional en la pantalla (independiente de la porción)

La fila rankeada ya tiene su `amount` (aporte del día, del snapshot del `MealItem`). Los sub-ítems:

```
Σ = sum(contributions.value)
subAmount_i = round1( (value_i / Σ) × row.amount )
subPct_i    = round( (value_i / Σ) × 100 )
```

Los sub-ítems **suman exactamente** la fila (repartimos el `amount` ya mostrado, no re-derivamos la
porción). Para `salt_g` la fracción sale del **sodio** (el `valueOf` de esa pantalla ya convierte
sodio→sal; como es lineal, la fracción es idéntica a la del sodio).

Si `Σ <= 0` (ningún ingrediente aporta ese nutriente pese a que la fila > 0, caso de borde por
snapshot desalineado): no se ofrece expansión, se degrada a fila opaca.

### 3. Enganche en `rankFoods` / `FoodRank` (breakdown.ts)

`rankFoods` sigue **agrupando por `foodName`** (no cambia el display). Se agrega a `FoodRank`:

```ts
foodId: string | null; // el id cuando el grupo mapea a un ÚNICO foodId no-nulo; null si es ambiguo
```

- Durante la agrupación se acumula el conjunto de `foodId` vistos por nombre. Al emitir: si hay
  exactamente **un** `foodId` distinto no-nulo → se setea; si hay varios (dos Foods distintos con el
  mismo nombre) o ninguno → `null`. Sólo con un id no ambiguo se puede mirar si es receta.
- Las filas de **suplemento** (construidas en `nutriente.tsx` y en el motor de suplementos) setean
  `foodId: null`.

### 4. UI — acordeón inline

Un hook chico `useFoodCatalog` (react-query, cacheado) que baja `listFoods()` una vez y expone
`Map<string, Food>`.

En `macro.tsx` y `nutriente.tsx`, por cada fila de ranking:
- Se resuelve `row.foodId` en el catálogo. Es **expandible** si el Food existe, tiene `recipe`, y
  `expandRecipe(...).complete === true` con `Σ > 0`.
- Fila expandible: se muestra un chevron ▸/▾ (Pressable) que alterna un estado local
  (`Set<string>` de filas abiertas, por `foodId`). Al abrir, se listan las `contributions` con
  `subAmount unidad · subPct%` cada una, con una barra/indentado que las distingue de las filas
  raíz.
- Fila no expandible (alimento común, receta con ingrediente faltante, o `Σ<=0`): igual que hoy,
  sin chevron. Opcional: un marcador sutil "receta" sin acordeón cuando `foodId` es receta pero
  incompleta (decidir en implementación; no bloquea).
- El `valueOf` que se le pasa a `expandRecipe` es **el mismo** que usa la pantalla para rankear:
  - `macro.tsx`: `(m) => m[field]` (`protein_g|carbs_g|fat_g`).
  - `nutriente.tsx`: `(m) => rankAmount`-equivalente (`m[nutrient]`, o `saltGFromSodiumMg(m.sodium_mg)`
    para `salt_g`). Se exporta un helper reutilizable desde breakdown.ts para no duplicar la lógica
    de sal.

### Degradación / bordes

- Ingrediente **borrado** (foodId no está en el catálogo) → `complete=false` → fila opaca.
- Ingrediente **editado** desde que se creó la receta: no se detecta (barato); el reparto usa la
  per-100g actual del ingrediente. Aceptable: la per-100g de la receta también estaría desalineada.
  Se documenta como limitación conocida.
- `foodId` ambiguo (dos Foods con el mismo nombre) → `foodId=null` → no expandible. Correcto: no
  sabemos cuál receta es.
- Suplementos: nunca expandibles (`foodId=null`).

## Testing (TDD, verificación por mutación)

Motor puro `expandRecipe` (shared, `bun test`):
- Reparte proporcional: dos ingredientes → `value` correcto por `valueOf`, orden desc, desempate por
  nombre.
- `complete=false` si un `foodId` no resuelve; los demás igual se computan (no depende del orden).
- Descarta ingredientes con `value` null/0.
- `salt_g`: fracción por sodio (usando el `valueOf` de sal).
- Aplanado un nivel: un ingrediente que es receta se trata atómico.
- `Σ=0` → contributions vacío.

`rankFoods`/`FoodRank`:
- `foodId` seteado cuando el grupo tiene un único id; `null` si ambiguo o ausente.
- No cambia el ranking/orden existente (regresión).

Pantalla (jest, `--runInBand`): la fila de receta muestra chevron y, al expandir, las filas de
ingredientes con montos que suman la fila; receta con ingrediente faltante no muestra chevron.

## Entrega

- **Sin migración.** La receta ya guarda sus ingredientes; el `MealItem` ya trae `foodId`.
- **Sin backend.** Todo client-side + shared.
- **OTA runtime `11`** (JS-only). Verificar el runtime en la salida de `eas update`.

## Fuera de alcance (v1)

- Recursión de recetas anidadas (se aplana un nivel).
- Detección de ingredientes editados (no borrados).
- Expansión en informes/otras vistas: sólo los dos rankings del día.
