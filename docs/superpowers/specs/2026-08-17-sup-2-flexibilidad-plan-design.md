# SUP-2 · Flexibilidad del plan de suplementos — diseño

**Ticket:** Kan `w5z1b5whfkaf` (P1 · Features, pedido por owner).
**Fecha:** 2026-08-17.

Dos capacidades que comparten schema/backend, en un solo PR y una sola migración (0029):

- **Parte A — Toma ad-hoc:** registrar la toma de un suplemento que NO está en el plan.
- **Parte B — Pausar:** desactivar temporalmente (indefinido, reactivación manual) un suplemento que SÍ está en el plan, sin borrarlo ni cambiar su frecuencia.

## Decisiones del owner (cerradas)

1. **Modelo de la toma ad-hoc:** toma "suelta" que referencia `supplementId` directo (`planItemId` nullable + `supplementId` nullable, se exige una de las dos). NO se modela como ítem de plan efímero (evita ensuciar el plan y no ripplea al union de frecuencias / LCM de `overlap.ts` / schema de IA).
2. **Semántica de pausa:** indefinida, con flag `active` boolean en el ítem del plan. Reactivación **a mano** (no auto-reanuda por fecha).
3. **Dosis del ad-hoc:** stepper numérico en la unidad contable del suplemento (`unitLabel`), con fallback a texto libre si el suplemento no tiene `unitLabel`. Garantiza mg exactos.
4. **Acciones de la fila ad-hoc:** solo "quitar" (la fila queda como "tomada"; no hay editar-dosis ni desvío).
5. **Sin plan activo:** el ad-hoc funciona igual (botón + aporte de micros + informe) aunque no haya plan.

## Contexto de arquitectura que condiciona el diseño

- `supplement_take.planItemId` **ya es nullable** (`onDelete: "set null"`) y guarda snapshot (`supplementName`, `plannedDose`, `slot`). La toma ya es semi-independiente del ítem del plan.
- Cálculo de mg (`shared/src/nutrition/supplementBreakdown.ts`): `micro = amountPerUnit × unidades`, con `unidades = parseLeadingNumber(dose)` y `amountPerUnit` **por unidad contable**. Para `taken` usa `plannedDose`; para `deviated` usa `actualDose`. → El caso "tomé 1 en vez de 2 de un suplemento **del plan**" ya lo cubre el flujo **Desvío** existente; no se toca.
- Micros del diario (`takesWithComponents` / `takesWithComponentsByDay`, backend `repository.ts`) resuelven el suplemento **por `planItemId → supplementId`** y **saltean** las tomas con `planItemId` null. ← acá se agrega el camino directo por `supplementId`.
- El informe (`backend/src/reports/collect.ts`) resuelve micros de tomas **por nombre** contra el catálogo → las tomas ad-hoc aportan sin cambios estructurales; solo hay que destrabar el gate `if (activePlan)` para que cuenten aunque no haya plan.
- El checklist se arma **solo** desde ítems del plan filtrados por frecuencia (`shared/src/supplements/checklist.ts`, `resolveDayChecklist`).
- `FrequencySchema` es un union discriminado; NO se agrega variante nueva (evita ripple a `AiPlanFrequencySchema`, `SCAN_DAYS` en `overlap.ts`, `WeekPreview`, prompt de IA).

## Parte A — Toma ad-hoc

### DB (migración 0029)
- `supplement_take`: agregar `supplement_id uuid` nullable, `REFERENCES supplement(id) ON DELETE SET NULL`.
- Índice único **parcial**: `CREATE UNIQUE INDEX supplement_take_adhoc_unique_idx ON supplement_take (user_id, date, supplement_id, slot) WHERE plan_item_id IS NULL;` → idempotencia del upsert ad-hoc sin colisionar con el índice `(user_id, date, plan_item_id)` de las tomas del plan.
- `schema.ts`: agregar la columna y el índice parcial (Drizzle `uniqueIndex(...).on(...).where(sql\`plan_item_id IS NULL\`)`).

Invariante de aplicación (no lo garantiza el schema): una toma tiene `plan_item_id` **o** `supplement_id`, nunca ambos null. Toma del plan → `plan_item_id` set, `supplement_id` null. Toma ad-hoc → `supplement_id` set, `plan_item_id` null.

