# NUT-11 · Alimentos crudos/secos vs cocidos — factor de rendimiento (yield)

> Spec de diseño. Fecha: **2026-08-20**. Ticket Kan: **NUT-11** (P1 · Features, pedido por owner).
> Estado: **aprobado el diseño, pendiente el plan de implementación**.

## 1. Problema

Al registrar una porción, el usuario **pesa el alimento cocido** (con el agua ya absorbida), pero
la app aplica el per-100g del alimento tal cual está guardado. Si ese per-100g es de la versión
**seca/cruda** (pasta seca, arroz crudo, legumbre seca, avena), aplicar el per-100g seco a gramos
**cocidos** (hidratados) **sobrecuenta** calorías y macros: la pasta cocida pesa ~2–2.5× lo seco,
así que su per-100g real es ~⅓ del seco.

### 1.1 Dónde pega de verdad (hallazgo que reencuadra el ticket)

El ticket asumía que el catálogo guarda el per-100g **seco** para estos alimentos. **No es así.** El
catálogo base sembrado ([`backend/scripts/seed-food-catalog.data.ts`](../../../backend/scripts/seed-food-catalog.data.ts))
ya mapea las filas **cocidas** de USDA justo para los alimentos que absorben agua:

- `Arroz basmati/integral` → `Rice, ... cooked`
- `Pasta integral` → `Pasta, whole grain, cooked`
- `Fideos de arroz` / `Noodles` / `Cuscús` / `Mijo` / `Bulgur` / `Trigo sarraceno` → todos `cooked`
- `Lentejas` / `Garbanzos` / `Alubias` / `Guisantes` → todos `cooked, boiled`

Para el **catálogo base**, entonces, pesar cocido y aplicar el per-100g cocido **ya es correcto**: el
bug del owner no ocurre ahí. (Patata/batata/yuca están en `raw`, pero esos *pierden* agua al
cocinarse, no la absorben; quedan fuera del alcance de esta feature.)

El bug **sí** ocurre con **alimentos que el usuario agrega desde la foto de una etiqueta**: la tabla
nutricional de un paquete de pasta o arroz suele ser **por 100 g en seco**. Ese `Food` queda con el
per-100g seco; después el usuario pesa la porción **cocida** y se sobrecuenta ~2–2.5×.

**Reencuadre:** la feature no "arregla el catálogo". Le da a un `Food` la capacidad de saber que su
per-100g es **seco** y de **convertir** el peso cocido a peso seco equivalente al registrar.

## 2. Precedente que se reusa

Las **recetas** ya resuelven el agua a nivel plato con `cookedWeightG`
([`shared/src/nutrition/recipe.ts`](../../../shared/src/nutrition/recipe.ts), `deriveRecipe`):
capturan el agua absorbida/evaporada como un peso y recalibran la densidad per-100g. NUT-11 es lo
análogo para un **alimento suelto** del catálogo, pero por **factor** (no por peso del plato), porque
un mismo alimento seco se registra muchas veces con porciones distintas.

## 3. Decisiones tomadas (con el owner)

1. **Mecanismo:** un solo campo `cookingYield` en `Food` (cocido ÷ seco). No un flag + factor
   separados: "hay yield" ya significa "el per-100g es seco y hay conversión disponible".
2. **Fuente del factor:** la **IA lo estima y el usuario confirma/edita**. Al leer la foto, la IA
   detecta si es un producto seco y propone el factor; el usuario lo ve y lo ajusta o lo borra.
3. **Retrofit de alimentos viejos:** botón **"estimar factor de cocción con IA"** en la pantalla del
   alimento (reusa el patrón de "que la IA complete" de micros) + edición manual.
4. **Default del toggle al registrar:** **cocido** (el caso real: se pesa el plato terminado).
5. **Alcance:** no se toca el catálogo base (ya cocido) ni el seed. Alimentos existentes quedan con
   `cookingYield = null` (sin cambio de comportamiento). Comidas ya registradas **no** se recalculan
   (el snapshot es inmutable).

## 4. Modelo de datos

### 4.1 `Food` (shared)

Un campo nuevo, opcional y nullable, en el objeto base del alimento
([`shared/src/schemas/nutrition.ts`](../../../shared/src/schemas/nutrition.ts)):

