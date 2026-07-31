# Cobertura de micros por período — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un bloque nuevo y determinístico en la pantalla de Informes que, por período (semana/quincena/mes), clasifica cada vitamina/mineral en cubierto-desde-la-comida / gracias-al-suplemento / sin-cubrir, con una métrica del norte ("% solo con comida") y su evolución.

**Architecture:** La matemática pura (clasificación, `%`, banda de tolerancia) vive en `shared/nutrition/coverage.ts` para que backend, móvil y tests la compartan. La comida por-día se deriva en el móvil desde `useMealsRange` (los `meals` traen `eatenAt`); el aporte de suplemento por-día viene de un endpoint nuevo `range-nutrients-daily`. El componente `CoverageBlock` (móvil) ensambla dona + métrica + mini-gráfico + barras y se monta en `informes.tsx`.

**Tech Stack:** TypeScript, Bun test (`bun:test`), Hono (backend), React Native / Expo Router (móvil), Zod. Todo el monorepo con `@pulsia/shared`.

**Spec:** `docs/superpowers/specs/2026-07-31-cobertura-micros-periodo-design.md`

> **Desviaciones durante la ejecución (2026-07-31), ya aplicadas en el código:**
> 1. **Guard de dato-cero en `coveragePeriod`** (Task 1): el sample de Step 3 clasificaba los ~21
>    nutrientes-piso como `few_data` aunque no tuvieran NINGÚN dato (inflaba el conteo y rompía el
>    test de `onlyFoodPct`). El código real omite del todo un nutriente con 0 días de dato en comida
>    Y suplemento (`if (daysWithData === 0 && suppDaysWithData === 0) continue;`).
> 2. **Convención de tests del móvil**: NO es `bun:test` co-locado sino **jest** con los tests en
>    `mobile/__tests__/` (globals `test`/`expect` sin import, source vía `../src/...`), y los tests de
>    componente mockean `expo-router` y usan `screen.getByText` (no destructuran `render`). Los tres
>    tests del móvil viven como `__tests__/coverage-{data,evolution,block}.test.ts(x)`.
> 3. **`fakeDb` del backend no filtra tomas por fecha** → el test de `range-nutrients-daily` verifica
>    la FORMA (`perDay` con las claves correctas + `totals` por día), no días vacíos.

---

## Estructura de archivos

**Crear:**
- `shared/src/nutrition/coverage.ts` — tipos + `coveragePeriod` + `coverageReference` + `COVERAGE_TOLERANCE` (matemática pura).
- `shared/src/nutrition/coverage.test.ts` — tests de la matemática.
- `mobile/src/nutrition/coverageData.ts` — `mealsToPerDayNutrients`, `suppPerDayToNutrients` (adaptadores móvil→`PerDayNutrients`).
- `mobile/src/nutrition/coverageData.test.ts`.
- `mobile/src/nutrition/coverageEvolution.ts` — `coverageEvolution` + `filterByPeriod` (serie del mini-gráfico).
- `mobile/src/nutrition/coverageEvolution.test.ts`.
- `mobile/src/nutrition/useCoverage.ts` — hook que trae la ventana y arma resultado actual + evolución.
- `mobile/src/nutrition/CoverageBlock.tsx` — el componente visual.
- `mobile/src/nutrition/CoverageBlock.test.tsx`.

**Modificar:**
- `shared/src/index.ts` — exportar `./nutrition/coverage`.
- `backend/src/routes/supplements.ts` — endpoint `GET /nutrition/supplements/range-nutrients-daily`.
- `backend/src/routes/supplements.test.ts` — tests del endpoint.
- `mobile/src/api/supplements.ts` — `getRangeNutrientsDaily`.
- `mobile/app/nutricion/informes.tsx` — montar `<CoverageBlock kind={kind} offset={offset} />`.

---

## Task 1: shared — matemática de cobertura (`coveragePeriod`)

**Files:**
- Create: `shared/src/nutrition/coverage.ts`
- Test: `shared/src/nutrition/coverage.test.ts`

Contexto: `referenceFor(key, person)` (`references.efsa.ts`) da el piso EFSA (`kind: "min"`) personalizado por sexo/edad, o `null`. La **fibra** es un piso pero EFSA lo deja en `null` a propósito (para no duplicar con `references.ts`, que la fija en 30 g); hay que tomarla de `NUTRIENT_REFERENCES` + `NUTRIENT_REFERENCE_KIND`. Los de **techo** (sodio, azúcar, saturadas, colesterol) nunca entran.

- [ ] **Step 1: Escribir el test que falla**

