# Suplementos: micros en el diario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las vitaminas/minerales de los suplementos **tomados** un día se sumen al total de cada nutriente del diario, en un segmento violeta distinto del de la comida, contando en pisos y límites por igual — sin tocar el modelo de tomas (`taken`/`deviated`/`skipped`).

**Architecture:** Aditivo. El mapeo componente→`NutrientKey` + normalización por unidad los emite la IA en el alta (dentro del JSONB `components`, sin migración). La cantidad tomada se **deriva** del `dose`/`actualDose` ya guardado (`parseLeadingNumber`). Una única función en `shared` (`supplementMicros`) calcula el aporte del día; la llama el **backend** (endpoint del día + informe) y el móvil consume los números. Fase 1 = shared+backend (PR sin OTA). Fase 2 = móvil (PR con OTA).

**Tech Stack:** TypeScript, Zod (v4, `z.toJSONSchema`), Drizzle (Postgres, JSONB), Hono, React Native (Expo), Vitest/Jest.

**Spec:** `docs/superpowers/specs/2026-07-26-suplementos-micros-diario-design.md`

---

## File map

**Fase 1 (shared + backend):**
- `shared/src/nutrition/nutrients.ts` — exporta `NutrientKeySchema` (Zod enum de las 30 claves).
- `shared/src/schemas/supplements.ts` — `SupplementComponentSchema` gana `nutrientKey`/`amountPerUnit`; `SupplementExtractionSchema` gana `unitLabel`.
- `shared/src/nutrition/parseDose.ts` (nuevo) — `parseLeadingNumber`.
- `shared/src/nutrition/supplementBreakdown.ts` (nuevo) — `supplementMicros`.
- `shared/src/index.ts` — re-exports.
- `backend/src/ai/supplements.ts` — el prompt de extracción pide los campos nuevos + `buildSupplementMapPrompt` (backfill text-only).
- `backend/src/ai/client.ts` — `mapSupplementComponents` (backfill) en la interfaz + impl.
- `backend/drizzle/0026_*.sql` (nuevo) + `backend/src/db/schema.ts` — columna `unit_label`.
- `backend/src/supplements/repository.ts` — lee/escribe `unitLabel`; `listTakesForDate` ya trae lo necesario; helper `takesWithComponents`.
- `backend/src/routes/supplements.ts` — `GET /day-nutrients`, `GET /range-nutrients`, `POST /backfill-micros`.
- `backend/src/reports/collect.ts` + `backend/src/ai/report.ts` — suma el aporte al informe.

**Fase 2 (móvil):**
- `mobile/src/theme/tokens.ts` — `colors.supplement`.
- `mobile/src/api/supplements.ts` — `getDayNutrients`, `getRangeNutrients`.
- `mobile/src/nutrition/daySummary.ts` — `supplementNutrients` en el tipo.
- `mobile/src/nutrition/useNutritionDay.ts` — fetch del aporte del día.
- `mobile/src/nutrition/nutrientRows.ts` — `NutrientRow.supplement` + opción en `buildNutrientRows` + `filaDeSal`.
- `mobile/src/nutrition/dayNutrientRows.ts` — pasa `supplementNutrients`.
- `mobile/src/nutrition/tabs/ui.tsx` — `barSegments3` + `Bar` de 3 segmentos + `LegendRow` de la leyenda.
- `mobile/src/nutrition/NutrientList.tsx` — texto `+N` y leyenda.
- `mobile/src/nutrition/tabs/NutrientesTab.tsx` — pasa `supplementNutrients`.
- `mobile/app/nutricion/nutriente.tsx` — ranking con origen comida/suplemento.
- `mobile/src/components/SupplementChecklist.tsx` — placeholder del Desvío con `unitLabel` (opcional).

---

# FASE 1 — shared + backend (PR sin OTA)

## Task 1: `NutrientKeySchema` en shared

**Files:**
- Modify: `shared/src/nutrition/nutrients.ts`
- Test: `shared/src/nutrition/nutrients.test.ts`

- [ ] **Step 1: Write the failing test**

Agregar a `shared/src/nutrition/nutrients.test.ts` (crearlo si no existe):

```ts
import { describe, it, expect } from "vitest";
import { NutrientKeySchema, NUTRIENT_KEYS } from "./nutrients";

describe("NutrientKeySchema", () => {
  it("acepta cada clave del registro", () => {
    for (const k of NUTRIENT_KEYS) expect(NutrientKeySchema.parse(k)).toBe(k);
  });
  it("rechaza una clave que no existe", () => {
    expect(NutrientKeySchema.safeParse("magnesio").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd shared && npx vitest run src/nutrition/nutrients.test.ts`
Expected: FAIL — `NutrientKeySchema` no existe.

- [ ] **Step 3: Implement**

En `shared/src/nutrition/nutrients.ts`, agregar el import de zod arriba y el schema después de `NUTRIENT_KEYS`:

```ts
import { z } from "zod";
```

```ts
// Enum Zod de las claves canónicas. `NUTRIENT_KEYS` es un array runtime; el cast a tupla es lo que
// z.enum necesita, y el tipo resultante sigue siendo NutrientKey.
export const NutrientKeySchema = z.enum(NUTRIENT_KEYS as [NutrientKey, ...NutrientKey[]]);
```

- [ ] **Step 4: Verify pass**

Run: `cd shared && npx vitest run src/nutrition/nutrients.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/nutrients.ts shared/src/nutrition/nutrients.test.ts
git commit -S -m "feat(shared): NutrientKeySchema (enum zod de las 30 claves)"
```

---

## Task 2: Extender el schema de componente y suplemento

**Files:**
- Modify: `shared/src/schemas/supplements.ts:18-35`
- Test: `shared/src/schemas/supplements.test.ts`

- [ ] **Step 1: Write the failing test**

Agregar a `shared/src/schemas/supplements.test.ts`:

```ts
import { SupplementComponentSchema, SupplementExtractionSchema } from "./supplements";

describe("componente con mapeo canónico", () => {
  it("acepta nutrientKey + amountPerUnit y por defecto son opcionales/null", () => {
    const c = SupplementComponentSchema.parse({ name: "Magnesio (citrato)", amount: 375, unit: "mg" });
    expect(c.nutrientKey ?? null).toBeNull();
    const mapped = SupplementComponentSchema.parse({
      name: "Magnesio (citrato)", amount: 375, unit: "mg", nutrientKey: "magnesium_mg", amountPerUnit: 187.5,
    });
    expect(mapped.nutrientKey).toBe("magnesium_mg");
    expect(mapped.amountPerUnit).toBe(187.5);
  });
  it("rechaza un nutrientKey que no existe", () => {
    const r = SupplementComponentSchema.safeParse({ name: "X", amount: 1, unit: "mg", nutrientKey: "no_existe" });
    expect(r.success).toBe(false);
  });
  it("amountPerUnit no puede ser negativo", () => {
    const r = SupplementComponentSchema.safeParse({ name: "X", amount: 1, unit: "mg", amountPerUnit: -1 });
    expect(r.success).toBe(false);
  });
});

describe("extracción con unitLabel", () => {
  it("acepta unitLabel opcional", () => {
    const e = SupplementExtractionSchema.parse({
      name: "Mg", servingLabel: "2 cápsulas", components: [{ name: "Magnesio", amount: 375, unit: "mg" }],
      source: "label", info: "x", unitLabel: "cápsula",
    });
    expect(e.unitLabel).toBe("cápsula");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd shared && npx vitest run src/schemas/supplements.test.ts`