```ts
// cocido ÷ seco. Ej: 100 g de pasta seca → ~220 g cocidos → 2.2.
// null  → alimento normal: el per-100g se aplica tal cual (comportamiento actual, sin toggle).
// !null → el per-100g guardado es SECO/CRUDO; al pesar cocido se convierte a seco equivalente.
cookingYield: z.number().positive().nullable().optional(),
```

Se agrega a `FoodExtractionSchema` (para que fluya del alta y de la IA) y por herencia a
`FoodInputSchema`/`FoodSchema`. Rango razonable en la UI: `1.0`–`4.0` (no se fuerza en el schema más
allá de `positive()`; la UI valida el rango y avisa).

**Semántica de `null` vs valor:** igual que los micros del proyecto, `null` = "no aplica / no
sabemos", nunca `1`. Un yield de `1.0` significaría "no cambia de peso al cocinarse" (un dato
afirmado), distinto de "este alimento no tiene concepto de seco/cocido".

### 4.2 `MealItem` snapshot (shared)

`MealItemInput` y `MealItem` ganan `weighedCooked: z.boolean().optional()`:

- Sólo es significativo cuando el `Food` tenía `cookingYield != null` al registrar.
- Se guarda junto con `grams` = **los gramos que el usuario realmente pesó** (cocidos si
  `weighedCooked`), para poder mostrar "150 g (cocido)". Los macros del snapshot ya salen
  convertidos y correctos (§5).
- `undefined`/`null` en ítems viejos = comportamiento actual (sin conversión).

### 4.3 Migración

Próxima migración drizzle (**0030**, autogenerada):
- `food.cooking_yield` `numeric`/`real` NULL.
- `meal_item.weighed_cooked` `boolean` NULL.

Ambas nullable → back-compat total; el arranque del backend auto-migra (patrón de siempre).

## 5. Cálculo (una sola fuente de verdad)

El escalado vive en [`shared/src/nutrition/macros.ts`](../../../shared/src/nutrition/macros.ts) y lo
usan **el móvil (preview)** y **el backend (snapshot)** — no puede haber dos criterios.

`foodMacrosForQuantity` (y su núcleo `foodMacrosRaw`) ganan un parámetro opcional:

```ts
foodMacrosForQuantity(food, quantity, unit, opts?: { weighedCooked?: boolean })
```

Regla, aplicada **después** de resolver `grams` (incluye el caso `unit === "unit"`) y **antes** del
`factor = grams / 100`:

```
si (food.cookingYield != null && opts?.weighedCooked !== false):
    gramsSecoEquivalente = grams / food.cookingYield
    factor = gramsSecoEquivalente / 100
```

- Default: cuando el alimento **tiene** yield y no se pasa `opts`, se asume `weighedCooked = true`
  (el caso común). `weighedCooked: false` desactiva la conversión (el usuario pesó seco).
- Cuando `cookingYield == null`, `opts` se ignora → **cero cambio** en todos los llamadores actuales.
- Se extrae un helper puro `rawEquivalentGrams(grams, cookingYield, weighedCooked)` para testear la
  conversión aislada.

### 5.1 No-regresión con recetas

`deriveRecipe` llama a `foodMacrosRaw` **sin `opts`** → los ingredientes se escalan como hoy
(cantidad "cruda" del ingrediente, sin conversión de cocción). El agua de la receta se sigue
capturando a nivel plato con `cookedWeightG`. Un test lo fija explícitamente para que un cambio
futuro no meta doble corrección de agua.

## 6. IA — estimación del factor

### 6.1 En el alta desde foto

`FoodIdentificationSchema` gana `cookingYield: z.number().positive().nullable()`. El prompt de
identificación ([`backend/src/ai/nutrition.ts`](../../../backend/src/ai/nutrition.ts)) pide:
> si el alimento es un producto **seco** que se cocina absorbiendo agua (pasta, arroz, legumbre
> seca, avena, cuscús, quinoa…), estimá el factor cocido÷seco; para cualquier otro alimento, `null`.

Fluye a la pantalla de confirmación del alta, donde el usuario lo ve y lo confirma/edita/borra antes
de guardar.

### 6.2 Retrofit (alimento ya cargado)

Nuevo método `deps.aiClient.estimateCookingYield({ name, apiKey })` + ruta que **no persiste**,
espejando `POST /foods/ai-micros`
([`backend/src/routes/nutrition.ts`](../../../backend/src/routes/nutrition.ts)):

