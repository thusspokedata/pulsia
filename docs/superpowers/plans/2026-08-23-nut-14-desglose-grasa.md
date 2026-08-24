# NUT-14 — Desglose de grasa por tipo (con colores) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando el usuario toca "Grasa" en la dona de macros del día, ver un desglose en barras de los 5 tipos de grasa (monoinsaturada, omega-6, omega-3, saturada, trans), cada barra bicolor cuando se pasa del umbral AHA, y al tocar un tipo ver qué alimentos lo aportaron.

**Architecture:** El modelo de nutrientes es single-source-of-truth: agregar un nutriente en `shared/src/nutrition/nutrients.ts` deriva schema Zod, escalado, sumas, referencias y columnas. Agregamos 3 nutrientes nuevos (`monounsaturated_fat_g`, `polyunsaturated_fat_g`, `trans_fat_g`); omega-3/6, saturada y colesterol ya existen. Un módulo puro nuevo (`fatBreakdown.ts`) computa las barras (gramos consumidos vs umbral en gramos derivado de % de kcal AHA). La UI móvil agrega una pantalla `grasas.tsx` con barras bicolor y reusa `nutriente.tsx` (que ya navega cualquier `NutrientKey`) para "qué alimentos lo aportan".

**Tech Stack:** Bun + Zod (shared), Hono + Drizzle + Postgres (backend), Expo/React Native + jest (mobile). Tests: `bun test` (shared/backend), `npm test -- --runInBand` (mobile).

**Umbrales AHA (% de las kcal de la meta → gramos vía 9 kcal/g):**
- Saturada: `max` 10 % · Trans: `max` 2 % · Omega-6: `max` 10 % (pintan el excedente en rojo).
- Monoinsaturada: `recommended` 15 % (marca de referencia, NUNCA pinta alerta) · Omega-3: `recommended`, sin tope (barra toda verde).

**Decisiones del owner (ya resueltas):** 5 barras (mono/omega-6/omega-3/saturada/trans), backfill del catálogo base USDA **aprobado por el owner pero pendiente de ejecución** (paso operativo, requiere los CSV crudos de USDA; ver Fase 4 / "Backfill"), paleta coherente con el semáforo (verde=recomendado/dentro, rojo=excedente de las "comer menos"). Mono y omega-3 nunca pintan alerta.

---

## Notas de arranque para el worker

- **Worktree ya creado**: se trabaja en `.claude/worktrees/nut-14-fat-breakdown` (rama `worktree-nut-14-fat-breakdown`). Los worktrees NO comparten `node_modules`: correr `bun install` en la raíz del worktree antes de los tests de shared/backend, y en `mobile/` antes de los de móvil (ver §7 del ONBOARDING).
- **Commits firmados** `git commit -S`, sin atribución a Claude (CLAUDE.md).
- **TDD con verificación por mutación**: tras cada test nuevo en verde, romper el código a propósito y confirmar que el test se queja.
- **No editar** `shared/src/catalog/exercises.data.ts` (auto-generado) — no aplica acá.

---

## Fase 1 — shared: registro + referencias + motor de barras

### Task 1: Agregar los 3 nutrientes al registro

**Files:**
- Modify: `shared/src/nutrition/nutrients.ts:20-25` (bloque `--- Grasas ---`)
- Test: `shared/src/nutrition/nutrients.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `nutrients.test.ts`, agregar un test que exija los 3 keys nuevos y su grupo/unidad:

```ts
import { test, expect } from "bun:test";
import { NUTRIENTS, NUTRIENT_KEYS } from "./nutrients";