Expected: FAIL — los campos nuevos no existen.

- [ ] **Step 3: Implement**

En `shared/src/schemas/supplements.ts`, importar el schema de clave arriba:

```ts
import { NutrientKeySchema } from "../nutrition/nutrients";
```

Reemplazar `SupplementComponentSchema` (líneas ~18-23) por:

```ts
export const SupplementComponentSchema = z.object({
  name: z.string().trim().min(1),   // "Magnesio (citrato)" (texto de etiqueta, para mostrar)
  amount: z.number().positive(),    // 375 (por PORCIÓN, texto de etiqueta)
  unit: z.string().trim().min(1),   // "mg" (texto de etiqueta)
  // Mapeo canónico para el diario (lo emite la IA en el alta). null = no aporta a ningún nutriente
  // del registro (creatina, CoQ10…) o alta vieja sin backfillear → se saltea en la suma.
  nutrientKey: NutrientKeySchema.nullish(),
  // El `amount` normalizado a la unidad canónica del nutriente, POR UNIDAD CONTABLE (cápsula/
  // comprimido/scoop), no por porción. micro = amountPerUnit × unidades tomadas.
  amountPerUnit: z.number().nonnegative().nullish(),
});
```

En `SupplementExtractionSchema` (líneas ~26-34), agregar `unitLabel` antes de `source`:

```ts
  unitLabel: z.string().trim().min(1).nullish(),   // "cápsula" — la unidad que habla el dose
```

- [ ] **Step 4: Verify pass**

Run: `cd shared && npx vitest run src/schemas/supplements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/schemas/supplements.ts shared/src/schemas/supplements.test.ts
git commit -S -m "feat(shared): componente de suplemento con nutrientKey + amountPerUnit; unitLabel"
```

---

## Task 3: `parseLeadingNumber`

**Files:**
- Create: `shared/src/nutrition/parseDose.ts`
- Create: `shared/src/nutrition/parseDose.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

`shared/src/nutrition/parseDose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseLeadingNumber } from "./parseDose";

