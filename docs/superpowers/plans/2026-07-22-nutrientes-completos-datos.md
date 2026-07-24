# Nutrientes completos — Plan 1: datos, matcher y referencias

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un alimento de Pulsia pase de 10 a 34 nutrientes persistidos, con los micros
tomados de una copia local de USDA en vez de estimados por la IA.

**Architecture:** Un **registro de nutrientes** en `shared/` es la fuente única: de él se derivan
el schema Zod, el escalado por cantidad, las sumas y las referencias. Una tabla `usda_food` en la
Postgres de la Pi se carga en el arranque desde un artefacto versionado. Un **matcher** con
interfaz propia (búsqueda detrás de la interfaz) traduce "huevo frito" a una fila de USDA; la IA
identifica y elige, la base aporta los números.

**Tech Stack:** Bun, Hono, Drizzle, Postgres 16 + `pg_trgm`, Zod, `bun test`.

**Spec:** `docs/superpowers/specs/2026-07-22-nutrientes-completos-design.md`

**Alcance de ESTE plan:** shared + backend. La UI (componente de lista, detalle de comida,
detalle de alimento, pestaña del día) va en el **Plan 2**, que se escribe cuando este termine —
para que use los nombres de campo reales y no unos inventados por adelantado.

---

## Convenciones obligatorias de este repo

Leer antes de empezar. No son sugerencias.

- **TDD con verificación por mutación.** Cada test nuevo: escribirlo, verlo fallar, implementar,
  verlo pasar, y **después romper el código a propósito** y confirmar que ese test se queja. Un
  test que pasa con la implementación rota es peor que no tenerlo. En las últimas cinco sesiones
  de este repo aparecieron entre 3 y 6 defectos por plan, casi todos de esta familia, y **todos
  se encontraron ejecutando, ninguno leyendo el diff**.
- **Commits firmados:** `git commit -S`. **Nunca** `Co-Authored-By` ni atribución a Claude/Anthropic.
- **Tests:** raíz `bun test shared backend`. Nunca commitear con la suite roja.
- **Si un paso de este plan parece mal, pará y decilo.** El plan tiene defectos; encontrarlos es
  parte del trabajo, no una desviación.

---

## Estructura de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `shared/src/nutrition/nutrients.ts` | Registro único de los 30 micronutrientes: clave, label, unidad, grupo, decimales |
| `shared/src/nutrition/nutrients.test.ts` | Invariantes del registro |
| `shared/src/nutrition/derived.ts` | Carbos netos y sal (derivados, no persistidos) |
| `shared/src/nutrition/derived.test.ts` | |
| `shared/src/nutrition/references.efsa.ts` | Tabla EFSA personalizada por sexo/edad |
| `shared/src/nutrition/references.efsa.test.ts` | |
| `backend/src/usda/schema.ts` | Tabla `usda_food` (Drizzle) |
| `backend/src/usda/loader.ts` | Carga idempotente del artefacto al arranque |
| `backend/src/usda/loader.test.ts` | |
| `backend/src/usda/matcher.ts` | Interfaz del matcher + implementación `pg_trgm` |
| `backend/src/usda/matcher.test.ts` | |
| `backend/scripts/build-usda-dataset.ts` | Baja los CSV de USDA y escribe el artefacto |
| `backend/data/usda-<version>.json.gz` | Artefacto versionado (~1-2 MB) |

**Modificar:**

| Archivo | Cambio |
|---|---|
| `shared/src/nutrition/macros.ts` | Escalado genérico sobre el registro; suma con marca de parcial |
| `shared/src/schemas/nutrition.ts` | +25 campos, `sodium_mg` por `salt_g`, `source` en dos |
| `backend/src/db/schema.ts` | Columnas nuevas en `food` y `meal_item` |
| `backend/src/ai/nutrition.ts` | Prompt: frase de búsqueda en inglés + prompt de elección |
| `backend/src/ai/client.ts` | Tool `return_food` actualizado + `pickUsdaCandidate` |
| `backend/src/routes/nutrition.ts` | Cablear el matcher en `/foods/extract` y `/foods/describe` |
| `backend/src/nutrition/repository.ts` | Persistir los campos nuevos |

---

## Task 1: Registro de nutrientes

**Files:**
- Create: `shared/src/nutrition/nutrients.ts`
- Test: `shared/src/nutrition/nutrients.test.ts`

El registro cubre los **30 micronutrientes nullable**. Los 4 macros (`kcal`, `protein_g`,
`carbs_g`, `fat_g`) quedan fuera a propósito: son `notNull` y tienen reglas de redondeo propias
(kcal es entero).

- [ ] **Step 1: Escribir el test que falla**

```ts
// shared/src/nutrition/nutrients.test.ts
import { expect, test } from "bun:test";
import { NUTRIENTS, NUTRIENT_KEYS, nutrientsByGroup } from "./nutrients";

test("hay 30 micronutrientes", () => {
  expect(NUTRIENTS.length).toBe(30);
});

test("las claves son únicas", () => {
  expect(new Set(NUTRIENT_KEYS).size).toBe(NUTRIENT_KEYS.length);
});

test("los 4 macros NO están en el registro", () => {
  for (const k of ["kcal", "protein_g", "carbs_g", "fat_g"]) {
    expect(NUTRIENT_KEYS).not.toContain(k);
  }
});

test("salt_g no está: la fuente única es sodium_mg", () => {
  expect(NUTRIENT_KEYS).not.toContain("salt_g");
  expect(NUTRIENT_KEYS).toContain("sodium_mg");
});

test("cada grupo tiene la cantidad esperada", () => {
  const g = nutrientsByGroup();
  expect(g.grasas.map((n) => n.key)).toEqual([
    "saturated_fat_g", "omega3_g", "omega6_g", "cholesterol_mg",
  ]);
  expect(g.vitaminas.length).toBe(14);
  expect(g.minerales.length).toBe(9);
});

test("toda unidad es una de las conocidas", () => {
  for (const n of NUTRIENTS) expect(["g", "mg", "mcg", "ml"]).toContain(n.unit);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/nutrition/nutrients.test.ts`
Expected: FAIL — `Cannot find module './nutrients'`

- [ ] **Step 3: Implementar el registro**

