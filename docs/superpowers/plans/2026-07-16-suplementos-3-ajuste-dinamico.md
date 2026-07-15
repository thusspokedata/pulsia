# Suplementos PR3 — Ajuste dinámico vía informe diario: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El informe diario (piggyback, cero llamadas extra — idea del usuario) mira lo que comiste/tomaste y deja un **ajuste para mañana** ("ayer comiste rico en magnesio → hoy podés saltearlo") que el checklist ya sabe mostrar (PR2 lee `supplement_adjustment`); los informes mencionan la **adherencia**; y el plan generado valida en **runtime** los solapamientos de componentes (pedido 2 veces por reviews). Spec: `docs/superpowers/specs/2026-07-15-suplementos-design.md` §IA/generateReport. Cierra el sub-proyecto #3.

**Architecture:** `generateReport` (solo `kind: "daily"`) recibe además datos de suplementos + nombres de lo comido, y su tool schema suma `supplementAdjustment` (AdjustmentItem[], ya validado por Zod: solo skip/reduce, reduce exige dose). El server filtra ids fuera del plan activo y upsertea `supplement_adjustment` (UNIQUE user+forDate: el último informe pisa). El móvil manda `adjustmentForDate` (día calendario del dispositivo SIGUIENTE al día del informe) — el server no adivina timezones. Chequeo runtime: `detectComponentOverlaps` puro en `shared/`.

**Convenciones:** rama **`feat/suplementos-3-ajuste`** desde `main` actualizado; TDD; commits `-S` sin atribución; suites `bun test shared backend` + `cd mobile && npx jest --runInBand` + typechecks. Los patrones de PR1/PR2 son la referencia (los implementadores DEBEN leer los archivos citados antes de tocar).

**Gap descubierto al planificar:** `ReportData` (backend/src/reports/collect.ts:8) hoy NO tiene nombres de alimentos — solo totales. La inferencia "comiste rico en magnesio" necesita los **nombres**: T2 agrega `foodNames` al collect (también mejora el texto del informe).

**Decisiones de este plan:**
- `adjustmentForDate: z.iso.date().nullish()` en `ReportGenerateInputSchema` — el móvil lo manda SOLO para `daily` (= día del informe + 1, calendario del dispositivo). Server: sin ese campo o kind ≠ daily → no se genera ni persiste ajuste.
- El ajuste NO escribe el plan (escribe `supplement_adjustment`) → `plan-suplementos` sigue con `useEffect` (invariante registrado en PR2: cambia a `useFocusEffect` solo si aparece otro ESCRITOR del plan).
- Adherencia periódica = conteos de tomas registradas (tomado/desvío/salteado) — sin reconstruir el "planificado" día por día (YAGNI).
- Respuesta de `POST /plan/generate` pasa de `PlanView` a `{ plan: PlanView, warnings: string[] }` (breaking interno; el móvil se adapta en la misma tanda).

---

### Task 1: Shared — schemas de wire + `detectComponentOverlaps` + comentario de keying

**Files:** `shared/src/schemas/report.ts`, `shared/src/schemas/supplements.ts` (solo si hace falta re-export), `shared/src/supplements/overlap.ts` (new) + test, `shared/src/supplements/checklist.ts` (comentario), `shared/src/index.ts`.

- [ ] **Step 1 (TDD schemas):** en `report.ts`: `ReportGenerateInputSchema` gana `adjustmentForDate: z.iso.date().nullish()`; `ReportOutputSchema` gana `supplementAdjustment: z.array(AdjustmentItemSchema).max(10).default([])` (import desde `./supplements`). Tests: input acepta sin el campo (back-compat) y rechaza fecha inválida; output default `[]` y rechaza `action: "increase"` adentro (ya lo bloquea AdjustmentItemSchema — el test lo pinnea a este nivel).
- [ ] **Step 2 (TDD overlap):** `shared/src/supplements/overlap.ts`:

```ts
// Detecta componentes activos que se solapan entre ítems del plan el mismo día.
// Heurística de agrupado: primera palabra del nombre del componente, minúscula, sin paréntesis
// ("Magnesio (citrato)" y "Magnesio bisglicinato" → "magnesio"). Chequea los próximos 14 días
// con frequencyAppliesOn; si algún día 2+ ítems comparten componente → warning por componente.
export function detectComponentOverlaps(
  items: { supplementId: string; frequency: Frequency; }[],
  catalog: Pick<Supplement, "id" | "name" | "components">[],
  fromDate: string, // YYYY-MM-DD
): string[]
```

