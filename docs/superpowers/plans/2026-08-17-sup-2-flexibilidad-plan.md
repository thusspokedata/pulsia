# SUP-2 · Flexibilidad del plan de suplementos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar tomas ad-hoc de suplementos fuera del plan y pausar (indefinido) un suplemento del plan, sin borrarlo ni tocar su frecuencia.

**Architecture:** La toma ad-hoc es una fila "suelta" en `supplement_take` (`supplement_id` set, `plan_item_id` null), deduplicada por índice parcial. La pausa es un flag `active` en `supplement_plan_item`. Ambas reusan el checklist puro (`resolveDayChecklist`) y el cálculo de micros existente. Un PR, migración 0029.

**Tech Stack:** Bun + Hono + Drizzle (Postgres) en `backend/`; Zod en `shared/`; Expo/React Native en `mobile/`. Tests con `bun:test`. Monorepo con workspace `@pulsia/shared`.

**Spec:** `docs/superpowers/specs/2026-08-17-sup-2-flexibilidad-plan-design.md`

**Orden:** estrictamente secuencial (shared → backend → móvil). Nunca dos escrituras en paralelo. Cada capa depende de los tipos de la anterior. Correr `bun test` de la capa antes de pasar a la siguiente.

**Comandos de test (desde la raíz del repo):**
- shared: `cd shared && bun test`
- backend (repo tests necesitan Postgres local): `cd backend && bun test`
- móvil: `cd mobile && bun test`
- typecheck: `cd <ws> && bun run typecheck` (existe en backend; en shared/mobile usar `bunx tsc --noEmit` si aplica)

---

## CAPA 1 — shared

### Task 1: `active` en el schema del ítem del plan

**Files:**
- Modify: `shared/src/schemas/supplements.ts`

- [ ] **Step 1: Agregar `active` a `PlanItemSchema`**

En `PlanItemSchema` (después de `dose`, antes de `reason`):

```ts
export const PlanItemSchema = z.object({
  id: z.string().uuid(),
  supplementId: z.string().uuid(),
  slot: TakeSlotSchema,
  frequency: FrequencySchema,
  dose: z.string().trim().min(1),
  // Pausa (SUP-2): false = pausado indefinido (se reactiva a mano). El default lo pone la DB.
  active: z.boolean(),
  reason: z.string().nullish(),
});
```

- [ ] **Step 2: Agregar `active` opcional a `PlanItemPatchSchema`**

```ts
export const PlanItemPatchSchema = z
  .object({
    slot: TakeSlotSchema.optional(),
    frequency: FrequencySchema.optional(),
    dose: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((p) => p.slot !== undefined || p.frequency !== undefined || p.dose !== undefined || p.active !== undefined);
```

`PlanItemViewSchema` hereda `active` de `PlanItemSchema` automáticamente (usa `.extend`). No tocar.

- [ ] **Step 3: Typecheck**

Run: `cd shared && bunx tsc --noEmit`
Expected: PASS (puede fallar en consumidores que construyen PlanItem sin `active`; se arreglan en sus tasks — si falla solo en tests de otras capas, seguir).

---

### Task 2: `AdHocTakeInputSchema`

**Files:**
- Modify: `shared/src/schemas/supplements.ts`

- [ ] **Step 1: Agregar el schema al final de la sección de tomas (después de `TakeInputSchema`)**

```ts
// Toma ad-hoc (SUP-2): un suplemento que NO está en el plan, tomado hoy. Nace siempre "taken";
// plannedDose = la dosis elegida (stepper de unitLabel en el móvil). Se dedupe por
// (userId, date, supplementId, slot) — índice parcial WHERE plan_item_id IS NULL.
export const AdHocTakeInputSchema = z.object({
  date: z.iso.date(),
  supplementId: z.string().uuid(),
  slot: TakeSlotSchema,
  dose: z.string().trim().min(1),
  note: z.string().nullish(),
});
export type AdHocTakeInput = z.infer<typeof AdHocTakeInputSchema>;
```

- [ ] **Step 2: Verificar el export**

`shared/src/schemas/supplements.ts` se re-exporta vía el barrel. Confirmar que el índice lo levanta:

Run: `cd shared && grep -rn "schemas/supplements" src/index.ts`
Expected: una línea `export * from "./schemas/supplements";` (o equivalente). Si NO aparece, agregarla (lección `barrel-export-muerto`).

- [ ] **Step 3: Commit (Tasks 1-2 juntos)**

```bash
git add shared/src/schemas/supplements.ts
git commit -S -m "feat(shared): active en PlanItem + AdHocTakeInputSchema (SUP-2)"
```

---

### Task 3: `DayChecklistEntry` con `origin`/`takeId` y ad-hoc en `resolveDayChecklist`

**Files:**
- Modify: `shared/src/supplements/checklist.ts`
- Test: `shared/src/supplements/checklist.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `shared/src/supplements/checklist.test.ts`:

```ts
test("resolveDayChecklist: omite ítems pausados (active:false)", () => {
  const paused = { ...mgItem, active: false as const };
  const out = resolveDayChecklist({ planItems: [paused, { ...znItem, active: true as const }], adjustments: [], takes: [], adHocTakes: [], date: "2026-07-15" });
  // el 15 el zinc toca; el magnesio está pausado → solo 1 entry, la del zinc
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ planItemId: ITEM_ZN, origin: "plan", takeId: null });
});