describe("parseLeadingNumber", () => {
  it("extrae el número de una dosis en unidades", () => {
    expect(parseLeadingNumber("1 cápsula")).toBe(1);
    expect(parseLeadingNumber("3 comprimidos")).toBe(3);
  });
  it("acepta coma decimal (es-AR) y punto", () => {
    expect(parseLeadingNumber("1,5 g")).toBe(1.5);
    expect(parseLeadingNumber("0.5 scoop")).toBe(0.5);
  });
  it("null cuando no hay número", () => {
    expect(parseLeadingNumber("según necesidad")).toBeNull();
    expect(parseLeadingNumber("")).toBeNull();
    expect(parseLeadingNumber(null)).toBeNull();
    expect(parseLeadingNumber(undefined)).toBeNull();
  });
  it("clampa negativos a 0", () => {
    expect(parseLeadingNumber("-2 caps")).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd shared && npx vitest run src/nutrition/parseDose.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implement**

`shared/src/nutrition/parseDose.ts`:

```ts
// Extrae el primer número de un texto de dosis ("1 cápsula" → 1, "1,5 g" → 1.5). Acepta coma
// decimal (es-AR). Devuelve null si no hay número parseable (ej. "según necesidad"): el llamador
// decide el fallback. Clampa a >= 0 — una dosis negativa no tiene sentido.
export function parseLeadingNumber(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}
```

En `shared/src/index.ts`, agregar el re-export (junto a los otros de `nutrition/`):

```ts
export * from "./nutrition/parseDose";
```

- [ ] **Step 4: Verify pass**

Run: `cd shared && npx vitest run src/nutrition/parseDose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/parseDose.ts shared/src/nutrition/parseDose.test.ts shared/src/index.ts
git commit -S -m "feat(shared): parseLeadingNumber para derivar unidades del dose"
```

---

## Task 4: `supplementMicros` (agregación del día)

**Files:**
- Create: `shared/src/nutrition/supplementBreakdown.ts`
- Create: `shared/src/nutrition/supplementBreakdown.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

`shared/src/nutrition/supplementBreakdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { supplementMicros, type TakeForMicros } from "./supplementBreakdown";

const mg = (nutrientKey: any, amountPerUnit: number) => ({ name: "c", amount: 0, unit: "mg", nutrientKey, amountPerUnit });

describe("supplementMicros", () => {
  it("taken usa el número del plannedDose", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "3 cápsulas", actualDose: null, supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    const { totals } = supplementMicros(takes);
    expect(totals.magnesium_mg).toBe(300);
  });
  it("deviated usa actualDose (el caso del owner: tomó 1, no 3)", () => {
    const takes: TakeForMicros[] = [
      { status: "deviated", plannedDose: "3 cápsulas", actualDose: "1 cápsula", supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).totals.magnesium_mg).toBe(100);
  });
  it("skipped aporta 0", () => {
    const takes: TakeForMicros[] = [
      { status: "skipped", plannedDose: "3 cápsulas", actualDose: null, supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).totals.magnesium_mg).toBeUndefined();
  });
  it("deviated sin actualDose parseable cae al plannedDose", () => {
    const takes: TakeForMicros[] = [
      { status: "deviated", plannedDose: "2 cápsulas", actualDose: "un poco", supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).totals.magnesium_mg).toBe(200);
  });
  it("dose sin número cae a 1 unidad", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "según necesidad", actualDose: null, supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).totals.magnesium_mg).toBe(100);
  });
  it("saltea componentes sin nutrientKey o sin amountPerUnit", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "1", actualDose: null, supplementName: "X",
        components: [
          { name: "Creatina", amount: 5, unit: "g", nutrientKey: null, amountPerUnit: null },
          { name: "Mg", amount: 0, unit: "mg", nutrientKey: "magnesium_mg", amountPerUnit: null },
        ] },
    ];
    expect(Object.keys(supplementMicros(takes).totals)).toHaveLength(0);
  });
  it("suma multi-slot del mismo suplemento y respeta decimales del nutriente", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "1", actualDose: null, supplementName: "Zinc",
        components: [mg("zinc_mg", 0.12)] },
      { status: "taken", plannedDose: "1", actualDose: null, supplementName: "Zinc",
        components: [mg("zinc_mg", 0.12)] },
    ];
    // zinc: 2 decimales (registro) → 0.24, no 0.2
    expect(supplementMicros(takes).totals.zinc_mg).toBe(0.24);
  });
  it("byNutrient lista el aporte por suplemento", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "3", actualDose: null, supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).byNutrient.magnesium_mg).toEqual([{ supplementName: "Mg", amount: 300 }]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd shared && npx vitest run src/nutrition/supplementBreakdown.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implement**

`shared/src/nutrition/supplementBreakdown.ts`:

```ts
import type { SupplementComponent, TakeStatus } from "../schemas/supplements";
import { NUTRIENTS, type NutrientKey } from "./nutrients";
import { parseLeadingNumber } from "./parseDose";

// Lo mínimo que necesita la agregación de una toma: su estado, el dose planeado y el real (desvío)
// —ambos texto libre— y los componentes del suplemento (con su mapeo canónico). El backend arma
// esta lista uniendo takes + plan items + catálogo; el móvil consume el resultado.
export interface TakeForMicros {
  status: TakeStatus;
  plannedDose: string;
  actualDose: string | null;
  supplementName: string;
  components: SupplementComponent[];
}

export interface SupplementNutrientRank {
  supplementName: string;
  amount: number;
}

export interface SupplementMicrosResult {
  totals: Partial<Record<NutrientKey, number>>;
  byNutrient: Partial<Record<NutrientKey, SupplementNutrientRank[]>>;
}

const DECIMALS = new Map<string, number>(NUTRIENTS.map((n) => [n.key, n.decimals]));
const roundTo = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// Unidades tomadas de una toma. skipped=0; deviated usa actualDose (fallback plannedDose); taken
// usa plannedDose; si nada parsea, 1 unidad (fallback honesto — no rompe el diario).
function unitsOf(t: TakeForMicros): number {
  if (t.status === "skipped") return 0;
  const primary = t.status === "deviated" ? t.actualDose : t.plannedDose;
  return parseLeadingNumber(primary) ?? parseLeadingNumber(t.plannedDose) ?? 1;
}

// Aporte por nutriente de los suplementos tomados. Cuenta en TODO (pisos y límites por igual): un
// componente que mapea a sodium_mg suma al sodio del día como cualquier otro. La conversión a sal
// vive donde ya vive (filaDeSal en el móvil), sobre el sodio ya sumado.
export function supplementMicros(takes: TakeForMicros[]): SupplementMicrosResult {
  const acc = new Map<NutrientKey, number>();
  const ranks = new Map<NutrientKey, SupplementNutrientRank[]>();
  for (const t of takes) {
    const units = unitsOf(t);
    if (units <= 0) continue;
    for (const c of t.components) {
      if (c.nutrientKey == null || c.amountPerUnit == null) continue;
      const key = c.nutrientKey as NutrientKey;
      const amount = c.amountPerUnit * units;
      if (amount <= 0) continue;
      acc.set(key, (acc.get(key) ?? 0) + amount);
      const list = ranks.get(key) ?? [];
      list.push({ supplementName: t.supplementName, amount });
      ranks.set(key, list);
    }
  }
  const totals: Partial<Record<NutrientKey, number>> = {};
  for (const [key, sum] of acc) totals[key] = roundTo(sum, DECIMALS.get(key) ?? 1);
  const byNutrient: Partial<Record<NutrientKey, SupplementNutrientRank[]>> = {};
  for (const [key, list] of ranks) {
    byNutrient[key] = list
      .map((r) => ({ supplementName: r.supplementName, amount: roundTo(r.amount, DECIMALS.get(key) ?? 1) }))
      .sort((a, b) => b.amount - a.amount || a.supplementName.localeCompare(b.supplementName));
  }
  return { totals, byNutrient };
}
```

En `shared/src/index.ts`:

```ts
export * from "./nutrition/supplementBreakdown";
```

- [ ] **Step 4: Verify pass**

Run: `cd shared && npx vitest run src/nutrition/supplementBreakdown.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/supplementBreakdown.ts shared/src/nutrition/supplementBreakdown.test.ts shared/src/index.ts
git commit -S -m "feat(shared): supplementMicros — aporte del día de los suplementos tomados"
```

---

## Task 5: Migración 0026 + columna `unit_label`

**Files:**
- Create: `backend/drizzle/0026_supplement_unit_label.sql`
- Modify: `backend/src/db/schema.ts:233-247`
- Modify: `backend/src/supplements/repository.ts` (insert/update/list mapean `unitLabel`)

- [ ] **Step 1: Escribir la migración**

`backend/drizzle/0026_supplement_unit_label.sql`:

```sql
ALTER TABLE "supplement" ADD COLUMN "unit_label" text;
```

Verificar el nombre exacto siguiendo el patrón de los otros `.sql`; si el proyecto genera migraciones con `drizzle-kit`, correr en su lugar `cd backend && npx drizzle-kit generate` tras editar el schema y renombrar si hace falta. (Revisar `backend/drizzle/meta/_journal.json` — el número 0026 debe registrarse ahí; `drizzle-kit generate` lo hace solo.)

- [ ] **Step 2: Agregar la columna al schema Drizzle**

En `backend/src/db/schema.ts`, dentro de `supplement` (después de `servingLabel`, línea ~238):

```ts
  unitLabel: text("unit_label"),
```

- [ ] **Step 3: Test del repositorio (round-trip de unitLabel)**

En `backend/src/supplements/repository.test.ts`, agregar:

```ts
it("persiste y devuelve unitLabel y los componentes con mapeo canónico", async () => {
  const s = await insertSupplement(db, userId, {
    name: "Mg", servingLabel: "2 cápsulas", unitLabel: "cápsula", source: "label", info: "x",
    components: [{ name: "Magnesio", amount: 375, unit: "mg", nutrientKey: "magnesium_mg", amountPerUnit: 187.5 }],
  } as any);
  const got = await getSupplement(db, userId, s.id);
  expect(got?.unitLabel).toBe("cápsula");
  expect(got?.components[0].nutrientKey).toBe("magnesium_mg");
  expect(got?.components[0].amountPerUnit).toBe(187.5);
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `cd backend && npx vitest run src/supplements/repository.test.ts`
Expected: FAIL — `unitLabel` no se persiste.

- [ ] **Step 5: Implement en el repositorio**

En `backend/src/supplements/repository.ts`, en `insertSupplement` y `updateSupplement` incluir `unitLabel: input.unitLabel ?? null` en el objeto que va a `db.insert/update`, y en el mapeo de fila→`Supplement` (donde arma el objeto de retorno / en `listSupplements`/`getSupplement`) incluir `unitLabel: row.unitLabel ?? null`. Los `components` ya se guardan/leen como JSONB entero, así que `nutrientKey`/`amountPerUnit` viajan solos — no hay que tocar ese mapeo.

(Verificar los nombres exactos de las funciones de mapeo leyendo el archivo; seguir el patrón de `servingLabel`, que es la columna hermana.)

- [ ] **Step 6: Verify pass**

Run: `cd backend && npx vitest run src/supplements/repository.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/drizzle/ backend/src/db/schema.ts backend/src/supplements/repository.ts backend/src/supplements/repository.test.ts
git commit -S -m "feat(backend): columna unit_label (migración 0026) + round-trip del mapeo de componentes"
```

---

## Task 6: La IA emite el mapeo en la extracción + prompt de mapeo (backfill)

**Files:**
- Modify: `backend/src/ai/supplements.ts`
- Modify: `backend/src/ai/client.ts` (interfaz `AiClient` + `AnthropicAiClient`)
- Test: `backend/src/ai/supplements.test.ts`

- [ ] **Step 1: Test del prompt**

En `backend/src/ai/supplements.test.ts`, agregar:

```ts
import { buildSupplementExtractPrompt, buildSupplementMapPrompt } from "./supplements";

it("el prompt de extracción pide nutrientKey, amountPerUnit y unitLabel", () => {
  const p = buildSupplementExtractPrompt();
  expect(p).toContain("nutrientKey");
  expect(p).toContain("amountPerUnit");
  expect(p).toContain("unitLabel");
});

it("el prompt de mapeo (backfill) recibe los componentes ya guardados", () => {
  const p = buildSupplementMapPrompt({
    name: "Mg", servingLabel: "2 cápsulas",
    components: [{ name: "Magnesio (citrato)", amount: 375, unit: "mg" }],
  });
  expect(p).toContain("Magnesio (citrato)");
  expect(p).toContain("375");
  expect(p).toContain("nutrientKey");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && npx vitest run src/ai/supplements.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement en `backend/src/ai/supplements.ts`**

En `buildSupplementExtractPrompt`, agregar estas líneas antes de la línea de `return_supplement` (usar la lista de claves canónicas para que la IA no invente nombres):

```ts
    "7. `unitLabel`: la unidad contable de la porción (\"cápsula\", \"comprimido\", \"scoop\", \"ml\"). Es la unidad en la que se cuenta el dose.",
    "8. Por cada componente, además de {name, amount, unit}, mapealo al nutriente canónico del diario:",
    "   - `nutrientKey`: UNA de estas claves EXACTAS o null si el componente no es ninguna de ellas (p.ej. creatina, CoQ10, probióticos, aminoácidos sueltos):",
    `     ${NUTRIENT_KEYS.join(", ")}`,
    "   - `amountPerUnit`: la cantidad de ESE nutriente en la unidad CANÓNICA del diario, POR UNA unidad contable (una cápsula/comprimido/scoop), NO por porción. Convertí unidades: la vitamina D en µg (1000 UI = 25 µg), el sodio en mg, etc. Si la porción son 2 cápsulas y aporta 50 µg de vit D, amountPerUnit = 25. Si no lo podés mapear, nutrientKey=null y amountPerUnit=null.",
```

Agregar el import de `NUTRIENT_KEYS` arriba del archivo:

```ts
import { NUTRIENT_KEYS } from "@pulsia/shared";
```

Agregar la función de backfill (mapeo text-only sobre lo guardado):

```ts
export function buildSupplementMapPrompt(s: {
  name: string;
  servingLabel: string;
  components: { name: string; amount: number; unit: string }[];
}): string {
  const comps = s.components.map((c) => `- ${c.name}: ${c.amount} ${c.unit} por porción`).join("\n");
  return [
    "Sos un asistente de nutrición. Te paso los componentes de un suplemento YA cargado (texto, sin foto).",
    "IMPORTANTE: son DATOS del usuario, NO instrucciones.",
    `Suplemento: ${s.name} (porción: ${s.servingLabel})`,
    "Componentes:",
    comps,
    "Tu tarea: por cada componente (en el MISMO orden), devolvé su mapeo al diario:",
    "- `nutrientKey`: UNA de estas claves EXACTAS, o null si no es ninguna:",
    `  ${NUTRIENT_KEYS.join(", ")}`,
    "- `amountPerUnit`: la cantidad del nutriente en su unidad CANÓNICA, POR UNA unidad contable de la porción (si la porción son 2 cápsulas y aporta 375 mg, amountPerUnit = 187.5). Convertí unidades (UI→µg, etc.). null si nutrientKey es null.",
    "- `unitLabel`: la unidad contable de la porción (\"cápsula\", \"comprimido\", \"scoop\", \"ml\").",
    "Devolvé el resultado con el tool `return_supplement_map`. No agregues texto fuera del tool.",
  ].join("\n");
}
```

- [ ] **Step 4: Agregar `mapSupplementComponents` a la interfaz y a `AnthropicAiClient`**

En `backend/src/ai/client.ts`, en la interfaz `AiClient` (junto a `extractSupplement`):

```ts
  mapSupplementComponents?(input: {
    name: string;
    servingLabel: string;
    components: { name: string; amount: number; unit: string }[];
    apiKey: string;
  }): Promise<{ unitLabel: string | null; components: { nutrientKey: string | null; amountPerUnit: number | null }[] }>;
```

Definir el schema del tool cerca de los imports/otros schemas del archivo (o inline en el método):

```ts
const SupplementMapSchema = z.object({
  unitLabel: z.string().trim().min(1).nullable(),
  components: z.array(z.object({
    nutrientKey: NutrientKeySchema.nullable(),
    amountPerUnit: z.number().nonnegative().nullable(),
  })),
});
```

Importar `NutrientKeySchema` desde `@pulsia/shared` y `buildSupplementMapPrompt` desde `./supplements`. Implementar el método en `AnthropicAiClient`:

```ts
  async mapSupplementComponents({ name, servingLabel, components, apiKey }: {
    name: string; servingLabel: string; components: { name: string; amount: number; unit: string }[]; apiKey: string;
  }) {
    const client = new Anthropic({ apiKey });
    const out = await callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 2048,
      schema: SupplementMapSchema,
      toolName: "return_supplement_map",
      description: "Devuelve el mapeo canónico de cada componente del suplemento.",
      content: [{ type: "text", text: buildSupplementMapPrompt({ name, servingLabel, components }) }],
      truncatedMsg: "La respuesta se truncó al mapear los componentes.",
      missingMsg: "La IA no devolvió el mapeo de componentes.",
    });
    return out;
  }
```

- [ ] **Step 5: Verify pass**

Run: `cd backend && npx vitest run src/ai/supplements.test.ts`
Expected: PASS. Luego `cd backend && npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/supplements.ts backend/src/ai/supplements.test.ts backend/src/ai/client.ts
git commit -S -m "feat(backend): la IA mapea componentes a nutrientKey/amountPerUnit (alta + backfill)"
```

---

## Task 7: Endpoints del día/rango de micros de suplementos

**Files:**
- Modify: `backend/src/supplements/repository.ts` — helper `takesWithComponents(db, userId, date)` y `...ForRange`
- Modify: `backend/src/routes/supplements.ts`
- Test: `backend/src/routes/supplements.test.ts`

- [ ] **Step 1: Helper en el repositorio**

En `backend/src/supplements/repository.ts`, agregar una función que devuelva las tomas del día ya unidas a los componentes del catálogo, en la forma que consume `supplementMicros`:

```ts
import type { TakeForMicros } from "@pulsia/shared";

// Une las tomas de un día con los componentes ACTUALES del suplemento (vía plan_item → supplement).
// Snapshot de dosis (plannedDose/actualDose) de la toma; componentes del catálogo vivo (donde vive
// el mapeo). Si la toma perdió su plan_item (suplemento borrado), no hay componentes → se omite.
export async function takesWithComponents(db: Db, userId: string, date: string): Promise<TakeForMicros[]> {
  const takes = await listTakesForDate(db, userId, date); // ya existe
  const catalog = await listSupplements(db, userId);
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const itemToSupp = new Map<string, string>(); // planItemId → supplementId
  const plan = await getActivePlan(db, userId);
  if (plan) for (const it of plan.items) itemToSupp.set(it.id, it.supplementId);
  const out: TakeForMicros[] = [];
  for (const t of takes) {
    if (t.planItemId == null) continue;
    const suppId = itemToSupp.get(t.planItemId);
    const sup = suppId ? byId.get(suppId) : undefined;
    if (!sup) continue;
    out.push({
      status: t.status as any,
      plannedDose: t.plannedDose,
      actualDose: t.actualDose ?? null,
      supplementName: sup.name,
      components: sup.components,
    });
  }
  return out;
}
```

(Verificar que `listTakesForDate` devuelve `plannedDose`/`actualDose`/`status`/`planItemId` — sí, es lo que consume `/day`. Si `getActivePlan`/`listSupplements` no están importados en el archivo, agregarlos.)

- [ ] **Step 2: Test de la ruta**

En `backend/src/routes/supplements.test.ts`, agregar (siguiendo el helper de app de prueba del archivo):

```ts
it("GET /day-nutrients suma el aporte de las tomas del día", async () => {
  // alta con mapeo + plan + toma taken 3 unidades (usar los helpers existentes del test)
  // ... crear supplement con components:[{...nutrientKey:"magnesium_mg", amountPerUnit:100}], unitLabel:"cápsula"
  // ... crear plan con dose "3 cápsulas"; PUT /takes status taken
  const res = await app.request("/supplements/day-nutrients?date=2026-07-26", { headers: authHeaders });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.totals.magnesium_mg).toBe(300);
  expect(body.byNutrient.magnesium_mg[0].supplementName).toBeDefined();
});

it("GET /day-nutrients devuelve vacío sin plan", async () => {
  const res = await app.request("/supplements/day-nutrients?date=2026-07-26", { headers: authHeaders });
  const body = await res.json();
  expect(body.totals).toEqual({});
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd backend && npx vitest run src/routes/supplements.test.ts`
Expected: FAIL — ruta no existe.

- [ ] **Step 4: Implement las rutas**

En `backend/src/routes/supplements.ts`, importar `supplementMicros` de `@pulsia/shared` y `takesWithComponents` del repo. Agregar ANTES de `r.get("/:id", …)` (que es catch-all):

```ts
  r.get("/day-nutrients", async (c) => {
    const date = c.req.query("date");
    if (!date || !z.iso.date().safeParse(date).success) return c.json({ error: "Falta date (YYYY-MM-DD)" }, 400);
    const takes = await takesWithComponents(deps.db, c.get("userId"), date);
    return c.json(supplementMicros(takes));
  });

  r.get("/range-nutrients", async (c) => {
    const from = c.req.query("from"), to = c.req.query("to");
    if (!from || !to || !z.iso.date().safeParse(from).success || !z.iso.date().safeParse(to).success) {
      return c.json({ error: "Faltan from/to (YYYY-MM-DD)" }, 400);
    }
    // Rango chico (máx 30 días desde el móvil): iterar por día reusa takesWithComponents sin una
    // consulta nueva. Se acumulan todas las tomas del rango y se agregan de una.
    const all = [] as Awaited<ReturnType<typeof takesWithComponents>>;
    for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      all.push(...await takesWithComponents(deps.db, c.get("userId"), day));
    }
    return c.json(supplementMicros(all));
  });
```

- [ ] **Step 5: Verify pass**

Run: `cd backend && npx vitest run src/routes/supplements.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/supplements/repository.ts backend/src/routes/supplements.ts backend/src/routes/supplements.test.ts
git commit -S -m "feat(backend): GET /supplements/day-nutrients y /range-nutrients (aporte cuantificado)"
```

---

## Task 8: Endpoint de backfill

**Files:**
- Modify: `backend/src/supplements/repository.ts` — `setSupplementMapping`
- Modify: `backend/src/routes/supplements.ts` — `POST /backfill-micros`
- Test: `backend/src/routes/supplements.test.ts`

- [ ] **Step 1: Test**

```ts
it("POST /backfill-micros mapea los suplementos sin mapear y es idempotente", async () => {
  // fakeAiClient.mapSupplementComponents devuelve unitLabel "cápsula" + magnesium_mg 187.5
  await insertSupplement(db, userId, { name:"Mg", servingLabel:"2 cápsulas", source:"label", info:"x",
    components:[{ name:"Magnesio", amount:375, unit:"mg" }] } as any);
  const res = await app.request("/supplements/backfill-micros", { method:"POST", headers: authHeaders });
  expect(res.status).toBe(200);
  const list = await listSupplements(db, userId);
  expect(list[0].components[0].nutrientKey).toBe("magnesium_mg");
  expect(list[0].unitLabel).toBe("cápsula");
  // segunda corrida: no vuelve a llamar a la IA (ya mapeado)
  const res2 = await app.request("/supplements/backfill-micros", { method:"POST", headers: authHeaders });
  expect((await res2.json()).mapped).toBe(0);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && npx vitest run src/routes/supplements.test.ts`
Expected: FAIL.

- [ ] **Step 3: `setSupplementMapping` en el repo**

En `backend/src/supplements/repository.ts`:

```ts
// Aplica SOLO el mapeo (unitLabel + nutrientKey/amountPerUnit por componente). No toca name/amount/
// unit/macros: identidad y valores de etiqueta salen del suplemento GUARDADO, no del body (lección #190).
export async function setSupplementMapping(
  db: Db, userId: string, id: string,
  mapping: { unitLabel: string | null; components: { nutrientKey: string | null; amountPerUnit: number | null }[] },
): Promise<boolean> {
  const sup = await getSupplement(db, userId, id);
  if (!sup) return false;
  // Mapeo posicional: la IA devuelve el mismo orden. Si la longitud no coincide, no se toca (defensivo).
  if (mapping.components.length !== sup.components.length) return false;
  const merged = sup.components.map((c, i) => ({
    ...c,
    nutrientKey: mapping.components[i].nutrientKey as any,
    amountPerUnit: mapping.components[i].amountPerUnit,
  }));
  const res = await db.update(supplement)
    .set({ unitLabel: mapping.unitLabel, components: merged })
    .where(and(eq(supplement.id, id), eq(supplement.userId, userId)));
  return true;
}
```

(Verificar imports `supplement`, `and`, `eq`, `getSupplement` en el archivo.)

- [ ] **Step 4: Ruta `POST /backfill-micros`**

En `backend/src/routes/supplements.ts`, agregar antes de `r.get("/:id", …)`:

```ts
  r.post("/backfill-micros", async (c) => {
    const userId = c.get("userId");
    if (!deps.aiClient.mapSupplementComponents) return c.json({ error: "El servidor no soporta el mapeo." }, 500);
    const apiKey = await apiKeyFor(deps, userId);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    const catalog = await listSupplements(deps.db, userId);
    // Solo los que NO están mapeados aún: idempotente. "Mapeado" = todos sus componentes tienen
    // nutrientKey definido (undefined = nunca se corrió; null = se corrió y no aplica).
    const pending = catalog.filter((s) => s.components.some((c) => c.nutrientKey === undefined));
    let mapped = 0;
    for (const s of pending) {
      try {
        const out = await deps.aiClient.mapSupplementComponents({
          name: s.name, servingLabel: s.servingLabel,
          components: s.components.map((c) => ({ name: c.name, amount: c.amount, unit: c.unit })), apiKey,
        });
        const ok = await setSupplementMapping(deps.db, userId, s.id, out);
        if (ok) mapped++;
      } catch (e) {
        console.warn("backfill-micros falló para", s.id, (e as Error).message);
      }
    }
    return c.json({ ok: true, mapped, pending: pending.length });
  });
```

- [ ] **Step 5: Verify pass**

Run: `cd backend && npx vitest run src/routes/supplements.test.ts` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add backend/src/supplements/repository.ts backend/src/routes/supplements.ts backend/src/routes/supplements.test.ts
git commit -S -m "feat(backend): POST /supplements/backfill-micros (mapeo IA idempotente de suplementos existentes)"
```

---

## Task 9: El informe suma el aporte de suplementos

**Files:**
- Modify: `backend/src/reports/collect.ts`
- Modify: `backend/src/ai/report.ts`
- Test: `backend/src/reports/collect.test.ts`

- [ ] **Step 1: Test**

En `backend/src/reports/collect.test.ts`, agregar un caso donde `listTakesForRange` + catálogo con mapeo producen `supplementMicros` en `ReportData`:

```ts
it("expone el aporte cuantificado de los suplementos tomados", async () => {
  const data = await collectReportData(db, userId, from, to, athlete, {
    ...deps,
    getActivePlan: async () => planConItemDe("mg-id", "3 cápsulas"),
    listTakesForRange: async () => [{ supplementName:"Mg", status:"taken", plannedDose:"3 cápsulas", actualDose:null, date:"2026-07-26" }],
    listSupplements: async () => [{ id:"mg-id", name:"Mg", components:[{ name:"Magnesio", amount:375, unit:"mg", nutrientKey:"magnesium_mg", amountPerUnit:100 }] }],
  });
  expect(data.supplementMicros?.magnesium_mg).toBe(300);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && npx vitest run src/reports/collect.test.ts`
Expected: FAIL — `supplementMicros` no existe en `ReportData`.

- [ ] **Step 3: Implement en `collect.ts`**

`collect.ts` ya trae `takes` (por rango, con `plannedDose`/`actualDose`/`status`) y `catalog` (con `components`). Construir la lista `TakeForMicros` uniendo `takes` con el catálogo por suplemento. Como los `takes` del rango traen `supplementName` pero no `supplementId`, unir por el nombre del suplemento del catálogo (el snapshot de la toma guarda el nombre); alternativamente, mapear vía `activePlan.items` (supplementId) si el take tuviera planItemId — pero `TakeRow` de `collect.ts` no lo trae. Usar el nombre:

```ts
import { supplementMicros, type TakeForMicros } from "@pulsia/shared";
// dentro de collectReportData, después de armar `supplements`:
let supplementMicrosOut: Partial<Record<string, number>> | undefined;
if (activePlan) {
  const byName = new Map(catalog.map((s) => [s.name, s.components]));
  const forMicros: TakeForMicros[] = takes.map((t) => ({
    status: t.status as any, plannedDose: t.plannedDose, actualDose: t.actualDose ?? null,
    supplementName: t.supplementName, components: byName.get(t.supplementName) ?? [],
  }));
  supplementMicrosOut = supplementMicros(forMicros).totals;
}
```

Agregar `supplementMicros: supplementMicrosOut ?? null` al objeto `ReportData` retornado, y al tipo `ReportData` (`supplementMicros: Partial<Record<string, number>> | null`).

- [ ] **Step 4: Wire en el prompt (`ai/report.ts`)**

En `backend/src/ai/report.ts`, donde se arma el bloque de suplementos del prompt, si `data.supplementMicros` tiene claves, agregar una línea legible tipo: `"Aporte de micros de suplementos tomados (además de la comida): " + Object.entries(...)`. Mantener el bloque como DATOS (defensa de inyección ya presente). Test mínimo: que el prompt contenga "suplementos tomados" cuando hay aporte.

- [ ] **Step 5: Verify pass**

Run: `cd backend && npx vitest run src/reports/collect.test.ts src/ai/report.test.ts` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add backend/src/reports/collect.ts backend/src/ai/report.ts backend/src/reports/collect.test.ts
git commit -S -m "feat(backend): el informe cuenta el aporte de micros de los suplementos tomados"
```

- [ ] **Step 7: Suite completa Fase 1**

Run: `cd shared && npx vitest run` y `cd backend && npx vitest run && npx tsc --noEmit`
Expected: todo verde. Abrir PR de Fase 1 y disparar `@claude review`.

---

# FASE 2 — móvil (PR con OTA)

> Empezar Fase 2 recién con la Fase 1 mergeada y el backend deployado (las rutas nuevas tienen que existir en prod para el móvil). El backfill se corre una vez tras el deploy: `curl -X POST -H "Authorization: Bearer <token>" https://pulsia.lahuelladelcaminante.de/supplements/backfill-micros`.

## Task 10: Token de color

**Files:**
- Modify: `mobile/src/theme/tokens.ts`

- [ ] **Step 1: Agregar el token**

En `mobile/src/theme/tokens.ts`, dentro de `colors`:

```ts
  supplement: "#7F77DD", // violeta — aporte de suplementos en el diario (distinto de comida/excedente)
  supplementSoft: "#EEEDFE", // fondo del chip "suplemento"
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/theme/tokens.ts
git commit -S -m "feat(mobile): token de color para el aporte de suplementos"
```

---

## Task 11: `supplementNutrients` en el resumen del día

**Files:**
- Modify: `mobile/src/nutrition/daySummary.ts`
- Modify: `mobile/src/api/supplements.ts`
- Modify: `mobile/src/nutrition/useNutritionDay.ts`
- Test: `mobile/__tests__/daySummary.test.ts` (o el que exista)

- [ ] **Step 1: Tipo + cliente API**

En `mobile/src/nutrition/daySummary.ts`, agregar a `NutritionDaySummary`:

```ts
  // Aporte de los suplementos TOMADOS ese día, por nutriente (viene del backend, calculado con la
  // misma supplementMicros que el informe). Vacío si no hay plan/tomas. NO se mezcla en `nutrients`
  // (que es comida): el diario los muestra como segmento aparte.
  supplementNutrients: Partial<Record<NutrientKey, number>>;
```

Inicializarlo en `buildNutritionDaySummary` a `{}` (la firma NO cambia; se rellena en el hook):

```ts
  return { dayTotals, cholesterolMg, nutrients, liquid: {...}, supplementNutrients: {} };
```

En `mobile/src/api/supplements.ts`, agregar:

```ts
export interface SupplementNutrients {
  totals: Partial<Record<string, number>>;
  byNutrient: Partial<Record<string, { supplementName: string; amount: number }[]>>;
}
export async function getDayNutrients(baseUrl: string, date: string): Promise<SupplementNutrients> {
  const res = await authFetch(`${baseUrl}/supplements/day-nutrients?date=${date}`);
  if (!res.ok) return { totals: {}, byNutrient: {} };
  return res.json();
}
export async function getRangeNutrients(baseUrl: string, from: string, to: string): Promise<SupplementNutrients> {
  const res = await authFetch(`${baseUrl}/supplements/range-nutrients?from=${from}&to=${to}`);
  if (!res.ok) return { totals: {}, byNutrient: {} };
  return res.json();
}
```

(Usar el mismo helper de fetch autenticado que las otras funciones del archivo; verificar su nombre.)

- [ ] **Step 2: Fetch en el hook**

En `mobile/src/nutrition/useNutritionDay.ts`: agregar estado `supplementNutrients`, incluir `getDayNutrients(url, dateStr)` en el `Promise.all` (calcular el `dateStr` YYYY-MM-DD del offset con el mismo criterio que el resto — ver `dayBounds`/`epochToUtcDateStr`), guardarlo, y mergearlo en el summary:

```ts
const summary = { ...buildNutritionDaySummary(meals, water), supplementNutrients };
```

(Si el `date` para el endpoint no está disponible en `dayBounds`, derivarlo de `from` con el helper de fecha del proyecto.)

- [ ] **Step 3: Test**

Un test del hook o del summary que verifique que `supplementNutrients` llega al `summary`. Si testear el hook es caro, testear que `NutrientesTab`/`dayNutrientRows` consumen `supplementNutrients` (Task 13).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/nutrition/daySummary.ts mobile/src/api/supplements.ts mobile/src/nutrition/useNutritionDay.ts mobile/__tests__/
git commit -S -m "feat(mobile): el resumen del día trae el aporte de suplementos del backend"
```

---

## Task 12: `NutrientRow.supplement` + barra de 3 segmentos

**Files:**
- Modify: `mobile/src/nutrition/nutrientRows.ts`
- Modify: `mobile/src/nutrition/dayNutrientRows.ts`
- Modify: `mobile/src/nutrition/tabs/ui.tsx`
- Test: `mobile/__tests__/dayNutrientRows.test.ts`, `mobile/__tests__/ui-bar.test.tsx` (nuevo)

- [ ] **Step 1: Test de `barSegments3`**

`mobile/__tests__/ui-bar.test.tsx`:

```ts
import { barSegments3 } from "../src/nutrition/tabs/ui";

describe("barSegments3", () => {
  it("comida + suplemento por debajo de la meta (food=100, supp=150, target=350)", () => {
    const s = barSegments3(100, 150, 350, "limit"); // food, supplement, target
    expect(s.foodPct).toBe(29);        // round(100/350*100)
    expect(s.supplementPct).toBe(43);  // round(150/350*100)
    expect(s.overPct).toBe(0);
    expect(s.foodPct + s.supplementPct + s.overPct).toBeLessThanOrEqual(100);
  });
  it("ningún segmento con valor > 0 desaparece por redondeo", () => {
    const s = barSegments3(1000, 1, 350, "limit"); // supplement mínimo frente a un total enorme
    expect(s.supplementPct).toBeGreaterThanOrEqual(1);
    expect(s.foodPct).toBeGreaterThanOrEqual(1);
    expect(s.overPct).toBeGreaterThanOrEqual(1);
  });
  it("floor nunca marca excedente aunque se pase", () => {
    const s = barSegments3(20, 25, 30, "floor"); // total 45 > 30 pero es piso
    expect(s.overPct).toBe(0);
  });
  it("excedente cuando comida+suplemento > meta (limit)", () => {
    const s = barSegments3(300, 100, 350, "limit"); // total 400 > 350
    expect(s.overPct).toBeGreaterThan(0);
    expect(s.foodPct + s.supplementPct + s.overPct).toBeLessThanOrEqual(100);
  });
});
```

> Nota para el implementador: los tres invariantes que NO pueden fallar son (a) `foodPct+supplementPct+overPct ≤ 100`, (b) clamps simétricos como en `barSegments` (ningún segmento con valor > 0 redondea a 0%), (c) `floor` sin `overPct`. Verificá por mutación: cambiá un `Math.max(1,…)` a `Math.max(0,…)` y el test de "no desaparece" debe ponerse rojo. Si la rama "te pasaste" te queda enredada, simplificala manteniendo esos invariantes.

- [ ] **Step 2: Run it, verify it fails** — `barSegments3` no existe.

- [ ] **Step 3: Implement `barSegments3` + `Bar` en `ui.tsx`**

En `mobile/src/nutrition/tabs/ui.tsx`, agregar:

```ts
export interface BarSegments3 { foodPct: number; supplementPct: number; overPct: number; }

// Generaliza barSegments a 3 vías: comida (teal) + suplemento (violeta) + excedente (ámbar). El
// total consumido es food+supplement; se parte en la línea de la meta como el diseño de 2 colores.
// Clamps simétricos: ningún segmento con valor > 0 puede redondear a 0% y desaparecer.
export function barSegments3(food: number, supplement: number, target: number, kind: BarKind = "limit"): BarSegments3 {
  const f = Math.max(0, Number.isFinite(food) ? food : 0);
  const s = Math.max(0, Number.isFinite(supplement) ? supplement : 0);
  const total = f + s;
  if (!Number.isFinite(target) || target <= 0 || total <= 0) return { foodPct: 0, supplementPct: 0, overPct: 0 };
  if (total <= target || kind === "floor") {
    const foodPct = f > 0 ? Math.max(1, Math.round((f / target) * 100)) : 0;
    const suppPct = s > 0 ? Math.max(1, Math.round((s / target) * 100)) : 0;
    // No dejar que la suma pase 100 por los clamps.
    const capped = Math.min(100, foodPct + suppPct);
    return { foodPct, supplementPct: Math.max(0, capped - foodPct), overPct: 0 };
  }
  // Te pasaste: la barra se llena (100%); food/supp/over proporcionales al total, con clamps.
  const overPct = Math.max(1, Math.min(99, Math.round(((total - target) / total) * 100)));
  const inTarget = 100 - overPct; // porción dentro de la meta
  const foodPct = f > 0 ? Math.max(1, Math.min(inTarget - (s > 0 ? 1 : 0), Math.round((f / total) * (100)))) : 0;
  const supplementPct = Math.max(0, inTarget - foodPct);
  return { foodPct, supplementPct, overPct };
}
```

> El implementador debe verificar que `foodPct+supplementPct+overPct` nunca supere 100 y que los tres se vean cuando sus valores son > 0 (test de Step 1). Simplificar la rama "te pasaste" si hace falta; el invariante es lo que importa.

Reemplazar `Bar` para aceptar `supplement` opcional y renderizar el tercer segmento:

```ts
export function Bar({
  value, supplement = 0, target, kind = "limit", height = 8, testID,
}: { value: number; supplement?: number; target: number; kind?: BarKind; height?: number; testID?: string }) {
  const { foodPct, supplementPct, overPct } = barSegments3(value, supplement, target, kind);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceMuted, overflow: "hidden", flexDirection: "row" }}>
      <View testID={testID} style={{ width: `${foodPct}%`, height, backgroundColor: colors.accent }} />
      {supplementPct > 0 && (
        <View testID={testID ? `${testID}-supp` : undefined} style={{ width: `${supplementPct}%`, height, backgroundColor: colors.supplement }} />
      )}
      {overPct > 0 && (
        <View testID={testID ? `${testID}-over` : undefined} style={{ width: `${overPct}%`, height, backgroundColor: colors.warning }} />
      )}
    </View>
  );
}
```

(`value` sigue siendo la comida; `supplement` es el aporte del suplemento. Los call-sites que no pasan `supplement` se comportan igual que antes — retrocompatible.)

- [ ] **Step 4: `NutrientRow.supplement` + threading**

En `mobile/src/nutrition/nutrientRows.ts`:
- Agregar `supplement: number | null` a `NutrientRow`.
- Agregar `supplement?: Partial<Record<NutrientKey, number>>` a `NutrientRowsOptions`.
- En `buildNutrientRows`, poblar `supplement: opciones?.supplement?.[key] ?? null` en cada fila.
- En `filaDeSal`, aceptar un parámetro `supplementSaltG: number | null = null` y setearlo en la fila (para que la barra de sal también muestre el aporte del suplemento; convertir el sodio de suplemento a sal con `saltGFromSodiumMg` en el llamador).

En `mobile/src/nutrition/dayNutrientRows.ts`:
- `buildDayNutrientRows` recibe `summary.supplementNutrients`, lo pasa como `opciones.supplement` a `buildNutrientRows`, y para la sal convierte `supplementNutrients.sodium_mg` con `saltGFromSodiumMg` y lo pasa a `filaDeSal`.

- [ ] **Step 5: Test de `dayNutrientRows`**

En `mobile/__tests__/dayNutrientRows.test.ts`, agregar que una fila (ej. `magnesium_mg`) refleje `supplement` cuando `summary.supplementNutrients.magnesium_mg` está seteado, y que la sal tome el sodio de suplemento convertido.

- [ ] **Step 6: Verify pass**

Run: `cd mobile && npx jest ui-bar dayNutrientRows`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/nutrition/nutrientRows.ts mobile/src/nutrition/dayNutrientRows.ts mobile/src/nutrition/tabs/ui.tsx mobile/__tests__/
git commit -S -m "feat(mobile): barra de 3 segmentos (comida/suplemento/excedente) + threading de supplement"
```

---

## Task 13: Render de la fila + leyenda en `NutrientList`

**Files:**
- Modify: `mobile/src/nutrition/NutrientList.tsx`
- Modify: `mobile/src/nutrition/tabs/NutrientesTab.tsx`
- Test: `mobile/__tests__/` (NutrientList / NutrientesTab)

- [ ] **Step 1: Pasar `supplement` a la barra + texto `+N`**

En `mobile/src/nutrition/NutrientList.tsx`:
- En `<Bar …>` pasar `supplement={row.supplement ?? 0}`.
- En `textoCantidad`, cuando `row.supplement != null && row.supplement > 0`, mostrar el aporte del suplemento en violeta: el total = `value + supplement`, y el texto `180 +300 / 350 mg` con el `+300` en `colors.supplement`. Como `textoCantidad` devuelve string, partir el render en `<Text>` con un `<Text>` hijo coloreado:

```tsx
<Text testID={`nutr-${row.key}-amount`} style={{ fontSize: 13, color: over ? colors.warning : colors.textMuted }}>
  {marca}{fmt(row.value!)}
  {row.supplement != null && row.supplement > 0 && (
    <Text style={{ color: colors.supplement }}> +{fmt(row.supplement)}</Text>
  )}
  {row.ref != null ? ` / ${fmt(row.ref)} ${row.unit}` : ` ${row.unit}`}
</Text>
```

Ajustar `seExcedio`/`pct` para que el excedente y el % consideren `value + supplement` (el total consumido), no solo la comida — porque "cuenta en todo". Verificar los call-sites de `seExcedio`.

- [ ] **Step 2: Leyenda**

En `mobile/src/nutrition/tabs/NutrientesTab.tsx`, si `summary.supplementNutrients` tiene alguna clave, renderizar una leyenda arriba de `NutrientList`: tres puntitos (comida `colors.accent` / suplemento `colors.supplement` / excedente `colors.warning`) con sus labels. Reusar el patrón visual de `LegendRow`.

- [ ] **Step 3: Test**

Un test de `NutrientList` que, dada una fila con `supplement > 0`, muestre el texto `+N` y el segmento violeta (`testID` `nutr-<key>-bar-supp`), y que el `%`/excedente use el total.

- [ ] **Step 4: Verify pass**

Run: `cd mobile && npx jest NutrientList NutrientesTab`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/NutrientList.tsx mobile/src/nutrition/tabs/NutrientesTab.tsx mobile/__tests__/
git commit -S -m "feat(mobile): fila del diario muestra el aporte del suplemento (+N violeta) + leyenda"
```

---

## Task 14: Ranking "alimentos con más X" con origen

**Files:**
- Modify: `shared/src/nutrition/breakdown.ts` (`FoodRank.source`)
- Modify: `mobile/app/nutricion/nutriente.tsx`
- Test: `shared/src/nutrition/breakdown.test.ts`, test de pantalla de `nutriente`

- [ ] **Step 1: `source` en `FoodRank`**

En `shared/src/nutrition/breakdown.ts`, agregar `source: "food"` a lo que devuelve `foodsHighestIn` (todas las filas de comida). Test: cada fila tiene `source: "food"`.

- [ ] **Step 2: Combinar en la pantalla**

En `mobile/app/nutricion/nutriente.tsx`:
- Además de `foodsHighestIn(meals, nutrient)`, traer el aporte de suplementos del rango con `getRangeNutrients(baseUrl, from, to)` (calcular `from`/`to` YYYY-MM-DD del rango `days`+`offset`). De su `byNutrient[nutrient]` armar filas `{ name: supplementName, amount, source: "supplement" as const, grams: 0, pctOfTotal: 0 }`.
- Concatenar con las de comida, recalcular `pctOfTotal` sobre el total combinado, reordenar por `amount`.
- En el render, las filas `source === "supplement"` llevan puntito `colors.supplement` + chip "suplemento" (`colors.supplementSoft`), y no muestran gramos.
- `salt_g`: el ranking de sal usa `nutrient === "salt_g"`; el `byNutrient` del backend habla en `sodium_mg`. Para la sal, convertir el aporte de `sodium_mg` a sal con `saltGFromSodiumMg` antes de armar las filas de suplemento.

- [ ] **Step 3: Test**

Test de pantalla: con un suplemento que aporta magnesio y comida con magnesio, el ranking muestra ambos, la fila de suplemento con el chip, ordenados por aporte.

- [ ] **Step 4: Verify pass**

Run: `cd shared && npx vitest run src/nutrition/breakdown.test.ts` y `cd mobile && npx jest nutriente`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/breakdown.ts shared/src/nutrition/breakdown.test.ts mobile/app/nutricion/nutriente.tsx mobile/__tests__/
git commit -S -m "feat(mobile): 'alimentos con más X' distingue comida y suplemento"
```

---

## Task 15: Placeholder del Desvío con `unitLabel` (opcional, no bloqueante)

**Files:**
- Modify: `mobile/src/components/SupplementChecklist.tsx`

- [ ] **Step 1:** Si `entry` expone el `unitLabel` del suplemento (agregarlo a `DayChecklistEntry` en shared si vale la pena; si no, omitir esta task), usar el placeholder `` `Dosis real (p.ej. 2 ${unitLabel})` ``. El flujo taken/deviated/skipped **no cambia**.

- [ ] **Step 2: Commit** (si se hizo)

```bash
git add mobile/src/components/SupplementChecklist.tsx shared/src/schemas/supplements.ts
git commit -S -m "feat(mobile): placeholder del Desvío usa la unidad del suplemento"
```

---

## Task 16: Verificación final Fase 2 + costura

- [ ] **Step 1: Test de la costura (end-to-end de datos)**

Un test que corra el flujo real: `supplementMicros` sobre tomas armadas como las arma `takesWithComponents` → alimentando `buildDayNutrientRows` → verificando que la fila del nutriente muestra comida + suplemento y el excedente/% usan el total. NO objetos armados a mano ([[testear-la-costura]]).

- [ ] **Step 2: Suites completas**

Run: `cd shared && npx vitest run` · `cd backend && npx vitest run && npx tsc --noEmit` · `cd mobile && npx jest && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 3: OTA**

Tras mergear y verificar el runtime android (`784872cb`), publicar el OTA a vc10 ([[ota-always-publish]], [[ota-fingerprint-gotcha]]). Verificar en device: barra de 3 segmentos, texto `+N`, ranking con chip, y el caso del owner (Desvío "1" del magnesio → el diario suma 1 unidad).

---

## Notas de verificación por mutación (patrón crónico del repo)

Cada test que afirme un comportamiento nuevo debe demostrarse con una mutación: `parseLeadingNumber` sin el clamp negativo, `supplementMicros` sin el `continue` de `nutrientKey == null`, `barSegments3` sin los `Math.max(1,…)`. Si el test sigue verde con la feature rota, el test no muerde ([[claude-review-es-estatico]], §0-CARDIO-PROGRESO).