```ts
// shared/src/nutrition/nutrients.ts

// Fuente ÚNICA de qué micronutrientes existen. De acá se derivan el schema Zod, el escalado por
// cantidad, las sumas, las referencias diarias y el agrupado de la UI. Agregar un nutriente es
// agregar una línea acá: si se escribiera a mano en cada lugar, olvidarse de uno lo perdería en
// silencio (es el bug de buildFitActivity, que ningún test veía).
export type NutrientGroup = "grasas" | "carbohidratos" | "vitaminas" | "minerales";
export type NutrientUnit = "g" | "mg" | "mcg" | "ml";

export interface NutrientDef {
  key: string;
  label: string;          // español, para la UI
  unit: NutrientUnit;
  group: NutrientGroup;
  decimals: number;       // redondeo al escalar por cantidad
}

// El orden dentro de cada grupo es el orden de la UI. Es una decisión de presentación y por eso
// vive acá, explícito, y no se deriva alfabéticamente de las claves.
export const NUTRIENTS = [
  // --- Grasas ---
  { key: "saturated_fat_g", label: "Grasas saturadas", unit: "g", group: "grasas", decimals: 1 },
  { key: "omega3_g", label: "Omega-3", unit: "g", group: "grasas", decimals: 2 },
  { key: "omega6_g", label: "Omega-6", unit: "g", group: "grasas", decimals: 2 },
  { key: "cholesterol_mg", label: "Colesterol", unit: "mg", group: "grasas", decimals: 1 },
  // --- Carbohidratos ---
  { key: "sugars_g", label: "Azúcares", unit: "g", group: "carbohidratos", decimals: 1 },
  { key: "fiber_g", label: "Fibra", unit: "g", group: "carbohidratos", decimals: 1 },
  // --- Vitaminas (14) ---
  { key: "vitamin_a_mcg", label: "Vitamina A", unit: "mcg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_b1_mg", label: "Vitamina B1 (tiamina)", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_b2_mg", label: "Vitamina B2 (riboflavina)", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_b3_mg", label: "Vitamina B3 (niacina)", unit: "mg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_b5_mg", label: "Vitamina B5 (ác. pantoténico)", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_b6_mg", label: "Vitamina B6 (piridoxina)", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_b7_mcg", label: "Vitamina B7 (biotina)", unit: "mcg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_b9_mcg", label: "Vitamina B9 (folato)", unit: "mcg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_b12_mcg", label: "Vitamina B12 (cobalamina)", unit: "mcg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_c_mg", label: "Vitamina C", unit: "mg", group: "vitaminas", decimals: 1 },
  { key: "vitamin_d_mcg", label: "Vitamina D", unit: "mcg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_e_mg", label: "Vitamina E", unit: "mg", group: "vitaminas", decimals: 2 },
  { key: "vitamin_k_mcg", label: "Vitamina K", unit: "mcg", group: "vitaminas", decimals: 1 },
  { key: "choline_mg", label: "Colina", unit: "mg", group: "vitaminas", decimals: 1 },
  // --- Minerales (9) ---
  { key: "calcium_mg", label: "Calcio", unit: "mg", group: "minerales", decimals: 1 },
  { key: "iron_mg", label: "Hierro", unit: "mg", group: "minerales", decimals: 2 },
  { key: "magnesium_mg", label: "Magnesio", unit: "mg", group: "minerales", decimals: 1 },
  { key: "iodine_mcg", label: "Yodo", unit: "mcg", group: "minerales", decimals: 1 },
  { key: "phosphorus_mg", label: "Fósforo", unit: "mg", group: "minerales", decimals: 1 },
  { key: "potassium_mg", label: "Potasio", unit: "mg", group: "minerales", decimals: 1 },
  { key: "selenium_mcg", label: "Selenio", unit: "mcg", group: "minerales", decimals: 1 },
  { key: "sodium_mg", label: "Sodio", unit: "mg", group: "minerales", decimals: 1 },
  { key: "zinc_mg", label: "Zinc", unit: "mg", group: "minerales", decimals: 2 },
  // --- Otros ---
  { key: "water_ml", label: "Agua", unit: "ml", group: "carbohidratos", decimals: 1 },
] as const satisfies readonly NutrientDef[];

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];
export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key) as NutrientKey[];

// Valores de nutrientes de un alimento o ítem. Todos opcionales y nullable: `null` es "no
// sabemos", que NO es lo mismo que 0. Ver sumNutrient en macros.ts.
export type NutrientValues = { [K in NutrientKey]?: number | null };

const GROUP_ORDER: NutrientGroup[] = ["grasas", "carbohidratos", "vitaminas", "minerales"];

export function nutrientsByGroup(): Record<NutrientGroup, NutrientDef[]> {
  const out = Object.fromEntries(GROUP_ORDER.map((g) => [g, [] as NutrientDef[]])) as Record<
    NutrientGroup,
    NutrientDef[]
  >;
  for (const n of NUTRIENTS) out[n.group].push(n);
  return out;
}
```

⚠️ **`water_ml` está en el grupo `carbohidratos`** solo porque tiene que caer en algún grupo de
la UI y no amerita uno propio. Si el Plan 2 decide mostrarlo aparte, se cambia acá y la UI lo
sigue sola.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `bun test shared/src/nutrition/nutrients.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verificación por mutación**

Borrá la línea de `zinc_mg` del registro. Esperado: falla el test de los 30 y el de minerales.
Cambiá `omega3_g` a `omega_3_g`. Esperado: falla el test de grupos. Restaurá ambas.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/nutrients.ts shared/src/nutrition/nutrients.test.ts
git commit -S -m "feat(nutricion): registro unico de micronutrientes"
```

---

## Task 2: Derivados (carbos netos y sal)

**Files:**
- Create: `shared/src/nutrition/derived.ts`, `shared/src/nutrition/derived.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// shared/src/nutrition/derived.test.ts
import { expect, test } from "bun:test";
import { netCarbsG, saltGFromSodiumMg } from "./derived";

test("carbos netos = carbos - fibra", () => {
  expect(netCarbsG(20, 5)).toBe(15);
});

// Pasa de verdad en verduras de hoja: la fibra medida supera a los carbos totales declarados.
test("carbos netos nunca es negativo", () => {
  expect(netCarbsG(2, 5)).toBe(0);
});

test("sin dato de fibra, los carbos netos son los carbos", () => {
  expect(netCarbsG(20, null)).toBe(20);
});

test("sin carbos no hay carbos netos", () => {
  expect(netCarbsG(null, 5)).toBe(null);
});

test("sal = sodio x 2.5 / 1000", () => {
  expect(saltGFromSodiumMg(400)).toBe(1);
});

test("sin sodio no hay sal", () => {
  expect(saltGFromSodiumMg(null)).toBe(null);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/nutrition/derived.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// shared/src/nutrition/derived.ts

// Nutrientes que NO se persisten: se calculan de otros. Guardarlos como columna sería duplicar
// un dato que puede quedar inconsistente.

const round1 = (n: number) => Math.round(n * 10) / 10;

// Piso en 0: con datos reales la fibra puede superar a los carbos totales (verduras de hoja),
// y "-3 g de carbos netos" no significa nada.
export function netCarbsG(carbsG: number | null | undefined, fiberG: number | null | undefined): number | null {
  if (carbsG == null) return null;
  return round1(Math.max(0, carbsG - (fiberG ?? 0)));
}

// La app muestra SAL (referencia OMS de 5 g/día, que es la que el usuario reconoce) pero
// persiste SODIO, que es lo que entrega USDA. Factor 2.5 = peso molecular NaCl / Na.
export function saltGFromSodiumMg(sodiumMg: number | null | undefined): number | null {
  if (sodiumMg == null) return null;
  return round1((sodiumMg * 2.5) / 1000);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `bun test shared/src/nutrition/derived.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verificación por mutación**

Sacá el `Math.max(0, …)`. Esperado: falla "nunca es negativo". Cambiá `2.5` por `2`. Esperado:
falla el de sal. Restaurá.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/derived.ts shared/src/nutrition/derived.test.ts
git commit -S -m "feat(nutricion): carbos netos y sal como derivados"
```

---

## Task 3: Escalado genérico sobre el registro

**Files:**
- Modify: `shared/src/nutrition/macros.ts`
- Modify: `shared/src/nutrition/macros.test.ts`

Hoy `foodMacrosForQuantity` escala 6 micros escritos a mano. Pasa a recorrer el registro.

- [ ] **Step 1: Escribir el test que falla**

```ts
// agregar a shared/src/nutrition/macros.test.ts
import { NUTRIENT_KEYS } from "./nutrients";