```ts
// shared/src/nutrition/coverage.test.ts
import { test, expect } from "bun:test";
import { coveragePeriod, coverageReference, COVERAGE_TOLERANCE, type PerDayNutrients } from "./coverage";

const MALE = { sex: "male" as const, age: 40 };

test("coverageReference: pisos sí, techos no", () => {
  expect(coverageReference("vitamin_d_mcg", MALE)).toBe(15); // EFSA AI
  expect(coverageReference("fiber_g", MALE)).toBe(30); // references.ts
  expect(coverageReference("sodium_mg", MALE)).toBeNull(); // techo (EFSA null)
  expect(coverageReference("cholesterol_mg", MALE)).toBeNull(); // techo
  expect(coverageReference("vitamin_b1_mg", MALE)).toBeNull(); // EFSA proporcional a energía → null
});

test("clasifica food / supplement / uncovered con banda del 10%", () => {
  // vit C ref(male)=110. Comida 100/día (>= 0.9*110=99) → food.
  // vit D ref=15. Comida 1/día, suplemento 20/día → food+supp cubre → supplement.
  // calcio ref(male,40)=950. Comida 300/día, sin suplemento → uncovered.
  const food: PerDayNutrients = {
    "2026-07-01": { vitamin_c_mg: 100, vitamin_d_mcg: 1, calcium_mg: 300 },
    "2026-07-02": { vitamin_c_mg: 100, vitamin_d_mcg: 1, calcium_mg: 300 },
  };
  const supp: PerDayNutrients = {
    "2026-07-01": { vitamin_d_mcg: 20 },
    "2026-07-02": { vitamin_d_mcg: 20 },
  };
  const r = coveragePeriod(food, supp, MALE, { minDataDays: 1 });
  const byKey = Object.fromEntries(r.byNutrient.map((n) => [n.key, n.state]));
  expect(byKey["vitamin_c_mg"]).toBe("food");
  expect(byKey["vitamin_d_mcg"]).toBe("supplement");
  expect(byKey["calcium_mg"]).toBe("uncovered");
  expect(r.daysRegistered).toBe(2);
});

test("pocos datos: bajo minDataDays y sin cubrir → few_data (no uncovered)", () => {
  const food: PerDayNutrients = { "2026-07-01": { calcium_mg: 100 } }; // 1 día con dato
  const r = coveragePeriod(food, {}, MALE, { minDataDays: 3 });
  const cal = r.byNutrient.find((n) => n.key === "calcium_mg")!;
  expect(cal.state).toBe("few_data");
  expect(cal.daysWithData).toBe(1);
});

test("null ≠ 0 en comida no esconde el aporte del suplemento", () => {
  // Comida no declara vit D ningún día (null); suplemento la cubre.
  const food: PerDayNutrients = { "2026-07-01": { calcium_mg: 950 } };
  const supp: PerDayNutrients = { "2026-07-01": { vitamin_d_mcg: 20 } };
  const r = coveragePeriod(food, supp, MALE, { minDataDays: 1 });
  const d = r.byNutrient.find((n) => n.key === "vitamin_d_mcg")!;
  expect(d.foodAvg).toBeNull();
  expect(d.state).toBe("supplement");
});

test("onlyFoodPct excluye few_data y no clasificables", () => {
  // vit C food-cubierto; calcio few_data. onlyFoodPct = 1/(1) = 100 (calcio no cuenta).
  const food: PerDayNutrients = { "2026-07-01": { vitamin_c_mg: 200, calcium_mg: 10 } };
  const r = coveragePeriod(food, {}, MALE, { minDataDays: 3 });
  expect(r.onlyFoodPct).toBe(100);
  expect(r.counts.food).toBe(1);
  expect(r.counts.fewData).toBe(1);
});

test("banda exacta: 90% cuenta, 89% no", () => {
  const ref = coverageReference("vitamin_c_mg", MALE)!; // 110
  const at90: PerDayNutrients = { d: { vitamin_c_mg: COVERAGE_TOLERANCE * ref } };
  const at89: PerDayNutrients = { d: { vitamin_c_mg: 0.89 * ref } };
  expect(coveragePeriod(at90, {}, MALE, { minDataDays: 1 }).byNutrient.find((n) => n.key === "vitamin_c_mg")!.state).toBe("food");
  expect(coveragePeriod(at89, {}, MALE, { minDataDays: 1 }).byNutrient.find((n) => n.key === "vitamin_c_mg")!.state).toBe("uncovered");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd shared && bun test src/nutrition/coverage.test.ts`
Expected: FAIL — `Cannot find module "./coverage"`.

- [ ] **Step 3: Implementar `coverage.ts`**

```ts
// shared/src/nutrition/coverage.ts
import { NUTRIENTS, type NutrientKey, type NutrientValues } from "./nutrients";
import { referenceFor, type ReferencePerson } from "./references.efsa";
import { NUTRIENT_REFERENCES, NUTRIENT_REFERENCE_KIND } from "./references";

// Fracción de la referencia que ya cuenta como "alcanzado": 90% (banda de tolerancia del 10%),
// para que un 98% por ruido no caiga en rojo. Ver spec §4.
export const COVERAGE_TOLERANCE = 0.9;

// Aporte diario por nutriente, indexado por día (YYYY-MM-DD LOCAL — el caller bucketiza con su
// propia función de fecha, para no meter zonas horarias en shared). `null` = "no sabemos" ese día
// (ningún ítem declaró el nutriente); NO es 0. Un 0 declarado sí es un número.
export type PerDayNutrients = Record<string, NutrientValues>;

export type CoverageState = "food" | "supplement" | "uncovered" | "few_data";

export interface NutrientCoverage {
  key: NutrientKey;
  foodAvg: number | null; // promedio sobre los días CON dato de comida para este nutriente
  suppAvg: number; // promedio sobre los días registrados (un día sin toma = 0 real)
  ref: number; // referencia personalizada (piso)
  state: CoverageState;
  daysWithData: number; // días con dato de comida para este nutriente
}

export interface CoverageResult {
  byNutrient: NutrientCoverage[];
  counts: { food: number; supplement: number; uncovered: number; fewData: number };
  onlyFoodPct: number | null; // food / (food+supplement+uncovered); null si no hay clasificables
  daysRegistered: number; // días con cualquier registro (comida o suplemento)
}

// Piso contra el cual medir "cubrir". EFSA `min` para vitaminas/minerales (personalizado por
// sexo/edad); fibra desde references.ts (EFSA la deja null a propósito). Techos → null (no aplica).
export function coverageReference(key: NutrientKey, person: ReferencePerson): number | null {
  const efsa = referenceFor(key, person);
  if (efsa && efsa.kind === "min") return efsa.value;
  const flat = (NUTRIENT_REFERENCES as Partial<Record<string, number>>)[key];
  const kind = (NUTRIENT_REFERENCE_KIND as Partial<Record<string, "min" | "max">>)[key];
  if (flat != null && kind === "min") return flat;
  return null;
}

export function coveragePeriod(
  perDayFood: PerDayNutrients,
  perDaySupp: PerDayNutrients,
  person: ReferencePerson,
  opts: { minDataDays: number },
): CoverageResult {
  const foodDays = Object.keys(perDayFood);
  const suppDays = Object.keys(perDaySupp);
  const daysRegistered = new Set([...foodDays, ...suppDays]).size;

  const byNutrient: NutrientCoverage[] = [];
  const counts = { food: 0, supplement: 0, uncovered: 0, fewData: 0 };

  for (const def of NUTRIENTS) {
    const key = def.key as NutrientKey;
    const ref = coverageReference(key, person);
    if (ref == null) continue; // techo o sin piso para este perfil → no se clasifica

    // Comida: promedio sobre los días CON dato (null = no sé, se saltea).
    let foodSum = 0;
    let daysWithData = 0;
    for (const d of foodDays) {
      const v = perDayFood[d][key];
      if (v == null) continue;
      foodSum += v;
      daysWithData++;
    }
    const foodAvg = daysWithData > 0 ? foodSum / daysWithData : null;

    // Suplemento: total sobre los días registrados (un día sin toma = 0 real, no "no sé").
    let suppSum = 0;
    for (const d of suppDays) {
      const v = perDaySupp[d][key];
      if (v != null) suppSum += v;
    }
    const suppAvg = daysRegistered > 0 ? suppSum / daysRegistered : 0;

    const effFood = foodAvg ?? 0;
    const threshold = COVERAGE_TOLERANCE * ref;
    let state: CoverageState;
    if (effFood >= threshold) state = "food";
    else if (effFood + suppAvg >= threshold) state = "supplement";
    else if (daysWithData < opts.minDataDays) state = "few_data";
    else state = "uncovered";

    if (state === "food") counts.food++;
    else if (state === "supplement") counts.supplement++;
    else if (state === "uncovered") counts.uncovered++;
    else counts.fewData++;

    byNutrient.push({ key, foodAvg, suppAvg, ref, state, daysWithData });
  }

  const classifiable = counts.food + counts.supplement + counts.uncovered;
  const onlyFoodPct = classifiable > 0 ? Math.round((counts.food / classifiable) * 100) : null;
  return { byNutrient, counts, onlyFoodPct, daysRegistered };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd shared && bun test src/nutrition/coverage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/src/nutrition/coverage.ts shared/src/nutrition/coverage.test.ts
git commit -S -m "feat(nutrición): matemática de cobertura de micros por período (shared)"
```