```
POST /foods/cooking-yield   { name }  → { cookingYield: number | null }
```

Devuelve la propuesta para recargar el campo del form; recién el `PATCH /foods/:id` la persiste.
Guardas: si el servidor no tiene la capacidad → 500 con mensaje claro; sin API key → 400; fallo del
modelo → 502 "Reintentá" (mismos contratos que ai-micros). El botón vive en `alimento.tsx`.

## 7. UX

### 7.1 Al registrar (`agregar-alimento` / registro de porción)

- El toggle **"pesé cocido / pesé seco"** aparece **sólo** si el alimento tiene `cookingYield`.
- Default = **cocido**. El preview de macros se recalcula en vivo según el toggle (usa el mismo
  `foodMacrosForQuantity` con `opts`).
- Microcopy junto al toggle: "el valor del alimento es en seco; pesá el plato como lo comés".

### 7.2 En la pantalla del alimento (`mobile/app/nutricion/alimento.tsx`)

- Campo editable **"Factor de cocción (cocido ÷ seco)"** con el valor actual o vacío.
- Botón **"Estimar con IA"** → llama a `POST /foods/cooking-yield`, precarga el número, editable.
- Guardar → `PATCH /foods/:id` con el `cookingYield`.
- Interacción con recetas: un `Food` de tipo receta (`recipe != null`) **no** muestra este campo (la
  receta ya maneja el agua con `cookedWeightG`); se oculta como ya se ocultan ahí los botones de
  USDA/IA-micros para recetas.

## 8. Alcance / fuera de alcance

**Dentro:** campo `cookingYield` en `Food`; conversión en `macros.ts`; snapshot `weighedCooked`;
estimación IA en alta + retrofit; toggle al registrar; edición en la pantalla del alimento;
migración 0030.

**Fuera:**
- Recalcular comidas ya registradas (snapshot inmutable, por diseño).
- Backfill automático de alimentos viejos (no sabemos cuáles eran secos; el usuario los marca).
- Tocar el catálogo base / el seed (ya está en cocido).
- Alimentos que *pierden* agua al cocinarse (carnes, patata) — el modelo soporta yield < 1 si hiciera
  falta, pero no se aborda ni se estima para ellos en esta iteración.

## 9. Testing (TDD, verificación por mutación)

**`shared`:**
- `rawEquivalentGrams`: 220 g cocidos, yield 2.2 → 100 g secos; `weighedCooked=false` → 220; yield
  `null` → 220 (sin cambio).
- `foodMacrosForQuantity` con `opts.weighedCooked`: pasta seca 350 kcal/100g, 220 g cocidos, yield
  2.2 → 350 kcal (no 770).
- `foodMacrosForQuantity` sin `opts` y `cookingYield=null` → idéntico a hoy (test de no-regresión).
- `deriveRecipe`: un ingrediente con `cookingYield` **no** aplica conversión (no-regresión).

**`backend`:**
- Snapshot del `MealItem` guarda `weighedCooked` y los macros convertidos correctos.
- `POST /foods/cooking-yield`: 200 con propuesta; 400 sin key; 500 sin capacidad; 502 en fallo. Spy
  de la IA para no gastar tokens en tests.
- Alta con `cookingYield` de la IA persiste; `PATCH /foods/:id` lo actualiza.

**`mobile`:**
- El toggle se muestra sólo con `cookingYield`; default cocido; el preview coincide con el snapshot
  del backend (probar la costura móvil↔backend, no sólo las piezas por separado).

## 10. Archivos afectados (orientativo)

- `shared/src/schemas/nutrition.ts` — `cookingYield`, `weighedCooked`, `FoodIdentificationSchema`.
- `shared/src/nutrition/macros.ts` — `rawEquivalentGrams`, `opts` en `foodMacrosForQuantity`/`Raw`.
- `backend/src/ai/nutrition.ts` + `client.ts` — `estimateCookingYield`, prompt de identificación.
- `backend/src/routes/nutrition.ts` — `POST /foods/cooking-yield`, snapshot con `weighedCooked`.
- `backend/src/db/schema.ts` + `backend/drizzle/0030_*.sql` — columnas nuevas.
- `mobile/app/nutricion/agregar-alimento.tsx` — toggle + preview.
- `mobile/app/nutricion/alimento.tsx` — campo + botón "Estimar con IA".