### shared
- `AdHocTakeInputSchema`:
  ```ts
  { date: iso.date, supplementId: uuid, slot: TakeSlot, dose: string.min(1), note?: string }
  ```
  (sin `status`: la toma ad-hoc siempre nace `"taken"`).
- `DayChecklistEntry` (cambio de contrato):
  - agregar `origin: "plan" | "adhoc"`.
  - agregar `takeId: string | null` (el `supplement_take.id`, para quitar la fila ad-hoc).
  - `planItemId` pasa a `string | null` (null en filas ad-hoc).
  - `reason`/`adjusted` quedan `null` en filas ad-hoc.
- `resolveDayChecklist`: nuevo parámetro `adHocTakes: ChecklistAdHocTake[]` (cada uno `{ takeId, supplementId, supplementName, slot, plannedDose, status, actualDose, note }`). Emite una entry `origin:"adhoc"` por cada uno, se integra al orden por franja junto con las del plan. Las del plan llevan `origin:"plan"`, `takeId:null`.
- **Pausa (comparte esta función):** filtrar los plan items por `active !== false` **antes** del filtro de frecuencia.

### Backend
- `repository.ts`:
  - `upsertAdHocTake(db, userId, input)`: busca el suplemento (ownership + `name` para el snapshot), inserta con `planItemId:null`, `supplementId`, `status:"taken"`, `plannedDose:input.dose`, `slot`, `note`. `onConflictDoUpdate` sobre el índice parcial (Drizzle: `target` + `targetWhere: sql\`plan_item_id IS NULL\``). Devuelve la fila.
  - `deleteAdHocTake(db, userId, takeId)`: borra por `id` con guardas `userId` **y** `plan_item_id IS NULL` (no permitir borrar tomas del plan por esta vía). Devuelve bool.
  - `listAdHocTakesForDate(db, userId, date)`: tomas del día con `plan_item_id IS NULL` → `{ id, supplementId, supplementName, slot, plannedDose, status, actualDose, note }`.
  - `takesWithComponents` / `takesWithComponentsByDay`: al resolver `suppId`, usar `itemToSupp.get(planItemId) ?? t.supplementId`. Ya no `continue` si `planItemId` es null cuando hay `supplementId`.
- `routes/supplements.ts`:
  - `POST /takes/adhoc`: valida `AdHocTakeInputSchema`, verifica ownership del suplemento (`getSupplement`, 404 si no), upsert. Devuelve `{ ok: true }`.
  - `DELETE /takes/adhoc/:id`: valida uuid, `deleteAdHocTake`. 404 si no borró.
    - Declarar ambas ANTES del `/:id` catch-all (mismo patrón que `/takes`, `/day`).
  - `GET /day`: además de plan items, llamar `listAdHocTakesForDate`; pasar a `resolveDayChecklist`. **Ya no** cortar con `hasPlan:false` + entries vacío cuando no hay plan: si no hay plan pero hay tomas ad-hoc, devolver `{ hasPlan:false, entries:[<adhoc>] }`.
- `reports/collect.ts`: computar `supplementMicrosOut` cuando haya `takes` (no solo `if (activePlan)`), para que el ad-hoc sin plan cuente en el informe. El objeto `supplements` (prompt IA) puede seguir gateado en `activePlan` (fuera de alcance).

### UI móvil
- `src/api/supplements.ts`: `addAdHocTake(baseUrl, input)` (POST) y `deleteAdHocTake(baseUrl, id)` (DELETE).
- Nueva pantalla `app/nutricion/agregar-toma.tsx`: lista el catálogo (`listSupplements`) → elegir suplemento → elegir franja (`ChipGroup` de `TAKE_SLOTS`) → **stepper de dosis** en `unitLabel` (fallback `TextInput` si no hay `unitLabel`) → confirmar (POST) → `router.back()`. Muestra `[−] n [+] <unitLabel>` y arma `dose = "<n> <unitLabel>"`.
- `SupplementChecklist.tsx` / `Row`: keyear por `entry.planItemId ?? entry.takeId`. Si `entry.origin === "adhoc"`: no mostrar Desvío/Salteado; mostrar la fila como tomada con acción **quitar** (llama a un `onRemove(entry)` nuevo). Las del plan sin cambios.
- `app/(tabs)/nutricion.tsx`: botón **"+ agregar suplemento a hoy"** en la card Suplementos (visible con o sin plan) → `router.push("/nutricion/agregar-toma")`. Handler `onRemove` → `deleteAdHocTake` → recargar. La card renderiza entries siempre que haya (plan o ad-hoc), no solo con `hasPlan`.