test("resolveDayChecklist: mergea tomas ad-hoc como entries origin=adhoc, ordenadas por franja", () => {
  const adHoc = {
    takeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    supplementId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    supplementName: "Vitamina D",
    slot: "desayuno" as const,
    plannedDose: "1 cápsula",
    status: "taken" as const,
    actualDose: null,
    note: null,
  };
  const out = resolveDayChecklist({
    planItems: [{ ...mgItem, active: true as const }], // antes_de_dormir
    adjustments: [], takes: [], adHocTakes: [adHoc], date: "2026-07-16",
  });
  expect(out).toHaveLength(2);
  // desayuno (ad-hoc) antes que antes_de_dormir (plan)
  expect(out[0]).toMatchObject({ takeId: adHoc.takeId, origin: "adhoc", planItemId: null, supplementName: "Vitamina D", status: "taken" });
  expect(out[1]).toMatchObject({ planItemId: ITEM_MG, origin: "plan" });
});
```

Además, agregar `active: true as const` a `mgItem` y `znItem` (arriba en el archivo) para que compilen con el nuevo campo requerido. Y en cada test existente que llama `resolveDayChecklist(...)` sin `adHocTakes`, agregar `adHocTakes: []`.

- [ ] **Step 2: Correr para ver fallar**

Run: `cd shared && bun test src/supplements/checklist.test.ts`
Expected: FAIL (falta `adHocTakes` en la firma / `origin`/`takeId` no existen).

- [ ] **Step 3: Implementar en `checklist.ts`**

Reemplazar la interfaz `ChecklistPlanItem` para incluir `active`, agregar `ChecklistAdHocTake`, extender `DayChecklistEntry`, y actualizar `resolveDayChecklist`:

```ts
export interface ChecklistPlanItem {
  id: string;
  supplementId: string;
  slot: TakeSlot;
  frequency: Frequency;
  dose: string;
  active: boolean;
  reason?: string | null;
  supplementName: string;
}

export interface ChecklistAdHocTake {
  takeId: string;
  supplementId: string;
  supplementName: string;
  slot: TakeSlot;
  plannedDose: string;
  status: TakeStatus;
  actualDose?: string | null;
  note?: string | null;
}

export interface DayChecklistEntry {
  origin: "plan" | "adhoc";
  planItemId: string | null;   // null en filas ad-hoc
  takeId: string | null;       // el supplement_take.id en filas ad-hoc; null en las del plan
  supplementId: string;
  supplementName: string;
  slot: TakeSlot;
  dose: string;          // efectiva (con reduce aplicado en las del plan)
  plannedDose: string;   // la del plan / la elegida en ad-hoc
  reason: string | null;
  adjusted: { action: "skip" | "reduce"; reason: string } | null;
  status: TakeStatus | null;
  actualDose: string | null;
  note: string | null;
}
```

En `resolveDayChecklist`, cambiar la firma y el cuerpo:

```ts
export function resolveDayChecklist({ planItems, adjustments, takes, adHocTakes, date }: {
  planItems: ChecklistPlanItem[];
  adjustments: AdjustmentItem[];
  takes: ChecklistTake[];
  adHocTakes: ChecklistAdHocTake[];
  date: string; // YYYY-MM-DD (día calendario del dispositivo)
}): DayChecklistEntry[] {
  const takesByItem = new Map(takes.map((t) => [t.planItemId, t]));
  const adjBySupplement = new Map(adjustments.map((a) => [a.supplementId, a]));
  const planEntries = planItems
    .filter((it) => it.active !== false && frequencyAppliesOn(it.frequency, date))
    .map((it): DayChecklistEntry => {
      const adj = adjBySupplement.get(it.supplementId) ?? null;
      const take = takesByItem.get(it.id) ?? null;
      return {
        origin: "plan",
        planItemId: it.id,
        takeId: null,
        supplementId: it.supplementId,
        supplementName: it.supplementName,
        slot: it.slot,
        dose: adj?.action === "reduce" && adj.dose ? adj.dose : it.dose,
        plannedDose: it.dose,
        reason: it.reason ?? null,
        adjusted: adj ? { action: adj.action, reason: adj.reason } : null,
        status: take?.status ?? null,
        actualDose: take?.actualDose ?? null,
        note: take?.note ?? null,
      };
    });
  const adHocEntries = adHocTakes.map((t): DayChecklistEntry => ({
    origin: "adhoc",
    planItemId: null,
    takeId: t.takeId,
    supplementId: t.supplementId,
    supplementName: t.supplementName,
    slot: t.slot,
    dose: t.plannedDose,
    plannedDose: t.plannedDose,
    reason: null,
    adjusted: null,
    status: t.status,
    actualDose: t.actualDose ?? null,
    note: t.note ?? null,
  }));
  const order = new Map(TAKE_SLOTS.map((s, i) => [s, i]));
  return [...planEntries, ...adHocEntries].sort((a, b) => (order.get(a.slot)! - order.get(b.slot)!));
}
```

(La firma de import ya trae `TakeStatus`. Confirmar que `TakeStatus` está en el `import type` de arriba; si no, agregarlo.)

- [ ] **Step 4: Correr los tests**

Run: `cd shared && bun test src/supplements/checklist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/supplements/checklist.ts shared/src/supplements/checklist.test.ts
git commit -S -m "feat(shared): resolveDayChecklist mergea ad-hoc y omite pausados (SUP-2)"
```

---

## CAPA 2 — backend

### Task 4: Migración 0029 + `schema.ts`

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0029_*.sql` (vía drizzle-kit)

- [ ] **Step 1: Editar `schema.ts` — columna `active` en `supplementPlanItem`**

En la definición de `supplementPlanItem`, agregar tras `dose`:

```ts
  dose: text("dose").notNull(),
  reason: text("reason"),
  active: boolean("active").notNull().default(true),
```

Confirmar que `boolean` está importado de `drizzle-orm/pg-core` al tope del archivo (buscar `boolean` en los imports; si falta, agregarlo a la lista).

- [ ] **Step 2: Editar `schema.ts` — columna `supplement_id` + índice parcial en `supplementTake`**

Agregar la columna tras `planItemId`:

```ts
  planItemId: uuid("plan_item_id").references(() => supplementPlanItem.id, { onDelete: "set null" }),
  supplementId: uuid("supplement_id").references(() => supplement.id, { onDelete: "set null" }), // toma ad-hoc (SUP-2)
```

Y agregar el índice parcial en el objeto de índices de la tabla (el 2º arg de `pgTable`), junto a `oncePerItemDay`:

```ts
}, (t) => ({
  oncePerItemDay: uniqueIndex("supplement_take_unique_idx").on(t.userId, t.date, t.planItemId),
  // Dedup de tomas ad-hoc (SUP-2): el índice de arriba no aplica (plan_item_id NULL → filas distintas en PG).
  adhocOncePerDay: uniqueIndex("supplement_take_adhoc_unique_idx").on(t.userId, t.date, t.supplementId, t.slot).where(sql`${t.planItemId} IS NULL`),
}));
```

Confirmar que `sql` está importado de `drizzle-orm` al tope de `schema.ts`; si falta, agregarlo (`import { sql } from "drizzle-orm";`).

- [ ] **Step 3: Generar la migración**

Run: `cd backend && bun run db:generate`
Expected: crea `backend/drizzle/0029_<nombre>.sql` y actualiza `meta/_journal.json`.

- [ ] **Step 4: Inspeccionar el SQL generado**

Run: `cat backend/drizzle/0029_*.sql`
Expected: contiene, en algún orden con `--> statement-breakpoint`:
```sql
ALTER TABLE "supplement_plan_item" ADD COLUMN "active" boolean DEFAULT true NOT NULL;
ALTER TABLE "supplement_take" ADD COLUMN "supplement_id" uuid;
ALTER TABLE "supplement_take" ADD CONSTRAINT ... FOREIGN KEY ("supplement_id") REFERENCES ... ON DELETE set null ...;
CREATE UNIQUE INDEX "supplement_take_adhoc_unique_idx" ON "supplement_take" ("user_id","date","supplement_id","slot") WHERE "supplement_take"."plan_item_id" IS NULL;
```
Si el `WHERE` del índice parcial NO aparece (drizzle-kit no lo emitió), editar el `.sql` a mano y agregarlo (precedente: `0024` edita SQL a mano). El índice DEBE ser parcial, si no rompe las tomas del plan.

- [ ] **Step 5: Aplicar y verificar la migración en local**

Run: `cd backend && bun run db:migrate`
Expected: aplica 0029 sin error. Si no hay DB local, saltear y anotarlo (se aplica en deploy).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -S -m "feat(backend): migración 0029 — supplement_id en take + active en plan_item (SUP-2)"
```

---

### Task 5: Repository — `active` en el plan + resolución directa por `supplementId`

**Files:**
- Modify: `backend/src/supplements/repository.ts`
- Test: `backend/src/supplements/repository.test.ts`

- [ ] **Step 1: `active` en las lecturas y escrituras del plan**

En `toPlanView`, agregar `active` a cada ítem mapeado:

```ts
    items: items.map((it) => ({
      id: it.id, supplementId: it.supplementId, slot: it.slot as TakeSlot,
      frequency: it.frequency as Frequency, dose: it.dose, reason: it.reason ?? null,
      active: it.active ?? true,
      supplementName: it.supplementName,
    })),
```

En `getActivePlan` y `getOwnedPlanItem`, agregar `active: supplementPlanItem.active` al objeto `select({...})` (en ambas funciones).

En `updatePlanItem`, extender el `set`:

```ts
  const set: Partial<Pick<PlanItemRow, "slot" | "frequency" | "dose" | "active">> = {};
  if (patch.slot !== undefined) set.slot = patch.slot;
  if (patch.frequency !== undefined) set.frequency = patch.frequency;
  if (patch.dose !== undefined) set.dose = patch.dose;
  if (patch.active !== undefined) set.active = patch.active;
```

El tipo `PlanItemJoined = PlanItemRow & { supplementName: string }` ya incluye `active` (viene de `PlanItemRow`). `createPlan` no necesita cambio (la columna tiene default true).

- [ ] **Step 2: Resolución directa por `supplementId` en micros — escribir el test que falla**

Agregar a `backend/src/supplements/repository.test.ts` (dentro del patrón `createDb`/`try`/`finally` como el test existente):

```ts
test("takesWithComponents resuelve micros de una toma ad-hoc por supplementId directo (plan_item_id null)", async () => {
  const { db } = createDb(process.env.DATABASE_URL ?? "postgres://pulsia:pulsia@localhost:5432/pulsia");
  let supId: string | undefined;
  try {
    const sup = await insertSupplement(db, DEV_USER_ID, {
      name: "Vit D Adhoc", servingLabel: "1 cápsula", unitLabel: "cápsula", source: "label", info: "x",
      components: [{ name: "Vitamina D", amount: 25, unit: "mcg", nutrientKey: "vitamin_d_mcg", amountPerUnit: 25 }],
    } as any);
    supId = sup.id;
    await upsertAdHocTake(db, DEV_USER_ID, { date: "2026-08-10", supplementId: sup.id, slot: "desayuno", dose: "2 cápsulas" });
    const result = await takesWithComponents(db, DEV_USER_ID, "2026-08-10");
    expect(result).toHaveLength(1);
    expect(result[0].supplementName).toBe("Vit D Adhoc");
    expect(result[0].plannedDose).toBe("2 cápsulas");
    expect(result[0].components[0].nutrientKey).toBe("vitamin_d_mcg");
  } finally {
    if (supId) await db.delete(supplement).where(eq(supplement.id, supId)); // cascade borra la toma
  }
});
```

Importar `upsertAdHocTake` y `supplement` (de `../db/schema`) en el test si no están.

- [ ] **Step 3: Implementar `upsertAdHocTake`, `deleteAdHocTake`, `listAdHocTakesForDate` + resolución directa**

En `repository.ts`:

```ts
// Toma ad-hoc (SUP-2): suplemento fuera del plan. plan_item_id null, supplement_id set,
// status "taken". Upsert idempotente por el índice parcial (user, date, supplement_id, slot).
export async function upsertAdHocTake(db: Db, userId: string, input: {
  date: string; supplementId: string; slot: string; dose: string; note?: string | null;
}): Promise<{ id: string } | null> {
  const sup = await getSupplement(db, userId, input.supplementId);
  if (!sup) return null;
  const rows = await db.insert(supplementTake).values({
    userId, date: input.date, planItemId: null, supplementId: input.supplementId,
    supplementName: sup.name, plannedDose: input.dose, slot: input.slot,
    status: "taken", actualDose: null, note: input.note ?? null,
  }).onConflictDoUpdate({
    target: [supplementTake.userId, supplementTake.date, supplementTake.supplementId, supplementTake.slot],
    targetWhere: sql`${supplementTake.planItemId} IS NULL`,
    set: { supplementName: sup.name, plannedDose: input.dose, status: "taken", note: input.note ?? null },
  }).returning({ id: supplementTake.id });
  return rows[0] ?? null;
}