---

## Task 2: shared — exportar `coverage` del índice

**Files:**
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Agregar el export**

Después de la línea `export * from "./nutrition/supplementBreakdown";` agregar:

```ts
export * from "./nutrition/coverage";
```

- [ ] **Step 2: Verificar tipos**

Run: `cd shared && bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add shared/src/index.ts
git commit -S -m "chore(shared): exportar nutrition/coverage"
```

---

## Task 3: backend — endpoint `range-nutrients-daily`

**Files:**
- Modify: `backend/src/routes/supplements.ts` (después del handler `range-nutrients`, ~línea 220)
- Test: `backend/src/routes/supplements.test.ts`

Contexto: `range-nutrients` ya itera día a día con `takesWithComponents` y **agrega** todo con `supplementMicros`. El nuevo devuelve el resultado **por día** sin agregar: `{ perDay: { [YYYY-MM-DD]: SupplementMicrosResult } }`. Mismo guard de 366 días y de `from > to`.

- [ ] **Step 1: Escribir el test que falla**

Agregar en `backend/src/routes/supplements.test.ts` (junto a los tests de `range-nutrients`, imitando su setup de plan+tomas):

```ts
test("GET /nutrition/supplements/range-nutrients-daily devuelve el aporte por día", async () => {
  // Reusa el mismo fixture de plan+toma que el test de day-nutrients (un suplemento con vit D
  // mapeada, tomado el 2026-07-26).
  const res = await app.request("/nutrition/supplements/range-nutrients-daily?from=2026-07-25&to=2026-07-27");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { perDay: Record<string, { totals: Record<string, number> }> };
  expect(Object.keys(body.perDay)).toEqual(["2026-07-25", "2026-07-26", "2026-07-27"]);
  expect(body.perDay["2026-07-26"].totals.vitamin_d_mcg).toBeGreaterThan(0);
  expect(body.perDay["2026-07-25"].totals).toEqual({}); // sin toma ese día
});

test("range-nutrients-daily → 400 si from es posterior a to", async () => {
  const res = await app.request("/nutrition/supplements/range-nutrients-daily?from=2026-07-20&to=2026-07-10");
  expect(res.status).toBe(400);
});

test("range-nutrients-daily → 400 si el rango supera 366 días", async () => {
  const res = await app.request("/nutrition/supplements/range-nutrients-daily?from=2025-01-01&to=2026-06-01");
  expect(res.status).toBe(400);
});
```