Tests: dos suplementos con "Magnesio X"/"Magnesio Y" ambos daily → 1 warning nombrando "magnesio" y los productos; mismos con weekdays complementarios ([1,3,5] vs [2,4,6]) → sin warning; componentes distintos → sin warning; mismo suplemento en 2 franjas (split dosing) → SIN warning (mismo producto no es duplicación). Iterar fechas con aritmética de calendario (`Date.UTC` + días, patrón checklist).
- [ ] **Step 3:** comentario en `checklist.ts` sobre el keying deliberado de ajustes por `supplementId` ("un skip del informe aplica a TODAS las franjas de ese suplemento; la IA razona por producto, no por ítem"). Export de `overlap.ts` en el índice.
- [ ] **Step 4:** `bun test shared` verde + typecheck. Commit: `feat(suplementos): schemas de ajuste en informes + detector de solapamiento de componentes (PR3)`.

---

### Task 2: Backend — datos de suplementos en el collect + repos

**Files:** `backend/src/supplements/repository.ts` (+2 funciones + tests), `backend/src/reports/collect.ts` + `collect.test.ts`.

- [ ] **Step 1 (repo, TDD):** `listTakesForRange(db, userId, fromDate, toDate)` (strings YYYY-MM-DD; `gte/lte` sobre la columna text — ISO ordena lexicográficamente) y `upsertAdjustment(db, userId, forDate, items: AdjustmentItem[], reportId)` con `onConflictDoUpdate` target `[userId, forDate]` set `{items, reportId}` (el índice UNIQUE existe desde 0016). Tests de mappers si aplica; el wiring se testea en rutas.
- [ ] **Step 2 (collect, TDD):** `ReportData` gana:

```ts
foodNames: string[]; // nombres únicos de los ítems comidos en el período (cap 40)
supplements: {
  planItems: { supplementName: string; dose: string; slot: string }[]; // plan activo
  takes: { supplementName: string; status: string; plannedDose: string; actualDose: string | null; date: string }[];
  catalog: { name: string; components: { name: string; amount: number; unit: string }[] }[];
} | null; // null si no hay plan activo
```

`collectReportData` los llena (inyectar `getActivePlan`/`listTakesForRange`/`listSupplements` vía `CollectDeps` como las demás); `foodNames` = únicos de `items.map(foodName)` cap 40. Las fechas del rango de takes: derivar de from/to con el date LOCAL del server NO — el período viene en epoch del dispositivo… los takes usan date-string del dispositivo. Aproximación honesta y suficiente: convertir from/to a YYYY-MM-DD con UTC (`new Date(from).toISOString().slice(0,10)` / idem to) — puede correr un día en el borde para TZs lejanas, pero el usuario está en Europe/Berlin y los informes ya usan esa aproximación para la fecha de memoria (route línea ~191). Documentarlo con un comentario.
`hasAnyData` NO cambia (suplementos solos no justifican un informe). Tests con deps fake (patrón existente del archivo).
- [ ] **Step 3:** `bun test backend` + typecheck. Commit: `feat(suplementos): datos de plan/tomas y nombres de comidas en el collect de informes (PR3)`.

---

### Task 3: Backend — prompt del informe + persistencia del ajuste

**Files:** `backend/src/ai/report.ts` + `report.test.ts`, `backend/src/routes/nutrition.ts` (handler `/reports/generate`) + test.

- [ ] **Step 1 (prompt, TDD):** `buildReportPrompt`:
  - Si `data.supplements` presente: sección "Suplementos" con plan del día/período + tomas registradas + catálogo con componentes; el texto del informe debe **mencionar la adherencia** (diaria: qué se tomó/salteó; periódica: conteos).
  - SOLO `kind === "daily"`: instrucción del ajuste — "si por lo que el usuario comió hoy (mirá los nombres de los alimentos) algún componente de sus suplementos ya quedó bien cubierto, podés devolver `supplementAdjustment` para MAÑANA: solo `skip` o `reduce` (reduce exige `dose`), nunca aumentar; `supplementId` EXACTO del catálogo; `reason` corto y concreto ('comiste espinaca y frutos secos, el magnesio quedó cubierto'). Si no hay motivo claro, devolvé la lista vacía — el plan base ya está bien". Anti-inyección ya presente en el prompt (verificar y extender la mención a los datos de suplementos). Kinds periódicos: adherencia en el texto, PROHIBIDO el ajuste (instrucción explícita + el route lo ignora igual).
  - Tests: la sección aparece solo con `supplements` presente; el bloque de ajuste solo en daily; regexes no-vacuas (rojas contra el prompt actual).