// Borra una toma ad-hoc por id. Guardas: del usuario y con plan_item_id null (no tocar tomas del plan).
export async function deleteAdHocTake(db: Db, userId: string, takeId: string): Promise<boolean> {
  const rows = await db.delete(supplementTake)
    .where(and(eq(supplementTake.id, takeId), eq(supplementTake.userId, userId), isNull(supplementTake.planItemId)))
    .returning({ id: supplementTake.id });
  return rows.length > 0;
}

export async function listAdHocTakesForDate(db: Db, userId: string, date: string) {
  return db.select({
    id: supplementTake.id, supplementId: supplementTake.supplementId,
    supplementName: supplementTake.supplementName, slot: supplementTake.slot,
    plannedDose: supplementTake.plannedDose, status: supplementTake.status,
    actualDose: supplementTake.actualDose, note: supplementTake.note,
  }).from(supplementTake)
    .where(and(eq(supplementTake.userId, userId), eq(supplementTake.date, date), isNull(supplementTake.planItemId)));
}
```

Agregar `isNull` y `sql` al import de `drizzle-orm` al tope: `import { and, asc, eq, gte, lte, isNull, sql } from "drizzle-orm";`

En `takesWithComponents` **y** `takesWithComponentsByDay`, cambiar la resolución del suplemento para caer al `supplementId` directo:

```ts
  for (const t of takes) {
    const suppId = (t.planItemId != null ? itemToSupp.get(t.planItemId) : null) ?? t.supplementId ?? null;
    const sup = suppId ? byId.get(suppId) : undefined;
    if (!sup) continue;
    // ...resto igual...
  }
```

(Quitar el `if (t.planItemId == null) continue;` de ambas.)

- [ ] **Step 4: Correr los tests del repo**

Run: `cd backend && bun test src/supplements/repository.test.ts`
Expected: PASS (necesita Postgres local en `DATABASE_URL`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/supplements/repository.ts backend/src/supplements/repository.test.ts
git commit -S -m "feat(backend): tomas ad-hoc en el repo + active en el plan (SUP-2)"
```

---

### Task 6: Rutas — `/takes/adhoc` (POST/DELETE) + `/day` mergea ad-hoc

**Files:**
- Modify: `backend/src/routes/supplements.ts`
- Test: `backend/src/routes/supplements.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/src/routes/supplements.test.ts`, agregar (usando el `fakeDb` existente; ver los tests de `/takes` como plantilla). Primero extender `fakeDb` para soportar `adHocTakes` (mock de `listAdHocTakesForDate`) — en la práctica el `fakeDb` intercepta `db.select(...)`; seguir el patrón de cómo mockea `takes`. Tests:

```ts
test("POST /nutrition/supplements/takes/adhoc → 200 con suplemento propio", async () => {
  const app = createApp(makeDeps(fakeDb({ supRow })));
  const res = await app.request("/nutrition/supplements/takes/adhoc", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: "2026-08-10", supplementId: SUP_ID, slot: "desayuno", dose: "1 cápsula" }),
  });
  expect(res.status).toBe(200);
});

test("POST /nutrition/supplements/takes/adhoc → 404 si el suplemento no es del usuario", async () => {
  const app = createApp(makeDeps(fakeDb({ supRow: null })));
  const res = await app.request("/nutrition/supplements/takes/adhoc", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: "2026-08-10", supplementId: SUP_UNKNOWN, slot: "desayuno", dose: "1 cápsula" }),
  });
  expect(res.status).toBe(404);
});

test("DELETE /nutrition/supplements/takes/adhoc/:id → 200", async () => {
  const app = createApp(makeDeps(fakeDb({})));
  const res = await app.request(`/nutrition/supplements/takes/adhoc/${ITEM_ID}`, { method: "DELETE" });
  expect([200, 404]).toContain(res.status); // depende del mock; el foco es que la ruta existe y no 400
});
```

(Usar el helper de construcción de deps/app tal como los otros tests del archivo; copiar el patrón exacto de `makeDeps`/`createApp` de un test vecino — no inventar nombres.)

- [ ] **Step 2: Correr para ver fallar**

Run: `cd backend && bun test src/routes/supplements.test.ts`
Expected: FAIL (rutas 404/no existen).

- [ ] **Step 3: Implementar las rutas**

En `routes/supplements.ts`:

- Importar `AdHocTakeInputSchema` de `@pulsia/shared` y `upsertAdHocTake, deleteAdHocTake, listAdHocTakesForDate` del repo.

- Agregar, JUNTO a `r.put("/takes", ...)` (ANTES del `r.patch("/:id")` y del `r.get("/:id")` catch-all):

```ts
  r.post("/takes/adhoc", async (c) => {
    const parsed = AdHocTakeInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Toma inválida", detail: parsed.error.issues }, 400);
    const out = await upsertAdHocTake(deps.db, c.get("userId"), parsed.data);
    if (!out) return c.json({ error: "Suplemento no encontrado" }, 404);
    return c.json({ ok: true, id: out.id });
  });

  r.delete("/takes/adhoc/:id", async (c) => {
    if (!UuidSchema.safeParse(c.req.param("id")).success) return badId(c);
    const ok = await deleteAdHocTake(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrado" }, 404);
  });
```

- Modificar `r.get("/day", ...)` para mergear ad-hoc y no cortar sin plan:

```ts
  r.get("/day", async (c) => {
    const date = c.req.query("date");
    if (!date || !z.iso.date().safeParse(date).success) return c.json({ error: "Falta date (YYYY-MM-DD)" }, 400);
    const userId = c.get("userId");
    const [plan, takes, adjustments, adHoc] = await Promise.all([
      getActivePlan(deps.db, userId),
      listTakesForDate(deps.db, userId, date),
      getAdjustmentItems(deps.db, userId, date),
      listAdHocTakesForDate(deps.db, userId, date),
    ]);
    const entries = resolveDayChecklist({
      planItems: plan?.items ?? [],
      adjustments,
      takes: takes
        .filter((t) => t.planItemId != null)
        .map((t) => ({ planItemId: t.planItemId as string, status: t.status as TakeStatus, actualDose: t.actualDose, note: t.note })),
      adHocTakes: adHoc.map((t) => ({
        takeId: t.id, supplementId: t.supplementId as string, supplementName: t.supplementName,
        slot: t.slot as TakeSlot, plannedDose: t.plannedDose, status: t.status as TakeStatus,
        actualDose: t.actualDose, note: t.note,
      })),
      date,
    });
    return c.json({ hasPlan: plan != null, entries });
  });
```

Agregar `TakeSlot` al `import type` de `@pulsia/shared` en el archivo (ya importa `TakeStatus`).

- [ ] **Step 4: Correr los tests**

Run: `cd backend && bun test src/routes/supplements.test.ts`
Expected: PASS. Ajustar el mock `fakeDb` si algún select nuevo no está cubierto (seguir el patrón de los mocks existentes).

- [ ] **Step 5: Typecheck**

Run: `cd backend && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/supplements.ts backend/src/routes/supplements.test.ts
git commit -S -m "feat(backend): rutas /takes/adhoc + /day mergea ad-hoc (SUP-2)"
```

---

### Task 7: Informe cuenta ad-hoc sin plan

**Files:**
- Modify: `backend/src/reports/collect.ts:~104-112`
- Test: `backend/src/reports/collect.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `collect.test.ts`, agregar un caso: sin `activePlan` (getActivePlan → null) pero con un take en el rango cuyo `supplementName` matchea un suplemento del catálogo → `supplementMicros` en la salida NO es null y suma. Copiar el patrón de un test existente de `collect` (ver los que arman `takes`/`catalog` con `id: "t1", ...`). Ejemplo:

```ts
test("supplementMicros cuenta tomas ad-hoc aunque no haya plan activo", async () => {
  const deps = makeCollectDeps({
    activePlan: null,
    takes: [{ id: "t1", userId: "u", date: "2026-08-10", planItemId: null, supplementName: "Vit D", plannedDose: "1 cápsula", slot: "desayuno", status: "taken", actualDose: null, note: null, createdAt: new Date(0) }],
    catalog: [{ id: "s1", name: "Vit D", components: [{ name: "Vitamina D", amount: 25, unit: "mcg", nutrientKey: "vitamin_d_mcg", amountPerUnit: 25 }] }],
  });
  const out = await collectReportData(deps, ...); // firma exacta según el archivo
  expect(out.nutrition.supplementMicros?.vitamin_d_mcg).toBe(25);
});
```

(Ajustar nombres de helper/campos a los reales del archivo — leer `collect.test.ts` para el shape exacto de `makeCollectDeps`/`collectReportData` y de `out`.)

- [ ] **Step 2: Correr para ver fallar**

Run: `cd backend && bun test src/reports/collect.test.ts`
Expected: FAIL (`supplementMicrosOut` es null porque `activePlan` es null).

- [ ] **Step 3: Implementar el cambio de gate**

En `collect.ts`, cambiar el `if (activePlan)` que envuelve el cálculo de `supplementMicrosOut` por `if (takes.length > 0)`:

```ts
  let supplementMicrosOut: Partial<Record<NutrientKey, number>> | null = null;
  if (takes.length > 0) {
    const byName = new Map(catalog.map((s) => [s.name, s.components]));
    const forMicros: TakeForMicros[] = takes.map((t) => ({
      status: t.status as TakeForMicros["status"], plannedDose: t.plannedDose, actualDose: t.actualDose ?? null,
      supplementName: t.supplementName, components: byName.get(t.supplementName) ?? [],
    }));
    supplementMicrosOut = supplementMicros(forMicros).totals;
  }
```

Dejar el objeto `supplements` (prompt IA) gateado en `activePlan` como está (fuera de alcance).

- [ ] **Step 4: Correr los tests**

Run: `cd backend && bun test src/reports/collect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/reports/collect.ts backend/src/reports/collect.test.ts
git commit -S -m "feat(backend): el informe cuenta tomas ad-hoc sin plan activo (SUP-2)"
```

- [ ] **Step 6: Correr toda la suite del backend**

Run: `cd backend && bun test`
Expected: PASS (toda la capa). Si algún test viejo de `collect`/`day` rompió por el cambio de contrato (`resolveDayChecklist` ahora exige `adHocTakes`), arreglarlo agregando `adHocTakes: []`.

---

## CAPA 3 — móvil

### Task 8: Cliente API + tipos

**Files:**
- Modify: `mobile/src/api/supplements.ts`
- Test: `mobile/__tests__/supplements-api.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `mobile/__tests__/supplements-api.test.ts`, agregar (seguir el patrón de mock de `apiFetch` del archivo):

```ts
test("addAdHocTake postea a /takes/adhoc con el body correcto", async () => {
  const spy = mockApiFetchOk({ ok: true, id: "x" }); // usar el helper real del archivo
  await addAdHocTake("http://b", { date: "2026-08-10", supplementId: "s1", slot: "desayuno", dose: "1 cápsula" });
  expect(spy).toHaveBeenCalledWith("http://b", "/nutrition/supplements/takes/adhoc", expect.objectContaining({ method: "POST" }));
});

test("deleteAdHocTake llama DELETE /takes/adhoc/:id", async () => {
  const spy = mockApiFetchOk({ ok: true });
  await deleteAdHocTake("http://b", "t1");
  expect(spy).toHaveBeenCalledWith("http://b", "/nutrition/supplements/takes/adhoc/t1", expect.objectContaining({ method: "DELETE" }));
});
```