test("escala TODOS los nutrientes del registro, no una lista a mano", () => {
  const food = {
    basis: "per_100g" as const,
    kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10,
    unitWeightG: null,
    // 1 en cada nutriente del registro
    ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 1])),
  };
  const out = foodMacrosForQuantity(food as never, 200, "g");
  for (const k of NUTRIENT_KEYS) {
    expect((out as Record<string, unknown>)[k]).toBe(2); // 200 g = factor 2
  }
});

test("un nutriente ausente queda null, no 0", () => {
  const food = {
    basis: "per_100g" as const,
    kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10, unitWeightG: null,
  };
  const out = foodMacrosForQuantity(food as never, 200, "g");
  expect(out.zinc_mg).toBe(null);
  expect(out.zinc_mg).not.toBe(0);
});

test("respeta los decimales declarados en el registro", () => {
  const food = {
    basis: "per_100g" as const,
    kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10, unitWeightG: null,
    iron_mg: 1.239,     // decimals: 2
    calcium_mg: 1.239,  // decimals: 1
  };
  const out = foodMacrosForQuantity(food as never, 100, "g");
  expect(out.iron_mg).toBe(1.24);
  expect(out.calcium_mg).toBe(1.2);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/nutrition/macros.test.ts`
Expected: FAIL — `out.zinc_mg` es `undefined`.

- [ ] **Step 3: Implementar**

Reemplazar en `shared/src/nutrition/macros.ts`:

```ts
import type { FoodBasis, QuantityUnit } from "../schemas/nutrition";
import { NUTRIENTS, type NutrientValues } from "./nutrients";

export type MacroSource = {
  basis: FoodBasis;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  unitWeightG: number | null;
} & NutrientValues;

export type ScaledMacros = {
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
} & { [K in keyof NutrientValues]-?: number | null };

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

export function foodMacrosForQuantity(food: MacroSource, quantity: number, unit: QuantityUnit): ScaledMacros {
  if (unit === "unit") {
    if (food.unitWeightG == null) throw new Error("El alimento no tiene peso por unidad; cargá gramos/ml.");
  } else if (unit === "g" && food.basis !== "per_100g") {
    throw new Error("Unidad incoherente con el alimento (basis per_100ml no se mide en g).");
  } else if (unit === "ml" && food.basis !== "per_100ml") {
    throw new Error("Unidad incoherente con el alimento (basis per_100g no se mide en ml).");
  }
  const grams = unit === "unit" ? quantity * (food.unitWeightG as number) : quantity;
  const factor = grams / 100;

  // Recorre el REGISTRO, no una lista escrita a mano: agregar un nutriente al registro lo hace
  // escalar solo. Un nutriente ausente queda null — nunca 0, que afirmaría "no tiene".
  const scaled = {} as Record<string, number | null>;
  for (const n of NUTRIENTS) {
    const v = (food as Record<string, number | null | undefined>)[n.key];
    scaled[n.key] = v == null ? null : roundTo(v * factor, n.decimals);
  }

  return {
    grams,
    kcal: Math.round(food.kcal * factor),
    protein_g: round1(food.protein_g * factor),
    carbs_g: round1(food.carbs_g * factor),
    fat_g: round1(food.fat_g * factor),
    ...scaled,
  } as ScaledMacros;
}
```

- [ ] **Step 4: Correr toda la suite**

Run: `bun test shared`
Expected: PASS. Si algún test viejo se queja de `salt_g`, **es correcto**: lo arregla la Task 4.
Anotarlo y seguir.

- [ ] **Step 5: Verificación por mutación**

Cambiá el `for (const n of NUTRIENTS)` por un `for` sobre los primeros 5 nutrientes
(`NUTRIENTS.slice(0, 5)`). Esperado: falla "escala TODOS los nutrientes". Cambiá
`v == null ? null : …` por `(v ?? 0)`. Esperado: falla "queda null, no 0". Restaurá.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/macros.ts shared/src/nutrition/macros.test.ts
git commit -S -m "refactor(nutricion): escalado derivado del registro de nutrientes"
```

---

## Task 4: Suma con marca de parcial

**Files:**
- Modify: `shared/src/nutrition/macros.ts`
- Modify: `shared/src/nutrition/macros.test.ts`

`sumNullableMicro` suma los ausentes como 0, así que un total puede decir "0,8 mg de zinc"
cuando la verdad es "0,8 de los tres alimentos que tenían dato, y de los otros cuatro no
sabemos". La función nueva devuelve además si el total tiene agujeros.

`sumNullableMicro` **se conserva** (la usan otros llamadores) pero pasa a implementarse sobre la
nueva, para que no existan dos criterios de suma.

- [ ] **Step 1: Escribir el test que falla**

```ts
// agregar a shared/src/nutrition/macros.test.ts
import { sumNutrient } from "./macros";

test("todos con dato: total completo", () => {
  expect(sumNutrient([1, 2, 3])).toEqual({ value: 6, partial: false, withData: 3, total: 3 });
});

test("algunos sin dato: total PARCIAL", () => {
  expect(sumNutrient([1, null, 3])).toEqual({ value: 4, partial: true, withData: 2, total: 3 });
});

test("ninguno con dato: value null y no es parcial (no hay nada que completar)", () => {
  expect(sumNutrient([null, null])).toEqual({ value: null, partial: false, withData: 0, total: 2 });
});

test("undefined cuenta como sin dato, igual que null", () => {
  expect(sumNutrient([1, undefined])).toEqual({ value: 1, partial: true, withData: 1, total: 2 });
});

test("lista vacía", () => {
  expect(sumNutrient([])).toEqual({ value: null, partial: false, withData: 0, total: 0 });
});

test("sumNullableMicro sigue devolviendo lo mismo que antes", () => {
  expect(sumNullableMicro([1, null, 3])).toBe(4);
  expect(sumNullableMicro([null, null])).toBe(null);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/nutrition/macros.test.ts`
Expected: FAIL — `sumNutrient` no existe.

- [ ] **Step 3: Implementar**

```ts
// en shared/src/nutrition/macros.ts, reemplazando sumNullableMicro

export interface NutrientSum {
  value: number | null;  // null = ningún ítem tenía dato
  partial: boolean;      // true = al menos uno tenía dato y al menos uno no
  withData: number;
  total: number;
}

// `partial` es la diferencia entre "comiste 0,8 mg de zinc" y "0,8 de los que sabemos". La UI
// tiene que poder decirlo; sumar los ausentes como 0 en silencio es afirmar un dato falso.
export function sumNutrient(values: Array<number | null | undefined>): NutrientSum {
  const total = values.length;
  const withData = values.filter((v) => v != null).length;
  if (withData === 0) return { value: null, partial: false, withData: 0, total };
  const sum = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  return {
    value: Math.round(sum * 10) / 10,
    partial: withData < total,
    withData,
    total,
  };
}

// Compatibilidad con los llamadores existentes. Se implementa sobre sumNutrient a propósito:
// dos criterios de suma distintos es exactamente cómo Progreso y Nutrición terminan mostrando
// cifras distintas del mismo día.
export function sumNullableMicro(values: Array<number | null | undefined>): number | null {
  return sumNutrient(values).value;
}
```

- [ ] **Step 4: Correr toda la suite**

Run: `bun test shared backend`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Cambiá `partial: withData < total` por `partial: false`. Esperado: falla "total PARCIAL".
Cambiá `withData === 0` por `withData < 0`. Esperado: falla "ninguno con dato". Restaurá.

- [ ] **Step 6: Commit**

```bash
git add shared/src/nutrition/macros.ts shared/src/nutrition/macros.test.ts
git commit -S -m "feat(nutricion): suma de nutrientes con marca de parcial"
```

---

## Task 5: Schema Zod compartido

**Files:**
- Modify: `shared/src/schemas/nutrition.ts`
- Modify: `shared/src/schemas/nutrition.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// agregar a shared/src/schemas/nutrition.test.ts
import { NUTRIENT_KEYS } from "../nutrition/nutrients";

test("FoodExtractionSchema acepta todos los nutrientes del registro", () => {
  const base = {
    name: "Huevo", basis: "per_100g", kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5,
    unitWeightG: 50, sourceMacros: "ai", sourceMicros: "usda",
    ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 1])),
  };
  const r = FoodExtractionSchema.safeParse(base);
  expect(r.success).toBe(true);
});

test("salt_g ya no forma parte del schema", () => {
  expect(Object.keys(FoodExtractionSchema.shape)).not.toContain("salt_g");
  expect(Object.keys(FoodExtractionSchema.shape)).toContain("sodium_mg");
});

test("source viejo NO se acepta: la migración lo abrió en dos", () => {
  const r = FoodExtractionSchema.safeParse({
    name: "X", basis: "per_100g", kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1,
    unitWeightG: null, source: "estimate",
  });
  expect(r.success).toBe(false);
});

test("sourceMicros acepta null (alimento sin match en USDA)", () => {
  const r = FoodExtractionSchema.safeParse({
    name: "Dulce de leche", basis: "per_100g", kcal: 315, protein_g: 7, carbs_g: 55, fat_g: 7,
    unitWeightG: null, sourceMacros: "ai", sourceMicros: null,
  });
  expect(r.success).toBe(true);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test shared/src/schemas/nutrition.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `shared/src/schemas/nutrition.ts`, reemplazar el bloque `microsPer100` y `FoodSourceSchema`:

```ts
import { NUTRIENTS } from "../nutrition/nutrients";

// Procedencia de los macros y de los micros de etiqueta. `estimate` se abrió en `ai` (lo estimó
// el modelo) y `manual` (lo cargó el usuario a mano): la distinción estaba pendiente en el
// backlog y la migración se hacía igual.
export const SourceMacrosSchema = z.enum(["label", "ai", "manual"]);
export type SourceMacros = z.infer<typeof SourceMacrosSchema>;

// Procedencia del bloque de vitaminas y minerales. null = no se pudo matchear contra USDA y el
// bloque quedó vacío (NO es lo mismo que valores en 0).
export const SourceMicrosSchema = z.enum(["usda", "ai"]).nullable();
export type SourceMicros = z.infer<typeof SourceMicrosSchema>;

// Los 30 nutrientes salen del REGISTRO, no de una lista repetida acá. Todos nullable+optional:
// la IA puede omitirlos y los alimentos viejos no los tienen.
const nutrientFields = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, z.number().nonnegative().nullable().optional()]),
) as Record<(typeof NUTRIENTS)[number]["key"], z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;