- [ ] **Step 2 (route, TDD):** en `/reports/generate`, tras `upsertReport`: si `kind === "daily"` y `parsed.data.adjustmentForDate` y `output.supplementAdjustment.length > 0` → cargar plan activo, filtrar items cuyo `supplementId` no esté entre los suplementos del plan (log de descartes), y si queda algo `upsertAdjustment(db, userId, adjustmentForDate, filtered, saved.id)`. Sin plan activo → ignorar todo. El schema ya bloqueó increase/reduce-sin-dose. Tests (fakeDb del archivo): daily con ajuste válido → insert con forDate y reportId; item con supplementId desconocido → filtrado; kind weekly con adjustment en el output → NO persiste; daily sin adjustmentForDate → NO persiste.
- [ ] **Step 3:** `bun test backend` + typecheck. Commit: `feat(suplementos): el informe diario deja el ajuste de mañana + adherencia en informes (PR3)`.

---

### Task 4: Warnings runtime en `/plan/generate` + UI

**Files:** `backend/src/routes/supplements.ts` + test, `mobile/src/api/supplements.ts` + test, `mobile/app/nutricion/plan-suplementos.tsx` + test.

- [ ] **Step 1 (route, TDD):** `POST /plan/generate` — tras `createPlan`, correr `detectComponentOverlaps(planItems, catalog, body.date)`; `console.warn` por warning; responder `{ plan: planView, warnings }` (antes devolvía el PlanView pelado). Tests: caso con dos magnesios daily → `warnings.length === 1` y el texto nombra el componente; caso limpio → `[]`. Ajustar los tests existentes del endpoint a la nueva forma.
- [ ] **Step 2 (mobile, TDD):** `generatePlan` devuelve `{ plan, warnings }` (ajustar tipo + tests); `plan-suplementos.tsx` guarda `warnings` en estado y las muestra en una nota ámbar (`colors.warning`) arriba del plan: "⚠️ {warning}" — con un texto contextual tipo "Revisá el plan o regenerá con una nota." Test: generar con warnings → visibles; sin warnings → nada.
- [ ] **Step 3:** suites móvil + backend + typechecks. Commit: `feat(suplementos): warnings runtime de componentes duplicados al generar el plan (PR3)`.

---

### Task 5: Mobile — `adjustmentForDate` desde informes + indicador en informes

**Files:** `mobile/app/nutricion/informes.tsx` + (nuevo o existente) test, `mobile/src/api/reports.ts` si tipa el input.

- [ ] **Step 1 (TDD):** al generar un informe **daily** (`generate()`), incluir `adjustmentForDate` = día calendario SIGUIENTE al día del informe: con el `offset` actual, `dateKey(dayAtNoon(offset - 1, Date.now()))` (offset positivo = pasado ⇒ offset−1 = el día siguiente; para offset 0 es mañana — verificar contra `metricDate.ts` y usar aritmética de calendario si dayAtNoon(-1) no está soportado: mirar la implementación y en su defecto `dateKey` de hoy+1 con componentes de calendario). Kinds periódicos: NO mandar el campo. Test: mock de `generateReport` API asertando el body para daily (campo presente y = mañana con fecha mockeada) y para weekly (ausente).
- [ ] **Step 2:** tras generar un informe daily con éxito, si la respuesta del backend no expone el ajuste (no hace falta), simplemente mostrar una línea informativa fija cuando corresponda es YAGNI — **no** agregar UI extra: el ajuste aparece solo en el checklist de mañana (ya implementado en PR2). Solo asegurarse de que nada rompa.
- [ ] **Step 3:** suite móvil + typecheck. Commit: `feat(suplementos): el informe diario manda adjustmentForDate (PR3)`.

---

### Task 6: Verificación final + PR

- [ ] Suites completas (shared+backend, móvil, typechecks ×3). Push + PR `feat(nutrición): suplementos #3 PR3 — ajuste dinámico vía informe + adherencia + warnings runtime` con `@claude review`. Tras merge: deploy health (`ssh vps 'curl -s http://10.8.0.2:3011/health'`) + **OTA** (runtime `784872cb…`). Actualizar memoria (`nutrition-comidas-status`: #3 COMPLETO).

---

## Self-review del plan (hecho)

- **Cobertura**: spec §generateReport extendido ✓ (T3), persistencia con UNIQUE ✓ (T2/T3), checklist ya muestra ajustes (PR2) ✓, adherencia diaria+periódica ✓ (T2/T3), anti-inyección extendida ✓ (T3), carry-overs: chequeo runtime ✓ (T1/T4), comentario keying ✓ (T1), invariante useEffect documentado ✓ (decisiones).
- **Gap de foodNames** resuelto en T2 (sin nombres la inferencia no existía).
- **Timezone del rango de takes**: aproximación UTC documentada, consistente con la fecha de memoria existente.
- **Breaking interno** de `/plan/generate` (respuesta `{plan, warnings}`) contenido en T4 con ambos lados en la misma tanda.
- **Placeholders**: los "verificar X" apuntan a archivos concretos con fallback, patrón de los planes anteriores.