## Parte B — Pausar (flag `active`)

### DB (misma migración 0029)
- `supplement_plan_item`: `ALTER TABLE ... ADD COLUMN active boolean NOT NULL DEFAULT true;`
- `schema.ts`: `active: boolean("active").notNull().default(true)`.

### shared
- `PlanItemSchema`: `active: z.boolean()` (la vista y el checklist lo usan; el default lo pone la DB / el `createPlan`).
- `PlanItemViewSchema` lo hereda.
- `PlanItemPatchSchema`: agregar `active: z.boolean().optional()` al union de campos opcionales (el refine "al menos uno" lo incluye).
- `resolveDayChecklist`: ya cubierto arriba (filtra `active !== false`).

### Backend
- `repository.ts`:
  - `getActivePlan` / `getOwnedPlanItem`: seleccionar `active` en el `select`.
  - `toPlanView`: incluir `active` en cada ítem.
  - `updatePlanItem`: mapear `patch.active` al `set`.
  - `createPlan`: los ítems nuevos nacen `active:true` (default de la columna; explicitar si hace falta).
- `routes/supplements.ts`: `PATCH /plan/items/:id` ya usa `PlanItemPatchSchema` → soporta `active` sin cambios de ruta.

### UI móvil
- `plan-suplementos.tsx`:
  - Cada ítem: toggle **Pausar** / **Reactivar** → `updatePlanItem(id, { active: !item.active })` → actualizar estado local.
  - Ítem pausado: atenuado (opacity) + badge "Pausado".
  - `WeekPreview`: filtrar `items` por `active !== false` antes de `frequencyAppliesOn`.

## Testing (la costura, no solo las piezas)

- **shared** (`supplements/checklist.test.ts`): `resolveDayChecklist` con (a) tomas ad-hoc → entries `origin:"adhoc"` ordenadas por franja junto a las del plan; (b) ítem `active:false` omitido; (c) mezcla plan + ad-hoc + pausado.
- **backend repo** (`supplements/repository.test.ts`): idempotencia del upsert ad-hoc (dos veces mismo user/date/supp/slot → una fila); `takesWithComponents` resuelve micros por `supplementId` directo (toma con `planItemId` null); `deleteAdHocTake` no borra tomas del plan.
- **backend rutas** (`routes/supplements.test.ts`): `POST /takes/adhoc` (200 + 404 suplemento ajeno), `DELETE /takes/adhoc/:id`, `GET /day` mergea ad-hoc (con y sin plan), `PATCH /plan/items/:id` con `active`.
- **backend informe** (`reports/collect.test.ts`): ad-hoc sin plan cuenta en `supplementMicrosOut`.
- **móvil**:
  - `supplements-api.test.ts`: `addAdHocTake` / `deleteAdHocTake` arman el request correcto (la costura cliente↔contrato).
  - `supplement-checklist.test.tsx`: fila ad-hoc muestra "quitar" y no Desvío; llama `onRemove`.
  - `plan-suplementos.test.tsx`: toggle pausa llama `updatePlanItem({active})`; ítem pausado atenuado; `WeekPreview` lo excluye.
  - nueva `agregar-toma.test.tsx`: stepper arma `dose = "<n> <unitLabel>"`; fallback texto libre sin `unitLabel`; confirmar postea.

## Ejecución

Subagent-driven, **secuencial** (nunca dos escrituras en paralelo — chocan en el índice de git):

1. **shared** — schemas (`active`, `AdHocTakeInputSchema`, `DayChecklistEntry`), `resolveDayChecklist` (ad-hoc + `active`) + tests.
2. **backend** — migración 0029 + `schema.ts`; `repository.ts` (upsert/delete/list ad-hoc, resolución directa por `supplementId`, `active` en plan) ; rutas (`/takes/adhoc` POST/DELETE, `/day` merge, `PATCH active`); `collect.ts` gate; + tests.
3. **móvil** — cliente API, `agregar-toma.tsx`, `SupplementChecklist` (quitar), `nutricion.tsx` (botón + onRemove), `plan-suplementos.tsx` (pausa) + tests.

Un PR con `@claude review`. Migración 0029 se autoaplica al deploy del backend. Publicar OTA del móvil (JS-only) tras mergear, verificando el runtime android.