> Nota para el implementador: copiá el bloque `beforeEach`/setup del test de `day-nutrients`/`range-nutrients` existente en este mismo archivo (crea el plan, el ítem y la toma). NO inventes datos reales — fixtures sintéticos ([[nunca-datos-reales-en-el-repo]]).

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && bun test src/routes/supplements.test.ts -t "range-nutrients-daily"`
Expected: FAIL — 404 (ruta inexistente).

- [ ] **Step 3: Implementar el handler**

En `backend/src/routes/supplements.ts`, inmediatamente después del handler `r.get("/range-nutrients", ...)`:

```ts
  r.get("/range-nutrients-daily", async (c) => {
    const from = c.req.query("from"), to = c.req.query("to");
    if (!from || !to || !z.iso.date().safeParse(from).success || !z.iso.date().safeParse(to).success) {
      return c.json({ error: "Faltan from/to (YYYY-MM-DD)" }, 400);
    }
    if (from > to) return c.json({ error: "from no puede ser posterior a to" }, 400);
    const rangeDays = (new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86_400_000;
    if (rangeDays > 366) return c.json({ error: "El rango entre from y to no puede superar 366 días" }, 400);
    // Igual que range-nutrients, pero SIN agregar: se guarda el aporte de cada día por separado,
    // que es lo que el móvil necesita para el promedio diario y la evolución por período.
    const perDay: Record<string, ReturnType<typeof supplementMicros>> = {};
    for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      const takes = await takesWithComponents(deps.db, c.get("userId"), day);
      perDay[day] = supplementMicros(takes);
    }
    return c.json({ perDay });
  });
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && bun test src/routes/supplements.test.ts -t "range-nutrients-daily"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/supplements.ts backend/src/routes/supplements.test.ts
git commit -S -m "feat(nutrición): endpoint range-nutrients-daily (aporte de suplemento por día)"
```

---

## Task 4: móvil — cliente `getRangeNutrientsDaily`

**Files:**
- Modify: `mobile/src/api/supplements.ts` (después de `getRangeNutrients`, ~línea 116)

Contexto: `getRangeNutrients` ya existe y degrada limpio (atrapa red/5xx y devuelve vacío). El nuevo cliente sigue el mismo patrón.

- [ ] **Step 1: Agregar el tipo y la función**

En `mobile/src/api/supplements.ts`, después de `getRangeNutrients`:

```ts
export interface RangeNutrientsDaily {
  perDay: Record<string, SupplementNutrients>;
}

export async function getRangeNutrientsDaily(baseUrl: string, from: string, to: string): Promise<RangeNutrientsDaily> {
  try {
    const res = await apiFetch(baseUrl, `/nutrition/supplements/range-nutrients-daily?from=${from}&to=${to}`);
    if (!res.ok) return { perDay: {} };
    return (await res.json()) as RangeNutrientsDaily;
  } catch {
    return { perDay: {} };
  }
}
```

> `SupplementNutrients` (`{ totals, byNutrient }`) ya está declarado/importado en este archivo (lo usa `getRangeNutrients`). Reusarlo.

- [ ] **Step 2: Verificar tipos**

Run: `cd mobile && bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/supplements.ts
git commit -S -m "feat(nutrición): cliente getRangeNutrientsDaily (móvil)"
```

---

## Task 5: móvil — adaptadores `PerDayNutrients` (comida + suplemento)

**Files:**
- Create: `mobile/src/nutrition/coverageData.ts`
- Test: `mobile/src/nutrition/coverageData.test.ts`

Contexto: `coveragePeriod` toma `PerDayNutrients` ya bucketeado. La comida se bucketiza desde `meals` con `dateKey` (mismo criterio de mediodía local que `dailyNutrientSeries`), sumando cada nutriente con `sumNullableMicro` (null-aware: null si ningún ítem declara el dato). El suplemento se adapta desde `{ perDay: { [date]: { totals } } }`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// mobile/src/nutrition/coverageData.test.ts
import { test, expect } from "bun:test";
import { mealsToPerDayNutrients, suppPerDayToNutrients } from "./coverageData";
import type { Meal } from "@pulsia/shared";

const item = (v: Partial<Record<string, number | null>>) => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...v }) as any;
const meal = (eatenAt: number, items: any[]): Meal => ({ id: "m", eatenAt, mealType: "lunch", note: null, items }) as any;

test("mealsToPerDayNutrients: suma por día, null si ningún ítem declara", () => {
  const t = new Date(2026, 6, 1, 13).getTime(); // 1 jul 13:00 local
  const per = mealsToPerDayNutrients([
    meal(t, [item({ vitamin_c_mg: 40 }), item({ vitamin_c_mg: 10, calcium_mg: 100 })]),
  ]);
  expect(per["2026-07-01"].vitamin_c_mg).toBe(50);
  expect(per["2026-07-01"].calcium_mg).toBe(100);
  expect(per["2026-07-01"].vitamin_d_mcg).toBeNull(); // nadie lo declaró
});

test("suppPerDayToNutrients: mapea totals a PerDayNutrients", () => {
  const per = suppPerDayToNutrients({
    "2026-07-01": { totals: { vitamin_d_mcg: 20 }, byNutrient: {} },
    "2026-07-02": { totals: {}, byNutrient: {} },
  });
  expect(per["2026-07-01"].vitamin_d_mcg).toBe(20);
  expect(per["2026-07-02"]).toEqual({});
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && bun test src/nutrition/coverageData.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `coverageData.ts`**

```ts
// mobile/src/nutrition/coverageData.ts
import { NUTRIENT_KEYS, sumNullableMicro, type Meal, type NutrientKey, type NutrientValues, type PerDayNutrients } from "@pulsia/shared";
import type { SupplementNutrients } from "../api/supplements";
import { dateKey } from "../session/dateKey";

// Comida por día → PerDayNutrients. Agrupa por mediodía local (dateKey, mismo criterio que
// dailyNutrientSeries) y suma cada nutriente con sumNullableMicro: `null` si NINGÚN ítem del día
// declaró el dato (no es lo mismo que 0). Un 0 declarado sí es número.
export function mealsToPerDayNutrients(meals: Meal[]): PerDayNutrients {
  const byDay: Record<string, Meal[]> = {};
  for (const m of meals) (byDay[dateKey(m.eatenAt)] ??= []).push(m);
  const out: PerDayNutrients = {};
  for (const [day, dayMeals] of Object.entries(byDay)) {
    const values: NutrientValues = {};
    for (const key of NUTRIENT_KEYS) {
      const nums: Array<number | null | undefined> = [];
      for (const m of dayMeals) for (const it of m.items) nums.push((it as Record<NutrientKey, number | null | undefined>)[key]);
      values[key] = sumNullableMicro(nums);
    }
    out[day] = values;
  }
  return out;
}