export const FoodExtractionSchema = z.object({
  name: z.string().trim().min(1),
  basis: FoodBasisSchema,
  ...macrosPer100,
  ...nutrientFields,
  unitWeightG: z.number().positive().nullable(),
  sourceMacros: SourceMacrosSchema,
  sourceMicros: SourceMicrosSchema,
  // fdcId de la fila de USDA usada, para poder rastrear de dónde salieron los micros y
  // re-matchear después. null si no hubo match.
  usdaFdcId: z.number().int().nullable().optional(),
});
```

Y en `MealItemSchema`, reemplazar `...microsPer100` por `...nutrientFields`.

⚠️ **`FoodSourceSchema` se elimina.** Buscá sus usos con
`grep -rn "FoodSourceSchema\|\"estimate\"\|'estimate'" shared/src backend/src mobile/src mobile/app`
y actualizá cada uno. El móvil va a romper la compilación de tests — es esperado y lo arregla el
Plan 2; acá alcanza con que `bun test shared backend` quede verde.

- [ ] **Step 4: Correr**

Run: `bun test shared`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Sacá `sourceMicros` del objeto. Esperado: falla "acepta null". Cambiá `SourceMacrosSchema` para
que incluya `"estimate"`. Esperado: falla "source viejo NO se acepta". Restaurá.

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas/nutrition.ts shared/src/schemas/nutrition.test.ts
git commit -S -m "feat(nutricion): schema con 30 nutrientes y procedencia partida en dos"
```

---

## Task 6: Migración de la base

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: migración generada por Drizzle en `backend/drizzle/`

⚠️ **Esta es la tarea peligrosa del plan.** Reescribe datos reales del usuario. La conversión
sal→sodio es irreversible si se hace mal (dividir por 2.5 lo que ya estaba en sodio).

- [ ] **Step 1: Escribir el test de la conversión**

