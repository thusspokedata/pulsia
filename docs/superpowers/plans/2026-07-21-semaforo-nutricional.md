# Semáforo nutricional del catálogo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el catálogo de alimentos muestre de un vistazo qué alimentos son altos en grasa, saturadas, azúcar, sal o colesterol —y cuáles son buena fuente de fibra— con chips de color, y que se pueda pedir "mostrame los altos en colesterol".

**Architecture:** Una capa pura en `shared/` decide el nivel de cada nutriente contra umbrales oficiales (FSA por 100 g/ml para los cuatro del etiquetado frontal, FDA %DV para colesterol y fibra) y lo traduce a un *sentiment* que ya incorpora la dirección (la fibra es piso, el resto son techos). La UI móvil pinta lo que esa capa devuelve y nunca conoce un umbral. Cero migración, cero backend, cero dependencia nativa → se entrega por OTA.

**Tech Stack:** TypeScript, Zod (schemas existentes), `bun test` en `shared/`, jest + `@testing-library/react-native` en `mobile/`, React Native / Expo.

**Spec:** `docs/superpowers/specs/2026-07-21-semaforo-nutricional-design.md`

---

## Convenciones del repo que aplican a TODAS las tareas

- **TDD estricto**: el test se escribe primero, se lo corre y se lo ve fallar, recién ahí se implementa.
- **Verificación por mutación de cada test nuevo**: después de que el test pase, romper a propósito la línea de producción que cubre y confirmar que el test se queja. Devolver el código a su estado bueno. En este repo aparecieron 27 tests falsos en una auditoría y 3 más en la feature anterior; un test verde no prueba nada por sí solo.
- **Commits firmados**: `git commit -S`. **Nunca** agregar `Co-Authored-By` ni ninguna atribución a Claude/Anthropic.
- Tests de mobile van en `mobile/__tests__/`, **nunca** en `mobile/app/`.
- Correr jest con `--runInBand` (en paralelo da timeouts flaky).
- En `mobile/` no se importa `zod` directo; se usan los tipos de `@pulsia/shared`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `shared/src/nutrition/nutrientLevel.ts` (crear) | Umbrales + juzgar un alimento: `nutrientLevel`, `nutrientSentiment`, `foodFlags` |
| `shared/src/nutrition/nutrientLevel.test.ts` (crear) | Tests de la anterior |
| `shared/src/nutrition/nutrientFilter.ts` (crear) | Consultar una lista: `filterFoodsByNutrient` |
| `shared/src/nutrition/nutrientFilter.test.ts` (crear) | Tests de la anterior |
| `shared/src/index.ts` (modificar) | Exportar los dos módulos nuevos |
| `mobile/src/nutrition/nutrientText.ts` (crear) | Textos en español: etiquetas, frases de chip, resumen de faltantes |
| `mobile/src/nutrition/NutrientFlags.tsx` (crear) | Componente, variantes `compact` y `full` |
| `mobile/__tests__/nutrient-flags.test.tsx` (crear) | Tests del componente y de los textos |
| `mobile/app/nutricion/catalogo.tsx` (modificar) | Chips por fila + fila de filtro |
| `mobile/app/nutricion/nueva-comida.tsx` (modificar) | Chips en el buscador de alimentos |
| `mobile/app/nutricion/agregar-alimento.tsx` (modificar) | Variante `full` en modo edición |

Se separan `nutrientLevel` y `nutrientFilter` porque son responsabilidades distintas: una juzga **un** alimento, la otra consulta **una lista**. El componente no lleva los textos adentro para poder testear las frases sin renderizar.

---

### Task 1: Umbrales y `nutrientLevel`

**Files:**
- Create: `shared/src/nutrition/nutrientLevel.ts`
- Test: `shared/src/nutrition/nutrientLevel.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `shared/src/nutrition/nutrientLevel.test.ts`:

```ts
import { test, expect } from "bun:test";
import { nutrientLevel, FLAGGED_NUTRIENTS } from "./nutrientLevel";

test("FSA sólidos: los bordes exactos caen del lado documentado", () => {
  // bajo usa <=, alto usa > → 5,0 es bajo y 22,5 es medio, no alto
  expect(nutrientLevel("sugars_g", 5.0, "per_100g")).toBe("low");
  expect(nutrientLevel("sugars_g", 5.01, "per_100g")).toBe("medium");
  expect(nutrientLevel("sugars_g", 22.5, "per_100g")).toBe("medium");
  expect(nutrientLevel("sugars_g", 22.6, "per_100g")).toBe("high");

  expect(nutrientLevel("fat_g", 3.0, "per_100g")).toBe("low");
  expect(nutrientLevel("fat_g", 17.5, "per_100g")).toBe("medium");
  expect(nutrientLevel("fat_g", 17.6, "per_100g")).toBe("high");

  expect(nutrientLevel("saturated_fat_g", 1.5, "per_100g")).toBe("low");
  expect(nutrientLevel("saturated_fat_g", 5.1, "per_100g")).toBe("high");

  expect(nutrientLevel("salt_g", 0.3, "per_100g")).toBe("low");
  expect(nutrientLevel("salt_g", 1.6, "per_100g")).toBe("high");
});

test("bebidas usan la escala reducida: el MISMO número da otro nivel", () => {
  // 10 g de azúcar por 100: medio en un sólido, alto en una bebida
  expect(nutrientLevel("sugars_g", 10, "per_100g")).toBe("medium");
  expect(nutrientLevel("sugars_g", 10, "per_100ml")).toBe("low");
  expect(nutrientLevel("sugars_g", 11.3, "per_100ml")).toBe("high");
  expect(nutrientLevel("sugars_g", 2.5, "per_100ml")).toBe("low");

  expect(nutrientLevel("fat_g", 8.8, "per_100ml")).toBe("high");
  expect(nutrientLevel("fat_g", 8.8, "per_100g")).toBe("medium");
  expect(nutrientLevel("salt_g", 0.8, "per_100ml")).toBe("high");
  expect(nutrientLevel("salt_g", 0.8, "per_100g")).toBe("medium");
});

test("colesterol (FDA): el umbral alto es INCLUSIVO, al revés que el FSA", () => {
  expect(nutrientLevel("cholesterol_mg", 20, "per_100g")).toBe("low");
  expect(nutrientLevel("cholesterol_mg", 21, "per_100g")).toBe("medium");
  expect(nutrientLevel("cholesterol_mg", 60, "per_100g")).toBe("high");
  expect(nutrientLevel("cholesterol_mg", 59.9, "per_100g")).toBe("medium");
});

test("colesterol y fibra NO cambian con el basis (la FDA no tiene escala de bebidas)", () => {
  expect(nutrientLevel("cholesterol_mg", 60, "per_100ml")).toBe("high");
  expect(nutrientLevel("fiber_g", 5.6, "per_100ml")).toBe("high");
});