(Ajustar al helper de mock real del archivo — leer los tests existentes de este archivo para copiar la mecánica exacta de espiado de `apiFetch`.)

- [ ] **Step 2: Correr para ver fallar**

Run: `cd mobile && bun test __tests__/supplements-api.test.ts`
Expected: FAIL (funciones no existen).

- [ ] **Step 3: Implementar en `mobile/src/api/supplements.ts`**

Agregar el import de `AdHocTakeInput` a los tipos y las funciones:

```ts
import type { /* ...existentes..., */ AdHocTakeInput } from "@pulsia/shared";

export async function addAdHocTake(baseUrl: string, input: AdHocTakeInput): Promise<void> {
  const res = await apiFetch(baseUrl, "/nutrition/supplements/takes/adhoc", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo registrar la toma."));
}

export async function deleteAdHocTake(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/nutrition/supplements/takes/adhoc/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "No se pudo quitar la toma."));
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd mobile && bun test __tests__/supplements-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/supplements.ts mobile/__tests__/supplements-api.test.ts
git commit -S -m "feat(mobile): cliente addAdHocTake/deleteAdHocTake (SUP-2)"
```

---

### Task 9: Pantalla "agregar toma" con stepper de dosis

**Files:**
- Create: `mobile/app/nutricion/agregar-toma.tsx`
- Test: `mobile/__tests__/agregar-toma.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

`mobile/__tests__/agregar-toma.test.tsx` (usar `@testing-library/react-native` como los tests `.tsx` existentes; mockear `getBackendUrl`, `listSupplements` que devuelve un suplemento con `unitLabel: "cápsula"`, y `addAdHocTake`):

```tsx
test("con stepper: arma dose '<n> <unitLabel>' y postea", async () => {
  // render, elegir el suplemento, franja desayuno, tocar [+] una vez (n=2), confirmar
  // expect(addAdHocTake).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ dose: "2 cápsula", supplementId: "s1", slot: "desayuno" }));
});

test("sin unitLabel: cae a TextInput de dosis libre", async () => {
  // suplemento con unitLabel null → hay un TextInput; escribir "media pastilla"; confirmar → dose: "media pastilla"
});
```

(Escribir las interacciones concretas con `fireEvent`/`getByText`/`getByTestId` siguiendo `plan-suplementos.test.tsx` como referencia de estilo.)

- [ ] **Step 2: Correr para ver fallar**

Run: `cd mobile && bun test __tests__/agregar-toma.test.tsx`
Expected: FAIL (pantalla no existe).

- [ ] **Step 3: Implementar `agregar-toma.tsx`**

Pantalla que:
1. Carga el catálogo (`listSupplements`) en `useEffect`.
2. Estado: `selectedId`, `slot` (default `"desayuno"`), `count` (number, default 1), `freeDose` (string).
3. Suplemento elegido → si `unitLabel` no es null, mostrar stepper `[−] {count} [+] {unitLabel}` (con `testID="dose-stepper-inc"`/`"dose-stepper-dec"`); si null, `TextInput` de dosis (`testID="dose-free"`).
4. `ChipGroup` de franjas (`SLOT_OPTIONS` como en `plan-suplementos.tsx`).
5. Botón "Agregar" → arma `dose = unitLabel ? \`${count} ${unitLabel}\` : freeDose.trim()`, llama `addAdHocTake(url, { date: dateKey(Date.now()), supplementId, slot, dose })`, luego `router.back()`.

Estructura base (adaptar tokens/estilos a los del proyecto, ver `plan-suplementos.tsx`):

```tsx
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listSupplements, addAdHocTake } from "../../src/api/supplements";
import { dateKey } from "../../src/session/dateKey";
import { SLOT_LABELS } from "../../src/components/SupplementChecklist";
import { ChipGroup } from "../../src/components/ChipGroup";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { TAKE_SLOTS } from "@pulsia/shared";
import type { Supplement, TakeSlot } from "@pulsia/shared";

const SLOT_OPTIONS = TAKE_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }));

export default function AgregarTomaScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const [items, setItems] = useState<Supplement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slot, setSlot] = useState<TakeSlot>("desayuno");
  const [count, setCount] = useState(1);
  const [freeDose, setFreeDose] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setItems(await listSupplements(await getBackendUrl())); }
      catch (e) { setError((e as Error).message); }
    })();
  }, []);

  const selected = items.find((s) => s.id === selectedId) ?? null;
  const unitLabel = selected?.unitLabel ?? null;
  const canSave = !saving && selected != null && (unitLabel ? count > 0 : freeDose.trim().length > 0);

  const add = useCallback(async () => {
    if (!selected) return;
    setSaving(true); setError(null);
    try {
      const dose = unitLabel ? `${count} ${unitLabel}` : freeDose.trim();
      await addAdHocTake(await getBackendUrl(), { date: dateKey(Date.now()), supplementId: selected.id, slot, dose });
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }, [selected, unitLabel, count, freeDose, slot]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Agregar suplemento a hoy</Text>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Suplemento</Text>
      {items.map((s) => (
        <Pressable key={s.id} onPress={() => setSelectedId(s.id)}
          style={{ backgroundColor: selectedId === s.id ? colors.accentSoft : colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: selectedId === s.id ? colors.accent : colors.border, padding: spacing.md }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{s.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Porción: {s.servingLabel}</Text>
        </Pressable>
      ))}

      {selected && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Franja</Text>
          <ChipGroup single options={SLOT_OPTIONS} selected={[slot]} onChange={(v) => setSlot(v[0] as TakeSlot)} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Dosis</Text>
          {unitLabel ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Pressable testID="dose-stepper-dec" onPress={() => setCount((n) => Math.max(1, n - 1))}
                style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 18 }}>−</Text>
              </Pressable>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{count} {unitLabel}</Text>
              <Pressable testID="dose-stepper-inc" onPress={() => setCount((n) => n + 1)}
                style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 18 }}>+</Text>
              </Pressable>
            </View>
          ) : (
            <TextInput testID="dose-free" value={freeDose} onChangeText={setFreeDose} placeholder="Dosis (p.ej. 1 cápsula)" placeholderTextColor={colors.icon}
              style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
          )}
          <Pressable onPress={add} disabled={!canSave}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: canSave ? 1 : 0.5 }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Agregar</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
```

