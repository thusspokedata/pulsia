# Comidas — editar comida + editar alimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder editar una comida ya cargada (tap → pantalla de Nueva comida precargada → `PATCH /meals/:id`) y editar un alimento del catálogo (tap → pantalla de Agregar alimento precargada, a mano o con foto nueva → `PATCH /foods/:id`), sin romper las comidas ya cargadas (snapshot inmutable).

**Architecture:** Reusar las pantallas existentes en "modo edición" vía query param (`?mealId=` / `?foodId=`). Backend: re-agregar `updateFood` (repo) + `PATCH /foods/:id` (sacados como YAGNI en #114), y agregar `getMealById` (repo) + `GET /foods/:id` + `GET /meals/:id`. Sin migración, sin APK — deploy + OTA a vc10.

**Tech Stack:** Bun monorepo · Hono · Drizzle · Zod 4 · Expo/React Native · bun test (backend) · jest (mobile).

**Referencia:** spec `docs/superpowers/specs/2026-07-14-comidas-edicion-design.md`.

---

## File Structure

**Backend**
- Modify `backend/src/nutrition/repository.ts` — re-agregar `updateFood`, agregar `getMealById`.
- Modify `backend/src/routes/nutrition.ts` — `PATCH /foods/:id`, `GET /foods/:id`, `GET /meals/:id`.
- Modify `backend/src/routes/nutrition.test.ts` — tests de las rutas nuevas (extiende el fakeDb).

**Mobile**
- Modify `mobile/src/api/nutrition.ts` — `getFood`, `updateFood` (re-add), `getMeal`, `updateMeal`.
- Modify `mobile/app/nutricion/agregar-alimento.tsx` — modo edición (`?foodId`).
- Modify `mobile/app/nutricion/catalogo.tsx` — tap = editar.
- Modify `mobile/app/nutricion/nueva-comida.tsx` — modo edición (`?mealId`).
- Modify `mobile/app/(tabs)/nutricion.tsx` — tap en comida = editar.

**PR boundaries:** PR1 = backend (deployable). PR2 = mobile (OTA). O un solo PR.

---

## Fase 1 — Backend

### Task 1: Repo — `updateFood` (re-add) + `getMealById`

**Files:**
- Modify: `backend/src/nutrition/repository.ts`

- [ ] **Step 1: Add the two functions**

En `backend/src/nutrition/repository.ts`, después de `getFood` (y antes de `deleteFood`), agregar:

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

Y en la sección `---- Meals ----`, después de `getMealOwner`, agregar:

```ts
export async function getMealById(db: Db, userId: string, id: string): Promise<Meal | null> {
  const row = await db.query.meal.findFirst({ where: and(eq(meal.id, id), eq(meal.userId, userId)) });
  if (!row) return null;
  const items = await db.select().from(mealItem).where(eq(mealItem.mealId, id));
  return toMeal(row, items);
}
```

(`and`, `eq`, `food`, `meal`, `mealItem`, `toFood`, `toMeal`, `FoodInput`, `Food`, `Meal` ya están importados.)

- [ ] **Step 2: Typecheck**

Run: `cd backend && bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/nutrition/repository.ts
git commit -S -m "feat(backend): repo updateFood (re-add) + getMealById para edición"
```

---

### Task 2: Rutas — PATCH/GET foods + GET meals/:id

**Files:**
- Modify: `backend/src/routes/nutrition.ts`
- Test: `backend/src/routes/nutrition.test.ts`

- [ ] **Step 1: Write the failing tests**

En `backend/src/routes/nutrition.test.ts`, extender el `fakeDb` para que `query.meal.findFirst` pueda devolver una comida completa: reemplazar la línea `meal: { findFirst: ... }` por:

```ts
      meal: { findFirst: async () => opts.mealFull ?? (opts.meals?.[0] ? { userId: opts.meals[0].userId } : null) },
```

Y agregar el tipo del opts: en la firma `function fakeDb(opts: { foods?: any[]; meals?: any[]; items?: any[]; foodRow?: any } = {})` agregar `mealFull?: any`.

Agregar estos tests al final del archivo:

```ts
const MEAL_ID2 = "44444444-4444-4444-8444-444444444444";

test("GET /nutrition/foods/:id → 200 con el alimento", async () => {
  const app = createApp(deps(fakeDb({ foodRow: bananaRow })));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: FOOD_ID, name: "Banana", sugars_g: 12 });
});

test("GET /nutrition/foods/:id → 404 si no existe", async () => {
  const res = await createApp(deps(fakeDb())).request(`/nutrition/foods/${FOOD_ID}`);
  expect(res.status).toBe(404);
});

test("PATCH /nutrition/foods/:id → 200 con el alimento actualizado", async () => {
  const app = createApp(deps(fakeDb({ foodRow: { ...bananaRow, name: "Banana madura" } })));
  const res = await app.request(`/nutrition/foods/${FOOD_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Banana madura", basis: "per_100g", kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, unitWeightG: 120, source: "estimate", sugars_g: 15 }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ name: "Banana madura" });
});

