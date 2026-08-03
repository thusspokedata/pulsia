# Catálogo de comidas compartido — diseño

**Fecha:** 2026-08-03

## Problema

Cada usuario tiene su propio catálogo de alimentos (`food.user_id`). Como la familia comparte un
único `INVITE_CODE` y muchos usan **la API key de Claude del owner**, cada familiar que carga una
comida nueva dispara operaciones de IA caras (`/foods/extract`, `/foods/describe`,
`/foods/ai-micros` con web_search) **para alimentos que otro ya cargó**. Se re-buscan las mismas
comidas y se gastan tokens del owner sin sentido.

## Objetivo

Que el **catálogo `food` sea compartido** (lectura/reuso) entre todos los usuarios, para que reusen
las comidas ya cargadas en vez de re-crearlas con IA. Los **diarios personales siguen privados**.

## Decisiones (tomadas con el owner)

1. **Modelo de escritura:** catálogo **compartido en lectura**; **editar/borrar/refinar = solo el
   creador**. Nadie pisa el dato de otro.
2. **Duplicados existentes:** **juntar todo como está, sin dedup.** El catálogo compartido incluye
   todas las comidas actuales tal cual (puede haber 2-3 "banana"); de acá en más se reusa y no se
   generan nuevos. Sin migración de datos.
3. **Guarda anti-duplicado en `agregar-alimento`** (sugerir coincidencias antes de la IA):
   **diferida a fase 2.** El buscador de `nueva-comida` ya cubre el caso principal.

## Alcance de "compartido" vs "privado"

| Tabla | Cambia | Regla |
|---|---|---|
| `food` | **Sí** | Lectura compartida (todos); mutación solo el creador. `user_id` = creador. |
| `meal` / `meal_item` | No | Privado por `user_id`. |
| `water_log` | No | Privado. |
| `settings` / `profiles` / resto | No | Privado. |

**Sin cambio de esquema.** No hace falta migración: "juntar" = quitar el filtro `user_id` en las
queries de lectura/reuso. Se agrega un flag de lectura `mine` (calculado, no persistido).

## Diseño detallado

### Backend — `backend/src/nutrition/repository.ts`

**Lectura → compartida:**
- `listFoods(db, userId)`: quita `where(eq(food.userId, userId))` → devuelve **todo** el catálogo
  (`orderBy(asc(food.name))`). El `userId` se conserva **solo** para calcular `mine`.
- Lectura por id compartida: nueva `getFoodShared(db, id)` (sin filtro de user) para los consumidores
  de solo-lectura. `GET /foods/:id` la usa.
- **Flag `mine`:** las respuestas de lectura de `food` incluyen `mine: row.userId === userId`.
  Se agrega `mine?: boolean` (opcional) a `FoodSchema` en `shared/src/schemas/nutrition.ts` y se
  setea en el mapeo del route (no en `toFood`, que no conoce el `userId` del request).

**Reuso en comidas → compartido:**
- `createMeal` (línea ~118) y `updateMeal` (línea ~160): el lookup de alimentos
  `where(and(eq(food.userId, userId), inArray(food.id, ids)))` pierde el `eq(food.userId, userId)`
  → `where(inArray(food.id, ids))`. Podés registrar **tu** comida (que sigue siendo tuya) usando un
  alimento de cualquiera. `snapshotItems` valida que el `foodId` exista en el **catálogo compartido**
  (antes: "que sea del usuario"). Actualizar el comentario de la línea 120.

**Mutación → solo el creador (SIN cambio de query, ya filtran por `user_id`):**
- `updateFood` / `updateFoodRow` / `deleteFood`: siguen con `and(eq(food.id, id), eq(food.userId, userId))`.
- `usda-proposal` / `ai-micros-proposal` (NO mutan): gateados por `getFood(db, userId, …)` → un
  alimento ajeno da 404. Sin cambio.
- `usda-apply` / `ai-micros-apply` (SÍ mutan): pre-chequean con `getFoodOwner` → **403** en alimento
  ajeno (igual que `PATCH`/`DELETE`), 404 si no existe; el `updateFoodRow(db, userId, …)` sigue
  scopeado. (Consistencia con las otras mutaciones — se alineó tras la review.)

**Routes — `backend/src/routes/nutrition.ts`:**
- `GET /foods` y `GET /foods/:id`: setear `mine` en la respuesta.
- `PATCH /foods/:id` (update) y `DELETE /foods/:id`: cuando el alimento **existe pero no es del
  usuario**, responder **403** ("no sos el creador"), distinto del 404 "no existe". Requiere
  distinguir "no encontrado" de "no es tuyo": chequear existencia con `getFoodShared` y propiedad con
  el `user_id`. (Hoy devuelven 404 en ambos casos porque el update/delete filtra por user y da null.)

**Aislamiento de diarios (verificar, no cambiar):**
- `listItemsOfFood` (línea ~195) ya hace `JOIN meal ON meal.user_id` → el re-snapshot de un alimento
  compartido refinado por su creador **solo** toca los `meal_item` **del creador**; los diarios de
  los demás quedan con su snapshot histórico (correcto e inmutable). Los tests lo fijan.

### Mobile

- `mobile/app/nutricion/nueva-comida.tsx`: **sin cambios** — el buscador (`Buscar alimento del
  catálogo…`, filtro por nombre client-side) ya opera sobre lo que devuelve `listFoods`, que ahora
  es el catálogo compartido.
- `mobile/app/nutricion/catalogo.tsx`: muestra el catálogo compartido. **Borrar/editar solo para
  `mine`**; para las ajenas, ocultar/deshabilitar esos controles y mostrar un indicador sutil
  (ej. "de la familia"). Usa el flag `mine` de la API.
- `mobile/src/api/nutrition.ts` y el tipo `Food`: reflejar `mine?: boolean`.

## Testing

**Backend (la costura, no solo las piezas):**
- A crea "banana"; B la ve en `listFoods` (con `mine=false`); A la ve con `mine=true`.
- B registra una comida usando la "banana" de A → OK; la comida queda como de B.
- B intenta `PATCH`/`DELETE` (o `usda-apply`/`ai-micros-apply` sobre) la "banana" de A → **403**; sigue existiendo.
- A `DELETE` su propia "banana" → OK.
- **Aislamiento:** `listMeals(B)` no incluye comidas de A; A no ve el diario de B.
- **Re-snapshot:** A refina "banana" con USDA → los `meal_item` de A se re-snapshotean; los de B
  **no** cambian.

**Mobile:**
- `catalogo`: no renderiza borrar/editar en un alimento con `mine=false`; sí en `mine=true`.

## Fuera de alcance (fase 2)

- Guarda anti-duplicado en `agregar-alimento` (sugerir coincidencias del compartido antes de la IA).
- Dedup de los duplicados actuales / merge manual.
- Concepto de "workspace"/múltiples invite codes (hoy hay uno solo → compartido = global).