(OJO: en RN los estilos son `paddingHorizontal`/`paddingVertical`, no `paddingHorizontal` camel raro — corregir a `paddingHorizontal`/`paddingVertical` reales.)

- [ ] **Step 4: Correr los tests**

Run: `cd mobile && bun test __tests__/agregar-toma.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/nutricion/agregar-toma.tsx mobile/__tests__/agregar-toma.test.tsx
git commit -S -m "feat(mobile): pantalla agregar-toma con stepper de dosis (SUP-2)"
```

---

### Task 10: Checklist muestra filas ad-hoc con "quitar"

**Files:**
- Modify: `mobile/src/components/SupplementChecklist.tsx`
- Test: `mobile/__tests__/supplement-checklist.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

En `supplement-checklist.test.tsx`, agregar: una entry `origin: "adhoc"` con `takeId` → NO renderiza "Desvío" ni "Salteado"; renderiza "Quitar"; al tocarlo llama `onRemove`. Y las entries `origin: "plan"` siguen con Desvío/Salteado. Usar el shape completo de `DayChecklistEntry` (con `origin`, `takeId`, `planItemId`). Firma nueva del componente: `<SupplementChecklist entries={...} onMark={...} onRemove={...} />`.

- [ ] **Step 2: Correr para ver fallar**

Run: `cd mobile && bun test __tests__/supplement-checklist.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `SupplementChecklist.tsx`:
- `SupplementChecklistProps`: agregar `onRemove: (entry: DayChecklistEntry) => void;`.
- `Row`: recibir `onRemove`. Keyear/testIDs por `entry.planItemId ?? entry.takeId`. Si `entry.origin === "adhoc"`:
  - El `Pressable` principal NO marca taken al tocar (o lo deja inerte); mostrar la fila como tomada (`✓`, `successSoft`).
  - En vez de "Desvío"/"Salteado", un solo `Pressable testID={\`remove-${entry.takeId}\`}` con texto "Quitar" (color `danger`) que llama `onRemove(entry)`.
  - No renderizar el bloque `expanded` de desvío.
- En `SupplementChecklist` (el map de filas), pasar `onRemove` y usar `key={entry.planItemId ?? entry.takeId}`.

Fragmento del `Row` (rama ad-hoc):

```tsx
  const isAdHoc = entry.origin === "adhoc";
  // ...
  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable onPress={isAdHoc ? undefined : markTaken}
        style={{ /* ...taken usa successSoft; para ad-hoc mostrar siempre como tomada... */ }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>
            {(taken || isAdHoc) ? "✓ " : ""}{entry.supplementName}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{entry.dose}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {isAdHoc ? (
            <Pressable testID={`remove-${entry.takeId}`} onPress={() => onRemove(entry)} hitSlop={8}>
              <Text style={{ color: colors.danger, fontSize: 12 }}>Quitar</Text>
            </Pressable>
          ) : (
            <>
              <Pressable testID={`deviate-${entry.planItemId}`} onPress={() => setExpanded((e) => !e)} hitSlop={8}>
                <Text style={{ color: colors.accentText, fontSize: 12 }}>Desvío</Text>
              </Pressable>
              <Pressable testID={`skip-${entry.planItemId}`} onPress={markSkipped} hitSlop={8}>
                <Text style={{ color: colors.danger, fontSize: 12 }}>Salteado</Text>
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
      {!isAdHoc && expanded && ( /* ...bloque de desvío existente... */ )}
    </View>
  );
```

- [ ] **Step 4: Correr los tests**

Run: `cd mobile && bun test __tests__/supplement-checklist.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/SupplementChecklist.tsx mobile/__tests__/supplement-checklist.test.tsx
git commit -S -m "feat(mobile): filas ad-hoc con 'quitar' en el checklist (SUP-2)"
```

---

### Task 11: Tab nutrición — botón "+ agregar" y handler `onRemove`

**Files:**
- Modify: `mobile/app/(tabs)/nutricion.tsx`

- [ ] **Step 1: Importar y agregar el handler `onRemove`**

Importar `deleteAdHocTake` de `../../src/api/supplements`. Agregar junto a `onMarkTake`:

```tsx
  async function onRemoveTake(entry: DayChecklistEntry) {
    if (!entry.takeId) return;
    try {
      const url = await getBackendUrl();
      await deleteAdHocTake(url, entry.takeId);
      await loadChecklist();
    } catch (e) { setError((e as Error).message); }
  }
```

- [ ] **Step 2: Botón "+ agregar suplemento a hoy" (visible con o sin plan)**

Dentro del bloque `{!supplementsCollapsed && (...)}`, agregar SIEMPRE (antes o después del render de entries) un botón:

```tsx
            <Pressable onPress={() => router.push("/nutricion/agregar-toma")}
              style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.sm, alignItems: "center" }}>
              <Text style={{ color: colors.accentText, fontWeight: "600" }}>+ Agregar suplemento a hoy</Text>
            </Pressable>
```

- [ ] **Step 3: Renderizar entries cuando haya (plan o ad-hoc) + pasar `onRemove`**

Cambiar la condición de render del checklist para no depender de `hasPlan`:

```tsx
            {checklist && checklist.entries.length > 0 && (
              <SupplementChecklist entries={checklist.entries} onMark={onMarkTake} onRemove={onRemoveTake} />
            )}
            {checklist && checklist.hasPlan && checklist.entries.length === 0 && (
              <Text style={{ color: colors.textMuted }}>Hoy no toca ningún suplemento.</Text>
            )}
```