```ts
// backend/src/nutrition/migration0022.test.ts
import { expect, test } from "bun:test";
import { sodiumMgFromSaltG } from "./migration0022";
import { saltGFromSodiumMg } from "@pulsia/shared";

test("2.5 g de sal son 1000 mg de sodio", () => {
  expect(sodiumMgFromSaltG(2.5)).toBe(1000);
});

test("ida y vuelta: sodio -> sal -> sodio", () => {
  expect(sodiumMgFromSaltG(saltGFromSodiumMg(400) as number)).toBe(400);
});

test("sal null queda sodio null, NO 0", () => {
  expect(sodiumMgFromSaltG(null)).toBe(null);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test backend/src/nutrition/migration0022.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar el helper**

```ts
// backend/src/nutrition/migration0022.ts
// Inversa exacta de saltGFromSodiumMg (shared/src/nutrition/derived.ts). Vive acá y no en
// shared porque solo la usa la migración: la app nunca convierte en este sentido.
export function sodiumMgFromSaltG(saltG: number | null | undefined): number | null {
  if (saltG == null) return null;
  return Math.round((saltG * 1000) / 2.5);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `bun test backend/src/nutrition/migration0022.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Actualizar el schema de Drizzle**

En `backend/src/db/schema.ts`, en las tablas `food` y `meal_item`:

- Eliminar `saltG: real("salt_g")`.
- Eliminar `source: text("source").notNull()` de `food`; agregar
  `sourceMacros: text("source_macros").notNull()` y `sourceMicros: text("source_micros")`.
- Agregar `usdaFdcId: integer("usda_fdc_id")` a `food`.
- Agregar las **25 columnas nuevas** con el mismo nombre que la clave del registro
  (`omega3_g` → `omega3G: real("omega3_g")`, etc.), todas nullable, en `food` **y** en `meal_item`.

⚠️ `meal_item` **no** lleva `sourceMacros`/`sourceMicros`/`usdaFdcId`: es un snapshot de valores,
no del origen. Si en el Plan 2 hace falta mostrar la procedencia en el detalle de una comida, se
lee del `food` referenciado (que puede ser null si se borró) — decidilo entonces, no ahora.

- [ ] **Step 6: Generar la migración y editarla a mano**

```bash
cd backend && bun run db:generate
```

Drizzle va a generar el `ADD COLUMN` / `DROP COLUMN`. **Editar el SQL generado** para que la
conversión ocurra ANTES del drop, y agregar el backfill de procedencia:

```sql
-- 1. sodio a partir de la sal existente, ANTES de borrar salt_g
UPDATE "food"      SET "sodium_mg" = ROUND(("salt_g" * 1000) / 2.5) WHERE "salt_g" IS NOT NULL;
UPDATE "meal_item" SET "sodium_mg" = ROUND(("salt_g" * 1000) / 2.5) WHERE "salt_g" IS NOT NULL;

-- 2. procedencia: todo lo viejo `estimate` lo cargó la IA
UPDATE "food" SET "source_macros" = CASE WHEN "source" = 'label' THEN 'label' ELSE 'ai' END;
-- source_micros queda NULL a propósito: no hay vitaminas cargadas todavía.

-- 3. recién ahora se borran las columnas viejas
ALTER TABLE "food"      DROP COLUMN "salt_g";
ALTER TABLE "meal_item" DROP COLUMN "salt_g";
ALTER TABLE "food"      DROP COLUMN "source";
```

⚠️ **El orden importa y Drizzle no lo garantiza:** si el `DROP COLUMN "salt_g"` queda antes del
`UPDATE`, la conversión corre sobre una columna que ya no existe y **se pierde el sodio de todos
los alimentos cargados**. Verificá el orden a ojo en el archivo antes de commitear.

- [ ] **Step 7: Probar la migración contra una base real**

```bash
docker compose up -d
cd backend && bun run db:migrate
```

Expected: sin errores. Después, comprobá que la conversión corrió:

```bash
docker compose exec db psql -U postgres -d pulsia -c \
  "SELECT name, sodium_mg, source_macros FROM food LIMIT 5;"
```

Expected: `sodium_mg` con valores donde antes había sal, `source_macros` en `ai` o `label`,
nunca vacío.

- [ ] **Step 8: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle backend/src/nutrition/migration0022.ts backend/src/nutrition/migration0022.test.ts
git commit -S -m "feat(nutricion): migracion a 30 nutrientes, sodio y procedencia partida"
```

---

## Task 7: Tabla `usda_food`

**Files:**
- Create: `backend/src/usda/schema.ts`
- Modify: `backend/src/db/schema.ts` (re-exportar)

- [ ] **Step 1: Implementar la tabla**

```ts
// backend/src/usda/schema.ts
import { pgTable, integer, text, real, index } from "drizzle-orm/pg-core";

// Copia local de USDA FoodData Central (dominio público). Una fila por alimento, valores por
// 100 g. NO tiene userId: es un catálogo de referencia compartido, no datos de nadie.
export const usdaFood = pgTable("usda_food", {
  fdcId: integer("fdc_id").primaryKey(),
  description: text("description").notNull(),      // en inglés, tal como viene de USDA
  dataType: text("data_type").notNull(),           // 'foundation' | 'sr_legacy' | 'survey'
  // 30 columnas nullable con el nombre de la clave del registro, igual que en `food`.
  saturatedFatG: real("saturated_fat_g"),
  omega3G: real("omega3_g"),
  // … (el resto de los 30, mismo criterio de nombres)
}, (t) => ({
  byDescription: index("usda_food_description_trgm_idx").using("gin", t.description),
}));

// Versión del dataset cargado. Una sola fila. Hace idempotente la carga del arranque.
export const usdaDataset = pgTable("usda_dataset", {
  id: integer("id").primaryKey(),                  // siempre 1
  version: text("version").notNull(),
  rowCount: integer("row_count").notNull(),
});
```

⚠️ El índice GIN de `pg_trgm` no lo expresa Drizzle bien; agregar a mano en la migración:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX usda_food_description_trgm_idx ON usda_food USING gin (description gin_trgm_ops);
```

- [ ] **Step 2: Generar y correr la migración**

```bash
cd backend && bun run db:generate && bun run db:migrate
```

Expected: sin errores; `\d usda_food` muestra la tabla.

- [ ] **Step 3: Commit**

```bash
git add backend/src/usda/schema.ts backend/src/db/schema.ts backend/drizzle
git commit -S -m "feat(usda): tabla local de composicion de alimentos"
```

---

## Task 8: Script de construcción del dataset

**Files:**
- Create: `backend/scripts/build-usda-dataset.ts`

Este script lo corre **una persona, a mano, muy de vez en cuando** (SR Legacy está congelado
desde 2018). No corre en el deploy ni en CI.

- [ ] **Step 1: Implementar el script**

```ts
// backend/scripts/build-usda-dataset.ts
//
// Baja los CSV de USDA FoodData Central, se queda solo con los nutrientes del registro y
// escribe backend/data/usda-<version>.json.gz.
//
// Uso:  bun run backend/scripts/build-usda-dataset.ts <carpeta-con-los-csv> <version>
//
// Los CSV crudos pesan cientos de MB y NO van al repo: se bajan de
// https://fdc.nal.usda.gov/download-datasets, se descomprimen en una carpeta temporal y se le
// pasa esa carpeta a este script. El artefacto resultante (~1-2 MB) SÍ se versiona, para que un
// deploy sea reproducible sin depender de que USDA esté arriba.
//
// Archivos que se leen: food.csv (fdc_id, data_type, description),
// food_nutrient.csv (fdc_id, nutrient_id, amount), nutrient.csv (id, name, unit_name).

import { gzipSync } from "node:zlib";

// Mapeo de nutrient_id de USDA a la clave del registro. Los ids son estables en FoodData Central.
// ⚠️ Verificar cada uno contra nutrient.csv antes de confiar: un id mal mapeado carga selenio en
// la columna de zinc y NADIE lo va a notar mirando la app.
const USDA_NUTRIENT_IDS: Record<number, string> = {
  1258: "saturated_fat_g",
  1253: "cholesterol_mg",
  2000: "sugars_g",
  1079: "fiber_g",
  1093: "sodium_mg",
  1087: "calcium_mg",
  1089: "iron_mg",
  1090: "magnesium_mg",
  1091: "phosphorus_mg",
  1092: "potassium_mg",
  1095: "zinc_mg",
  1103: "selenium_mcg",
  1100: "iodine_mcg",
  1106: "vitamin_a_mcg",
  1165: "vitamin_b1_mg",
  1166: "vitamin_b2_mg",
  1167: "vitamin_b3_mg",
  1170: "vitamin_b5_mg",
  1175: "vitamin_b6_mg",
  1176: "vitamin_b7_mcg",
  1177: "vitamin_b9_mcg",
  1178: "vitamin_b12_mcg",
  1162: "vitamin_c_mg",
  1114: "vitamin_d_mcg",
  1109: "vitamin_e_mg",
  1185: "vitamin_k_mcg",
  1180: "choline_mg",
  1051: "water_ml",
  1008: "kcal",
  1003: "protein_g",
  1005: "carbs_g",
  1004: "fat_g",
};

// Omega-3 y omega-6 no son un nutriente de USDA: son SUMAS de ácidos grasos individuales.
const OMEGA3_IDS = [1404, 1278, 1272, 1280]; // 18:3 n-3, 20:5 (EPA), 22:5, 22:6 (DHA)
const OMEGA6_IDS = [1269, 1316];             // 18:2 n-6, 20:4 n-6
```

⚠️ **Los `nutrient_id` de arriba se verifican contra `nutrient.csv`, no se confían.** Un id mal
mapeado carga selenio en la columna de zinc y no hay test que lo note: los dos son números
plausibles. El paso 2 es esa verificación.

- [ ] **Step 2: Verificar el mapeo contra la fuente**

```bash
# por cada id del mapeo, imprimir su nombre real según USDA
awk -F',' 'NR>1 {print $1","$2","$3}' <carpeta>/nutrient.csv | grep -E '^(1258|1253|2000|1079|1093|1087|1089|1090|1091|1092|1095|1103|1100|1106|1165|1166|1167|1170|1175|1176|1177|1178|1162|1114|1109|1185|1180|1051|1008|1003|1005|1004),'
```

Expected: cada línea confirma el nutriente y su unidad. **Cualquier discrepancia se corrige en el
mapeo antes de seguir.** Anotar en el commit qué ids se verificaron.

- [ ] **Step 3: Completar el script (lectura, filtrado, escritura)**

El cuerpo: leer `food.csv` quedándose con `data_type` en
`{foundation_food, sr_legacy_food, survey_fndds_food}`; leer `food_nutrient.csv` acumulando por
`fdc_id` los nutrientes del mapeo y sumando los grupos omega; normalizar unidades (USDA da
vitamina A en mcg RAE, vitamina D en mcg, folato en mcg DFE — **verificar cada `unit_name`**);
escribir `{ version, rows: [...] }` con `gzipSync`.

- [ ] **Step 4: Correr y verificar el tamaño**

```bash
bun run backend/scripts/build-usda-dataset.ts /tmp/fdc 2026-07
ls -lh backend/data/usda-2026-07.json.gz
```

Expected: el archivo existe y pesa entre 500 KB y 3 MB. Si pesa 50 MB, el filtrado no está
funcionando y **no se commitea**.

- [ ] **Step 5: Chequeo de cordura sobre datos conocidos**

```bash
bun -e "const d=JSON.parse(require('zlib').gunzipSync(require('fs').readFileSync('backend/data/usda-2026-07.json.gz')).toString()); const e=d.rows.find(r=>/^Egg, whole, raw, fresh/.test(r.description)); console.log(e)"
```

Expected: un huevo crudo con ~1.3 mg de hierro, ~373 mg de colesterol y ~50 mg de calcio por
100 g. **Si el colesterol da 3.73 o 37300, hay un error de unidad o de escala** — pará y
corregí el mapeo antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/build-usda-dataset.ts backend/data/usda-2026-07.json.gz
git commit -S -m "feat(usda): script de construccion del dataset + artefacto 2026-07"
```

---

## Task 9: Loader idempotente

**Files:**
- Create: `backend/src/usda/loader.ts`, `backend/src/usda/loader.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/usda/loader.test.ts
import { expect, test } from "bun:test";
import { shouldLoad } from "./loader";

test("carga si no hay dataset", () => {
  expect(shouldLoad(null, "2026-07")).toBe(true);
});

test("NO carga si la version coincide", () => {
  expect(shouldLoad({ version: "2026-07", rowCount: 16000 }, "2026-07")).toBe(false);
});

test("carga si la version cambio", () => {
  expect(shouldLoad({ version: "2025-01", rowCount: 16000 }, "2026-07")).toBe(true);
});

test("recarga si la version coincide pero la tabla quedo vacia", () => {
  expect(shouldLoad({ version: "2026-07", rowCount: 0 }, "2026-07")).toBe(true);
});
```

El último caso importa: si una carga se cortó por la mitad, la fila de versión puede haber
quedado escrita con la tabla vacía, y el arranque siguiente la daría por buena para siempre.

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test backend/src/usda/loader.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// backend/src/usda/loader.ts
export interface DatasetRow { version: string; rowCount: number }

export function shouldLoad(current: DatasetRow | null, artifactVersion: string): boolean {
  if (current == null) return true;
  if (current.version !== artifactVersion) return true;
  // Una carga interrumpida puede dejar la fila de versión escrita con la tabla vacía. Sin este
  // guard, ese estado se daría por bueno para siempre y el matcher no encontraría nunca nada.
  return current.rowCount <= 0;
}
```

Más la función que efectivamente carga: leer el `.json.gz`, `DELETE FROM usda_food`, insertar en
lotes de 1000, y **recién al final** escribir la fila de `usda_dataset` — en esa orden, dentro de
una transacción, para que un corte no deje la versión escrita sin datos.

- [ ] **Step 4: Cablear al arranque**

En `backend/src/index.ts`, después de las migraciones que ya se auto-aplican. **Si la carga
falla, se loguea y el servidor arranca igual**: sin dataset el alta cae al comportamiento actual
(§7 del spec), y un backend caído es peor que uno sin vitaminas.

- [ ] **Step 5: Correr y verificar**

```bash
cd backend && bun run start
```

Expected: en el log, `usda: cargadas 16xxx filas (2026-07)`. Reiniciar: esta vez
`usda: dataset 2026-07 ya cargado`.

- [ ] **Step 6: Verificación por mutación**

Cambiá `return current.rowCount <= 0` por `return false`. Esperado: falla el test de la tabla
vacía. Restaurá.

- [ ] **Step 7: Commit**

```bash
git add backend/src/usda/loader.ts backend/src/usda/loader.test.ts backend/src/index.ts
git commit -S -m "feat(usda): carga idempotente del dataset al arranque"
```

---

## Task 10: El matcher

**Files:**
- Create: `backend/src/usda/matcher.ts`, `backend/src/usda/matcher.test.ts`

**Restricción de diseño del spec (§4.3):** interfaz propia, y la **estrategia de búsqueda queda
detrás de ella**. Quien llama pasa un texto y recibe candidatos, sin saber si adentro hubo
`pg_trgm` o embeddings. Es lo que permite sumar búsqueda semántica después sin tocar consumidores.

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/usda/matcher.test.ts
import { expect, test } from "bun:test";
import { rankCandidates } from "./matcher";

const row = (fdcId: number, dataType: string, description: string, similarity: number) =>
  ({ fdcId, dataType, description, similarity }) as never;

test("ante similitud pareja, Foundation le gana a SR Legacy y ambos a Survey", () => {
  const out = rankCandidates([
    row(3, "survey", "Egg, fried", 0.8),
    row(1, "foundation", "Egg, whole, raw", 0.8),
    row(2, "sr_legacy", "Egg, whole, cooked", 0.8),
  ]);
  expect(out.map((c) => c.fdcId)).toEqual([1, 2, 3]);
});

test("una similitud MUCHO mejor le gana a la prioridad de tipo", () => {
  const out = rankCandidates([
    row(1, "foundation", "Milk, whole", 0.2),
    row(2, "survey", "Egg, fried", 0.95),
  ]);
  expect(out[0].fdcId).toBe(2);
});

test("devuelve como maximo 8 candidatos", () => {
  const many = Array.from({ length: 20 }, (_, i) => row(i, "sr_legacy", `Food ${i}`, 0.5));
  expect(rankCandidates(many).length).toBe(8);
});

test("sin candidatos devuelve lista vacia, no error", () => {
  expect(rankCandidates([])).toEqual([]);
});
```

El segundo test es el que importa: una prioridad de tipo que pise cualquier diferencia de
similitud haría que "leche" matchee un huevo de Foundation.

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test backend/src/usda/matcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el ranking**

```ts
// backend/src/usda/matcher.ts

export interface UsdaCandidate {
  fdcId: number;
  description: string;
  dataType: string;
  similarity: number;   // 0..1, de pg_trgm
}

// Foundation y SR Legacy son valores de laboratorio; FNDDS (survey) son valores derivados de
// recetas — muy por encima de una estimación de IA, un escalón por debajo de los otros dos.
const TYPE_BONUS: Record<string, number> = {
  foundation: 0.10,
  sr_legacy: 0.05,
  survey: 0,
};

export const MAX_CANDIDATES = 8;

// El bonus es un EMPUJÓN, no un orden lexicográfico: 0.10 no alcanza para que un match malo de
// Foundation le gane a uno bueno de Survey. Con prioridad estricta por tipo, "leche" terminaría
// matcheando un huevo de Foundation.
export function rankCandidates(rows: UsdaCandidate[]): UsdaCandidate[] {
  return [...rows]
    .sort((a, b) => {
      const sa = a.similarity + (TYPE_BONUS[a.dataType] ?? 0);
      const sb = b.similarity + (TYPE_BONUS[b.dataType] ?? 0);
      if (sb !== sa) return sb - sa;
      return a.fdcId - b.fdcId; // desempate estable: sin esto el orden depende del planner
    })
    .slice(0, MAX_CANDIDATES);
}
```

Más la función de búsqueda, que corre el SQL y delega el orden en `rankCandidates`:

```sql
SELECT fdc_id, description, data_type, similarity(description, $1) AS similarity
FROM usda_food
WHERE description % $1
ORDER BY similarity DESC
LIMIT 40
```

(Se traen 40 y se rankean en TS: el bonus por tipo puede subir algo que el SQL dejaría afuera.)

- [ ] **Step 4: Correr y verificar que pasa**

Run: `bun test backend/src/usda/matcher.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verificación por mutación**

Poné `TYPE_BONUS.foundation = 10`. Esperado: falla "una similitud MUCHO mejor le gana". Sacá el
`.slice(0, MAX_CANDIDATES)`. Esperado: falla el de los 8. Restaurá.

- [ ] **Step 6: Chequeo contra la base real**

```bash
cd backend && bun -e "import {searchUsda} from './src/usda/matcher'; console.log(await searchUsda(db, 'fried egg'))"
```

Expected: `Egg, whole, cooked, fried` entre los primeros. Si no aparece, el problema es la
búsqueda, no el ranking.

- [ ] **Step 7: Commit**

```bash
git add backend/src/usda/matcher.ts backend/src/usda/matcher.test.ts
git commit -S -m "feat(usda): matcher con ranking por similitud y tipo de dato"
```

---

## Task 11: Referencias EFSA

**Files:**
- Create: `shared/src/nutrition/references.efsa.ts`, `shared/src/nutrition/references.efsa.test.ts`

⚠️ **Los valores se transcriben de la fuente publicada de EFSA, NO de memoria ni de este plan.**
Un número de referencia equivocado es invisible en un code review y le miente al usuario para
siempre. Este plan **deliberadamente no trae la tabla de valores**: traerla sería invitar a
copiarla sin verificar.

- [ ] **Step 1: Obtener los valores de la fuente**

Abrir el **EFSA Dietary Reference Values summary report** (`https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values`,
tabla de *Population Reference Intakes*) y transcribir, para cada uno de los 30 nutrientes del
registro y para cada combinación de sexo (`male`/`female`) y tramo de edad adulta:

- el valor de referencia,
- la unidad (**verificar que coincida con la del registro**; EFSA da folato en mcg DFE y
  vitamina A en mcg RE),
- si es un **piso** (`min`, alcanzar) o un **techo** (`max`, no pasar).

Anotar en un comentario junto a cada valor de qué tabla salió.

- [ ] **Step 2: Escribir el test que falla**

```ts
// shared/src/nutrition/references.efsa.test.ts
import { expect, test } from "bun:test";
import { referenceFor, referencesFor } from "./references.efsa";
import { NUTRIENT_KEYS } from "./nutrients";

// El caso que motiva toda la personalización: no es un matiz, es el doble.
test("el hierro de una mujer en edad fertil es MAYOR que el de un varon", () => {
  const varon = referenceFor("iron_mg", { sex: "male", age: 35 });
  const mujer = referenceFor("iron_mg", { sex: "female", age: 35 });
  expect(varon).not.toBeNull();
  expect(mujer).not.toBeNull();
  expect(mujer!.value).toBeGreaterThan(varon!.value);
});

// ⚠️ Sin este test, el anterior pasa en verde con una tabla que ignora el sexo, siempre que el
// fallback coincida con el valor masculino.
test("el perfil sin sexo NO devuelve el valor masculino por casualidad", () => {
  const varon = referenceFor("iron_mg", { sex: "male", age: 35 })!;
  const sinDato = referenceFor("iron_mg", {})!;
  expect(sinDato.value).toBeGreaterThan(varon.value);
});

test("cae al fallback neutro cuando falta el sexo", () => {
  expect(referenceFor("calcium_mg", {})).not.toBeNull();
});

test("cae al fallback neutro cuando falta la edad", () => {
  expect(referenceFor("calcium_mg", { sex: "female" })).not.toBeNull();
});

test("todo nutriente del registro tiene referencia o null explicito", () => {
  const refs = referencesFor({ sex: "male", age: 35 });
  for (const k of NUTRIENT_KEYS) expect(k in refs).toBe(true);
});

test("cada referencia declara si es piso o techo", () => {
  const refs = referencesFor({ sex: "male", age: 35 });
  for (const r of Object.values(refs)) {
    if (r != null) expect(["min", "max"]).toContain(r.kind);
  }
});
```

⚠️ El **fallback neutro es el valor más conservador**, o sea el **más alto** para los pisos
(`min`). Por eso el segundo test espera que el fallback de hierro sea *mayor* que el masculino:
un fallback igual al del varón le diría a una mujer sin perfil que ya llegó, cuando no.

- [ ] **Step 3: Correr y verificar que falla**

Run: `bun test shared/src/nutrition/references.efsa.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar con los valores del Step 1**

```ts
// shared/src/nutrition/references.efsa.ts
import type { NutrientKey } from "./nutrients";

export type ReferenceKind = "min" | "max";
export interface NutrientReference { value: number; kind: ReferenceKind }
export interface ReferencePerson { sex?: "male" | "female" | "other" | "prefer_not_to_say"; age?: number }

// Valores de referencia poblacional de EFSA (Dietary Reference Values). NO son metas personales
// calculadas del perfil: son referencias públicas, y la UI las muestra como "ref". Se
// personalizan por sexo y edad porque la referencia PÚBLICA misma depende de eso.
//
// Cada entrada lleva de qué tabla de EFSA salió. Transcribir de la fuente, nunca de memoria.
// … tabla, completada en el Step 1 …

// `other` y `prefer_not_to_say` caen al fallback igual que un perfil vacío: no hay una
// referencia EFSA para esas categorías y elegir una del binario sería inventar.
export function referenceFor(key: NutrientKey, person: ReferencePerson): NutrientReference | null { /* … */ }
export function referencesFor(person: ReferencePerson): Record<NutrientKey, NutrientReference | null> { /* … */ }
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `bun test shared/src/nutrition/references.efsa.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Verificación por mutación**

Hacé que `referenceFor` ignore el sexo y devuelva siempre la tabla masculina. Esperado: fallan
**dos** tests (el del hierro y el del fallback). Si solo falla uno, el test del fallback no
está mordiendo. Restaurá.

- [ ] **Step 7: Commit**

```bash
git add shared/src/nutrition/references.efsa.ts shared/src/nutrition/references.efsa.test.ts
git commit -S -m "feat(nutricion): referencias EFSA personalizadas por sexo y edad"
```

---

## Task 12: Prompt de la IA con frase de búsqueda

**Files:**
- Modify: `backend/src/ai/nutrition.ts`, `backend/src/ai/nutrition.test.ts`

La 1ª llamada ya no estima 30 micros: identifica el alimento y devuelve **una frase de búsqueda
en inglés**. Los micros los pone USDA.

- [ ] **Step 1: Escribir el test que falla**

```ts
// agregar a backend/src/ai/nutrition.test.ts
test("el prompt pide una frase de busqueda en INGLES", () => {
  const p = buildFoodPrompt("photo");
  expect(p).toContain("searchQuery");
  expect(p).toMatch(/en ingl[eé]s/i);
});

test("el prompt ya NO pide sal: la fuente unica es el sodio", () => {
  expect(buildFoodPrompt("photo")).not.toContain("salt_g");
});

test("el prompt NO le pide vitaminas ni minerales al modelo", () => {
  const p = buildFoodPrompt("photo");
  for (const k of ["vitamin_b12_mcg", "selenium_mcg", "iron_mg"]) expect(p).not.toContain(k);
});

test("el anti-inyeccion sigue estando en los dos modos", () => {
  for (const mode of ["photo", "text"] as const) {
    expect(buildFoodPrompt(mode)).toMatch(/NO instrucciones/);
  }
});
```

⚠️ El último test es una de las **aserciones laxas** que este repo ya auditó: `/NO instrucciones/`
tiene que aparecer por **un solo camino**. Verificá con `grep -c "NO instrucciones"` sobre el
prompt generado que hay exactamente una ocurrencia por modo; si hay dos, el test pasa aunque se
borre la defensa de uno.

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test backend/src/ai/nutrition.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `buildFoodPrompt`: sacar la regla 3 (sal) y reemplazarla por sodio; **eliminar** cualquier
pedido de vitaminas/minerales; agregar:

```
6. `searchQuery`: el nombre del alimento en INGLÉS, en el vocabulario de las tablas de
   composición de alimentos de USDA — genérico, con el método de cocción si aplica. Ejemplos:
   "huevo frito" → "egg whole cooked fried"; "leche descremada" → "milk nonfat fluid";
   "milanesa de carne" → "beef breaded fried cutlet". Sin marcas ni adjetivos de sabor.
```

Y actualizar el tool `return_food` en `backend/src/ai/client.ts` para que incluya `searchQuery`
y **ya no** los micros que ahora vienen de USDA.

- [ ] **Step 4: Correr**

Run: `bun test backend`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Borrá la línea del `searchQuery` del prompt. Esperado: falla el primer test. Restaurá.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/nutrition.ts backend/src/ai/nutrition.test.ts backend/src/ai/client.ts
git commit -S -m "feat(nutricion): el prompt identifica y busca, no estima micros"
```

---

## Task 13: Elección de candidato (2ª llamada) y cableado

**Files:**
- Modify: `backend/src/ai/client.ts`, `backend/src/routes/nutrition.ts`,
  `backend/src/nutrition/repository.ts`
- Modify: `backend/src/routes/nutrition.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// agregar a backend/src/routes/nutrition.test.ts

test("sin match en USDA el alta NO se bloquea", async () => {
  // matcher que no encuentra nada (dulce de leche, Leberkäse, un guiso)
  const res = await app.request("/nutrition/foods/describe", {
    method: "POST",
    body: JSON.stringify({ text: "dulce de leche" }),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.sourceMicros).toBe(null);
  expect(body.sourceMacros).toBe("ai");
  expect(body.iron_mg ?? null).toBe(null);   // null, NO 0
});

test("con match, los micros salen de USDA y no del modelo", async () => {
  const body = await (await postDescribe("huevo frito")).json();
  expect(body.sourceMicros).toBe("usda");
  expect(body.usdaFdcId).toBeGreaterThan(0);
  expect(body.iron_mg).toBeGreaterThan(0);
});

test("si la 2a llamada de IA falla, devuelve los candidatos para elegir a mano", async () => {
  // aiClient.pickUsdaCandidate rechaza
  const body = await (await postDescribe("huevo frito")).json();
  expect(body.candidates.length).toBeGreaterThan(0);
  expect(body.sourceMicros).toBe(null);
});

test("con la tabla usda_food vacia, el alta cae al comportamiento actual", async () => {
  // sin filas cargadas
  const res = await postDescribe("huevo frito");
  expect(res.status).toBe(200);
  expect((await res.json()).sourceMicros).toBe(null);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `bun test backend/src/routes/nutrition.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`AiClient.pickUsdaCandidate({ foodName, candidates, apiKey })` → devuelve el `fdcId` elegido o
`null`. Prompt corto: le pasa el nombre y la lista numerada, pide el índice, y **permite
responder "ninguno"** — forzar una elección entre candidatos malos es peor que no matchear.

En `/foods/extract` y `/foods/describe`, después de la 1ª llamada:

```
searchQuery → searchUsda() → rankCandidates()
  ├─ sin candidatos       → devolver el alimento con sourceMicros: null
  ├─ pickUsdaCandidate falla → devolver el alimento + `candidates` para elegir a mano
  └─ elegido              → mezclar: macros de la 1ª llamada (o de la etiqueta),
                            micros de la fila de USDA, sourceMicros: "usda", usdaFdcId
```

⚠️ **La regla de mezcla (§5.2 del spec):** con `sourceMacros: "label"` la etiqueta gana en los
campos que cubre y USDA rellena **solo lo que la etiqueta no trae**. Con `sourceMacros: "ai"`,
USDA gana en todo lo que tenga.

Agregar `GET /nutrition/usda/search?q=…` para el "¿no es este?" del Plan 2.

- [ ] **Step 4: Correr toda la suite**

Run: `bun test shared backend`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Hacé que el camino "sin candidatos" tire 500. Esperado: falla "el alta NO se bloquea". Hacé que
los micros sin match se guarden en 0. Esperado: falla la aserción `null, NO 0`. Restaurá.

- [ ] **Step 6: Prueba E2E a mano**

```bash
cd backend && bun run start
curl -s -X POST localhost:8787/nutrition/foods/describe \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"text":"huevo frito"}' | jq '{name, sourceMacros, sourceMicros, usdaFdcId, iron_mg, vitamin_b12_mcg}'
```

Expected: `sourceMicros: "usda"`, `usdaFdcId` real, hierro y B12 con valores plausibles
(un huevo frito ronda 1.9 mg de hierro y 1.3 mcg de B12 por 100 g).

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/src/routes/nutrition.test.ts
git commit -S -m "feat(nutricion): los micros salen de USDA con eleccion asistida por IA"
```

---

## Cierre del plan

- [ ] `bun test shared backend` verde entero.
- [ ] Abrir PR contra `main` y disparar `@claude review`.
- [ ] ⚠️ **El review de `@claude` es estático: no corre Bash.** Ya aprobó un PR con 3 bugs de
      runtime adentro. Los tests de mutación de cada tarea son la defensa real, no el review.
- [ ] **NO deployar a la Pi sin supervisión del usuario** — hay una migración destructiva.
- [ ] Escribir el **Plan 2 (UI)** con los nombres de campo reales que quedaron.

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| El `DROP COLUMN salt_g` corre antes del `UPDATE` y se pierde el sodio | Task 6 Step 6: verificar el orden a ojo; Step 7 lo comprueba contra la base |
| Un `nutrient_id` de USDA mal mapeado carga selenio como zinc | Task 8 Steps 2 y 5: verificación contra `nutrient.csv` + chequeo de cordura sobre el huevo |
| Un valor de EFSA mal transcripto | Task 11 Step 1: transcribir de la fuente con cita; el plan no trae los números a propósito |
| El matcher elige `raw` cuando era `fried` | El "¿no es este?" del Plan 2; `usdaFdcId` queda guardado para poder corregir después |
| Yodo y biotina casi siempre vacíos | Esperado (§3 del spec): se muestran como "sin dato", nunca 0 |