test("fibra: el bajo usa < porque acá pasarse es lo bueno", () => {
  expect(nutrientLevel("fiber_g", 2.79, "per_100g")).toBe("low");
  expect(nutrientLevel("fiber_g", 2.8, "per_100g")).toBe("medium");
  expect(nutrientLevel("fiber_g", 5.6, "per_100g")).toBe("high");
});

test("sin dato → unknown, JAMÁS low", () => {
  for (const n of FLAGGED_NUTRIENTS) {
    expect(nutrientLevel(n, null, "per_100g")).toBe("unknown");
    expect(nutrientLevel(n, undefined, "per_100g")).toBe("unknown");
  }
});

test("un número basura no se cuela como nivel real", () => {
  expect(nutrientLevel("sugars_g", NaN, "per_100g")).toBe("unknown");
  expect(nutrientLevel("sugars_g", Infinity, "per_100g")).toBe("unknown");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test shared/src/nutrition/nutrientLevel.test.ts`
Expected: FAIL — `Cannot find module './nutrientLevel'`

- [ ] **Step 3: Implementar**

Crear `shared/src/nutrition/nutrientLevel.ts`:

```ts
import type { FoodBasis } from "../schemas/nutrition";

// Los seis nutrientes que llevan semáforo. El ORDEN importa: desempata el orden de los chips
// en la UI, así que cambiarlo cambia lo que ve el usuario.
export const FLAGGED_NUTRIENTS = [
  "fat_g",
  "saturated_fat_g",
  "sugars_g",
  "salt_g",
  "cholesterol_mg",
  "fiber_g",
] as const;
export type FlaggedNutrient = (typeof FLAGGED_NUTRIENTS)[number];

export type NutrientLevel = "low" | "medium" | "high" | "unknown";

// Un umbral con sus operadores explícitos, porque los dos esquemas que mezclamos NO usan los
// mismos: el FSA define "alto" como > (22,5 g de azúcar es medio), la FDA como >= (60 mg de
// colesterol ya es alto). Codificarlo acá evita tener que recordarlo en cada comparación.
type Band = {
  low: number;
  high: number;
  lowInclusive: boolean; // true → value <= low es bajo
  highInclusive: boolean; // true → value >= high es alto
};

const FSA: Omit<Band, "low" | "high"> = { lowInclusive: true, highInclusive: false };

// Etiquetado frontal de la FSA/DoH (Reino Unido), por 100 g de alimento sólido.
const FSA_SOLID = {
  fat_g: { low: 3.0, high: 17.5, ...FSA },
  saturated_fat_g: { low: 1.5, high: 5.0, ...FSA },
  sugars_g: { low: 5.0, high: 22.5, ...FSA },
  salt_g: { low: 0.3, high: 1.5, ...FSA },
} as const satisfies Record<string, Band>;

// Misma guía, escala reducida para bebidas, por 100 ml.
const FSA_DRINK = {
  fat_g: { low: 1.5, high: 8.75, ...FSA },
  saturated_fat_g: { low: 0.75, high: 2.5, ...FSA },
  sugars_g: { low: 2.5, high: 11.25, ...FSA },
  salt_g: { low: 0.3, high: 0.75, ...FSA },
} as const satisfies Record<string, Band>;

// El FSA no cubre colesterol ni fibra, así que estos dos salen del %DV de la FDA
// (21 CFR 101.54 y 101.62). No tienen escala de bebidas: los anclajes son por porción de
// referencia, no por volumen, así que el basis no los afecta.
const FDA = {
  // "low cholesterol" = <=20 mg; "alto en" = >=20% del DV de 300 mg = 60 mg.
  cholesterol_mg: { low: 20, high: 60, lowInclusive: true, highInclusive: true },
  // DV de fibra = 28 g. "good source" arranca en 10% (2,8 g), "excellent" en 20% (5,6 g).
  // Es el único PISO del set (ver NUTRIENT_REFERENCE_KIND en references.ts): mucha fibra es
  // bueno. Por eso el bajo usa < en vez de <=.
  fiber_g: { low: 2.8, high: 5.6, lowInclusive: false, highInclusive: true },
} as const satisfies Record<string, Band>;

function bandFor(nutrient: FlaggedNutrient, basis: FoodBasis): Band {
  if (nutrient === "cholesterol_mg" || nutrient === "fiber_g") return FDA[nutrient];
  return basis === "per_100ml" ? FSA_DRINK[nutrient] : FSA_SOLID[nutrient];
}

/**
 * Cuánto hay de un nutriente, contra los umbrales. NO opina sobre si eso es bueno o malo:
 * de eso se ocupa nutrientSentiment, porque la fibra va al revés que el resto.
 *
 * Un valor ausente devuelve "unknown", nunca "low". Los cinco micros son nullable en el
 * schema, y decir "bajo en azúcar" de un alimento cuyo azúcar no conocemos es afirmar algo
 * que no sabemos.
 */
export function nutrientLevel(
  nutrient: FlaggedNutrient,
  value: number | null | undefined,
  basis: FoodBasis,
): NutrientLevel {
  if (value == null || !Number.isFinite(value)) return "unknown";
  const band = bandFor(nutrient, basis);
  const isLow = band.lowInclusive ? value <= band.low : value < band.low;
  if (isLow) return "low";
  const isHigh = band.highInclusive ? value >= band.high : value > band.high;
  return isHigh ? "high" : "medium";
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `bun test shared/src/nutrition/nutrientLevel.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Verificación por mutación**

Hacer estas tres mutaciones de a una, correr el test, confirmar que **falla**, y revertir:

1. En `nutrientLevel`, cambiar `if (value == null || !Number.isFinite(value)) return "unknown";` por `if (value == null) return "unknown";` → debe romper el test de NaN/Infinity.
2. En `FDA.cholesterol_mg`, cambiar `highInclusive: true` por `false` → debe romper el test de colesterol en 60.
3. En `bandFor`, cambiar `basis === "per_100ml"` por `basis === "per_100g"` → debe romper el test de bebidas.

Si alguna mutación NO rompe ningún test, el test correspondiente es falso: arreglarlo antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/nutrientLevel.ts shared/src/nutrition/nutrientLevel.test.ts
git commit -S -m "feat(nutricion): umbrales FSA/FDA y nutrientLevel

Los dos esquemas no usan los mismos operadores (FSA define alto como >,
FDA como >=), así que cada umbral lleva los suyos explícitos en vez de
depender de recordarlo en cada comparación.

Un micro en null da unknown y nunca low."
```

---

### Task 2: `nutrientSentiment` y `foodFlags`

**Files:**
- Modify: `shared/src/nutrition/nutrientLevel.ts`
- Test: `shared/src/nutrition/nutrientLevel.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `shared/src/nutrition/nutrientLevel.test.ts`:

```ts
import { nutrientSentiment, foodFlags } from "./nutrientLevel";

test("la fibra va al REVÉS que el resto: mucha es buena", () => {
  expect(nutrientSentiment("fiber_g", "high")).toBe("good");
  expect(nutrientSentiment("fiber_g", "medium")).toBe("neutral");
  expect(nutrientSentiment("fiber_g", "low")).toBe("neutral");
  // el mismo nivel, en un nutriente techo, es lo contrario
  expect(nutrientSentiment("sugars_g", "high")).toBe("bad");
  expect(nutrientSentiment("sugars_g", "medium")).toBe("warn");
  expect(nutrientSentiment("sugars_g", "low")).toBe("neutral");
});

test("unknown se propaga como sentiment propio, no como neutral", () => {
  expect(nutrientSentiment("sugars_g", "unknown")).toBe("unknown");
  expect(nutrientSentiment("fiber_g", "unknown")).toBe("unknown");
});

const quesoCrema = {
  basis: "per_100g" as const,
  fat_g: 34, saturated_fat_g: 20, sugars_g: 3.2,
  salt_g: 0.8, cholesterol_mg: 101, fiber_g: 0,
};

test("foodFlags ordena por severidad y desempata por el orden de FLAGGED_NUTRIENTS", () => {
  const { notable } = foodFlags(quesoCrema);
  // grasa/saturadas/colesterol son bad; sal es warn; fibra 0 es neutral y no aparece
  expect(notable.map((f) => f.nutrient)).toEqual([
    "fat_g", "saturated_fat_g", "cholesterol_mg", "salt_g",
  ]);
  expect(notable.map((f) => f.sentiment)).toEqual(["bad", "bad", "bad", "warn"]);
});

test("foodFlags separa los sin-dato y NO los mete en notable", () => {
  const almendra = {
    basis: "per_100g" as const,
    fat_g: 50, saturated_fat_g: 3.8, sugars_g: null,
    salt_g: null, cholesterol_mg: 0, fiber_g: 12.5,
  };
  const { notable, unknown } = foodFlags(almendra);
  expect(unknown).toEqual(["sugars_g", "salt_g"]);
  expect(notable.some((f) => f.nutrient === "sugars_g")).toBe(false);
  expect(notable.some((f) => f.nutrient === "salt_g")).toBe(false);
  // la fibra alta sí es notable, y es lo único bueno
  expect(notable.find((f) => f.nutrient === "fiber_g")?.sentiment).toBe("good");
});

test("foodFlags.all trae siempre los seis, en orden fijo", () => {
  const { all } = foodFlags(quesoCrema);
  expect(all.map((f) => f.nutrient)).toEqual([...FLAGGED_NUTRIENTS]);
});

test("un alimento sin nada destacable no genera ningún chip", () => {
  const lechuga = {
    basis: "per_100g" as const,
    fat_g: 0.2, saturated_fat_g: 0, sugars_g: 0.8,
    salt_g: 0.01, cholesterol_mg: 0, fiber_g: 1.3,
  };
  expect(foodFlags(lechuga).notable).toEqual([]);
  expect(foodFlags(lechuga).unknown).toEqual([]);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test shared/src/nutrition/nutrientLevel.test.ts`
Expected: FAIL — `nutrientSentiment is not a function`

- [ ] **Step 3: Implementar**

Agregar a `shared/src/nutrition/nutrientLevel.ts`:

```ts
export type NutrientSentiment = "bad" | "warn" | "good" | "neutral" | "unknown";

/**
 * Si el nivel medido es bueno o malo. Acá —y solo acá— vive la dirección de cada nutriente,
 * espejando el NUTRIENT_REFERENCE_KIND de references.ts: la fibra es piso, los otros cinco son
 * techos. Sin esta separación, la UI tendría que saber que la fibra va al revés.
 */
export function nutrientSentiment(
  nutrient: FlaggedNutrient,
  level: NutrientLevel,
): NutrientSentiment {
  if (level === "unknown") return "unknown";
  if (nutrient === "fiber_g") return level === "high" ? "good" : "neutral";
  if (level === "high") return "bad";
  if (level === "medium") return "warn";
  return "neutral";
}

export type NutrientFlag = {
  nutrient: FlaggedNutrient;
  level: NutrientLevel;
  sentiment: NutrientSentiment;
  value: number | null;
};

export type FoodFlags = {
  /** bad | warn | good, ordenados por severidad. Lo que la UI pinta como chips. */
  notable: NutrientFlag[];
  /** Los que no tienen dato. Se muestran aparte: "no sé" no es "está bajo". */
  unknown: FlaggedNutrient[];
  /** Los seis, en orden fijo. Para la vista de detalle. */
  all: NutrientFlag[];
};

// Lo mínimo que hace falta para juzgar un alimento. Un Food lo satisface, pero pedir solo esto
// permite testear sin construir un Food entero con id, userId y timestamps.
export type FoodFlagsInput = {
  basis: FoodBasis;
  fat_g: number;
  saturated_fat_g?: number | null;
  sugars_g?: number | null;
  salt_g?: number | null;
  cholesterol_mg?: number | null;
  fiber_g?: number | null;
};

const SENTIMENT_RANK: Record<NutrientSentiment, number> = {
  bad: 0,
  warn: 1,
  good: 2,
  neutral: 3,
  unknown: 4,
};

export function foodFlags(food: FoodFlagsInput): FoodFlags {
  const all: NutrientFlag[] = FLAGGED_NUTRIENTS.map((nutrient) => {
    const raw = food[nutrient];
    const value = typeof raw === "number" ? raw : null;
    const level = nutrientLevel(nutrient, value, food.basis);
    return { nutrient, level, sentiment: nutrientSentiment(nutrient, level), value };
  });

  const rankOf = (n: FlaggedNutrient) => FLAGGED_NUTRIENTS.indexOf(n);
  const notable = all
    .filter((f) => f.sentiment === "bad" || f.sentiment === "warn" || f.sentiment === "good")
    // Orden determinista: primero por severidad, y los empates por el orden de la tabla.
    // Sin el desempate explícito quedaría a merced de cómo el motor ordena empates.
    .sort(
      (a, b) =>
        SENTIMENT_RANK[a.sentiment] - SENTIMENT_RANK[b.sentiment] ||
        rankOf(a.nutrient) - rankOf(b.nutrient),
    );

  const unknown = all.filter((f) => f.level === "unknown").map((f) => f.nutrient);

  return { notable, unknown, all };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `bun test shared/src/nutrition/nutrientLevel.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 5: Verificación por mutación**

De a una, revirtiendo cada vez:

1. En `nutrientSentiment`, borrar la línea `if (nutrient === "fiber_g") …` → debe romper el test de la fibra.
2. En `foodFlags`, borrar el desempate `|| rankOf(a.nutrient) - rankOf(b.nutrient)` → **si ningún test rompe, el test de orden es falso**: significa que el orden de entrada ya coincidía con el esperado. Arreglarlo construyendo un alimento cuyos empates estén desordenados respecto de `FLAGGED_NUTRIENTS`.
3. En `foodFlags`, cambiar el filtro de `notable` para que incluya `"unknown"` → debe romper el test de la almendra.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/nutrientLevel.ts shared/src/nutrition/nutrientLevel.test.ts
git commit -S -m "feat(nutricion): sentiment por nutriente y foodFlags

Separa medir de juzgar: nutrientSentiment es el único lugar que sabe que
la fibra es piso y los otros cinco son techos, así que la UI pinta por
sentiment sin preguntar qué nutriente le tocó.

Los sin-dato salen por unknown, no por notable."
```

---

### Task 3: `filterFoodsByNutrient`

**Files:**
- Create: `shared/src/nutrition/nutrientFilter.ts`
- Test: `shared/src/nutrition/nutrientFilter.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `shared/src/nutrition/nutrientFilter.test.ts`:

```ts
import { test, expect } from "bun:test";
import { filterFoodsByNutrient } from "./nutrientFilter";

const food = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  basis: "per_100g" as const,
  fat_g: 0, saturated_fat_g: 0, sugars_g: 0,
  salt_g: 0, cholesterol_mg: 0, fiber_g: 0,
  ...over,
});

test("filtra a los altos y ordena de mayor a menor", () => {
  const foods = [
    food("manzana", { sugars_g: 10 }),      // medio → fuera
    food("pasas", { sugars_g: 59 }),        // alto
    food("dulce de leche", { sugars_g: 55 }), // alto
    food("lechuga", { sugars_g: 0.8 }),     // bajo → fuera
  ];
  const { matches } = filterFoodsByNutrient(foods, "sugars_g");
  expect(matches.map((f) => f.name)).toEqual(["pasas", "dulce de leche"]);
});

test("los SIN DATO van aparte, nunca se descartan en silencio", () => {
  const foods = [
    food("queso crema", { cholesterol_mg: 101 }),
    food("almendra", { cholesterol_mg: null }),
    food("lechuga", { cholesterol_mg: 0 }),
  ];
  const { matches, unknown } = filterFoodsByNutrient(foods, "cholesterol_mg");
  expect(matches.map((f) => f.name)).toEqual(["queso crema"]);
  expect(unknown.map((f) => f.name)).toEqual(["almendra"]);
  // el que no tiene dato NO se cuela entre los altos, pero tampoco desaparece
  expect(matches.some((f) => f.name === "almendra")).toBe(false);
});

test("la fibra filtra por BUENA fuente, no por alta-mala", () => {
  const foods = [
    food("lentejas", { fiber_g: 7.9 }),
    food("pan blanco", { fiber_g: 2.1 }),
    food("salvado", { fiber_g: 43 }),
  ];
  const { matches } = filterFoodsByNutrient(foods, "fiber_g");
  expect(matches.map((f) => f.name)).toEqual(["salvado", "lentejas"]);
});

test("respeta el basis al decidir qué es alto", () => {
  const foods = [
    { ...food("gaseosa"), basis: "per_100ml" as const, sugars_g: 11.5 }, // alto en bebida
    food("yogur", { sugars_g: 11.5 }), // el MISMO número, medio en sólido
  ];
  const { matches } = filterFoodsByNutrient(foods, "sugars_g");
  expect(matches.map((f) => f.name)).toEqual(["gaseosa"]);
});

test("lista vacía no explota", () => {
  expect(filterFoodsByNutrient([], "sugars_g")).toEqual({ matches: [], unknown: [] });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bun test shared/src/nutrition/nutrientFilter.test.ts`
Expected: FAIL — `Cannot find module './nutrientFilter'`

- [ ] **Step 3: Implementar**

Crear `shared/src/nutrition/nutrientFilter.ts`:

```ts
import {
  nutrientLevel,
  nutrientSentiment,
  type FlaggedNutrient,
  type FoodFlagsInput,
} from "./nutrientLevel";

export type NutrientFilterResult<T> = {
  /** Los que califican, de mayor a menor valor. */
  matches: T[];
  /** Los que no tienen el dato cargado. Se muestran aparte, nunca se descartan. */
  unknown: T[];
};

/**
 * "Mostrame los altos en X". Para la fibra, que es piso, "califica" significa buena fuente.
 *
 * Los alimentos sin el dato salen por `unknown` en vez de quedar afuera: si desaparecieran,
 * la lista estaría afirmando que no son altos, y no lo sabe.
 */
export function filterFoodsByNutrient<T extends FoodFlagsInput>(
  foods: readonly T[],
  nutrient: FlaggedNutrient,
): NutrientFilterResult<T> {
  const wanted = nutrient === "fiber_g" ? "good" : "bad";
  const scored: Array<{ food: T; value: number }> = [];
  const unknown: T[] = [];

  for (const food of foods) {
    const raw = food[nutrient];
    const value = typeof raw === "number" ? raw : null;
    const level = nutrientLevel(nutrient, value, food.basis);
    if (level === "unknown") {
      unknown.push(food);
      continue;
    }
    if (nutrientSentiment(nutrient, level) === wanted) {
      scored.push({ food, value: value as number });
    }
  }

  scored.sort((a, b) => b.value - a.value);
  return { matches: scored.map((s) => s.food), unknown };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `bun test shared/src/nutrition/nutrientFilter.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Verificación por mutación**

De a una, revirtiendo:

1. Cambiar `unknown.push(food); continue;` por solo `continue;` → debe romper el test de los sin-dato.
2. Cambiar `wanted` a la constante `"bad"` fija → debe romper el test de la fibra.
3. Cambiar `scored.sort((a, b) => b.value - a.value)` por `a.value - b.value` → debe romper el test de orden.

- [ ] **Step 6: Exportar desde el índice de shared**

En `shared/src/index.ts`, agregar junto a las otras líneas de `./nutrition/`:

```ts
export * from "./nutrition/nutrientLevel";
export * from "./nutrition/nutrientFilter";
```

- [ ] **Step 7: Correr la suite entera de shared**

Run: `bun test shared`
Expected: PASS, sin regresiones

- [ ] **Step 8: Commit**

```bash
git add shared/src/nutrition/nutrientFilter.ts shared/src/nutrition/nutrientFilter.test.ts shared/src/index.ts
git commit -S -m "feat(nutricion): filtro de alimentos por nutriente

Los alimentos sin el dato cargado salen por unknown en vez de quedar
afuera del resultado: si desaparecieran, la lista estaría afirmando que
no son altos en ese nutriente sin saberlo."
```

---

### Task 4: Textos en español

**Files:**
- Create: `mobile/src/nutrition/nutrientText.ts`
- Test: `mobile/__tests__/nutrient-flags.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `mobile/__tests__/nutrient-flags.test.tsx`:

```tsx
import { flagText, unknownLabel, NUTRIENT_LABELS } from "../src/nutrition/nutrientText";
import { FLAGGED_NUTRIENTS, foodFlags } from "@pulsia/shared";

test("cada flag destacable tiene una frase, ninguna queda vacía", () => {
  // Un alimento que dispara bad en los cinco techos y good en la fibra
  const todoAlto = {
    basis: "per_100g" as const,
    fat_g: 99, saturated_fat_g: 99, sugars_g: 99,
    salt_g: 99, cholesterol_mg: 999, fiber_g: 99,
  };
  for (const f of foodFlags(todoAlto).notable) {
    expect(flagText(f.nutrient, f.sentiment)).toBeTruthy();
  }
  // Y lo mismo para el escalón intermedio
  const todoMedio = {
    basis: "per_100g" as const,
    fat_g: 10, saturated_fat_g: 3, sugars_g: 10,
    salt_g: 1, cholesterol_mg: 40, fiber_g: 0,
  };
  for (const f of foodFlags(todoMedio).notable) {
    expect(flagText(f.nutrient, f.sentiment)).toBeTruthy();
  }
});

test("las frases concuerdan en género y número", () => {
  expect(flagText("fat_g", "bad")).toBe("grasa alta");
  expect(flagText("saturated_fat_g", "bad")).toBe("saturadas altas");
  expect(flagText("sugars_g", "bad")).toBe("azúcar alto");
  expect(flagText("salt_g", "bad")).toBe("sal alta");
  expect(flagText("cholesterol_mg", "bad")).toBe("colesterol alto");
  expect(flagText("fiber_g", "good")).toBe("buena fibra");
});

test("el nivel va ESCRITO, no solo en el color", () => {
  // Un daltónico tiene que poder distinguir alto de medio sin ver el color
  for (const n of ["fat_g", "sugars_g", "salt_g", "cholesterol_mg"] as const) {
    expect(flagText(n, "bad")).not.toBe(flagText(n, "warn"));
  }
});

test("el aviso de faltantes nombra hasta dos y después resume", () => {
  expect(unknownLabel([])).toBeNull();
  expect(unknownLabel(["sugars_g"])).toBe("sin datos de azúcar");
  expect(unknownLabel(["sugars_g", "salt_g"])).toBe("sin datos de azúcar y sal");
  expect(unknownLabel(["sugars_g", "salt_g", "fiber_g"])).toBe("sin datos de 3 nutrientes");
});

test("hay etiqueta para los seis nutrientes", () => {
  for (const n of FLAGGED_NUTRIENTS) expect(NUTRIENT_LABELS[n]).toBeTruthy();
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && npm test -- --runInBand nutrient-flags`
Expected: FAIL — no se puede resolver `../src/nutrition/nutrientText`

- [ ] **Step 3: Implementar**

Crear `mobile/src/nutrition/nutrientText.ts`:

```ts
import type { FlaggedNutrient, NutrientSentiment } from "@pulsia/shared";

export const NUTRIENT_LABELS: Record<FlaggedNutrient, string> = {
  fat_g: "grasa",
  saturated_fat_g: "saturadas",
  sugars_g: "azúcar",
  salt_g: "sal",
  cholesterol_mg: "colesterol",
  fiber_g: "fibra",
};

// Las frases se escriben enteras en vez de componer `${etiqueta} ${nivel}` porque el español
// concuerda en género y número: "grasa alta" pero "azúcar alto" y "saturadas altas". Componer
// mecánicamente produciría "grasa alto".
//
// El nivel va en el TEXTO, no solo en el color: quien no distingue rojo de ámbar tiene que
// poder leer la diferencia.
const FLAG_TEXT: Record<FlaggedNutrient, Partial<Record<NutrientSentiment, string>>> = {
  fat_g: { bad: "grasa alta", warn: "grasa media" },
  saturated_fat_g: { bad: "saturadas altas", warn: "saturadas medias" },
  sugars_g: { bad: "azúcar alto", warn: "azúcar medio" },
  salt_g: { bad: "sal alta", warn: "sal media" },
  cholesterol_mg: { bad: "colesterol alto", warn: "colesterol medio" },
  fiber_g: { good: "buena fibra" },
};

/** Texto del chip. Devuelve null para las combinaciones que no se muestran (neutral, unknown). */
export function flagText(nutrient: FlaggedNutrient, sentiment: NutrientSentiment): string | null {
  return FLAG_TEXT[nutrient][sentiment] ?? null;
}

/**
 * Aviso de datos faltantes. Nombra hasta dos nutrientes; a partir del tercero resume, porque el
 * chip entra en una fila de lista y una enumeración de cinco la desborda.
 */
export function unknownLabel(unknown: readonly FlaggedNutrient[]): string | null {
  if (unknown.length === 0) return null;
  if (unknown.length === 1) return `sin datos de ${NUTRIENT_LABELS[unknown[0]!]}`;
  if (unknown.length === 2) {
    return `sin datos de ${NUTRIENT_LABELS[unknown[0]!]} y ${NUTRIENT_LABELS[unknown[1]!]}`;
  }
  return `sin datos de ${unknown.length} nutrientes`;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand nutrient-flags`
Expected: PASS, 5 tests

- [ ] **Step 5: Verificación por mutación**

De a una, revirtiendo:

1. En `FLAG_TEXT.sugars_g`, borrar la clave `warn` → debe romper el test de "cada flag tiene frase".
2. En `FLAG_TEXT.fat_g`, poner `warn: "grasa alta"` (igual que `bad`) → debe romper el test del nivel escrito.
3. En `unknownLabel`, cambiar `unknown.length === 2` por `>= 2` → debe romper el test del resumen.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/nutrition/nutrientText.ts mobile/__tests__/nutrient-flags.test.tsx
git commit -S -m "feat(nutricion): textos en español del semáforo

Las frases van enteras y no compuestas porque el español concuerda en
género: sería 'grasa alto'. El nivel va escrito además del color, para
que no dependa de distinguir rojo de ámbar."
```

---

### Task 5: Componente `NutrientFlags`

**Files:**
- Create: `mobile/src/nutrition/NutrientFlags.tsx`
- Modify: `mobile/__tests__/nutrient-flags.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `mobile/__tests__/nutrient-flags.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import { NutrientFlags } from "../src/nutrition/NutrientFlags";

const quesoCrema = {
  basis: "per_100g" as const,
  fat_g: 34, saturated_fat_g: 20, sugars_g: 3.2,
  salt_g: 0.8, cholesterol_mg: 101, fiber_g: 0,
};

test("compact capa en 3 chips y avisa cuántos quedaron afuera", () => {
  const { getByText, queryByText } = render(<NutrientFlags food={quesoCrema} />);
  getByText("grasa alta");
  getByText("saturadas altas");
  getByText("colesterol alto");
  expect(queryByText("sal media")).toBeNull(); // el cuarto no entra
  getByText("+1");
});

test("un alimento sin dato de azúcar NO dice que es bajo ni lo pinta verde", () => {
  const almendra = {
    basis: "per_100g" as const,
    fat_g: 50, saturated_fat_g: 3.8, sugars_g: null,
    salt_g: null, cholesterol_mg: 0, fiber_g: 12.5,
  };
  const { getByText, queryByText } = render(<NutrientFlags food={almendra} />);
  expect(queryByText(/azúcar/)).toBeNull();
  getByText("sin datos de azúcar y sal");
});

test("el aviso de faltantes NO compite por el cap de 3 chips", () => {
  // tres alarmas + datos faltantes: el aviso tiene que sobrevivir igual
  const conTodo = { ...quesoCrema, sugars_g: null, salt_g: null };
  const { getByText } = render(<NutrientFlags food={conTodo} />);
  getByText("grasa alta");
  getByText("saturadas altas");
  getByText("colesterol alto");
  getByText("sin datos de azúcar y sal");
});

test("un alimento sin nada destacable no renderiza chips", () => {
  const lechuga = {
    basis: "per_100g" as const,
    fat_g: 0.2, saturated_fat_g: 0, sugars_g: 0.8,
    salt_g: 0.01, cholesterol_mg: 0, fiber_g: 1.3,
  };
  const { queryByTestId } = render(<NutrientFlags food={lechuga} />);
  expect(queryByTestId("nutrient-flags")).toBeNull();
});

test("full muestra los seis con su valor, incluidos los que están bien", () => {
  const { getByText } = render(<NutrientFlags food={quesoCrema} variant="full" />);
  getByText("grasa");
  getByText("azúcar");
  getByText("fibra");
  getByText(/101/); // el valor del colesterol
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && npm test -- --runInBand nutrient-flags`
Expected: FAIL — no se puede resolver `../src/nutrition/NutrientFlags`

- [ ] **Step 3: Implementar**

Crear `mobile/src/nutrition/NutrientFlags.tsx`:

```tsx
import { View, Text } from "react-native";
import { foodFlags, type FoodFlagsInput, type NutrientSentiment } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";
import { NUTRIENT_LABELS, flagText, unknownLabel } from "./nutrientText";

// Máximo de chips en una fila de lista. Más que esto y la fila se convierte en un párrafo.
const MAX_CHIPS = 3;

// Reusa los tokens semánticos existentes. `danger` está documentado como "rojo semántico
// (errores)" y que un alimento tenga azúcar no es un error, pero es la lectura universal de un
// semáforo y evita tocar la identidad visual, que el owner se reservó decidir. Si algún día se
// agrega un rojo propio menos agresivo, se cambia acá y en ningún otro lado.
const CHIP_STYLE: Record<string, { bg: string; fg: string }> = {
  bad: { bg: "#FBEAE7", fg: colors.danger },
  warn: { bg: "#FBF0E2", fg: colors.warning },
  good: { bg: colors.successSoft, fg: colors.successText },
  unknown: { bg: colors.surfaceMuted, fg: colors.textMuted },
};

function Chip({ text, sentiment }: { text: string; sentiment: NutrientSentiment }) {
  // neutral no tiene estilo propio porque nunca se renderiza como chip; cae al gris por el ??
  const s = CHIP_STYLE[sentiment] ?? CHIP_STYLE.unknown!;
  return (
    <View
      testID={`nutrient-chip-${sentiment}`}
      style={{
        backgroundColor: s.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: s.fg, fontSize: 11, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function NutrientFlags({
  food,
  variant = "compact",
}: {
  food: FoodFlagsInput;
  variant?: "compact" | "full";
}) {
  const flags = foodFlags(food);

  if (variant === "full") {
    return (
      <View testID="nutrient-flags-full" style={{ gap: spacing.xs }}>
        {flags.all.map((f) => (
          <View
            key={f.nutrient}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {NUTRIENT_LABELS[f.nutrient]}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {f.value == null ? "sin dato" : `${f.value}${f.nutrient === "cholesterol_mg" ? " mg" : " g"}`}
              </Text>
              <Chip
                text={flagText(f.nutrient, f.sentiment) ?? (f.level === "unknown" ? "sin dato" : "ok")}
                sentiment={f.sentiment}
              />
            </View>
          </View>
        ))}
        <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: spacing.xs }}>
          Umbrales por 100 {food.basis === "per_100ml" ? "ml" : "g"} · grasa, saturadas, azúcar y
          sal según FSA (Reino Unido); colesterol y fibra según %DV de la FDA.
        </Text>
      </View>
    );
  }

  const shown = flags.notable.slice(0, MAX_CHIPS);
  const extra = flags.notable.length - shown.length;
  const missing = unknownLabel(flags.unknown);
  if (shown.length === 0 && !missing) return null;

  return (
    <View
      testID="nutrient-flags"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}
    >
      {shown.map((f) => {
        const text = flagText(f.nutrient, f.sentiment);
        return text ? <Chip key={f.nutrient} text={text} sentiment={f.sentiment} /> : null;
      })}
      {extra > 0 && <Chip text={`+${extra}`} sentiment="unknown" />}
      {/* El aviso de faltantes va aparte del cap: el cap ordena por severidad, así que si
          compitiera, un alimento con tres alarmas escondería que además hay datos que no tenemos. */}
      {missing && <Chip text={missing} sentiment="unknown" />}
    </View>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand nutrient-flags`
Expected: PASS, 10 tests

- [ ] **Step 5: Verificación por mutación**

De a una, revirtiendo:

1. Cambiar `MAX_CHIPS` a `10` → debe romper el test del cap.
2. Mover el chip de faltantes adentro del `slice(0, MAX_CHIPS)` (o sea, concatenarlo a `notable` antes de cortar) → debe romper el test de "no compite por el cap".
3. En `NutrientFlags`, borrar `if (shown.length === 0 && !missing) return null;` → debe romper el test de la lechuga.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/nutrition/NutrientFlags.tsx mobile/__tests__/nutrient-flags.test.tsx
git commit -S -m "feat(nutricion): componente NutrientFlags

Dos variantes sobre la misma capa pura: chips capados para las listas y
el detalle completo con umbrales y fuente.

El aviso de datos faltantes va aparte del cap de chips, porque el cap
ordena por severidad y si compitiera, un alimento con tres alarmas
escondería que además hay datos que no tenemos."
```

---

### Task 6: Cablear los chips en el catálogo y en el armado de comida

**Files:**
- Modify: `mobile/app/nutricion/catalogo.tsx:57-64`
- Modify: `mobile/app/nutricion/nueva-comida.tsx` (la lista de resultados, alrededor de la línea 163)
- Test: `mobile/__tests__/catalogo-semaforo.test.tsx` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `mobile/__tests__/catalogo-semaforo.test.tsx`. Mockear el API y `expo-router` siguiendo el patrón de los tests existentes de nutrición (revisar `mobile/__tests__/` para copiar el estilo exacto de mocks del repo antes de escribir):

```tsx
import { render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => cb(),
}));

const mockFoods = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Pasas de uva", basis: "per_100g", source: "estimate",
    kcal: 299, protein_g: 3, carbs_g: 79, fat_g: 0.5,
    sugars_g: 59, fiber_g: 3.7, saturated_fat_g: 0.06, salt_g: 0.03,
    cholesterol_mg: 0, unitWeightG: null,
  },
];

jest.mock("../src/api/nutrition", () => ({
  listFoods: jest.fn(async () => mockFoods),
  deleteFood: jest.fn(),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));

import CatalogoScreen from "../app/nutricion/catalogo";

test("el catálogo marca el azúcar alto de las pasas", async () => {
  const { getByText } = render(<CatalogoScreen />);
  await waitFor(() => getByText("Pasas de uva"));
  getByText("azúcar alto");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && npm test -- --runInBand catalogo-semaforo`
Expected: FAIL — `Unable to find an element with text: azúcar alto`

- [ ] **Step 3: Implementar en el catálogo**

En `mobile/app/nutricion/catalogo.tsx`, importar el componente:

```tsx
import { NutrientFlags } from "../../src/nutrition/NutrientFlags";
```

y agregarlo justo después del `<Text>` de macros que termina en la línea 64, dentro del mismo `<Pressable>`:

```tsx
            <NutrientFlags food={f} />
```

**Al mismo tiempo, borrar del `<Text>` de macros las cuatro interpolaciones de micros sueltos**
(`· azúc …`, `· fibra …`, `· sat …`, `· sal …`, líneas 59-62). Son exactamente lo que los chips
reemplazan; dejar las dos cosas sería decir lo mismo dos veces en la misma fila. La línea conserva
las kcal, los macros y el peso por unidad.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand catalogo-semaforo`
Expected: PASS

- [ ] **Step 5: Implementar en el armado de comida**

En `mobile/app/nutricion/nueva-comida.tsx`, importar igual y agregar `<NutrientFlags food={f} />` dentro de la fila de cada resultado del buscador (la que hoy renderiza `+ {f.name}` alrededor de la línea 163). Envolver el contenido de esa fila en un `<View>` si hoy es solo un `<Text>`, para que los chips queden debajo del nombre y no al lado.

- [ ] **Step 6: Agregar el test de esa pantalla**

Agregar a `mobile/__tests__/catalogo-semaforo.test.tsx` un test equivalente que renderice la pantalla de nueva comida, escriba en el buscador y verifique que aparece `azúcar alto` junto al resultado. Copiar el estilo de mocks de los tests existentes de `nueva-comida` si los hay.

- [ ] **Step 7: Correr la suite entera de mobile**

Run: `cd mobile && npm test -- --runInBand`
Expected: PASS, sin regresiones (la suite estaba en ~522 tests)

- [ ] **Step 8: Verificación por mutación**

Borrar la línea `<NutrientFlags food={f} />` del catálogo → el test de catálogo debe fallar. Restaurar. Repetir para nueva-comida.

- [ ] **Step 9: Commit**

```bash
git add mobile/app/nutricion/catalogo.tsx mobile/app/nutricion/nueva-comida.tsx mobile/__tests__/catalogo-semaforo.test.tsx
git commit -S -m "feat(nutricion): chips de semáforo en el catálogo y al armar la comida

El buscador de nueva-comida es el momento real de decisión: si el
semáforo viviera solo en el catálogo, llegaría tarde."
```

---

### Task 7: Variante `full` en el detalle del alimento

**Files:**
- Modify: `mobile/app/nutricion/agregar-alimento.tsx`
- Test: `mobile/__tests__/nutrient-flags.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `mobile/__tests__/alimento-detalle.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ foodId: "11111111-1111-4111-8111-111111111111" }),
}));

jest.mock("../src/api/nutrition", () => ({
  getFood: jest.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Queso crema", basis: "per_100g", source: "estimate",
    kcal: 350, protein_g: 6, carbs_g: 4, fat_g: 34,
    saturated_fat_g: 20, sugars_g: 3.2, fiber_g: 0, salt_g: 0.8,
    cholesterol_mg: 101, water_ml: null, unitWeightG: null,
  })),
  updateFood: jest.fn(), createFood: jest.fn(), describeFood: jest.fn(),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));