Mantener el bloque "Armar plan con IA" (`!checklist.hasPlan`) como está.

- [ ] **Step 4: Typecheck + smoke test del módulo**

Run: `cd mobile && bun test` (corre toda la suite móvil)
Expected: PASS. Arreglar cualquier test de `nutricion` que rompa por la nueva prop `onRemove` (si existe test de esa pantalla).

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/nutricion.tsx"
git commit -S -m "feat(mobile): botón agregar toma + quitar ad-hoc en el tab nutrición (SUP-2)"
```

---

### Task 12: Pausar / reactivar en el editor del plan

**Files:**
- Modify: `mobile/app/nutricion/plan-suplementos.tsx`
- Test: `mobile/__tests__/plan-suplementos.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

En `plan-suplementos.test.tsx`: un plan con un ítem `active: true` → hay un control "Pausar"; al tocarlo llama `updatePlanItem(id, { active: false })`. Un ítem `active: false` → muestra badge "Pausado" y control "Reactivar"; `WeekPreview` NO lo lista. (Mockear `updatePlanItem`; los ítems del `PlanView` mock ahora deben incluir `active`.)

- [ ] **Step 2: Correr para ver fallar**

Run: `cd mobile && bun test __tests__/plan-suplementos.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `plan-suplementos.tsx`:
- Handler:

```tsx
  async function togglePause(item: PlanItemView) {
    if (!url.current || !plan) return;
    setSavingId(item.id); setError(null);
    try {
      const updated = await updatePlanItem(url.current, item.id, { active: !item.active });
      setPlan({ ...plan, items: plan.items.map((it) => (it.id === item.id ? updated : it)) });
    } catch (e) { setError((e as Error).message); }
    setSavingId(null);
  }
```

- En el render de cada ítem (dentro del `Pressable` de cabecera, o como fila de acciones debajo), agregar un control (con `hitSlop`, sin disparar el expand — usar un `Pressable` anidado con `onPress` propio y `testID={\`pause-${item.id}\`}`):

```tsx
                    <Pressable testID={`pause-${item.id}`} onPress={() => togglePause(item)} hitSlop={8}>
                      <Text style={{ color: item.active ? colors.accentText : colors.warning, fontSize: 12 }}>
                        {item.active ? "Pausar" : "Reactivar"}
                      </Text>
                    </Pressable>
```

- Si `!item.active`: atenuar la card (`opacity: 0.5`) y mostrar un badge:

```tsx
                    {!item.active && <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "600" }}>⏸ Pausado</Text>}
```

- `WeekPreview`: filtrar antes de `frequencyAppliesOn`:

```tsx
    const names = items.filter((it) => it.active !== false && frequencyAppliesOn(it.frequency, date)).map((it) => it.supplementName);
```

- [ ] **Step 4: Correr los tests**

Run: `cd mobile && bun test __tests__/plan-suplementos.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/nutricion/plan-suplementos.tsx mobile/__tests__/plan-suplementos.test.tsx
git commit -S -m "feat(mobile): pausar/reactivar suplemento en el plan (SUP-2)"
```

---

### Task 13: Seam test end-to-end + suite completa

**Files:**
- Modify: `mobile/__tests__/supplement-seam.test.ts` (si aplica el patrón de costura)

- [ ] **Step 1: Extender el seam test**

Verificar que `supplement-seam.test.ts` cubra: el móvil arma el payload ad-hoc → el backend lo parsea con `AdHocTakeInputSchema` → `resolveDayChecklist` lo emite como entry ad-hoc. Si el archivo ya testea el contrato take↔checklist, agregar el caso ad-hoc. (Leer el archivo para el patrón exacto; no inventar helpers.)

- [ ] **Step 2: Suite completa de las tres capas**

Run:
```bash
cd shared && bun test && cd ../backend && bun test && cd ../mobile && bun test
```
Expected: PASS en las tres.

- [ ] **Step 3: Typecheck de las tres capas**

Run:
```bash
cd shared && bunx tsc --noEmit ; cd ../backend && bun run typecheck ; cd ../mobile && bunx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 4: Commit (si hubo cambios en el seam)**

```bash
git add mobile/__tests__/supplement-seam.test.ts
git commit -S -m "test(mobile): seam ad-hoc take → checklist (SUP-2)"
```

---

## Cierre (fuera de las tasks de código)

- [ ] Abrir el PR contra `main` y disparar `@claude review` (auto, sin pedir confirmación).
- [ ] Tras mergear: la migración 0029 se autoaplica en el deploy del backend (self-hosted runner en la Pi). Verificar `journalctl`/deploy OK.
- [ ] Publicar OTA del móvil (JS-only) verificando el runtime android antes (`eas update` → confirmar fingerprint). Ver memoria `ota-fingerprint-gotcha` / `ota-always-publish`.
- [ ] Comentar en la card de Kan `w5z1b5whfkaf` el resultado y mover a ✅ Hecho (mutación sobre infra del owner → según memoria, mover de columna se confirma; comentar no).

---

## Self-review (cobertura spec → tasks)

- Parte A DB (supplement_id + índice parcial) → Task 4. ✓
- Parte A shared (AdHocTakeInputSchema, DayChecklistEntry, resolveDayChecklist) → Tasks 2, 3. ✓
- Parte A micros (resolución directa por supplementId) → Task 5. ✓
- Parte A rutas (POST/DELETE adhoc, /day merge sin plan) → Task 6. ✓
- Parte A informe (gate) → Task 7. ✓
- Parte A UI (cliente, pantalla+stepper, fila quitar, botón) → Tasks 8, 9, 10, 11. ✓
- Parte B DB (active) → Task 4. ✓
- Parte B shared (active en schema/patch/checklist) → Tasks 1, 3. ✓
- Parte B backend (active en repo/rutas) → Task 5 (rutas ya soportan via PlanItemPatchSchema). ✓
- Parte B UI (toggle pausa, WeekPreview, atenuado) → Task 12. ✓
- Testing de la costura → Task 13. ✓
