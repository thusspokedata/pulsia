# Catálogo de comidas compartido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el catálogo `food` sea compartido en lectura/reuso entre todos los usuarios (ahorra tokens de IA), manteniendo editar/borrar/refinar solo para el creador y los diarios personales privados.

**Architecture:** Sin cambio de esquema. Se quita el filtro `user_id` de las queries de LECTURA/REUSO (`listFoods`, lookup de alimentos en `createMeal`/`updateMeal`, `GET /foods/:id`) y se conserva en las de MUTACIÓN (`updateFood`/`deleteFood`/USDA/AI). Se agrega un flag de lectura `mine` calculado (no persistido) para que el móvil muestre borrar/editar solo en los alimentos propios.

**Tech Stack:** Hono + drizzle (backend), zod (shared), React Native/Expo (mobile), jest + @testing-library/react-native.

**Decisiones del owner:** compartido en lectura / mutar solo el creador; duplicados actuales se juntan sin dedup (sin migración de datos); guarda anti-duplicado en `agregar-alimento` → fase 2.

---

## File Structure

- `shared/src/schemas/nutrition.ts` — agrega `mine?: boolean` a `FoodSchema` (solo lectura).
- `backend/src/nutrition/repository.ts` — `listFoods` compartido + `mine`; nuevas `getFoodShared` y `getFoodOwner`; quitar filtro `user_id` del lookup de alimentos en `createMeal`/`updateMeal`.
- `backend/src/routes/nutrition.ts` — `GET /foods` y `GET /foods/:id` compartidos con `mine`; `PATCH`/`DELETE /foods/:id` devuelven 403 cuando el alimento existe pero no es del usuario.
- `backend/src/nutrition/repository.test.ts` y `backend/src/routes/nutrition.test.ts` — tests.
- `mobile/app/nutricion/catalogo.tsx` y `mobile/app/nutricion/alimento.tsx` — mostrar borrar/editar solo si `mine`.
- `mobile/__tests__/catalogo-shared.test.tsx` — test de gating.

---

### Task 1: `mine` en el schema compartido

**Files:**
- Modify: `shared/src/schemas/nutrition.ts:95-99`
- Test: `shared/src/schemas/nutrition.test.ts` (si no existe, crear junto a otros tests de shared; si el repo pone los tests de shared en otro lado, seguí ese patrón)

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest"; // usar el runner del workspace shared (ver otros *.test.ts de shared)
import { FoodSchema } from "./nutrition";

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3,
  unitWeightG: 120, sourceMacros: "ai", searchQuery: "banana", createdAt: 1,
};