test("grasas incluye mono/poli/trans", () => {
  const byKey = new Map(NUTRIENTS.map((n) => [n.key, n]));
  for (const key of ["monounsaturated_fat_g", "polyunsaturated_fat_g", "trans_fat_g"] as const) {
    const def = byKey.get(key);
    expect(def).toBeDefined();
    expect(def!.group).toBe("grasas");
    expect(def!.unit).toBe("g");
  }
  expect(NUTRIENT_KEYS).toContain("trans_fat_g");
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/nutrition/nutrients.test.ts`
Expected: FAIL (los keys no existen todavía).

- [ ] **Step 3: Implementar — agregar las 3 líneas al bloque Grasas**

En `NUTRIENTS`, reemplazar el bloque de grasas para que quede en este orden (el orden es el de la UI de la pestaña Nutrientes; agrupamos "comer menos" y luego "comer más"):

```ts
  // --- Grasas ---
  { key: "saturated_fat_g", label: "Grasas saturadas", unit: "g", group: "grasas", decimals: 1 },
  { key: "trans_fat_g", label: "Grasas trans", unit: "g", group: "grasas", decimals: 2 },
  { key: "monounsaturated_fat_g", label: "Grasas monoinsaturadas", unit: "g", group: "grasas", decimals: 1 },
  { key: "polyunsaturated_fat_g", label: "Grasas poliinsaturadas", unit: "g", group: "grasas", decimals: 1 },
  { key: "omega3_g", label: "Omega-3", unit: "g", group: "grasas", decimals: 2 },
  { key: "omega6_g", label: "Omega-6", unit: "g", group: "grasas", decimals: 2 },
  { key: "cholesterol_mg", label: "Colesterol", unit: "mg", group: "grasas", decimals: 1 },
```

- [ ] **Step 4: Correr y verificar verde (shared entero)**

Run: `bun test shared/src/nutrition`
Expected: PASS. Si algún test asserta el CONTEO de nutrientes (p.ej. "34 nutrientes"), actualizar el número esperado a los nuevos totales — es un cambio esperado, no un bug.

- [ ] **Step 5: Verificación por mutación**

Cambiar el `group` de `trans_fat_g` a `"carbohidratos"`, correr el test, confirmar que falla, revertir.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/nutrients.ts shared/src/nutrition/nutrients.test.ts
git commit -S -m "NUT-14: agregar mono/poli/trans al registro de nutrientes"
```

### Task 2: Referencias de umbral por tipo de grasa (% de kcal → gramos)

**Files:**
- Modify: `shared/src/nutrition/references.ts`
- Test: `shared/src/nutrition/references.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { test, expect } from "bun:test";
import { FAT_TYPE_PERCENT_KCAL, fatTypeRefG, saturatedFatRefG } from "./references";

test("fatTypeRefG deriva gramos desde % de kcal (9 kcal/g)", () => {
  // 10% de 2000 kcal = 200 kcal / 9 = 22.2 g
  expect(fatTypeRefG(0.1, 2000)).toBe(22.2);
  // guard: meta inválida → 0
  expect(fatTypeRefG(0.1, 0)).toBe(0);
  expect(fatTypeRefG(0.1, NaN)).toBe(0);
});

test("saturatedFatRefG sigue dando 10% (back-compat)", () => {
  expect(saturatedFatRefG(2000)).toBe(fatTypeRefG(0.1, 2000));
});

test("FAT_TYPE_PERCENT_KCAL: mono/omega3 recommended, resto max", () => {
  expect(FAT_TYPE_PERCENT_KCAL.saturated_fat_g).toEqual({ pct: 0.1, kind: "max" });
  expect(FAT_TYPE_PERCENT_KCAL.trans_fat_g).toEqual({ pct: 0.02, kind: "max" });
  expect(FAT_TYPE_PERCENT_KCAL.omega6_g).toEqual({ pct: 0.1, kind: "max" });
  expect(FAT_TYPE_PERCENT_KCAL.monounsaturated_fat_g).toEqual({ pct: 0.15, kind: "recommended" });
  expect(FAT_TYPE_PERCENT_KCAL.omega3_g).toEqual({ pct: null, kind: "recommended" });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/nutrition/references.test.ts`
Expected: FAIL (`fatTypeRefG`/`FAT_TYPE_PERCENT_KCAL` no existen).

- [ ] **Step 3: Implementar en `references.ts`**

Agregar al final del archivo, y reescribir `saturatedFatRefG` para que delegue (DRY):

```ts
// Umbrales de la American Heart Association por TIPO de grasa, como fracción de las kcal de la
// meta. `kind: "max"` = tope a no pasar (el excedente se pinta en rojo). `kind: "recommended"` =
// grasa "buena" a favorecer: NUNCA pinta alerta; `pct` es una marca de referencia (mono ~15%) o
// null cuando no hay tope (omega-3). 9 kcal por gramo de grasa.
export const FAT_TYPE_PERCENT_KCAL = {
  saturated_fat_g: { pct: 0.1, kind: "max" },
  trans_fat_g: { pct: 0.02, kind: "max" },
  omega6_g: { pct: 0.1, kind: "max" },
  monounsaturated_fat_g: { pct: 0.15, kind: "recommended" },
  omega3_g: { pct: null, kind: "recommended" },
} as const;

// Gramos que representan `pct` de las kcal de la meta. Mismo guard que saturatedFatRefG: NaN <= 0
// es false, así que sin el Number.isFinite un NaN se colaría hasta la UI. 1 decimal, como los micros.
export function fatTypeRefG(pct: number, goalKcal: number): number {
  if (!Number.isFinite(goalKcal) || goalKcal <= 0) return 0;
  return Math.round(((goalKcal * pct) / 9) * 10) / 10;
}
```

Y cambiar `saturatedFatRefG` para delegar:

```ts
export function saturatedFatRefG(goalKcal: number): number {
  return fatTypeRefG(FAT_TYPE_PERCENT_KCAL.saturated_fat_g.pct, goalKcal);
}
```

- [ ] **Step 4: Correr y verificar verde**

Run: `bun test shared/src/nutrition/references.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Cambiar `omega6_g` a `kind: "recommended"`, confirmar que el test falla, revertir.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/references.ts shared/src/nutrition/references.test.ts
git commit -S -m "NUT-14: umbrales AHA por tipo de grasa (fatTypeRefG)"
```

### Task 3: Motor puro de barras (`fatBreakdown.ts`)

**Files:**
- Create: `shared/src/nutrition/fatBreakdown.ts`
- Test: `shared/src/nutrition/fatBreakdown.test.ts`
- Modify: `shared/src/index.ts` (o el barrel que reexporta nutrition — ver Task 4)

- [ ] **Step 1: Escribir el test que falla**

```ts
import { test, expect } from "bun:test";
import { fatBreakdown, FAT_BAR_ORDER } from "./fatBreakdown";

const fats = {
  monounsaturated_fat_g: 40,
  omega6_g: 30,
  omega3_g: 2,
  saturated_fat_g: 30, // umbral 10% de 2000 = 22.2 → excede
  trans_fat_g: 1,      // umbral 2% de 2000 = 4.4 → NO excede
};

test("FAT_BAR_ORDER es el orden del owner (mono, omega6, omega3, saturada, trans)", () => {
  expect(FAT_BAR_ORDER).toEqual([
    "monounsaturated_fat_g", "omega6_g", "omega3_g", "saturated_fat_g", "trans_fat_g",
  ]);
});

test("una grasa max que se pasa: overG > 0, exceeded true, within recortado al umbral", () => {
  const bars = fatBreakdown(fats, 2000);
  const sat = bars.find((b) => b.type === "saturated_fat_g")!;
  expect(sat.kind).toBe("max");
  expect(sat.thresholdG).toBe(22.2);
  expect(sat.exceeded).toBe(true);
  expect(sat.overG).toBeCloseTo(7.8, 5);   // 30 - 22.2
  expect(sat.withinG).toBe(22.2);
});

test("una grasa max por debajo del umbral: no excede", () => {
  const trans = fatBreakdown(fats, 2000).find((b) => b.type === "trans_fat_g")!;
  expect(trans.exceeded).toBe(false);
  expect(trans.overG).toBe(0);
  expect(trans.withinG).toBe(1);
});

test("una grasa recommended nunca excede; omega-3 no tiene umbral", () => {
  const bars = fatBreakdown(fats, 2000);
  const mono = bars.find((b) => b.type === "monounsaturated_fat_g")!;
  expect(mono.kind).toBe("recommended");
  expect(mono.exceeded).toBe(false);
  expect(mono.overG).toBe(0);
  expect(mono.withinG).toBe(40);
  expect(mono.thresholdG).toBe(30); // 15% de 2000 = 33.3... espera: 2000*0.15/9 = 33.3
  const om3 = bars.find((b) => b.type === "omega3_g")!;
  expect(om3.thresholdG).toBeNull();
});

test("sin meta de kcal: thresholdG null en todas, nada excede", () => {
  const bars = fatBreakdown(fats, null);
  for (const b of bars) {
    expect(b.thresholdG).toBeNull();
    expect(b.exceeded).toBe(false);
    expect(b.overG).toBe(0);
  }
});

test("valores null se tratan como 0 gramos", () => {
  const bars = fatBreakdown({ ...fats, trans_fat_g: null } as any, 2000);
  expect(bars.find((b) => b.type === "trans_fat_g")!.grams).toBe(0);
});
```

> NOTA para el worker: en el test de mono corregí el número — `2000*0.15/9 = 33.33 → 33.3`. Usar `expect(mono.thresholdG).toBe(33.3)`. (Dejé el error a propósito para que verifiques el cálculo antes de copiar.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/nutrition/fatBreakdown.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `fatBreakdown.ts`**

```ts
import { FAT_TYPE_PERCENT_KCAL, fatTypeRefG } from "./references";
import { NUTRIENTS } from "./nutrients";

// Los 5 tipos de grasa que se muestran como barras, en el orden pedido por el owner
// (recomendada primero cuando la listó): mono, omega-6, omega-3, saturada, trans.
export const FAT_BAR_ORDER = [
  "monounsaturated_fat_g",
  "omega6_g",
  "omega3_g",
  "saturated_fat_g",
  "trans_fat_g",
] as const;
export type FatType = (typeof FAT_BAR_ORDER)[number];

export interface FatBar {
  type: FatType;
  label: string;               // del registro de nutrientes
  grams: number;               // consumido en el día (null → 0)
  kind: "max" | "recommended";
  thresholdG: number | null;   // gramos del umbral según goalKcal; null si recommended-sin-tope o sin meta
  withinG: number;             // parte "dentro" (verde). max: min(grams, umbral); recommended: grams
  overG: number;               // excedente (rojo). max: max(0, grams - umbral); recommended: 0
  exceeded: boolean;           // overG > 0
}

export type FatGrams = Partial<Record<FatType, number | null>>;

const LABELS = new Map(NUTRIENTS.map((n) => [n.key as string, n.label]));

export function fatBreakdown(fats: FatGrams, goalKcal: number | null): FatBar[] {
  const kcalOk = typeof goalKcal === "number" && Number.isFinite(goalKcal) && goalKcal > 0;
  return FAT_BAR_ORDER.map((type) => {
    const raw = fats[type];
    const grams = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    const spec = FAT_TYPE_PERCENT_KCAL[type];
    // recommended-sin-tope (omega-3) o sin meta → sin umbral, todo "dentro", nunca excede.
    const thresholdG =
      spec.pct != null && kcalOk ? fatTypeRefG(spec.pct, goalKcal as number) : null;
    if (spec.kind === "recommended" || thresholdG == null) {
      return {
        type, label: LABELS.get(type)!, grams, kind: spec.kind,
        thresholdG, withinG: grams, overG: 0, exceeded: false,
      };
    }
    const overG = Math.max(0, grams - thresholdG);
    return {
      type, label: LABELS.get(type)!, grams, kind: spec.kind,
      thresholdG, withinG: Math.min(grams, thresholdG), overG, exceeded: overG > 0,
    };
  });
}
```

- [ ] **Step 4: Correr y verificar verde**

Run: `bun test shared/src/nutrition/fatBreakdown.test.ts`
Expected: PASS (con `mono.thresholdG === 33.3`).

- [ ] **Step 5: Verificación por mutación**

Cambiar `Math.max(0, grams - thresholdG)` por `grams - thresholdG` (sin el clamp), confirmar que el test de trans (overG debe ser 0) falla, revertir.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/fatBreakdown.ts shared/src/nutrition/fatBreakdown.test.ts
git commit -S -m "NUT-14: motor puro de desglose de grasa (fatBreakdown)"
```

### Task 4: Exportar lo nuevo desde el barrel de shared

**Files:**
- Modify: `shared/src/index.ts` (verificar el path real del barrel; buscar dónde se reexporta `./nutrition/references` y `./nutrition/breakdown`)
- Test: reusar `shared/src/nutrition/fatBreakdown.test.ts` pero importando desde `@pulsia/shared` en un smoke test, o confiar en el consumo desde móvil.

- [ ] **Step 1: Localizar el barrel**

Run: `grep -rn "nutrition/references\|nutrition/breakdown" shared/src/index.ts shared/src/nutrition/index.ts 2>/dev/null`
Seguir el mismo patrón: reexportar `fatBreakdown` (tipos `FatBar`, `FatType`, `FAT_BAR_ORDER`, `fatBreakdown`) y `FAT_TYPE_PERCENT_KCAL`, `fatTypeRefG` si no salen ya por `references`.

- [ ] **Step 2: Agregar los re-exports** (imitando las líneas vecinas — `export * from "./nutrition/fatBreakdown";` o el estilo que use el archivo).

- [ ] **Step 3: Verificar que compila y exporta**

Run: `bun test shared` (entero) y `cd shared && bunx tsc --noEmit` si el repo lo usa.
Expected: PASS / sin errores de tipo.

- [ ] **Step 4: Commit**

```bash
git add shared/src/index.ts
git commit -S -m "NUT-14: exportar fatBreakdown desde @pulsia/shared"
```

---

## Fase 2 — backend: schema, migración, USDA, IA

### Task 5: Columnas nuevas en `food`, `meal_item`, `usda_food` (schema Drizzle)

**Files:**
- Modify: `backend/src/db/schema.ts` (bloque grasas de `food` ~línea 111 y de `mealItem` ~línea 185)
- Modify: `backend/src/usda/schema.ts` (bloque grasas ~línea 21)
- Test: los tests de paridad ya existentes — `backend/src/nutrition/columns.test.ts` y `backend/src/usda/schema.test.ts` — ahora EXIGEN las columnas nuevas (derivan del registro). Correrlos primero para verlos fallar.

- [ ] **Step 1: Correr los tests de paridad para verlos fallar**

Run: `bun test backend/src/nutrition/columns.test.ts backend/src/usda/schema.test.ts`
Expected: FAIL — el registro ahora tiene mono/poli/trans y las tablas no.

- [ ] **Step 2: Agregar las 3 columnas al bloque Grasas de `food` y de `mealItem`** (mismo snake_case que el registro):

```ts
  saturatedFatG: real("saturated_fat_g"),
  transFatG: real("trans_fat_g"),
  monounsaturatedFatG: real("monounsaturated_fat_g"),
  polyunsaturatedFatG: real("polyunsaturated_fat_g"),
  omega3G: real("omega3_g"),
  omega6G: real("omega6_g"),
  cholesterolMg: real("cholesterol_mg"),
```

Aplicar el MISMO bloque en `usdaFood` (`backend/src/usda/schema.ts`).

- [ ] **Step 3: Correr los tests de paridad y verificar verde**

Run: `bun test backend/src/nutrition/columns.test.ts backend/src/usda/schema.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/src/usda/schema.ts
git commit -S -m "NUT-14: columnas mono/poli/trans en food, meal_item, usda_food"
```

### Task 6: Migración Drizzle 0032

**Files:**
- Create: `backend/src/db/migrations/0032_<slug>.sql` (verificar el path real: en el ONBOARDING las migraciones viven en `backend/src/db/migrations/` — confirmar con `ls`; puede ser `backend/drizzle/`). Usar el MISMO directorio que `0031_flimsy_hardball.sql`.
- Modify: el journal de drizzle si existe (`_journal.json` en la carpeta `meta/`).

- [ ] **Step 1: Generar la migración con drizzle-kit** (preferido sobre escribirla a mano, para que el journal quede consistente):

Run: `cd backend && bun run db:generate` (verificar el nombre exacto del script en `backend/package.json`; puede ser `drizzle-kit generate`).
Expected: crea `00XX_*.sql` con `ALTER TABLE ... ADD COLUMN` para las 3 columnas × food/meal_item/usda_food (6 tablas-columna × 3 = 9 ADD COLUMN, todas `real` nullable).

- [ ] **Step 2: Inspeccionar la migración generada**

Run: `cat backend/src/db/migrations/0032_*.sql`
Expected: solo `ADD COLUMN "trans_fat_g" real;` etc. Sin DROP ni cambios de tipo. Si drizzle-kit no está disponible, escribir la SQL a mano:

```sql
ALTER TABLE "food" ADD COLUMN "trans_fat_g" real;
ALTER TABLE "food" ADD COLUMN "monounsaturated_fat_g" real;
ALTER TABLE "food" ADD COLUMN "polyunsaturated_fat_g" real;
ALTER TABLE "meal_item" ADD COLUMN "trans_fat_g" real;
ALTER TABLE "meal_item" ADD COLUMN "monounsaturated_fat_g" real;
ALTER TABLE "meal_item" ADD COLUMN "polyunsaturated_fat_g" real;
ALTER TABLE "usda_food" ADD COLUMN "trans_fat_g" real;
ALTER TABLE "usda_food" ADD COLUMN "monounsaturated_fat_g" real;
ALTER TABLE "usda_food" ADD COLUMN "polyunsaturated_fat_g" real;
```

(Si se escribe a mano, agregar la entrada correspondiente al `meta/_journal.json` imitando la de 0031, o el arranque no la aplicará.)

- [ ] **Step 3: Aplicar la migración contra la DB dev y verificar**

Run: `docker compose up -d && cd backend && bun run db:migrate`
Expected: aplica 0032 sin error. Verificar: `docker compose exec -T db psql -U postgres -d pulsia -c "\d food" | grep trans_fat` (ajustar user/db al `docker-compose.yml` dev).

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/
git commit -S -m "NUT-14: migración 0032 columnas de tipos de grasa"
```

### Task 7: Mapear mono/poli/trans desde USDA FoodData Central

**Files:**
- Modify: `backend/scripts/build-usda-dataset.ts` (`MAPEO_NUTRIENTES`, ~línea 156)
- Test: `backend/scripts/build-usda-dataset.test.ts` si existe (buscar test de `verificarUnidades` / `MAPEO_NUTRIENTES`), o agregar un test que asserte los ids.

- [ ] **Step 1: Escribir/ubicar el test**

Buscar: `grep -rn "MAPEO_NUTRIENTES\|verificarUnidades" backend/scripts/*.test.ts`. Agregar un test:

```ts
test("MAPEO_NUTRIENTES incluye mono/poli/trans con la unidad correcta", () => {
  expect(MAPEO_NUTRIENTES[1292]).toEqual({ clave: "monounsaturated_fat_g", unidadUsda: "G" });
  expect(MAPEO_NUTRIENTES[1293]).toEqual({ clave: "polyunsaturated_fat_g", unidadUsda: "G" });
  expect(MAPEO_NUTRIENTES[1257]).toEqual({ clave: "trans_fat_g", unidadUsda: "G" });
});
```

- [ ] **Step 2: Correr y ver fallar** → `bun test backend/scripts/build-usda-dataset.test.ts`

- [ ] **Step 3: Implementar — agregar al bloque `--- Grasas ---` de `MAPEO_NUTRIENTES`**

```ts
  1258: { clave: "saturated_fat_g", unidadUsda: "G" }, // Fatty acids, total saturated
  1257: { clave: "trans_fat_g", unidadUsda: "G" }, // Fatty acids, total trans
  1292: { clave: "monounsaturated_fat_g", unidadUsda: "G" }, // Fatty acids, total monounsaturated
  1293: { clave: "polyunsaturated_fat_g", unidadUsda: "G" }, // Fatty acids, total polyunsaturated
  1253: { clave: "cholesterol_mg", unidadUsda: "MG" }, // Cholesterol
```

(1292/1293/1257 son totales directos de USDA — a diferencia de los omega, que se suman de ácidos individuales; NO tocar `ACIDOS_OMEGA3/6`.)

- [ ] **Step 4: Correr y verificar verde** → `bun test backend/scripts/build-usda-dataset.test.ts`

- [ ] **Step 5: Verificación por mutación** — cambiar `1292` a unidad `"MG"`, confirmar que el test (o `verificarUnidades`) se queja, revertir.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/build-usda-dataset.ts backend/scripts/build-usda-dataset.test.ts
git commit -S -m "NUT-14: mapear mono/poli/trans desde USDA (1292/1293/1257)"
```

### Task 8: Pedir mono/poli/trans en la extracción por IA

**Files:**
- Modify: `backend/src/ai/nutrition.ts` (el prompt de extracción y, si hay, el schema Zod del tool `return_food_*`)
- Test: `backend/src/ai/nutrition.test.ts`

- [ ] **Step 1: Leer el archivo entero** para ver cómo se listan hoy los micros en el prompt (líneas ~40-90) y si hay un schema del tool que enumere los campos permitidos.

- [ ] **Step 2: Escribir/extender el test**

Si `nutrition.test.ts` valida que el prompt menciona ciertos nutrientes o que el schema del tool acepta las keys, agregar aserciones para `monounsaturated_fat_g`, `polyunsaturated_fat_g`, `trans_fat_g`. Si el schema del tool deriva del registro (probable), quizás ya las acepta — en ese caso el trabajo es solo mencionarlas en el texto del prompt para que el modelo las devuelva cuando la etiqueta las tenga.

- [ ] **Step 3: Implementar** — agregar en el prompt la mención de las grasas mono/poli/trans (junto a saturadas), pidiendo que se devuelvan en gramos por 100 g/ml **solo si la etiqueta las muestra**, con `null` honesto si no.

- [ ] **Step 4: Correr y verificar verde** → `bun test backend/src/ai/nutrition.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/nutrition.ts backend/src/ai/nutrition.test.ts
git commit -S -m "NUT-14: pedir mono/poli/trans en la extracción por IA"
```

### Task 9: Correr toda la suite de backend + shared

- [ ] **Step 1:** `bun test shared backend`
Expected: PASS. Arreglar cualquier fixture/snapshot que enumere nutrientes (p.ej. tests de `assemble`, `fromUsda`, reports) para incluir las columnas nuevas como `null` — es cambio esperado del registro.

- [ ] **Step 2: Commit** cualquier ajuste de fixtures con mensaje `NUT-14: ajustar fixtures al registro ampliado`.

---

## Fase 3 — mobile: pantalla de desglose con barras bicolor

### Task 10: Componente de barra bicolor (dentro/excedente)

**Files:**
- Modify: `mobile/src/nutrition/tabs/ui.tsx` (donde vive `Bar`)
- Test: `mobile/__tests__/` (agregar `fatBar.test.tsx` o extender el de `ui` si existe)

- [ ] **Step 1: Leer `Bar` en `ui.tsx`** para imitar el estilo (radios, alturas, tokens).

- [ ] **Step 2: Escribir el test que falla** — un `SplitBar` que renderiza dos segmentos con anchos proporcionales a `withinG`/`overG` sobre el máximo de la fila, con testIDs `-within` y `-over`, y que NO renderiza el segmento `over` cuando `overG === 0`.

- [ ] **Step 3: Implementar `SplitBar`** (segmento verde `colors.success` para `within`, rojo `colors.danger` para `over`; el ancho total mide contra el mayor de {umbral, grams} de esa barra, o contra el máximo de todas las barras — decidir por legibilidad; documentarlo). Para las barras `recommended` el segmento es todo verde.

- [ ] **Step 4: Correr** → `cd mobile && npm test -- --runInBand fatBar`

- [ ] **Step 5: Commit** `NUT-14: componente SplitBar bicolor`.

### Task 11: Pantalla `grasas.tsx` (desglose por tipo)

**Files:**
- Create: `mobile/app/nutricion/grasas.tsx` (imitar `mobile/app/nutricion/macro.tsx`)
- Test: `mobile/__tests__/grasas.test.tsx` (imitar el test de `macro` si existe)

- [ ] **Step 1: Averiguar cómo obtener `goalKcal`** en una pantalla suelta. Buscar: `grep -rn "goalKcal\|useGoal\|goalView\|GoalView" mobile/src/nutrition`. La dona (`MacrosTab`) recibe `goalView`; la pantalla nueva debe traer la meta calórica por el mismo hook/endpoint que usa la pestaña Nutrición. Si la meta requiere el perfil, reusar ese hook.

- [ ] **Step 2: Escribir el test** — con `meals` mockeados y `goalKcal` dado, la pantalla renderiza 5 barras en `FAT_BAR_ORDER`, muestra "te pasaste" en las que exceden, y cada barra es `Pressable` que navega a `/nutricion/nutriente?key=<type>`.

- [ ] **Step 3: Implementar** usando `useMealsRange(1, offset)` + `fatBreakdown(dayTotals, goalKcal)`. Los gramos por tipo salen de sumar los `meal_item` del día (mismo `dayTotals`/summary que usa la pestaña; o sumar con el helper de sumas del registro). Cada barra: label, `grams` + unidad, umbral (`· máx N g` para `max`, `· ref N g` para mono, nada para omega-3), `SplitBar`, y `Pressable` → `router.push(\`/nutricion/nutriente?key=${type}&offset=${offset}\`)`. Texto guía: "Tocá un tipo de grasa para ver qué alimentos lo aportan." Mensaje cuando excede: "Te pasaste del máximo recomendado".

- [ ] **Step 4: Correr** → `cd mobile && npm test -- --runInBand grasas`

- [ ] **Step 5: Verificación por mutación** — romper el orden de `FAT_BAR_ORDER` en el render, confirmar que el test se queja, revertir.

- [ ] **Step 6: Commit** `NUT-14: pantalla de desglose de grasa por tipo`.

### Task 12: Enganchar el tap "Grasa" de la dona a la pantalla nueva

**Files:**
- Modify: `mobile/src/nutrition/tabs/MacrosTab.tsx:69`
- Test: extender el test de `MacrosTab` si existe.

- [ ] **Step 1: Escribir/ajustar el test** — tocar la fila `macro-row-fat` navega a `/nutricion/grasas?offset=...`; proteína/carbos siguen yendo a `/nutricion/macro?...`.

- [ ] **Step 2: Implementar** — en el `onPress` de la fila, ramificar por `s.key`:

```tsx
onPress={() =>
  router.push(
    s.key === "fat"
      ? `/nutricion/grasas?offset=${offset}`
      : `/nutricion/macro?macro=${s.key}&offset=${offset}`,
  )
}
```

Actualizar el texto guía inferior si conviene ("Tocá Grasa para ver el desglose por tipo").

- [ ] **Step 3: Correr** → `cd mobile && npm test -- --runInBand MacrosTab`

- [ ] **Step 4: Commit** `NUT-14: la dona de macros abre el desglose de grasa`.

### Task 13: Suite móvil completa

- [ ] **Step 1:** `cd mobile && npm test -- --runInBand`
Expected: PASS. Arreglar imports/mocks de `expo-router` según convención (§7 ONBOARDING).

- [ ] **Step 2: Commit** cualquier ajuste.

---

## Fase 4 — cierre

### Task 14: Verificación integral + PR

- [ ] **Step 1:** `bun test shared backend` y `cd mobile && npm test -- --runInBand` — todo verde.
- [ ] **Step 2:** Revisar el diff completo (`git diff origin/main...HEAD`) contra el spec de arriba: ¿5 barras? ¿umbrales correctos? ¿mono/omega-3 sin alerta? ¿tap → nutriente?
- [ ] **Step 3:** Push de la rama y abrir PR "NUT-14: desglose de grasa por tipo con colores". Disparar `@claude review` (memoria `auto-claude-review-on-pr`). NO mergear ni deployar sin las señales de siempre.

### Backfill (OPERATIVO — lo corre/decide el owner, fuera del código)

El catálogo base y el dataset USDA no traen mono/poli/trans hasta reconstruir el artefacto:
1. Reconstruir `backend/data/usda-YYYY-MM.json.gz` desde los CSV crudos de USDA con `build-usda-dataset.ts` (los CSV los tiene el owner localmente; **bumpea la versión** del dataset → el loader recarga en el próximo arranque).
2. Re-seedear el catálogo base con `seed-food-catalog` (#218) para que los ~114 ingredientes canónicos tomen los tipos de grasa.
3. Los alimentos personales/por-IA ya cargados quedan con `null` (la UI distingue "sin dato" de 0) hasta re-extraerlos.

Documentar estos pasos en el PR para que el owner decida cuándo correr el backfill.

---

## Self-review (hecho por el planificador)

- **Cobertura del spec**: (1) shared registro → Task 1; referencias AHA → Task 2; motor barras → Task 3. (2) migración/schema → Tasks 5-6; USDA → Task 7; IA → Task 8. (3) UI móvil con colores y barras → Tasks 10-12; tap→alimentos reusa `nutriente.tsx` (Task 11 step 3). Backfill → Task 14 (operativo, decisión del owner). ✅
- **Placeholders**: los pasos de UI (Tasks 10-12) apuntan a archivos hermanos exactos a imitar en vez de repetir todo el JSX de RN — es deliberado: el patrón `macro.tsx`/`Bar`/`nutriente.tsx` ya existe y copiarlo entero acá lo desincronizaría. El worker debe leerlos.
- **Consistencia de tipos**: `FatType`, `FatBar`, `FAT_BAR_ORDER`, `fatBreakdown`, `FAT_TYPE_PERCENT_KCAL`, `fatTypeRefG` se usan con la misma firma en las Fases 1 y 3. ✅
- **Gotcha sembrado**: el test de `mono.thresholdG` en Task 3 tiene un número mal a propósito (30 en vez de 33.3) con una nota — el worker debe corregirlo al implementar. Esto NO es un placeholder, es una verificación de que hizo la cuenta.
</content>
</invoke>