// Aporte de suplemento por día (respuesta del backend) → PerDayNutrients (usa solo `.totals`).
export function suppPerDayToNutrients(perDay: Record<string, SupplementNutrients>): PerDayNutrients {
  const out: PerDayNutrients = {};
  for (const [day, res] of Object.entries(perDay)) out[day] = res.totals as NutrientValues;
  return out;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd mobile && bun test src/nutrition/coverageData.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/coverageData.ts mobile/src/nutrition/coverageData.test.ts
git commit -S -m "feat(nutrición): adaptadores PerDayNutrients comida+suplemento (móvil)"
```

---

## Task 6: móvil — serie de evolución (`coverageEvolution`)

**Files:**
- Create: `mobile/src/nutrition/coverageEvolution.ts`
- Test: `mobile/src/nutrition/coverageEvolution.test.ts`

Contexto: la ventana (todos los días de los últimos `count` períodos) se trae UNA vez; esta función la bucketiza por período con `periodFor` (`mobile/src/reports/periods.ts`) y calcula `onlyFoodPct` de cada uno. `x` del punto = `period.start`; `y` = `onlyFoodPct`. Períodos sin clasificables (onlyFoodPct null) se omiten.

- [ ] **Step 1: Escribir el test que falla**

```ts
// mobile/src/nutrition/coverageEvolution.test.ts
import { test, expect } from "bun:test";
import { coverageEvolution, filterByPeriod } from "./coverageEvolution";
import type { PerDayNutrients } from "@pulsia/shared";

const MALE = { sex: "male" as const, age: 40 };

test("filterByPeriod: conserva los días dentro de [start,end] por mediodía local", () => {
  const per: PerDayNutrients = { "2026-07-01": { vitamin_c_mg: 1 }, "2026-07-20": { vitamin_c_mg: 1 } };
  const start = new Date(2026, 6, 1).getTime();
  const end = new Date(2026, 6, 15, 23, 59).getTime();
  expect(Object.keys(filterByPeriod(per, { start, end }))).toEqual(["2026-07-01"]);
});

test("coverageEvolution: un punto por período con clasificables, más viejo primero", () => {
  const now = new Date(2026, 6, 20, 12).getTime();
  // Comida cubre vit C en el mes actual; mes previo vacío (se omite).
  const food: PerDayNutrients = { "2026-07-10": { vitamin_c_mg: 200 } };
  const points = coverageEvolution("monthly", 0, 2, food, {}, MALE, { minDataDays: 1 }, now);
  expect(points.length).toBe(1);
  expect(points[0].y).toBe(100);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && bun test src/nutrition/coverageEvolution.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `coverageEvolution.ts`**

```ts
// mobile/src/nutrition/coverageEvolution.ts
import { coveragePeriod, type PerDayNutrients } from "@pulsia/shared";
import type { ReferencePerson, ReportKind } from "@pulsia/shared";
import { periodFor } from "../reports/periods";
import { dateKey } from "../session/dateKey";

export interface CoveragePoint { x: number; y: number }

// Mediodía local del día `YYYY-MM-DD` (mismo criterio que nutrientSeries.noonOf): representa el
// día, no la hora de la comida. Sirve para ubicar cada día dentro de un período.
function noonOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

// Conserva las entradas cuyo día (mediodía local) cae dentro de [start, end].
export function filterByPeriod(per: PerDayNutrients, period: { start: number; end: number }): PerDayNutrients {
  const out: PerDayNutrients = {};
  for (const [day, values] of Object.entries(per)) {
    const t = noonOf(day);
    if (t >= period.start && t <= period.end) out[day] = values;
  }
  return out;
}

// Serie de `onlyFoodPct` de los últimos `count` períodos del tipo `kind` que terminan en `offset`.
// Del más viejo al más nuevo. Los períodos sin nutrientes clasificables (onlyFoodPct null) se omiten.
export function coverageEvolution(
  kind: ReportKind,
  offset: number,
  count: number,
  perDayFood: PerDayNutrients,
  perDaySupp: PerDayNutrients,
  person: ReferencePerson,
  opts: { minDataDays: number },
  now: number,
): CoveragePoint[] {
  const points: CoveragePoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const period = periodFor(kind, offset + i, now);
    const food = filterByPeriod(perDayFood, period);
    const supp = filterByPeriod(perDaySupp, period);
    const res = coveragePeriod(food, supp, person, opts);
    if (res.onlyFoodPct == null) continue;
    points.push({ x: period.start, y: res.onlyFoodPct });
  }
  return points;
}

// Rango de días (from/to YYYY-MM-DD LOCAL) que cubre los últimos `count` períodos hasta `offset`.
// Se usa para pedir la ventana al backend/listMeals una sola vez.
export function windowBounds(kind: ReportKind, offset: number, count: number, now: number): { from: string; to: string } {
  const oldest = periodFor(kind, offset + count - 1, now);
  const newest = periodFor(kind, offset, now);
  return { from: dateKey(oldest.start), to: dateKey(newest.end) };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd mobile && bun test src/nutrition/coverageEvolution.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/coverageEvolution.ts mobile/src/nutrition/coverageEvolution.test.ts
git commit -S -m "feat(nutrición): serie de evolución de cobertura por período (móvil)"
```

---

## Task 7: móvil — hook `useCoverage`

**Files:**
- Create: `mobile/src/nutrition/useCoverage.ts`

Contexto: el hook trae la ventana (comida vía `listMeals`, suplemento vía `getRangeNutrientsDaily`) UNA vez para el `kind`+`offset` actuales, arma el resultado del período actual (`coveragePeriod`) y la serie de evolución (`coverageEvolution`). `minDataDays = max(3, ceil(N/4))` con N = días del período actual. Perfil desde `getProfile()`.

- [ ] **Step 1: Implementar el hook**

```ts
// mobile/src/nutrition/useCoverage.ts
import { useEffect, useRef, useState } from "react";
import { coveragePeriod, type CoverageResult, type ReferencePerson, type ReportKind } from "@pulsia/shared";
import { getBackendUrl } from "../storage/config";
import { getProfile } from "../storage/profile";
import { listMeals } from "../api/nutrition";
import { getRangeNutrientsDaily } from "../api/supplements";
import { periodFor } from "../reports/periods";
import { mealsToPerDayNutrients, suppPerDayToNutrients } from "./coverageData";
import { coverageEvolution, filterByPeriod, windowBounds, type CoveragePoint } from "./coverageEvolution";
import { dayBoundsFromKey } from "./dayBounds";

const WINDOW = 8; // períodos hacia atrás para la evolución

export interface Coverage {
  current: CoverageResult | null;
  evolution: CoveragePoint[];
  loading: boolean;
}

function sexOf(s: string | undefined): ReferencePerson["sex"] {
  return s === "male" || s === "female" || s === "other" || s === "prefer_not_to_say" ? s : undefined;
}

export function useCoverage(kind: ReportKind, offset: number, now: number = Date.now()): Coverage {
  const [state, setState] = useState<Coverage>({ current: null, evolution: [], loading: true });
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const [url, profile] = await Promise.all([getBackendUrl(), getProfile()]);
        const person: ReferencePerson = { sex: sexOf(profile?.sex), age: profile?.age };
        const { from, to } = windowBounds(kind, offset, WINDOW, now);
        // Ventana completa en ms (mediodía del from → fin del to) para listMeals.
        const fromMs = dayBoundsFromKey(from).from;
        const toMs = dayBoundsFromKey(to).to;
        const [meals, daily] = await Promise.all([
          listMeals(url, fromMs, toMs),
          getRangeNutrientsDaily(url, from, to),
        ]);
        if (id !== reqId.current) return;
        const perFood = mealsToPerDayNutrients(meals);
        const perSupp = suppPerDayToNutrients(daily.perDay);
        const period = periodFor(kind, offset, now);
        const N = Math.round((period.end - period.start) / 86_400_000);
        const opts = { minDataDays: Math.max(3, Math.ceil(N / 4)) };
        const current = coveragePeriod(filterByPeriod(perFood, period), filterByPeriod(perSupp, period), person, opts);
        const evolution = coverageEvolution(kind, offset, WINDOW, perFood, perSupp, person, opts, now);
        setState({ current, evolution, loading: false });
      } catch {
        if (id === reqId.current) setState({ current: null, evolution: [], loading: false });
      }
    })();
  }, [kind, offset, now]);

  return state;
}
```

- [ ] **Step 2: Agregar el helper `dayBoundsFromKey` si no existe**

Revisar `mobile/src/nutrition/dayBounds.ts`. Si no exporta un helper que convierta `YYYY-MM-DD` → `{ from, to }` en ms (mediodía local ±12 h), agregarlo:

```ts
// dayBounds.ts — bounds en ms de un día dado por su clave local YYYY-MM-DD.
export function dayBoundsFromKey(key: string): { from: number; to: number } {
  const [y, m, d] = key.split("-").map(Number);
  const noon = new Date(y, m - 1, d, 12).getTime();
  return { from: noon - 12 * 3600_000, to: noon + 12 * 3600_000 - 1 };
}
```

> Si `dayBounds.ts` ya tiene algo equivalente (p.ej. `dayBounds(offset)` que trabaja por offset y expone `noon`), preferí reusarlo y adaptá el import. Verificá el archivo antes de duplicar.

- [ ] **Step 3: Verificar tipos**

Run: `cd mobile && bun run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/nutrition/useCoverage.ts mobile/src/nutrition/dayBounds.ts
git commit -S -m "feat(nutrición): hook useCoverage (ventana + período actual + evolución)"
```

---

## Task 8: móvil — componente `CoverageBlock`

**Files:**
- Create: `mobile/src/nutrition/CoverageBlock.tsx`
- Test: `mobile/src/nutrition/CoverageBlock.test.tsx`

Contexto: cabecera "C" (dona de conteos + métrica del norte + mini-gráfico) y detalle "A" colapsable (barras por micro agrupadas por estado). Reusa `LineChart` (`data: {x,y}[]`, `refLine?`), `barSegments3`/`Bar` (`mobile/src/nutrition/tabs/ui.tsx`), tokens (`colors.accent` comida, `colors.supplement` violeta, `colors.warning` excedente, `colors.danger` sin cubrir, `colors.icon` pocos datos), y `NUTRIENTS` para etiquetas. Tap en un micro → `router.push({ pathname: "/nutricion/nutriente", params: { key, offset } })`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// mobile/src/nutrition/CoverageBlock.test.tsx
import { test, expect } from "bun:test";
import { render } from "@testing-library/react-native";
import { CoverageView } from "./CoverageBlock";
import type { CoverageResult } from "@pulsia/shared";

const result: CoverageResult = {
  byNutrient: [
    { key: "vitamin_c_mg", foodAvg: 200, suppAvg: 0, ref: 110, state: "food", daysWithData: 20 },
    { key: "vitamin_d_mcg", foodAvg: 1, suppAvg: 20, ref: 15, state: "supplement", daysWithData: 20 },
    { key: "calcium_mg", foodAvg: 300, suppAvg: 0, ref: 950, state: "uncovered", daysWithData: 20 },
  ],
  counts: { food: 1, supplement: 1, uncovered: 1, fewData: 0 },
  onlyFoodPct: 33,
  daysRegistered: 26,
};

test("muestra la métrica del norte y los 3 estados", () => {
  const { getByText, queryByText } = render(
    <CoverageView current={result} evolution={[{ x: 1, y: 27 }, { x: 2, y: 33 }]} daysInPeriod={31} offset={0} expanded />,
  );
  expect(getByText("33%")).toBeTruthy();
  expect(getByText(/26 de 31 días/)).toBeTruthy();
  expect(getByText("Vitamina C")).toBeTruthy(); // detalle expandido
  expect(queryByText("Calcio")).toBeTruthy();
});

test("EmptyState cuando no hay clasificables", () => {
  const empty: CoverageResult = { byNutrient: [], counts: { food: 0, supplement: 0, uncovered: 0, fewData: 0 }, onlyFoodPct: null, daysRegistered: 0 };
  const { getByText } = render(<CoverageView current={empty} evolution={[]} daysInPeriod={31} offset={0} expanded />);
  expect(getByText(/Sin datos suficientes/)).toBeTruthy();
});
```

> Verificá el patrón de tests de pantalla existente (`mobile/app/nutricion/detalle.test.tsx`) para el import correcto de `render` y el setup de RN. Ajustá los imports si el repo usa otro helper.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && bun test src/nutrition/CoverageBlock.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `CoverageBlock.tsx`**

Separar el componente **puro de presentación** `CoverageView` (recibe datos, sin fetch — testeable) del wrapper `CoverageBlock` (usa `useCoverage`).

```tsx
// mobile/src/nutrition/CoverageBlock.tsx
import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { NUTRIENTS, type CoverageResult, type CoverageState, type NutrientCoverage, type ReportKind } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";
import { LineChart } from "../components/LineChart";
import { Card, SectionTitle, EmptyState } from "./tabs/ui";
import { useCoverage } from "./useCoverage";
import type { CoveragePoint } from "./coverageEvolution";
import { periodFor } from "../reports/periods";

const LABEL = new Map(NUTRIENTS.map((n) => [n.key as string, n.label]));
const STATE_COLOR: Record<CoverageState, string> = {
  food: colors.accent,
  supplement: colors.supplement,
  uncovered: colors.danger,
  few_data: colors.icon,
};
const GROUPS: { state: CoverageState; title: string }[] = [
  { state: "food", title: "Desde la comida" },
  { state: "supplement", title: "Gracias al suplemento" },
  { state: "uncovered", title: "Sin cubrir" },
  { state: "few_data", title: "Pocos datos" },
];

function pct(n: NutrientCoverage): number {
  return Math.round((((n.foodAvg ?? 0) + n.suppAvg) / n.ref) * 100);
}

function Donut({ counts }: { counts: CoverageResult["counts"] }) {
  const total = counts.food + counts.supplement + counts.uncovered + counts.fewData;
  const segs: { c: string; n: number }[] = [
    { c: STATE_COLOR.food, n: counts.food },
    { c: STATE_COLOR.supplement, n: counts.supplement },
    { c: STATE_COLOR.uncovered, n: counts.uncovered },
    { c: STATE_COLOR.few_data, n: counts.fewData },
  ];
  // Barra apilada horizontal (dona simplificada, sin dependencia de SVG de torta): proporción por estado.
  return (
    <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surfaceMuted }}>
      {total > 0 && segs.map((s, i) => s.n > 0 ? <View key={i} style={{ flex: s.n, backgroundColor: s.c }} /> : null)}
    </View>
  );
}

function MicroRow({ n, offset }: { n: NutrientCoverage; offset: number }) {
  const p = pct(n);
  const foodW = Math.min(100, ((n.foodAvg ?? 0) / n.ref) * 100);
  const suppW = Math.min(100 - foodW, (n.suppAvg / n.ref) * 100);
  const overW = Math.max(0, Math.min(100, p) - foodW - suppW);
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/nutricion/nutriente", params: { key: n.key, offset: String(offset) } })}
      style={{ marginVertical: 6 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ color: colors.text, fontSize: 13 }}>{LABEL.get(n.key)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{n.state === "few_data" ? "pocos datos" : `${p}%`}</Text>
      </View>
      <View style={{ height: 9, borderRadius: 5, overflow: "hidden", backgroundColor: colors.surfaceMuted, flexDirection: "row", opacity: n.state === "few_data" ? 0.5 : 1 }}>
        <View style={{ width: `${foodW}%`, backgroundColor: colors.accent }} />
        <View style={{ width: `${suppW}%`, backgroundColor: colors.supplement }} />
        <View style={{ width: `${overW}%`, backgroundColor: colors.warning }} />
      </View>
    </Pressable>
  );
}

export function CoverageView({
  current, evolution, daysInPeriod, offset, expanded: initialExpanded = false,
}: {
  current: CoverageResult; evolution: CoveragePoint[]; daysInPeriod: number; offset: number; expanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  if (current.onlyFoodPct == null) {
    return <Card><EmptyState>Sin datos suficientes en este período para calcular la cobertura.</EmptyState></Card>;
  }
  const prev = evolution.length >= 2 ? evolution[evolution.length - 2].y : null;
  const delta = prev != null ? current.onlyFoodPct - prev : null;
  return (
    <Card>
      <SectionTitle>Cobertura de micros</SectionTitle>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
        {current.daysRegistered} de {daysInPeriod} días registrados
      </Text>

      <Donut counts={current.counts} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs }}>
        <Legend c={colors.accent} t={`Comida ${current.counts.food}`} />
        <Legend c={colors.supplement} t={`Suplemento ${current.counts.supplement}`} />
        <Legend c={colors.danger} t={`Sin cubrir ${current.counts.uncovered}`} />
      </View>

      <View style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={{ color: colors.accent, fontSize: 26, fontWeight: "800" }}>{current.onlyFoodPct}%</Text>
          {delta != null && (
            <Text style={{ color: delta >= 0 ? colors.accentText : colors.danger, fontSize: 13, fontWeight: "700" }}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts
            </Text>
          )}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>de los micros cubiertos solo con comida</Text>
        {evolution.length >= 2 && (
          <View style={{ marginTop: spacing.sm }}>
            <LineChart data={evolution} />
          </View>
        )}
      </View>

      <Pressable onPress={() => setExpanded((e) => !e)} style={{ marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600", textAlign: "center" }}>
          {expanded ? "▲ Ocultar detalle por micro" : "▼ Ver detalle por micro"}
        </Text>
      </Pressable>

      {expanded && GROUPS.map((g) => {
        const rows = current.byNutrient.filter((n) => n.state === g.state);
        if (rows.length === 0) return null;
        return (
          <View key={g.state} style={{ marginTop: spacing.sm }}>
            <Text style={{ color: STATE_COLOR[g.state], fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.sm }}>{g.title}</Text>
            {rows.map((n) => <MicroRow key={n.key} n={n} offset={offset} />)}
          </View>
        );
      })}
    </Card>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t}</Text>
    </View>
  );
}

// Wrapper con fetch. Se monta en informes.tsx.
export function CoverageBlock({ kind, offset, now = Date.now() }: { kind: ReportKind; offset: number; now?: number }) {
  const { current, evolution, loading } = useCoverage(kind, offset, now);
  if (loading) return <ActivityIndicator color={colors.accent} />;
  if (!current) return null;
  const period = periodFor(kind, offset, now);
  const daysInPeriod = Math.round((period.end - period.start) / 86_400_000);
  return <CoverageView current={current} evolution={evolution} daysInPeriod={daysInPeriod} offset={offset} />;
}
```

> Verificá los nombres exactos exportados por `./tabs/ui` (`Card`, `SectionTitle`, `EmptyState`) y por `../components/LineChart` (prop `data` vs `points`). Ajustá si difieren. `Donut` es una barra apilada (evita sumar una dependencia de torta SVG); si preferís torta real, `nutriente.tsx`/`detalle.tsx` ya no usan una — mantené la barra apilada para v1.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd mobile && bun test src/nutrition/CoverageBlock.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/CoverageBlock.tsx mobile/src/nutrition/CoverageBlock.test.tsx
git commit -S -m "feat(nutrición): componente CoverageBlock (dona + norte + evolución + detalle)"
```

---

## Task 9: móvil — montar el bloque en Informes

**Files:**
- Modify: `mobile/app/nutricion/informes.tsx`
- Test: `mobile/app/nutricion/informes.test.tsx` (crear si no existe; si el patrón del repo no testea esta pantalla, ver nota)

Contexto: el bloque va **arriba** del área del informe IA, respetando el `kind` + `offset` de la pantalla. En modo diario (`kind === "daily"`) NO se muestra (la cobertura es de período; ver spec §6). Es instantáneo, no depende del botón "generar".

- [ ] **Step 1: Importar y montar el bloque**

En `mobile/app/nutricion/informes.tsx`, agregar el import:

```tsx
import { CoverageBlock } from "../../src/nutrition/CoverageBlock";
```

Y en el JSX, inmediatamente después del bloque de navegación de período (el `<View>` con las flechas ◀ ▶ y `{period.label}`) y antes de `{loading && <ActivityIndicator .../>}`:

```tsx
      {kind !== "daily" && <CoverageBlock kind={kind} offset={offset} />}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd mobile && bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Test de humo del cableado**

Si `mobile/app/nutricion/` ya tiene tests de pantalla (p.ej. `detalle.test.tsx`), crear `informes.test.tsx` que monte la pantalla con un `kind` semanal mockeando `getProfile`/`listMeals`/`getRangeNutrientsDaily` para devolver vacío, y verificar que **no rompe** (render sin throw) y que con `daily` el bloque no aparece. Seguir el patrón de mocks del test de `detalle`.

```tsx
// mobile/app/nutricion/informes.test.tsx  (esqueleto — ajustar mocks al patrón del repo)
import { test, expect } from "bun:test";
import { render } from "@testing-library/react-native";
import InformesScreen from "./informes";

test("la pantalla de informes monta sin romper", () => {
  const { getByText } = render(<InformesScreen />);
  expect(getByText("Semana")).toBeTruthy();
});
```

> Si el repo NO testea pantallas con navegación/fetch a este nivel (verificá si `detalle.test.tsx` mockea el router y las apis), OMITÍ este step y confiá en el typecheck + los tests de `CoverageView` (Task 8), que cubren la lógica. No fuerces un test frágil de integración de pantalla si no hay patrón previo.

- [ ] **Step 4: Correr la suite completa del móvil**

Run: `cd mobile && bun test`
Expected: PASS (incluye los nuevos; sin regresiones).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/nutricion/informes.tsx mobile/app/nutricion/informes.test.tsx
git commit -S -m "feat(nutrición): montar el bloque de cobertura en Informes"
```

---

## Task 10: verificación final + typecheck de los tres paquetes

**Files:** ninguno (verificación).

- [ ] **Step 1: Typecheck de shared, backend y móvil**

```bash
cd shared && bun run typecheck && cd ../backend && bun run typecheck && cd ../mobile && bun run typecheck
```
Expected: sin errores en los tres.

- [ ] **Step 2: Suites completas**

```bash
cd shared && bun test && cd ../backend && bun test && cd ../mobile && bun test
```
Expected: todo verde. Anotar los conteos finales.

- [ ] **Step 3: Verificación manual en device (post-merge/OTA)**

Con datos reales del owner: en Informes, elegir **Mes**; confirmar que aparece la dona, el "% solo con comida", el mini-gráfico (si hay ≥2 períodos con dato) y que al desplegar salen las barras agrupadas; tocar un micro y verificar que abre su pantalla de evolución. Confirmar que en **Día** el bloque NO aparece.

---

## Notas de cierre

- **Sin migración SQL** (el endpoint nuevo solo lee). **Requiere OTA** (cambios de móvil JS) — publicar tras mergear, verificando el runtime android `784872cb` ([[ota-fingerprint-gotcha]], [[ota-always-publish]]).
- **Deploy backend**: el endpoint nuevo entra con el auto-deploy a la Pi al mergear a `main`.
- **La costura** ([[testear-la-costura]]): los tests de `coverageData`/`coverageEvolution` corren el camino real (meals→PerDayNutrients→coveragePeriod), no solo la matemática pura.
- **Follow-up** (spec §10): que el agente IA lea el mismo `coveragePeriod` para comentar en prosa; y la Idea 1 (reservas de liposolubles) como sesión aparte.
```