import AgregarAlimentoScreen from "../app/nutricion/agregar-alimento";

test("el detalle del alimento muestra los umbrales y de dónde salen", async () => {
  const { getByText } = render(<AgregarAlimentoScreen />);
  await waitFor(() => getByText(/Umbrales por 100 g/));
  getByText(/FSA/);
  getByText(/FDA/);
});

test("el detalle marca el colesterol alto del queso crema", async () => {
  const { getByText } = render(<AgregarAlimentoScreen />);
  await waitFor(() => getByText(/Umbrales por 100 g/));
  getByText("colesterol alto");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && npm test -- --runInBand alimento-detalle`
Expected: FAIL — `Unable to find an element with text: /Umbrales por 100 g/`

- [ ] **Step 3: Subir `num` y `optNum` a scope de módulo**

Hoy viven dentro de `save()` (líneas 110-111) y el render también los necesita. Sacarlos del cuerpo de `save()` y ponerlos arriba, junto a `EMPTY` (línea 18):

```ts
const num = (s: string) => Number(s.replace(",", "."));
const optNum = (s: string) => (s.trim() === "" ? null : num(s));
```

Borrar las dos declaraciones locales de `save()`; el resto de la función queda igual porque las
referencias siguen resolviendo.

Run: `cd mobile && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Implementar la sección**

Importar arriba:

```tsx
import { NutrientFlags } from "../../src/nutrition/NutrientFlags";
```

Y agregar después del bloque de sodio que termina en la línea 223 (o sea, después del último campo
de micros y antes del botón de guardar):

```tsx
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>Semáforo nutricional</Text>
        <NutrientFlags
          variant="full"
          food={{
            basis: form.basis,
            fat_g: num(form.fat_g),
            saturated_fat_g: optNum(form.saturated_fat_g),
            sugars_g: optNum(form.sugars_g),
            salt_g: optNum(form.salt_g),
            cholesterol_mg: optNum(form.cholesterol_mg),
            fiber_g: optNum(form.fiber_g),
          }}
        />
      </View>
```

Un campo vacío da `null` (→ "sin dato"), y uno con texto inválido da `NaN`, que la capa pura ya
trata como `unknown`. Los dos casos se ven, ninguno miente diciendo "bajo".

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand alimento-detalle`
Expected: PASS, 2 tests

Run: `cd mobile && npm test -- --runInBand nutrient-flags`
Expected: PASS

- [ ] **Step 6: Verificación por mutación**

Borrar el `<NutrientFlags … variant="full" />` → el test debe fallar. Restaurar.

- [ ] **Step 7: Commit**

```bash
git add mobile/app/nutricion/agregar-alimento.tsx mobile/__tests__/nutrient-flags.test.tsx
git commit -S -m "feat(nutricion): detalle del alimento con umbrales y fuente

La vista larga dice de dónde sale cada umbral. Mezclamos FSA y FDA, y
eso tiene que estar a la vista de quien lee el dato, no solo en el spec."
```

---

### Task 8: Filtro por nutriente en el catálogo

**Files:**
- Modify: `mobile/app/nutricion/catalogo.tsx`
- Test: `mobile/__tests__/catalogo-semaforo.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `mobile/__tests__/catalogo-semaforo.test.tsx`, ampliando `mockFoods` con un alimento alto en colesterol y otro sin ese dato:

```tsx
test("filtrar por colesterol deja los altos y los sin-dato aparte", async () => {
  const { getByText, queryByText } = render(<CatalogoScreen />);
  await waitFor(() => getByText("Pasas de uva"));

  fireEvent.press(getByText("colesterol"));

  getByText("Queso crema");                    // alto → queda
  expect(queryByText("Pasas de uva")).toBeNull(); // 0 mg → fuera
  getByText(/Sin datos de colesterol/);          // encabezado del grupo
  getByText("Almendra");                        // sin dato → visible, pero aparte
});

test("el filtro se combina con el buscador de texto", async () => {
  const { getByText, getByPlaceholderText, queryByText } = render(<CatalogoScreen />);
  await waitFor(() => getByText("Pasas de uva"));
  fireEvent.press(getByText("colesterol"));
  fireEvent.changeText(getByPlaceholderText("Buscar…"), "queso");
  getByText("Queso crema");
  expect(queryByText("Almendra")).toBeNull();
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd mobile && npm test -- --runInBand catalogo-semaforo`
Expected: FAIL — no existe el chip "colesterol"

- [ ] **Step 3: Implementar**

En `mobile/app/nutricion/catalogo.tsx`:

```tsx
import { filterFoodsByNutrient, FLAGGED_NUTRIENTS, type FlaggedNutrient } from "@pulsia/shared";
import { NUTRIENT_LABELS } from "../../src/nutrition/nutrientText";
```

Agregar estado y derivar la lista. **El texto se aplica primero y el nutriente después**, para que
el filtro por nutriente opere sobre lo que el usuario ya acotó:

```tsx
const [nutrient, setNutrient] = useState<FlaggedNutrient | null>(null);

const byText = foods.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
const result = nutrient ? filterFoodsByNutrient(byText, nutrient) : null;
const filtered = result ? result.matches : byText;
const missing = result ? result.unknown : [];
```

Fila de chips arriba de la lista (debajo del `TextInput`):

```tsx
<View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
  {FLAGGED_NUTRIENTS.map((n) => {
    const on = nutrient === n;
    return (
      <Pressable
        key={n}
        onPress={() => setNutrient(on ? null : n)}
        style={{
          backgroundColor: on ? colors.accent : colors.surfaceMuted,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
        }}
      >
        <Text style={{ color: on ? "#fff" : colors.textMuted, fontSize: 12 }}>
          {NUTRIENT_LABELS[n]}
        </Text>
      </Pressable>
    );
  })}
</View>
```

**Antes de escribir el grupo de faltantes, extraer la fila a un componente `FoodRow`** en el mismo
archivo, para no tener la fila duplicada en dos lugares. Es el `<View>` que hoy arranca en la línea
51 (el del `key={f.id}`), con su `Pressable` de edición, el `NutrientFlags` de la Task 6 y el botón
de borrar:

```tsx
function FoodRow({ food, onDelete }: { food: Food; onDelete: (f: Food) => void }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Pressable style={{ flex: 1 }} onPress={() => router.push(`/nutricion/agregar-alimento?foodId=${food.id}`)}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1 }}>{food.name}</Text>
          <SourceChip source={food.source} />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {food.kcal} kcal · P{food.protein_g} C{food.carbs_g} G{food.fat_g} /100{food.basis === "per_100ml" ? "ml" : "g"}
          {food.unitWeightG != null ? ` · 1 u ≈ ${food.unitWeightG}${food.basis === "per_100ml" ? "ml" : "g"}` : ""}
        </Text>
        <NutrientFlags food={food} />
      </Pressable>
      <Pressable onPress={() => onDelete(food)} style={{ padding: spacing.sm }}>
        <Text style={{ color: colors.danger }}>Borrar</Text>
      </Pressable>
    </View>
  );
}
```

Notar que la línea de macros **pierde el listado suelto de micros** (`· azúc 59 · fibra 3.7 · sat
0.06 · sal 0.03`): eso es justamente lo que los chips reemplazan, y dejar los dos sería decir lo
mismo dos veces en la misma fila.

El `.map` de `filtered` pasa a ser `<FoodRow key={f.id} food={f} onDelete={remove} />`, y después
va el grupo de los sin-dato:

```tsx
{missing.length > 0 && nutrient && (
  <>
    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.md }}>
      Sin datos de {NUTRIENT_LABELS[nutrient]} ({missing.length})
    </Text>
    {missing.map((f) => <FoodRow key={f.id} food={f} onDelete={remove} />)}
  </>
)}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd mobile && npm test -- --runInBand catalogo-semaforo`
Expected: PASS

- [ ] **Step 5: Verificación por mutación**

De a una, revirtiendo:

1. Cambiar `const filtered = result ? result.matches : byText;` para que ignore el filtro (`= byText`) → debe romper el test del filtro.
2. Borrar el bloque de `missing` → debe romper el test del grupo de sin-datos.
3. Invertir el orden de composición (aplicar el nutriente sobre `foods` en vez de sobre `byText`) → debe romper el test de combinación con el buscador.

- [ ] **Step 6: Correr TODA la suite**

Run desde la raíz: `bun test shared backend`
Run: `cd mobile && npm test -- --runInBand && npx tsc --noEmit`
Expected: todo verde

- [ ] **Step 7: Commit**

```bash
git add mobile/app/nutricion/catalogo.tsx mobile/__tests__/catalogo-semaforo.test.tsx
git commit -S -m "feat(nutricion): filtro por nutriente en el catálogo

Los alimentos sin el dato van a un grupo aparte en vez de desaparecer:
si desaparecieran, el filtro estaría afirmando que no son altos en ese
nutriente sin tener con qué saberlo."
```

---

## Verificación final antes del PR

- [ ] `bun test shared backend` verde
- [ ] `cd mobile && npm test -- --runInBand` verde, sin tests saltados
- [ ] `cd mobile && npx tsc --noEmit` sin errores
- [ ] `git log --format='%G? %s'` muestra `G` (firma buena) en todos los commits de la rama
- [ ] Ningún commit menciona Claude ni Anthropic
- [ ] **`sharp` u otras deps NO se movieron a `dependencies`** y no se agregó ninguna dependencia nativa: `git diff origin/main -- '*/package.json' package.json` debe estar vacío. Si hay cambios ahí, el fingerprint del OTA se re-basa y el update no le llega a nadie.