test("PATCH /nutrition/foods/:id → 404 si no existe", async () => {
  const res = await createApp(deps(fakeDb())).request(`/nutrition/foods/${FOOD_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "X", basis: "per_100g", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, source: "estimate" }),
  });
  expect(res.status).toBe(404);
});

test("PATCH /nutrition/foods/:id → 400 con body inválido", async () => {
  const res = await createApp(deps(fakeDb({ foodRow: bananaRow }))).request(`/nutrition/foods/${FOOD_ID}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "", basis: "per_100g", kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0, unitWeightG: null, source: "estimate" }),
  });
  expect(res.status).toBe(400);
});

test("GET /nutrition/meals/:id → 200 con la comida", async () => {
  const app = createApp(deps(fakeDb({ mealFull: { id: MEAL_ID2, userId: "single-user", eatenAt: 123, mealType: "desayuno", note: null }, foods: [] })));
  const res = await app.request(`/nutrition/meals/${MEAL_ID2}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: MEAL_ID2, eatenAt: 123, mealType: "desayuno", items: [] });
});

test("GET /nutrition/meals/:id → 404 si no existe", async () => {
  const res = await createApp(deps(fakeDb())).request(`/nutrition/meals/${MEAL_ID2}`);
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && bun test src/routes/nutrition.test.ts`
Expected: FAIL — las rutas nuevas devuelven 404 (no existen).

- [ ] **Step 3: Add the routes**

En `backend/src/routes/nutrition.ts`:

Actualizar el import del repo (agregar `updateFood`, `getFood`, `getMealById`):

```ts
import {
  insertFood, listFoods, getFood, updateFood, deleteFood,
  createMeal, listMeals, updateMeal, deleteMeal, getMealById,
  MealValidationError,
} from "../nutrition/repository";
```

En la sección `// ---- Foods (catálogo) ----`, después de `r.get("/foods", ...)` y antes de `r.delete("/foods/:id", ...)`, agregar:

```ts
  r.get("/foods/:id", async (c) => {
    const f = await getFood(deps.db, c.get("userId"), c.req.param("id"));
    return f ? c.json(f) : c.json({ error: "No encontrado" }, 404);
  });

  r.patch("/foods/:id", async (c) => {
    const parsed = FoodInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Alimento inválido", detail: parsed.error.issues }, 400);
    const updated = await updateFood(deps.db, c.get("userId"), c.req.param("id"), parsed.data);
    return updated ? c.json(updated) : c.json({ error: "No encontrado" }, 404);
  });
```

En la sección `// ---- Meals ----`, después de `r.get("/meals", ...)` y antes de `r.patch("/meals/:id", ...)`, agregar:

```ts
  r.get("/meals/:id", async (c) => {
    const m = await getMealById(deps.db, c.get("userId"), c.req.param("id"));
    return m ? c.json(m) : c.json({ error: "No encontrada" }, 404);
  });
```

- [ ] **Step 4: Run tests + typecheck + full sweep**

Run: `cd backend && bun test src/routes/nutrition.test.ts && bun run typecheck`
Expected: PASS + typecheck limpio.
Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared backend`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/nutrition.ts backend/src/routes/nutrition.test.ts
git commit -S -m "feat(backend): rutas GET/PATCH /foods/:id + GET /meals/:id (edición)"
```

---

## Fase 2 — Mobile (OTA)

### Task 3: Cliente API — getFood, updateFood, getMeal, updateMeal

**Files:**
- Modify: `mobile/src/api/nutrition.ts`

- [ ] **Step 1: Add the functions**

En `mobile/src/api/nutrition.ts`, después de `listFoods` agregar `getFood` y `updateFood`:

```ts
export async function getFood(baseUrl: string, id: string): Promise<Food> {
  const res = await apiFetch(baseUrl, `/nutrition/foods/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar el alimento."));
  return (await res.json()) as Food;
}

export async function updateFood(baseUrl: string, id: string, input: FoodInput): Promise<Food> {
  const res = await apiFetch(baseUrl, `/nutrition/foods/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo actualizar el alimento."));
  return (await res.json()) as Food;
}
```

Después de `listMeals` agregar `getMeal` y `updateMeal`:

```ts
export async function getMeal(baseUrl: string, id: string): Promise<Meal> {
  const res = await apiFetch(baseUrl, `/nutrition/meals/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo cargar la comida."));
  return (await res.json()) as Meal;
}

export async function updateMeal(baseUrl: string, id: string, input: MealInput): Promise<Meal> {
  const res = await apiFetch(baseUrl, `/nutrition/meals/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo actualizar la comida."));
  return (await res.json()) as Meal;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/nutrition.ts
git commit -S -m "feat(mobile): cliente API getFood/updateFood/getMeal/updateMeal (edición)"
```

---

### Task 4: Agregar-alimento en modo edición

**Files:**
- Modify: `mobile/app/nutricion/agregar-alimento.tsx`

- [ ] **Step 1: Read foodId + prefill on mount**

En `mobile/app/nutricion/agregar-alimento.tsx`:

Actualizar el import de la API:
```tsx
import { extractFood, createFood, getFood, updateFood } from "../../src/api/nutrition";
```

Agregar `useLocalSearchParams` al import de expo-router:
```tsx
import { router, useLocalSearchParams } from "expo-router";
```

Dentro del componente, al inicio (después de los `useState`), leer el param:
```tsx
  const { foodId } = useLocalSearchParams<{ foodId?: string }>();
```

Reemplazar el `useEffect` de carga de baseUrl por uno que además precargue el alimento en modo edición:
```tsx
  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (foodId) {
        try {
          const f = await getFood(url, foodId);
          const numStr = (v: number | null | undefined) => (v == null ? "" : String(v));
          setForm({
            name: f.name, basis: f.basis, kcal: String(f.kcal), protein_g: String(f.protein_g),
            carbs_g: String(f.carbs_g), fat_g: String(f.fat_g),
            saturated_fat_g: numStr(f.saturated_fat_g), sugars_g: numStr(f.sugars_g),
            fiber_g: numStr(f.fiber_g), salt_g: numStr(f.salt_g),
            unitWeightG: f.unitWeightG == null ? "" : String(f.unitWeightG), source: f.source,
          });
        } catch (e) { setError((e as Error).message); }
      }
    })();
  }, [foodId]);
```

- [ ] **Step 2: Save → update or create**

En `save()`, reemplazar el bloque del try por:
```tsx
    setSaving(true);
    try {
      if (foodId) await updateFood(baseUrl.current, foodId, input);
      else await createFood(baseUrl.current, input);
      router.back();
    } catch (e) {
      setError((e as Error).message); setSaving(false);
    }
```

- [ ] **Step 3: Title + button label**

Reemplazar el título:
```tsx
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{foodId ? "Editar alimento" : "Agregar alimento"}</Text>
```

Reemplazar el texto del botón guardar:
```tsx
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : foodId ? "Guardar cambios" : "Guardar en el catálogo"}</Text>
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/nutricion/agregar-alimento.tsx
git commit -S -m "feat(mobile): agregar-alimento en modo edición (foto o a mano)"
```

---

### Task 5: Catálogo — tap para editar

**Files:**
- Modify: `mobile/app/nutricion/catalogo.tsx`

- [ ] **Step 1: Wrap the food info in a Pressable that navigates to edit**

En `mobile/app/nutricion/catalogo.tsx`, en el `filtered.map`, envolver el `<View style={{ flex: 1 }}>` (el que tiene el nombre + detalle) en un `Pressable` que navega a edición. Reemplazar:

```tsx
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{f.name}</Text>
```
por:
```tsx
          <Pressable style={{ flex: 1 }} onPress={() => router.push(`/nutricion/agregar-alimento?foodId=${f.id}`)}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{f.name}</Text>
```

Y cerrar ese `Pressable` (en vez del `</View>`) justo antes del `<Pressable onPress={() => remove(f)}`:
```tsx
          </Pressable>
          <Pressable onPress={() => remove(f)} style={{ padding: spacing.sm }}>
```

(`router` ya está importado de `expo-router` en este archivo.)

- [ ] **Step 2: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/nutricion/catalogo.tsx
git commit -S -m "feat(mobile): tap en el catálogo abre el alimento para editar"
```

---

### Task 6: Nueva-comida en modo edición

**Files:**
- Modify: `mobile/app/nutricion/nueva-comida.tsx`

- [ ] **Step 1: Read mealId, load + reconstruct once, orphan handling**

En `mobile/app/nutricion/nueva-comida.tsx`:

Actualizar el import de la API:
```tsx
import { listFoods, createMeal, getMeal, updateMeal } from "../../src/api/nutrition";
```

Actualizar el import de params y agregar el `mealId` + estado + guard (después de los `useState` existentes):
```tsx
  const params = useLocalSearchParams<{ eatenAt?: string; mealId?: string }>();
  const mealId = params.mealId;
  const [notEditable, setNotEditable] = useState(false);
  const initedRef = useRef(false);
```

Reemplazar el `useFocusEffect` por uno que además cargue la comida a editar una sola vez:
```tsx
  useFocusEffect(useCallback(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      let cat: Food[] = [];
      try { cat = await listFoods(url); setFoods(cat); } catch (e) { setError((e as Error).message); }
      if (mealId && !initedRef.current) {
        initedRef.current = true;
        try {
          const m = await getMeal(url, mealId);
          eatenAt.current = m.eatenAt;
          setMealType(m.mealType);
          setNote(m.note ?? "");
          const reconstructed = m.items.map((it) => {
            const food = cat.find((f) => f.id === it.foodId);
            return food ? { food, quantity: it.quantity, unit: it.quantityUnit } : null;
          });
          if (reconstructed.some((r) => r === null)) setNotEditable(true);
          else setRows(reconstructed as MealRow[]);
        } catch (e) { setError((e as Error).message); }
      }
    })();
  }, [mealId]));
```

- [ ] **Step 2: Save → update or create; block if notEditable**

Reemplazar `save()`:
```tsx
  async function save() {
    setError(null);
    if (notEditable) { setError("Esta comida tiene un alimento borrado del catálogo; no se puede editar."); return; }
    if (rows.length === 0) { setError("Agregá al menos un alimento."); return; }
    if (rows.some((r) => r.quantity <= 0)) { setError("Las cantidades tienen que ser mayores a 0."); return; }
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      const input = buildMealInput({ eatenAt: eatenAt.current, mealType, note, rows });
      if (mealId) await updateMeal(baseUrl.current, mealId, input);
      else await createMeal(baseUrl.current, input);
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }
```

- [ ] **Step 3: Title + orphan banner + button label**

Reemplazar el título:
```tsx
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{mealId ? "Editar comida" : "Nueva comida"}</Text>
      {notEditable && (
        <Text style={{ color: colors.danger, fontSize: 13 }}>
          Esta comida tiene un alimento que borraste del catálogo, así que no se puede editar. Borrala y volvé a cargarla.
        </Text>
      )}
```

Reemplazar el texto del botón guardar (buscar el `<Text>` dentro del `Pressable onPress={save}`):
```tsx
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : mealId ? "Guardar cambios" : "Guardar comida"}</Text>
```

Y deshabilitar el botón guardar si `notEditable` (agregar a su `disabled`): `disabled={saving || notEditable}`.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/nutricion/nueva-comida.tsx
git commit -S -m "feat(mobile): nueva-comida en modo edición (precarga + PATCH, caso orphan)"
```

---

### Task 7: Tab Nutrición — tap en comida edita

**Files:**
- Modify: `mobile/app/(tabs)/nutricion.tsx`

- [ ] **Step 1: Add onPress to the meal Pressable**

En `mobile/app/(tabs)/nutricion.tsx`, en el `meals.map`, el `<Pressable key={m.id} onLongPress={() => remove(m)} ...>` — agregar `onPress` para editar:
```tsx
        <Pressable key={m.id} onPress={() => router.push(`/nutricion/nueva-comida?mealId=${m.id}`)} onLongPress={() => remove(m)} style={{ ... }}>
```
(mantener el resto del `style` y contenido igual; `router` ya está importado.)

- [ ] **Step 2: Typecheck + full mobile sweep**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.
Run: `cd mobile && npm test -- --runInBand`
Expected: verde (nada de esto toca tests existentes).

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(tabs)/nutricion.tsx"
git commit -S -m "feat(mobile): tap en una comida del día la abre para editar"
```

---

## Fase 3 — Entrega

### Task 8: Merge → deploy + OTA (operacional)

> Backend deploya solo en el merge (endpoints nuevos, sin migración). Mobile por OTA. Requiere confirmación del usuario (publish externo).

- [ ] **Step 1: Merge** (ver finishing-a-development-branch). Verificar salud: `curl -s https://pulsia.lahuelladelcaminante.de/health`.
- [ ] **Step 2: OTA** (⚠️ confirmar con el usuario): `cd mobile && bunx --bun eas-cli update --branch preview --environment preview --message "editar comida + editar alimento" --non-interactive`. Si falla con `wrap-ansi`, limpiar el cache de bunx (`rm -rf` el dir `bunx-*eas-cli*` bajo `/private/var/folders/**/T/`) y reintentar ([[ota-fingerprint-gotcha]]).
- [ ] **Step 3:** Verificar que el `eas update` reporte runtime android `784872cb…` (vc10). El usuario cierra/reabre la app 2× para recibir la OTA.

---

## Self-Review (hecha por el autor del plan)

**Spec coverage:**
- Editar comida (tap → precarga → PATCH) → Task 2 (GET /meals/:id) + Task 6 (UI) + Task 7 (tap). PATCH /meals ya existía. ✅
- Editar alimento (tap → precarga → PATCH, a mano o foto) → Task 1/2 (updateFood + PATCH/GET foods/:id) + Task 4 (UI) + Task 5 (tap). ✅
- Snapshot inmutable (comidas viejas no cambian) → no se toca el snapshot; `updateFood` solo actualiza `food`. ✅
- Caso orphan (alimento borrado) → Task 6 (notEditable + banner + save bloqueado). ✅
- Cargar una sola vez (no re-pisar edits) → Task 6 (`initedRef` guard). ✅
- Re-agregar lo que se sacó como YAGNI, ahora con tests → Task 1/2. ✅
- Sin migración / sin APK → Fase 3 (deploy + OTA). ✅

**Placeholder scan:** sin TBD/TODO; cada step tiene código o comando real.

**Type consistency:** `getFood`/`updateFood`/`getMeal`/`updateMeal` usan `Food`/`FoodInput`/`Meal`/`MealInput` de `@pulsia/shared`. `updateFood` (repo) mapea snake→camel igual que `insertFood`. `getMealById` usa `toMeal`. Los params (`foodId`/`mealId`) son strings. `buildMealInput` sin cambios (ya arma `MealInput`). Rutas nuevas scopeadas por `c.get("userId")`.