describe("FoodSchema.mine", () => {
  it("acepta mine ausente (retrocompat)", () => {
    expect(FoodSchema.parse(base).mine).toBeUndefined();
  });
  it("acepta mine boolean", () => {
    expect(FoodSchema.parse({ ...base, mine: true }).mine).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: el comando de tests del workspace shared (ej. `bun test` en `shared/` o `bunx vitest run shared/src/schemas/nutrition.test.ts` — usar el que ya use el repo).
Expected: FAIL (`mine` no existe en el tipo / no se parsea).

- [ ] **Step 3: Implementar el cambio mínimo**

En `shared/src/schemas/nutrition.ts`, extender `FoodSchema` (NO `FoodInputSchema`, que es input y no lleva `mine`):

```ts
// Alimento persistido / devuelto por el backend.
export const FoodSchema = FoodInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.number().int(),
  // Solo lectura: lo setea el backend en las respuestas de catálogo. `true` si el alimento lo
  // creó el usuario que hace el request (el catálogo es compartido; editar/borrar es del creador).
  mine: z.boolean().optional(),
});
export type Food = z.infer<typeof FoodSchema>;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/schemas/nutrition.ts shared/src/schemas/nutrition.test.ts
git commit -S -m "feat(nutrition): campo de lectura mine en FoodSchema"
```

---

### Task 2: Backend — lectura compartida del catálogo + `mine` + helpers de propiedad

**Files:**
- Modify: `backend/src/nutrition/repository.ts:81-89` (`listFoods`, `getFood`)
- Test: `backend/src/nutrition/repository.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `repository.test.ts` (seguir el patrón existente para crear usuarios y `db`):

```ts
it("listFoods devuelve el catálogo COMPARTIDO con mine correcto", async () => {
  const a = await createUser(db); // helper existente en este archivo
  const b = await createUser(db);
  const fa = await insertFood(db, a, foodInput({ name: "Banana" }));
  await insertFood(db, b, foodInput({ name: "Avena" }));

  const forA = await listFoods(db, a);
  const names = forA.map((f) => f.name).sort();
  expect(names).toEqual(["Avena", "Banana"]); // A ve el de B también
  expect(forA.find((f) => f.id === fa.id)!.mine).toBe(true);
  expect(forA.find((f) => f.name === "Avena")!.mine).toBe(false);
});

it("getFoodShared devuelve un alimento de otro usuario, con mine=false", async () => {
  const a = await createUser(db);
  const b = await createUser(db);
  const fa = await insertFood(db, a, foodInput({ name: "Banana" }));
  const seen = await getFoodShared(db, fa.id, b);
  expect(seen?.name).toBe("Banana");
  expect(seen?.mine).toBe(false);
});

it("getFoodOwner devuelve el creador y null si no existe", async () => {
  const a = await createUser(db);
  const fa = await insertFood(db, a, foodInput({ name: "Banana" }));
  expect((await getFoodOwner(db, fa.id))?.userId).toBe(a);
  expect(await getFoodOwner(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
});
```

> Nota: si `repository.test.ts` no tiene helpers `createUser`/`foodInput`, usar los que ya emplea el archivo (revisar los tests existentes de `insertFood`/`listFoods`) o crear equivalentes mínimos.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && bun test src/nutrition/repository.test.ts` (o el runner del repo).
Expected: FAIL (`listFoods` filtra por user; `getFoodShared`/`getFoodOwner` no existen).

- [ ] **Step 3: Implementar**

En `backend/src/nutrition/repository.ts`:

```ts
export async function listFoods(db: Db, userId: string): Promise<Food[]> {
  // Catálogo COMPARTIDO: se devuelven los alimentos de TODOS. `userId` se usa solo para marcar
  // cuáles son del que consulta (editar/borrar es del creador). Ver el spec del catálogo compartido.
  const rows = await db.select().from(food).orderBy(asc(food.name));
  return rows.map((r) => ({ ...toFood(r), mine: r.userId === userId }));
}

// Lectura compartida por id: cualquier usuario puede leer cualquier alimento del catálogo. `viewerId`
// solo calcula `mine`. Para las mutaciones seguí usando `getFood(db, userId, id)` (gatea por creador).
export async function getFoodShared(db: Db, id: string, viewerId: string): Promise<Food | null> {
  const row = await db.query.food.findFirst({ where: eq(food.id, id) });
  return row ? { ...toFood(row), mine: row.userId === viewerId } : null;
}

// Solo el creador, para distinguir 404 (no existe) de 403 (no es tuyo) en las rutas de mutación.
export async function getFoodOwner(db: Db, id: string): Promise<{ userId: string } | null> {
  const row = await db.query.food.findFirst({ where: eq(food.id, id), columns: { userId: true } });
  return row ?? null;
}
```

`getFood(db, userId, id)` (línea 86) queda **sin cambios**: sigue gateando por creador para las rutas de mutación (USDA/AI).

- [ ] **Step 4: Correr y verificar que pasan**

Expected: PASS (los 3 tests nuevos + los existentes de `listFoods` — OJO: revisar que ningún test viejo asumiera que `listFoods` filtraba por user; si lo asumía, ajustarlo a la semántica compartida).

- [ ] **Step 5: Commit**

```bash
git add backend/src/nutrition/repository.ts backend/src/nutrition/repository.test.ts
git commit -S -m "feat(nutrition): lectura compartida del catálogo + mine + helpers de propiedad"
```

---

### Task 3: Backend — reusar alimentos ajenos al registrar/editar comidas

**Files:**
- Modify: `backend/src/nutrition/repository.ts:116-130` (`createMeal`), `:156-171` (`updateMeal`)
- Test: `backend/src/nutrition/repository.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
it("createMeal permite usar un alimento de OTRO usuario; la comida es del que la registra", async () => {
  const a = await createUser(db);
  const b = await createUser(db);
  const fa = await insertFood(db, a, foodInput({ name: "Banana" }));

  const meal = await createMeal(db, b, {
    eatenAt: Date.now(), mealType: "snack", note: null,
    items: [{ foodId: fa.id, quantity: 100, quantityUnit: "g" }],
  });
  expect(meal.items[0].foodName).toBe("Banana");

  const mealsB = await listMeals(db, b);
  const mealsA = await listMeals(db, a);
  expect(mealsB).toHaveLength(1);   // la comida es de B
  expect(mealsA).toHaveLength(0);   // A no ve la comida de B (aislamiento de diarios)
});

it("createMeal tira si el foodId no existe en el catálogo compartido", async () => {
  const b = await createUser(db);
  await expect(createMeal(db, b, {
    eatenAt: Date.now(), mealType: null, note: null,
    items: [{ foodId: "00000000-0000-0000-0000-000000000000", quantity: 100, quantityUnit: "g" }],
  })).rejects.toThrow();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Expected: FAIL (hoy el lookup filtra `eq(food.userId, userId)` → el alimento de A no aparece para B → `snapshotItems` tira "no encontrado").

- [ ] **Step 3: Implementar**

En `createMeal` (línea ~118) quitar el filtro de usuario del lookup del catálogo:

```ts
  const ids = [...new Set(input.items.map((i) => i.foodId))];
  // Catálogo COMPARTIDO: se puede registrar la comida propia usando un alimento de cualquiera.
  // El aislamiento de diarios lo da que la `meal` se inserta con `userId` (abajo), no el lookup.
  const foods = await db.select().from(food).where(inArray(food.id, ids));
  const catalog = new Map(foods.map((f) => [f.id, f]));
  const snapped = snapshotItems(input.items, catalog); // tira si algún foodId no está en el catálogo compartido
```

En `updateMeal` (línea ~160), el mismo cambio en su lookup:

```ts
  const ids = [...new Set(input.items.map((i) => i.foodId))];
  const foods = await db.select().from(food).where(inArray(food.id, ids));
  const snapped = snapshotItems(input.items, new Map(foods.map((f) => [f.id, f])));
```

(La propiedad de la `meal` en `updateMeal` sigue chequeada arriba por `getMealOwner` — sin cambio.)

- [ ] **Step 4: Correr y verificar que pasan**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/nutrition/repository.ts backend/src/nutrition/repository.test.ts
git commit -S -m "feat(nutrition): registrar comidas reusando alimentos del catálogo compartido"
```

---

### Task 4: Backend routes — GET compartido con `mine` y 403 en mutación ajena

**Files:**
- Modify: `backend/src/routes/nutrition.ts:242-261`
- Test: `backend/src/routes/nutrition.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Seguir el patrón de `nutrition.test.ts` (app de test + helper de login por usuario). Agregar:

```ts
it("GET /foods es compartido y marca mine", async () => {
  // A crea "Banana"; B pide GET /foods y la ve con mine=false
  // (usar los helpers del archivo para registrar A y B y setear su sesión)
  // ...
  const res = await appB.request("/nutrition/foods");
  const list = await res.json();
  expect(list.find((f: any) => f.name === "Banana").mine).toBe(false);
});

it("DELETE /foods/:id ajeno → 403; propio → 200", async () => {
  // fa = alimento de A
  const forbidden = await appB.request(`/nutrition/foods/${fa.id}`, { method: "DELETE" });
  expect(forbidden.status).toBe(403);
  const own = await appA.request(`/nutrition/foods/${fa.id}`, { method: "DELETE" });
  expect(own.status).toBe(200);
});

it("PATCH /foods/:id ajeno → 403; inexistente → 404", async () => {
  const forbidden = await appB.request(`/nutrition/foods/${fa.id}`, { method: "PATCH", body: JSON.stringify(foodInput({ name: "X" })), headers: { "content-type": "application/json" } });
  expect(forbidden.status).toBe(403);
  const missing = await appA.request(`/nutrition/foods/00000000-0000-0000-0000-000000000000`, { method: "PATCH", body: JSON.stringify(foodInput({ name: "X" })), headers: { "content-type": "application/json" } });
  expect(missing.status).toBe(404);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && bun test src/routes/nutrition.test.ts`.
Expected: FAIL (GET /foods/:id gatea por user; DELETE/PATCH ajeno da 404 en vez de 403; falta `mine`).

- [ ] **Step 3: Implementar**

En `backend/src/routes/nutrition.ts`, importar los helpers nuevos (`getFoodShared`, `getFoodOwner`) y:

```ts
  r.get("/foods", async (c) => {
    return c.json(await listFoods(deps.db, c.get("userId")));
  });

  r.get("/foods/:id", async (c) => {
    const f = await getFoodShared(deps.db, c.req.param("id"), c.get("userId"));
    return f ? c.json(f) : c.json({ error: "No encontrado" }, 404);
  });

  r.patch("/foods/:id", async (c) => {
    const parsed = FoodInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Alimento inválido", detail: parsed.error.issues }, 400);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const owner = await getFoodOwner(deps.db, id);
    if (!owner) return c.json({ error: "No encontrado" }, 404);
    if (owner.userId !== userId) return c.json({ error: "No sos el creador de este alimento" }, 403);
    const updated = await updateFood(deps.db, userId, id, parsed.data);
    return updated ? c.json(updated) : c.json({ error: "No encontrado" }, 404);
  });

  r.delete("/foods/:id", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const owner = await getFoodOwner(deps.db, id);
    if (!owner) return c.json({ error: "No encontrado" }, 404);
    if (owner.userId !== userId) return c.json({ error: "No sos el creador de este alimento" }, 403);
    const ok = await deleteFood(deps.db, userId, id);
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrado" }, 404);
  });
```

- [ ] **Step 4: Correr y verificar que pasan**

Expected: PASS. Correr TODA la suite de `nutrition.test.ts` para no romper nada.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/nutrition.ts backend/src/routes/nutrition.test.ts
git commit -S -m "feat(nutrition): GET /foods compartido con mine + 403 al mutar alimento ajeno"
```

---

### Task 5: Backend — test de regresión del aislamiento del re-snapshot USDA

**Files:**
- Test: `backend/src/nutrition/repository.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
it("refinar un alimento compartido re-snapshotea SOLO los meal_item del creador", async () => {
  const a = await createUser(db);
  const b = await createUser(db);
  const fa = await insertFood(db, a, foodInput({ name: "Banana", kcal: 89 }));
  // A y B registran una comida con el MISMO alimento de A
  await createMeal(db, a, { eatenAt: Date.now(), mealType: null, note: null, items: [{ foodId: fa.id, quantity: 100, quantityUnit: "g" }] });
  await createMeal(db, b, { eatenAt: Date.now(), mealType: null, note: null, items: [{ foodId: fa.id, quantity: 100, quantityUnit: "g" }] });

  // A refina el alimento (cambia kcal) y re-snapshotea SUS ítems
  const nuevo = await updateFoodRow(db, a, fa.id, foodInput({ name: "Banana", kcal: 200 }));
  await resnapshotItemsOfFood(db, a, fa.id, nuevo!);

  const mealsA = await listMeals(db, a);
  const mealsB = await listMeals(db, b);
  expect(mealsA[0].items[0].kcal).toBe(200); // el de A se actualizó
  expect(mealsB[0].items[0].kcal).toBe(89);  // el de B NO cambió (snapshot histórico intacto)
});
```

> Ajustar los nombres/firmas a los reales de `updateFoodRow`/`resnapshotItemsOfFood` (ver `repository.ts:98,220`).

- [ ] **Step 2: Correr**

Expected: PASS sin cambios de producción (el JOIN `meal.user_id` de `listItemsOfFood` ya aísla). Si FALLA, hay una fuga real: investigar `resnapshotItemsOfFood`/`listItemsOfFood` antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add backend/src/nutrition/repository.test.ts
git commit -S -m "test(nutrition): el re-snapshot de un alimento compartido no toca diarios ajenos"
```

---

### Task 6: Mobile — borrar/editar solo en alimentos propios

**Files:**
- Modify: `mobile/app/nutricion/catalogo.tsx:23-44` (ocultar "Borrar" si no es `mine`)
- Modify: `mobile/app/nutricion/alimento.tsx` (ocultar "Editar" si no es `mine`; revisar el archivo para el botón exacto)
- Test: `mobile/__tests__/catalogo-shared.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { render } from "@testing-library/react-native";
import { FoodRow } from "../app/nutricion/catalogo"; // exportar FoodRow para poder testearlo

const base = { id: "1", name: "Banana", basis: "per_100g", kcal: 89, protein_g: 1, carbs_g: 23, fat_g: 0, unitWeightG: null, sourceMacros: "ai", sourceMicros: null, usdaFdcId: null, createdAt: 1 } as any;

it("muestra Borrar en un alimento propio", () => {
  const { queryByText } = render(<FoodRow food={{ ...base, mine: true }} onDelete={() => {}} />);
  expect(queryByText("Borrar")).toBeTruthy();
});
it("NO muestra Borrar en un alimento ajeno", () => {
  const { queryByText } = render(<FoodRow food={{ ...base, mine: false }} onDelete={() => {}} />);
  expect(queryByText("Borrar")).toBeNull();
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd mobile && bun test __tests__/catalogo-shared.test.tsx` (o el runner jest del repo).
Expected: FAIL (`FoodRow` no está exportado y siempre muestra "Borrar").

- [ ] **Step 3: Implementar**

En `catalogo.tsx`: exportar `FoodRow` y gatear el botón. `mine === false` = ajeno; `mine` ausente (retrocompat, backend viejo) o `true` = mostrar:

```tsx
export function FoodRow({ food, onDelete }: { food: Food; onDelete: (f: Food) => void }) {
  const canEdit = food.mine !== false; // ajeno solo si el backend dijo mine=false explícito
  return (
    <View style={{ /* ...igual... */ }}>
      <Pressable style={{ flex: 1 }} onPress={() => router.push(`/nutricion/alimento?id=${food.id}`)}>
        {/* ...igual... */}
      </Pressable>
      {canEdit ? (
        <Pressable onPress={() => onDelete(food)} style={{ padding: spacing.sm }}>
          <Text style={{ color: colors.danger }}>Borrar</Text>
        </Pressable>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 12, paddingHorizontal: spacing.sm }}>de la familia</Text>
      )}
    </View>
  );
}
```

En `alimento.tsx` (pantalla de detalle): gatear el botón "Editar" con la misma condición `food.mine !== false` (leer el archivo para ubicar el control exacto; si el detalle permite editar, ocultarlo/deshabilitarlo cuando no sea propio).

- [ ] **Step 4: Correr y verificar que pasa**

Expected: PASS. Correr la suite mobile para no romper nada.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/nutricion/catalogo.tsx mobile/app/nutricion/alimento.tsx mobile/__tests__/catalogo-shared.test.tsx
git commit -S -m "feat(nutrition): en el catálogo, borrar/editar solo en alimentos propios (mine)"
```

---

## Notas de cierre (post-implementación)

- Correr las suites completas de `backend/` y `mobile/` + typecheck del monorepo antes del PR.
- **Móvil JS-only** → tras mergear, publicar OTA (`eas update --branch preview --environment preview`) y **verificar runtime `"11"`** (ver `docs/ota-runtime-version.md`).
- Backend cambia → se despliega a la Pi por el flujo normal.
- Actualizar la memoria `nutrition-comidas-status` con el catálogo compartido.
- **Fase 2 (fuera de alcance):** guarda anti-duplicado en `agregar-alimento` (sugerir coincidencias del compartido antes de la IA).
