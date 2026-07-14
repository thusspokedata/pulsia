# Comidas — editar comida + editar alimento (enhancement de #1)

> Diseño. Fecha: 2026-07-14. **Enhancement** del sub-proyecto 1 (registro de comidas). Motivado por uso real: (a) el usuario carga dos comidas casi simultáneas y quiere combinarlas editando una; (b) con los micros nuevos, quiere completar/corregir alimentos ya cargados (incl. el nombre traducido de un producto agregado antes del fix de naming). **Sin APK** — backend (deploy, sin migración) + JS (OTA a vc10).

## Objetivo

1. **Editar una comida:** tocar una comida del día abre la pantalla de "Nueva comida" en **modo edición**, precargada (alimentos, cantidades, hora, tipo, nota). Guardar actualiza la comida (`PATCH /meals/:id`, ya existe). Habilita "combinar" (editar una a 22u + borrar la otra).
2. **Editar un alimento del catálogo:** tocar un alimento abre "Agregar alimento" en **modo edición**, precargado. Se edita a mano (completar los micros, corregir el nombre) **o** con una **foto nueva** (la IA re-extrae y sobrescribe el form). Guardar actualiza el alimento (`PATCH /foods/:id`, se re-agrega).
3. **Invariante:** editar un alimento del catálogo **NO cambia las comidas ya cargadas** — cada `meal_item` guarda su snapshot inmutable. El cambio solo aplica a comidas futuras. (Ya garantizado por el diseño de #1; este spec no lo altera.)

## No-objetivos (YAGNI)

- **No** merge explícito de dos comidas (se logra editando una + borrando la otra).
- **No** editar un `meal_item` orphan (alimento borrado del catálogo): esa comida no se puede editar (ver caso borde). Raro; borrar y recrear.
- **No** re-snapshotear comidas pasadas al editar un alimento (es justo lo que NO queremos).
- **No** migración: los endpoints nuevos usan las tablas/columnas existentes.
- **No** APK: sin deps nativas.

## Decisiones cerradas

- **Reusar las pantallas existentes** en "modo edición" vía query param (`?mealId=` / `?foodId=`), en vez de pantallas nuevas. Menos código, UX consistente.
- **Gesto:** en el día, **tap** en una comida = editar (el **long-press** ya es borrar). En el catálogo, **tap** en un alimento = editar (el botón **"Borrar"** sigue).
- **Editar alimento = re-agregar lo que se sacó como YAGNI:** `updateFood` (repo) + `PATCH /nutrition/foods/:id` (route) + su cliente móvil. Más `GET /nutrition/foods/:id` (route sobre el `getFood` del repo, que ya existe) para cargar.
- **Editar comida:** `PATCH /nutrition/meals/:id` ya existe; falta solo `GET /nutrition/meals/:id` (nuevo `getMealById` en el repo + route) para cargar.
- **Caso borde (comida con alimento borrado):** si algún `meal_item` tiene `foodId` null o un food ausente del catálogo, la comida **no es editable** — se muestra un aviso y el botón de guardar se deshabilita. (PATCH reconstruye los ítems desde el catálogo; un orphan no se puede re-snapshotear.)

## Diseño

### 1. Backend

- **`backend/src/nutrition/repository.ts`:**
  - **Re-agregar `updateFood`** (fue borrado en el review de #114). Firma y cuerpo simétricos a `insertFood`, scopeado por usuario, devolviendo el `Food` actualizado o `null` si no existe/no es del usuario. Persiste **todos** los campos incluidos los micros:
    ```ts
    export async function updateFood(db: Db, userId: string, id: string, input: FoodInput): Promise<Food | null> {
      const rows = await db.update(food).set({
        name: input.name, basis: input.basis, kcal: input.kcal,
        proteinG: input.protein_g, carbsG: input.carbs_g, fatG: input.fat_g,
        unitWeightG: input.unitWeightG, source: input.source,
        saturatedFatG: input.saturated_fat_g ?? null, sugarsG: input.sugars_g ?? null,
        fiberG: input.fiber_g ?? null, saltG: input.salt_g ?? null,
      }).where(and(eq(food.id, id), eq(food.userId, userId))).returning();
      return rows[0] ? toFood(rows[0]) : null;
    }
    ```
  - **Nuevo `getMealById`** — trae una comida completa (con ítems) scopeada por usuario:
    ```ts
    export async function getMealById(db: Db, userId: string, id: string): Promise<Meal | null> {
      const row = await db.query.meal.findFirst({ where: and(eq(meal.id, id), eq(meal.userId, userId)) });
      if (!row) return null;
      const items = await db.select().from(mealItem).where(eq(mealItem.mealId, id));
      return toMeal(row, items);
    }
    ```
  - (`getFood` ya existe.)

- **`backend/src/routes/nutrition.ts`:**
  - **Re-agregar** `PATCH /foods/:id` (valida con `FoodInputSchema`, llama `updateFood`, 404 si null). Re-importar `updateFood`.
  - **Nuevo** `GET /foods/:id` (llama `getFood`, 404 si null). Importar `getFood`.
  - **Nuevo** `GET /meals/:id` (llama `getMealById`, 404 si null). Importar `getMealById`.
  - Todos bajo `auth`, scopeados por `c.get("userId")`.

### 2. Shared

- Sin cambios (los tipos `Food`/`Meal`/`FoodInput`/`MealInput` ya existen y ya incluyen los micros).

### 3. Mobile

- **`mobile/src/api/nutrition.ts`:**
  - **Re-agregar `updateFood(baseUrl, id, input)`** (`PATCH /nutrition/foods/:id`).
  - **Nuevo `getFood(baseUrl, id)`** (`GET /nutrition/foods/:id`).
  - **Nuevo `getMeal(baseUrl, id)`** (`GET /nutrition/meals/:id`).

- **`mobile/app/nutricion/agregar-alimento.tsx` (modo edición):**
  - Lee `foodId` de `useLocalSearchParams`. Si está: en el mount, `getFood` → precarga el `Form` con los valores (incluidos los micros, `numStr` para null→"").
  - Título: "Editar alimento" si `foodId`, "Agregar alimento" si no. Botón: "Guardar cambios" vs "Guardar en el catálogo".
  - **Save:** si `foodId` → `updateFood(baseUrl, foodId, input)`; si no → `createFood`. Misma validación. La foto/re-extracción funciona igual (sobrescribe el form) en ambos modos.

- **`mobile/app/nutricion/catalogo.tsx`:**
  - Envolver la info del alimento en un `Pressable` con `onPress={() => router.push(\`/nutricion/agregar-alimento?foodId=${f.id}\`)}` (el botón "Borrar" queda aparte, sin gatillar el tap).

- **`mobile/app/nutricion/nueva-comida.tsx` (modo edición):**
  - Lee `mealId` de `useLocalSearchParams`. Si está: en el foco/mount, cargar en paralelo `getMeal(mealId)` + `listFoods`. Reconstruir `rows: MealRow[]` mapeando cada `meal.items[i]` a `{ food: catalog.find(foodId), quantity, unit: quantityUnit }`.
    - Prefill también `mealType`, `note`, y `eatenAt` (de la comida).
    - **Orphan:** si algún ítem no encuentra su food en el catálogo (foodId null o borrado) → set un flag `notEditable`, mostrar aviso "Esta comida tiene un alimento borrado del catálogo; no se puede editar (borrala y recreala)" y **deshabilitar Guardar**.
  - Título: "Editar comida" vs "Nueva comida". Botón: "Guardar cambios" vs "Guardar comida".
  - **Save:** si `mealId` → `updateMeal`-equivalente: `apiFetch PATCH /nutrition/meals/:id` con `buildMealInput(...)`; si no → `createMeal`. Reusar `buildMealInput` (ya arma `MealInput`). Agregar `updateMeal(baseUrl, id, input)` al cliente API.
  - Nota: `buildMealInput` toma `eatenAt`; en edición usar el `eatenAt` de la comida cargada (no `Date.now()`).

- **`mobile/app/(tabs)/nutricion.tsx`:**
  - La comida (`Pressable`) suma `onPress={() => router.push(\`/nutricion/nueva-comida?mealId=${m.id}\`)}` (mantiene `onLongPress` = borrar).

### 4. Cliente API — resumen de lo nuevo/re-agregado (`mobile/src/api/nutrition.ts`)

```ts
export async function getFood(baseUrl: string, id: string): Promise<Food> { /* GET /nutrition/foods/:id */ }
export async function updateFood(baseUrl: string, id: string, input: FoodInput): Promise<Food> { /* PATCH /nutrition/foods/:id */ }
export async function getMeal(baseUrl: string, id: string): Promise<Meal> { /* GET /nutrition/meals/:id */ }
export async function updateMeal(baseUrl: string, id: string, input: MealInput): Promise<Meal> { /* PATCH /nutrition/meals/:id */ }
```

## Testabilidad (TDD)

- **backend:**
  - `updateFood` (via ruta): actualiza todos los campos + micros; scoping por usuario; 404 si es de otro usuario / no existe.
  - `getMealById`: trae la comida con ítems; null si es de otro usuario. `GET /meals/:id` → 404 si null.
  - `GET /foods/:id`: devuelve el food; 404 si null/ajeno.
  - `PATCH /foods/:id`: 200 con el food actualizado; 404 si no existe; valida `FoodInputSchema` (400).
- **mobile:** (las pantallas no se testean unitariamente; sí el helper puro `buildMealInput` que ya existe y no cambia). Verificación por typecheck + prueba en device.

## Entrega

- **Backend:** deploya en el merge (endpoints nuevos, sin migración).
- **Mobile:** OTA a vc10 (sin dep nativa) — debe reportar runtime android `784872cb…` ([[ota-fingerprint-gotcha]]).
- Orden: backend (deployable) → mobile → `eas update`.

## Riesgos

- **Reconstrucción de `MealRow` en edición:** depende de que los foods de la comida sigan en el catálogo. El caso orphan se maneja deshabilitando la edición con aviso (raro).
- **Re-agregar código que se borró:** `updateFood`/`PATCH /foods` se sacaron como YAGNI en #114; ahora hay un caso de uso real → se re-agregan con tests (evita el "dead code" que marcó el review anterior).
- **Consistencia del modo edición:** un solo componente sirve alta+edición (param-driven) → cuidar que el mount cargue los datos una sola vez (no re-pisar lo que el usuario tipea; usar un flag de "cargado" como en el patrón de `weightEdited`/`perfil`).
