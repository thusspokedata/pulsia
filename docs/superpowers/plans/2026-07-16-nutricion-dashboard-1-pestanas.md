# Dashboard de nutrición — PR1 (pestañas + torta + dona) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el Detalle del día en un dashboard de 4 pestañas (Resumen / Calorías / Nutrientes / Macros) con torta de calorías por comida, dona de macros y referencias OMS para los micronutrientes.

**Architecture:** Los cálculos van como funciones puras en `shared/` (`references.ts`, `breakdown.ts`), un único componente `PieChart` (con `innerRadius` para la dona) cubre los dos gráficos, y `mobile/app/nutricion/detalle.tsx` pasa a ser un shell que renderiza el tab activo. Cada tab es un componente en `mobile/src/nutrition/tabs/`. El hook `useNutritionDay` **no cambia**: se llama una vez en el shell y se pasa por props.

**Tech Stack:** Bun workspaces (`shared` + `mobile`), Zod 4, React Native / Expo SDK 57, expo-router, `react-native-svg` (ya es dependencia), `bun test` en shared, `jest-expo` + `@testing-library/react-native` en mobile.

**Spec:** `docs/superpowers/specs/2026-07-16-nutricion-dashboard-design.md`

**Restricciones del repo (no negociables):**
- **Cero dependencias nuevas.** Cambiarían el fingerprint del runtime y romperían el OTA a vc10.
- Sin migraciones y sin tocar backend. PR1 es 100% `shared/` + `mobile/`.
- TDD: test que falla primero, siempre.
- Commits firmados: `git commit -S`. **Nunca** agregar atribución a Claude/Anthropic.
- Rama por PR, nunca commitear directo a `main`.
- No tocar `ONBOARDING.md` (tiene una modificación previa sin commitear que no es nuestra).

---

## Antes de la Task 1: la rama

Todo el trabajo va en una rama nueva, sacada de `main` actualizado:

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout main && git pull
git checkout -b feat/nutricion-dashboard-pestanas
```

`ONBOARDING.md` tiene una modificación previa sin commitear que **no es nuestra**: sobrevive al
cambio de rama y hay que dejarla ahí, sin `git add`.

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `shared/src/nutrition/references.ts` (crear) | Referencias OMS de micronutrientes + el sentido de cada una (límite vs piso). |
| `shared/src/nutrition/references.test.ts` (crear) | Tests de `saturatedFatRefG`. |
| `shared/src/nutrition/breakdown.ts` (crear) | `caloriesByMeal` + `macroSplit`. Puras, sin I/O. |
| `shared/src/nutrition/breakdown.test.ts` (crear) | Tests de ambas. |
| `shared/src/index.ts` (modificar) | Exportar los dos módulos nuevos. |
| `mobile/src/components/PieChart.tsx` (crear) | Torta/dona SVG. Único componente de gráfico del PR. |
| `mobile/__tests__/piechart.test.tsx` (crear) | Tests de render de arcos. |
| `mobile/src/nutrition/tabs/ui.tsx` (crear) | `Card`, `SectionTitle`, `Bar`, `EmptyState` — compartidos por los tabs. |
| `mobile/src/nutrition/tabs/ResumenTab.tsx` (crear) | Calorías + macros en barras + líquido. |
| `mobile/src/nutrition/tabs/NutrientesTab.tsx` (crear) | Tabla de micros con referencias. |
| `mobile/src/nutrition/tabs/CaloriasTab.tsx` (crear) | Torta de kcal por comida + leyenda. |
| `mobile/src/nutrition/tabs/MacrosTab.tsx` (crear) | Dona de macros (% real vs % meta) + gramos. |
| `mobile/app/nutricion/detalle.tsx` (modificar) | Shell: título + `SegmentToggle` + tab activo. |
| `mobile/__tests__/detalle.test.tsx` (crear) | Cambio de tab + contenido de cada uno. |

---

### Task 1: Referencias OMS en `shared/`

**Files:**
- Create: `shared/src/nutrition/references.ts`
- Test: `shared/src/nutrition/references.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Crear `shared/src/nutrition/references.test.ts`:

```ts
import { test, expect } from "bun:test";
import { NUTRIENT_REFERENCES, NUTRIENT_REFERENCE_KIND, saturatedFatRefG } from "./references";

test("las referencias fijas son las de la OMS", () => {
  expect(NUTRIENT_REFERENCES.fiber_g).toBe(30);
  expect(NUTRIENT_REFERENCES.salt_g).toBe(5);
  expect(NUTRIENT_REFERENCES.sugars_g).toBe(50);
  expect(NUTRIENT_REFERENCES.cholesterol_mg).toBe(300);
});

test("la fibra es un PISO y el resto son LÍMITES (define el color de la barra)", () => {
  expect(NUTRIENT_REFERENCE_KIND.fiber_g).toBe("min");
  expect(NUTRIENT_REFERENCE_KIND.salt_g).toBe("max");
  expect(NUTRIENT_REFERENCE_KIND.sugars_g).toBe("max");
  expect(NUTRIENT_REFERENCE_KIND.saturated_fat_g).toBe("max");
  expect(NUTRIENT_REFERENCE_KIND.cholesterol_mg).toBe("max");
});

test("saturadas: 10% de la energía / 9 kcal por gramo, a 1 decimal", () => {
  expect(saturatedFatRefG(2000)).toBe(22.2); // 200 kcal / 9
  expect(saturatedFatRefG(2500)).toBe(27.8); // 250 kcal / 9
});

test("saturadas: meta no positiva → 0 (no se muestra referencia negativa ni NaN)", () => {
  expect(saturatedFatRefG(0)).toBe(0);
  expect(saturatedFatRefG(-100)).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test src/nutrition/references.test.ts
```

Expected: FAIL — `Cannot find module './references'`.

- [ ] **Step 3: Write minimal implementation**

Crear `shared/src/nutrition/references.ts`:

```ts
// Referencias públicas para micronutrientes. NO son metas personales calculadas a partir del
// perfil: son referencias de organismos públicos, y la UI las muestra como "ref", no como
// objetivo del usuario.
export const NUTRIENT_REFERENCES = {
  fiber_g: 30, // OMS/EFSA: ≥25–30 g/día
  salt_g: 5, // OMS: <5 g/día de sal
  sugars_g: 50, // OMS: azúcares libres <10% de la energía (~50 g en una dieta de 2000 kcal)
  cholesterol_mg: 300, // referencia clásica de 300 mg/día
} as const;

// Sentido de cada referencia: "max" = límite a no pasar (pasarse pinta ámbar);
// "min" = piso a alcanzar (pasarse es BUENO, nunca pinta ámbar). La fibra es el único piso.
export const NUTRIENT_REFERENCE_KIND = {
  fiber_g: "min",
  salt_g: "max",
  sugars_g: "max",
  saturated_fat_g: "max",
  cholesterol_mg: "max",
} as const;

// Saturadas: la OMS las acota al 10% de la ENERGÍA, no a gramos fijos → depende de la meta de
// kcal, y por eso no vive en NUTRIENT_REFERENCES. 9 kcal por gramo de grasa; 1 decimal, como el
// resto de los micros (ver sumNullableMicro en macros.ts).
export function saturatedFatRefG(goalKcal: number): number {
  if (goalKcal <= 0) return 0;
  return Math.round(((goalKcal * 0.1) / 9) * 10) / 10;
}
```

- [ ] **Step 4: Export from the package index**

En `shared/src/index.ts`, después de la línea `export * from "./nutrition/exerciseBurn";`, agregar:

```ts
export * from "./nutrition/references";
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test src/nutrition/references.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add shared/src/nutrition/references.ts shared/src/nutrition/references.test.ts shared/src/index.ts
git commit -S -m "feat(nutrición): referencias OMS de micronutrientes en shared"
```

---

### Task 2: `caloriesByMeal` en `shared/`

**Files:**
- Create: `shared/src/nutrition/breakdown.ts`
- Test: `shared/src/nutrition/breakdown.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Crear `shared/src/nutrition/breakdown.test.ts`:

```ts
import { test, expect } from "bun:test";
import { caloriesByMeal } from "./breakdown";
import type { Meal } from "../schemas/nutrition";

const meal = (mealType: Meal["mealType"], kcals: number[]): Meal =>
  ({
    id: "m",
    eatenAt: 1,
    mealType,
    note: null,
    items: kcals.map((kcal) => ({ kcal, protein_g: 0, carbs_g: 0, fat_g: 0 })),
  }) as any;

test("agrupa por tipo de comida y calcula el % sobre el total del día", () => {
  const slices = caloriesByMeal([meal("desayuno", [300]), meal("cena", [700])]);
  expect(slices).toEqual([
    { key: "desayuno", label: "Desayuno", kcal: 300, pct: 30 },
    { key: "cena", label: "Cena", kcal: 700, pct: 70 },
  ]);
});

test("suma varias comidas del mismo tipo en una sola porción", () => {
  const slices = caloriesByMeal([meal("snack", [100]), meal("snack", [300])]);
  expect(slices).toEqual([{ key: "snack", label: "Snack", kcal: 400, pct: 100 }]);
});

test("mealType null cae en el bucket 'Sin tipo', al final del orden canónico", () => {
  const slices = caloriesByMeal([meal(null, [500]), meal("desayuno", [500])]);
  expect(slices.map((s) => s.key)).toEqual(["desayuno", "sin_tipo"]);
  expect(slices[1]).toEqual({ key: "sin_tipo", label: "Sin tipo", kcal: 500, pct: 50 });
});

test("respeta el orden canónico, no el orden de llegada", () => {
  const slices = caloriesByMeal([meal("cena", [100]), meal("desayuno", [100]), meal("almuerzo", [100])]);
  expect(slices.map((s) => s.key)).toEqual(["desayuno", "almuerzo", "cena"]);
});

test("las comidas de 0 kcal no generan porción", () => {
  const slices = caloriesByMeal([meal("desayuno", [0]), meal("cena", [500])]);
  expect(slices.map((s) => s.key)).toEqual(["cena"]);
});

test("día sin comidas → sin porciones", () => {
  expect(caloriesByMeal([])).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test src/nutrition/breakdown.test.ts
```

Expected: FAIL — `Cannot find module './breakdown'`.

- [ ] **Step 3: Write minimal implementation**

Crear `shared/src/nutrition/breakdown.ts`:

```ts
import type { Meal, MealType } from "../schemas/nutrition";

export type MealSliceKey = MealType | "sin_tipo";

export interface MealSlice {
  key: MealSliceKey;
  label: string;
  kcal: number;
  pct: number; // 0–100, sobre el total del día
}

// Orden canónico de la torta. "sin_tipo" va último: mealType es nullable en el schema, así que
// una comida puede no tener tipo.
const MEAL_ORDER: { key: MealSliceKey; label: string }[] = [
  { key: "desayuno", label: "Desayuno" },
  { key: "almuerzo", label: "Almuerzo" },
  { key: "cena", label: "Cena" },
  { key: "snack", label: "Snack" },
  { key: "sin_tipo", label: "Sin tipo" },
];

export function caloriesByMeal(meals: Meal[]): MealSlice[] {
  const kcalBy = new Map<MealSliceKey, number>();
  for (const m of meals) {
    const key: MealSliceKey = m.mealType ?? "sin_tipo";
    const kcal = m.items.reduce((a, it) => a + it.kcal, 0);
    kcalBy.set(key, (kcalBy.get(key) ?? 0) + kcal);
  }
  const total = [...kcalBy.values()].reduce((a, v) => a + v, 0);
  if (total <= 0) return [];
  // El % se calcula sobre los kcal CRUDOS (no los redondeados) para que no se desvíe.
  return MEAL_ORDER.flatMap(({ key, label }) => {
    const kcal = kcalBy.get(key) ?? 0;
    if (kcal <= 0) return [];
    return [{ key, label, kcal: Math.round(kcal), pct: Math.round((kcal / total) * 100) }];
  });
}
```

- [ ] **Step 4: Export from the package index**

En `shared/src/index.ts`, después de `export * from "./nutrition/references";`, agregar:

```ts
export * from "./nutrition/breakdown";
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test src/nutrition/breakdown.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add shared/src/nutrition/breakdown.ts shared/src/nutrition/breakdown.test.ts shared/src/index.ts
git commit -S -m "feat(nutrición): caloriesByMeal — kcal por comida para la torta"
```

---

### Task 3: `macroSplit` en `shared/`

**Files:**
- Modify: `shared/src/nutrition/breakdown.ts`
- Test: `shared/src/nutrition/breakdown.test.ts`

- [ ] **Step 1: Write the failing test**

Agregar al final de `shared/src/nutrition/breakdown.test.ts`:

```ts
import { macroSplit } from "./breakdown";

test("reparte las kcal por macro (4/4/9) y calcula el % sobre las kcal DERIVADAS de los macros", () => {
  // 100 g prot = 400 kcal · 100 g carbs = 400 kcal · 22.2 g grasa ≈ 200 kcal → total 1000
  const slices = macroSplit({ protein_g: 100, carbs_g: 100, fat_g: 22.2 }, null);
  expect(slices.map((s) => s.kcal)).toEqual([400, 400, 200]);
  expect(slices.map((s) => s.pctActual)).toEqual([40, 40, 20]);
});

test("sin meta, pctTarget es null en todas las porciones", () => {
  const slices = macroSplit({ protein_g: 100, carbs_g: 100, fat_g: 22.2 }, null);
  expect(slices.map((s) => s.pctTarget)).toEqual([null, null, null]);
});

test("con meta, pctTarget sale de la meta (no de lo comido)", () => {
  const slices = macroSplit(
    { protein_g: 10, carbs_g: 10, fat_g: 10 },
    { protein_g: 150, carbs_g: 200, fat_g: 66.7 }, // 600 + 800 + 600 = 2000 kcal → 30/40/30
  );
  expect(slices.map((s) => s.pctTarget)).toEqual([30, 40, 30]);
});

test("día vacío: 0 g, 0 kcal y 0% (sin NaN por dividir por cero)", () => {
  const slices = macroSplit({ protein_g: 0, carbs_g: 0, fat_g: 0 }, null);
  expect(slices.map((s) => s.pctActual)).toEqual([0, 0, 0]);
  expect(slices.map((s) => s.kcal)).toEqual([0, 0, 0]);
});

test("las keys y el orden son proteína, carbos, grasa (mismo orden que las barras del Resumen)", () => {
  const slices = macroSplit({ protein_g: 1, carbs_g: 1, fat_g: 1 }, null);
  expect(slices.map((s) => s.key)).toEqual(["protein", "carbs", "fat"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test src/nutrition/breakdown.test.ts
```

Expected: FAIL — `macroSplit is not a function` / error de import.

- [ ] **Step 3: Write minimal implementation**

Agregar al final de `shared/src/nutrition/breakdown.ts`:

```ts
export interface MacroGrams {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MacroSlice {
  key: "protein" | "carbs" | "fat";
  label: string;
  g: number;
  kcal: number;
  pctActual: number; // 0–100, sobre las kcal derivadas de los macros
  pctTarget: number | null; // null si no hay meta
}

// Las kcal de la torta se DERIVAN de los gramos (4/4/9), no se toman de dayTotals.kcal: los dos
// números pueden diferir por redondeos de etiqueta, y una torta tiene que cerrar en 100%.
const MACRO_ROWS = [
  { key: "protein", label: "Proteína", field: "protein_g", kcalPerG: 4 },
  { key: "carbs", label: "Carbohidratos", field: "carbs_g", kcalPerG: 4 },
  { key: "fat", label: "Grasa", field: "fat_g", kcalPerG: 9 },
] as const;

// OJO: los pct se redondean por separado, así que pueden sumar 99 o 101 (p.ej. tres tercios).
// Es solo texto de la leyenda: los arcos de la torta se dibujan con `kcal`, nunca con `pct`.
export function macroSplit(comido: MacroGrams, meta: MacroGrams | null): MacroSlice[] {
  const kcalOf = (src: MacroGrams) => MACRO_ROWS.map((r) => src[r.field] * r.kcalPerG);
  const actual = kcalOf(comido);
  const totalActual = actual.reduce((a, v) => a + v, 0);
  const target = meta ? kcalOf(meta) : null;
  const totalTarget = target ? target.reduce((a, v) => a + v, 0) : 0;
  return MACRO_ROWS.map((r, i) => ({
    key: r.key,
    label: r.label,
    g: Math.round(comido[r.field]),
    kcal: Math.round(actual[i]),
    pctActual: totalActual > 0 ? Math.round((actual[i] / totalActual) * 100) : 0,
    pctTarget: target && totalTarget > 0 ? Math.round((target[i] / totalTarget) * 100) : null,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test src/nutrition/breakdown.test.ts
```

Expected: PASS — 11 tests (los 6 de la Task 2 + 5 nuevos).

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add shared/src/nutrition/breakdown.ts shared/src/nutrition/breakdown.test.ts
git commit -S -m "feat(nutrición): macroSplit — % de kcal por macro, real vs meta"
```

---

### Task 4: Componente `PieChart` (torta + dona)

**Files:**
- Create: `mobile/src/components/PieChart.tsx`
- Test: `mobile/__tests__/piechart.test.tsx`

**Contexto:** `react-native-svg` ya es dependencia (la usan `LineChart`, `MultiLineChart` y `MuscleMap`). **No instalar nada.**

- [ ] **Step 1: Write the failing test**

Crear `mobile/__tests__/piechart.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { PieChart } from "../src/components/PieChart";

const three = [
  { label: "A", value: 300, color: "#111" },
  { label: "B", value: 500, color: "#222" },
  { label: "C", value: 200, color: "#333" },
];

test("dibuja un arco por porción", async () => {
  await render(<PieChart data={three} size={160} />);
  expect(screen.getByTestId("pie-arc-0")).toBeTruthy();
  expect(screen.getByTestId("pie-arc-1")).toBeTruthy();
  expect(screen.getByTestId("pie-arc-2")).toBeTruthy();
  expect(screen.queryByTestId("pie-arc-3")).toBeNull();
});

test("las porciones de valor 0 no se dibujan", async () => {
  await render(<PieChart data={[...three, { label: "D", value: 0, color: "#444" }]} size={160} />);
  expect(screen.queryByTestId("pie-arc-3")).toBeNull();
});

test("una sola porción se dibuja como círculo, no como arco (un arco de 360° degenera en SVG)", async () => {
  await render(<PieChart data={[{ label: "A", value: 10, color: "#111" }]} size={160} />);
  expect(screen.getByTestId("pie-arc-0").props.d).toBeUndefined(); // Circle, no Path
});

test("con varias porciones cada arco es un Path con su 'd'", async () => {
  await render(<PieChart data={three} size={160} />);
  expect(typeof screen.getByTestId("pie-arc-0").props.d).toBe("string");
});

test("sin datos (o todo en 0) no dibuja nada", async () => {
  await render(<PieChart data={[]} size={160} />);
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
  await render(<PieChart data={[{ label: "A", value: 0, color: "#111" }]} size={160} />);
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
});

test("innerRadius > 0 renderiza el contenido central", async () => {
  await render(<PieChart data={three} size={160} innerRadius={50} center={<Text>1800</Text>} />);
  expect(screen.getByText("1800")).toBeTruthy();
});
```

Agregar el import de `Text` arriba del archivo:

```tsx
import { Text } from "react-native";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- piechart
```

Expected: FAIL — `Cannot find module '../src/components/PieChart'`.

- [ ] **Step 3: Write minimal implementation**

Crear `mobile/src/components/PieChart.tsx`:

```tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  data: PieSlice[];
  size: number;
  innerRadius?: number; // 0 (default) = torta; > 0 = dona
  center?: ReactNode; // contenido del centro de la dona
}

// Punto del borde a `radius` del centro, en el ángulo dado en grados. -90 arranca a las 12 en punto.
function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

// Porción de torta (inner = 0) o de anillo (inner > 0), entre dos ángulos en grados.
function arcPath(cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  if (inner <= 0) return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  const [xi1, yi1] = polar(cx, cy, inner, a1);
  const [xi0, yi0] = polar(cx, cy, inner, a0);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0} Z`;
}

// Torta/dona. Los colores los pasa el que llama (desde theme/tokens): el componente no elige paleta.
// La leyenda va aparte, en cada tab, porque el formato del valor cambia (kcal vs %).
export function PieChart({ data, size, innerRadius = 0, center }: Props) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((a, d) => a + d.value, 0);
  if (total <= 0) return null;

  const c = size / 2;
  const r = size / 2;
  let acc = 0;
  const arcs = slices.map((d) => {
    const a0 = (acc / total) * 360;
    acc += d.value;
    return { d, a0, a1: (acc / total) * 360 };
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {arcs.length === 1 ? (
          // Un arco de 360° degenera: los dos extremos coinciden y el path no dibuja nada.
          innerRadius > 0 ? (
            <Circle
              testID="pie-arc-0"
              cx={c}
              cy={c}
              r={(r + innerRadius) / 2}
              stroke={arcs[0].d.color}
              strokeWidth={r - innerRadius}
              fill="none"
            />
          ) : (
            <Circle testID="pie-arc-0" cx={c} cy={c} r={r} fill={arcs[0].d.color} />
          )
        ) : (
          arcs.map((a, i) => (
            <Path key={a.d.label} testID={`pie-arc-${i}`} d={arcPath(c, c, r, innerRadius, a.a0, a.a1)} fill={a.d.color} />
          ))
        )}
      </Svg>
      {center}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- piechart
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/components/PieChart.tsx mobile/__tests__/piechart.test.tsx
git commit -S -m "feat(nutrición): PieChart — torta y dona SVG, sin dependencias nuevas"
```

---

### Task 5: Shell con pestañas + Resumen + Nutrientes

Esta tarea **mueve** la UI que hoy está inline en `detalle.tsx` a dos tabs, sin cambiar lo que se
ve dentro de cada card. Las referencias OMS entran en la Task 6.

**Files:**
- Create: `mobile/src/nutrition/tabs/ui.tsx`
- Create: `mobile/src/nutrition/tabs/ResumenTab.tsx`
- Create: `mobile/src/nutrition/tabs/NutrientesTab.tsx`
- Modify: `mobile/app/nutricion/detalle.tsx` (reemplazo completo)
- Test: `mobile/__tests__/detalle.test.tsx`

- [ ] **Step 1: Write the failing test**

Crear `mobile/__tests__/detalle.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import DetalleDiaScreen from "../app/nutricion/detalle";
import { useNutritionDay } from "../src/nutrition/useNutritionDay";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ offset: "0" }),
}));
jest.mock("../src/nutrition/useNutritionDay", () => ({ useNutritionDay: jest.fn() }));

const summary = {
  dayTotals: { kcal: 1800, protein_g: 120, carbs_g: 180, fat_g: 60, sugars_g: 40, fiber_g: 22, saturated_fat_g: 18, salt_g: 4 },
  cholesterolMg: 210,
  liquid: { total: 2100, drank: 1800, fromFood: 300 },
};
const goalView = {
  status: "ok",
  kcal: { meta: 2200, comido: 1800, exercise: 300, restante: 700, over: false },
  macros: [
    { key: "protein", label: "Proteína", comido: 120, meta: 150, restante: 30, pct: 80, over: false },
    { key: "carbs", label: "Carbohidratos", comido: 180, meta: 220, restante: 40, pct: 82, over: false },
    { key: "fat", label: "Grasa", comido: 60, meta: 70, restante: 10, pct: 86, over: false },
  ],
};

function mockDay(over: Partial<any> = {}) {
  (useNutritionDay as jest.Mock).mockReturnValue({ error: null, meals: [], summary, goalView, ...over });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDay();
});

test("arranca en Resumen: calorías, macros en barras y líquido", async () => {
  await render(<DetalleDiaScreen />);
  expect(screen.getByText("Calorías")).toBeTruthy();
  expect(screen.getByText(/te quedan 700/)).toBeTruthy();
  expect(screen.getByText("Proteína")).toBeTruthy();
  expect(screen.getByText("2100 ml")).toBeTruthy();
});

test("tocar Nutrientes cambia de pestaña y muestra los micros", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("Azúcares")).toBeTruthy();
  expect(screen.getByText("Colesterol")).toBeTruthy();
  expect(screen.queryByText("2100 ml")).toBeNull(); // el Resumen ya no está montado
});

test("meta incompleta: el Resumen ofrece el link a Objetivo en vez de la barra", async () => {
  mockDay({ goalView: { status: "incomplete", missing: ["peso"] } });
  await render(<DetalleDiaScreen />);
  expect(screen.getByText("1800 kcal")).toBeTruthy();
  expect(screen.getByText(/Definí tu objetivo/)).toBeTruthy();
});

test("el error del hook se muestra en cualquier pestaña", async () => {
  mockDay({ error: "sin red" });
  await render(<DetalleDiaScreen />);
  expect(screen.getByText("sin red")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: FAIL — `Unable to find an element with testID: seg-nutrientes` (la pantalla todavía no tiene pestañas).

- [ ] **Step 3: Create the shared tab UI helpers**

Crear `mobile/src/nutrition/tabs/ui.tsx`:

```tsx
import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { colors, radius, spacing } from "../../theme/tokens";

export function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.textMuted, fontSize: 13 }}>{children}</Text>;
}

// Barra de progreso. `over` = se pasó de un LÍMITE (ámbar y llena); nunca se usa para un piso
// como la fibra, donde pasarse es bueno.
export function Bar({ pct, over }: { pct: number; over: boolean }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
      <View style={{ width: over ? "100%" : `${pct}%`, height: 8, backgroundColor: over ? colors.warning : colors.accent }} />
    </View>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.textMuted, fontSize: 13 }}>{children}</Text>;
}
```

- [ ] **Step 4: Create `ResumenTab`**

Crear `mobile/src/nutrition/tabs/ResumenTab.tsx`:

```tsx
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { remainingLabel } from "../goalView";
import type { GoalView } from "../goalView";
import type { NutritionDaySummary } from "../daySummary";
import { colors, spacing } from "../../theme/tokens";
import { Card, SectionTitle, Bar } from "./ui";

interface Props {
  summary: NutritionDaySummary;
  goalView: GoalView | null;
}

export function ResumenTab({ summary, goalView }: Props) {
  const { dayTotals, liquid } = summary;
  return (
    <>
      <Card>
        <SectionTitle>Calorías</SectionTitle>
        {goalView?.status === "ok" ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>
                {goalView.kcal!.comido} <Text style={{ fontSize: 15, color: colors.textMuted }}>/ {goalView.kcal!.meta}</Text>
              </Text>
              <Text style={{ color: goalView.kcal!.over ? colors.warning : colors.textMuted, fontSize: 13 }}>
                {goalView.kcal!.over ? `${-goalView.kcal!.restante} de más` : `te quedan ${goalView.kcal!.restante}`}
              </Text>
            </View>
            {/* La barra mide contra el presupuesto real del día (meta + ejercicio), igual que el restante. */}
            <Bar
              pct={Math.min(100, Math.round((goalView.kcal!.comido / (goalView.kcal!.meta + goalView.kcal!.exercise)) * 100))}
              over={goalView.kcal!.over}
            />
            {goalView.kcal!.exercise > 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Ejercicio +{goalView.kcal!.exercise} kcal (ya sumado al restante)
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>{dayTotals.kcal} kcal</Text>
            <Pressable onPress={() => router.push("/nutricion/objetivo")}>
              <Text style={{ color: colors.accentText, fontSize: 13 }}>Definí tu objetivo / completá tu perfil para ver tu meta →</Text>
            </Pressable>
          </>
        )}
      </Card>

      {goalView?.status === "ok" && (
        <Card>
          <SectionTitle>Macros</SectionTitle>
          {goalView.macros!.map((m) => (
            <View key={m.key} style={{ gap: 4, marginTop: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{m.label}</Text>
                <Text style={{ color: m.over ? colors.warning : colors.textMuted, fontSize: 13 }}>
                  {m.comido} / {m.meta} g · {remainingLabel(m.restante)}
                </Text>
              </View>
              <Bar pct={m.pct} over={m.over} />
            </View>
          ))}
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ color: colors.text, fontSize: 14 }}>Líquido</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{liquid.total} ml</Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          tomada {Math.round(liquid.drank)} · aporte de alimentos {Math.round(liquid.fromFood)}
        </Text>
      </Card>
    </>
  );
}
```

- [ ] **Step 5: Create `NutrientesTab` (todavía sin referencias)**

Crear `mobile/src/nutrition/tabs/NutrientesTab.tsx`:

```tsx
import { View, Text } from "react-native";
import type { NutritionDaySummary } from "../daySummary";
import { colors } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState } from "./ui";

interface Props {
  summary: NutritionDaySummary;
}

export function NutrientesTab({ summary }: Props) {
  const { dayTotals, cholesterolMg } = summary;
  const rows = [
    ["Azúcares", dayTotals.sugars_g, "g"],
    ["Fibra", dayTotals.fiber_g, "g"],
    ["Grasas saturadas", dayTotals.saturated_fat_g, "g"],
    ["Sal", dayTotals.salt_g, "g"],
    ["Colesterol", cholesterolMg, "mg"],
  ] as [string, number | null, string][];

  if (rows.every(([, v]) => v == null)) {
    return (
      <Card>
        <SectionTitle>Nutrientes</SectionTitle>
        <EmptyState>Todavía no hay datos de nutrientes para este día.</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Nutrientes</SectionTitle>
      {rows.map(([label, v, unit]) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>{v == null ? "—" : `${Math.round(v)} ${unit}`}</Text>
        </View>
      ))}
    </Card>
  );
}
```

- [ ] **Step 6: Rewrite `detalle.tsx` as the shell**

Reemplazar **todo** el contenido de `mobile/app/nutricion/detalle.tsx` por:

```tsx
import { useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useNutritionDay } from "../../src/nutrition/useNutritionDay";
import { ResumenTab } from "../../src/nutrition/tabs/ResumenTab";
import { NutrientesTab } from "../../src/nutrition/tabs/NutrientesTab";
import { SegmentToggle } from "../../src/components/SegmentToggle";
import { colors, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

type TabKey = "resumen" | "nutrientes";

const TABS: { value: TabKey; label: string }[] = [
  { value: "resumen", label: "Resumen" },
  { value: "nutrientes", label: "Nutrientes" },
];

export default function DetalleDiaScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { offset: offsetParam } = useLocalSearchParams<{ offset?: string }>();
  const offset = Number(offsetParam ?? 0) || 0;
  const { error, summary, goalView } = useNutritionDay(offset);
  const [tab, setTab] = useState<TabKey>("resumen");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Detalle del día</Text>
      <SegmentToggle options={TABS} value={tab} onChange={(v) => setTab(v as TabKey)} />

      {tab === "resumen" && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
            Comido = lo registrado · Meta = tu objetivo · Restante = Meta − Comido + Ejercicio. El gasto del ejercicio se
            estima desde tus sesiones (FC o duración).
          </Text>
          <ResumenTab summary={summary} goalView={goalView} />
        </>
      )}
      {tab === "nutrientes" && <NutrientesTab summary={summary} />}

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: PASS — 4 tests.

- [ ] **Step 8: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/nutricion/detalle.tsx mobile/src/nutrition/tabs mobile/__tests__/detalle.test.tsx
git commit -S -m "refactor(nutrición): detalle del día como shell con pestañas (Resumen + Nutrientes)"
```

---

### Task 6: Referencias OMS en la pestaña Nutrientes

**Files:**
- Modify: `mobile/src/nutrition/tabs/NutrientesTab.tsx` (reemplazo completo)
- Test: `mobile/__tests__/detalle.test.tsx`

- [ ] **Step 1: Write the failing test**

Agregar al final de `mobile/__tests__/detalle.test.tsx`:

```tsx
test("cada micro se compara contra su referencia; pasarse de un LÍMITE avisa", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("40 / 50 g")).toBeTruthy(); // azúcares, ref fija
  expect(screen.getByText("210 / 300 mg")).toBeTruthy(); // colesterol
  expect(screen.getByText("18 / 24.4 g")).toBeTruthy(); // saturadas: 10% de 2200 kcal / 9
});

test("la fibra es un PISO: llegar a 30 no avisa, y el texto dice 'ref'", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("22 / 30 g")).toBeTruthy();
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.backgroundColor).not.toBe("#B45309"); // colors.warning
});

test("sal por encima del límite: la barra pinta ámbar", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, salt_g: 9 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-salt_g-bar").props.style.backgroundColor).toBe("#B45309"); // colors.warning
});

test("micro sin dato: muestra — y no dibuja barra", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, fiber_g: null } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.queryByTestId("nutr-fiber_g-bar")).toBeNull();
});

test("meta incompleta: saturadas se muestra sin referencia (el 10% depende de la meta de kcal)", async () => {
  mockDay({ goalView: { status: "incomplete", missing: ["peso"] } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("18 g")).toBeTruthy(); // sin "/ ref"
  expect(screen.getByText("40 / 50 g")).toBeTruthy(); // las fijas sí siguen
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: FAIL — `Unable to find an element with text: 40 / 50 g`.

- [ ] **Step 3: Rewrite `NutrientesTab` with references**

Reemplazar **todo** el contenido de `mobile/src/nutrition/tabs/NutrientesTab.tsx` por:

```tsx
import { View, Text } from "react-native";
import { NUTRIENT_REFERENCES, NUTRIENT_REFERENCE_KIND, saturatedFatRefG } from "@pulsia/shared";
import type { GoalView } from "../goalView";
import type { NutritionDaySummary } from "../daySummary";
import { colors } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState } from "./ui";

interface Props {
  summary: NutritionDaySummary;
  goalView: GoalView | null;
}

type RowKey = keyof typeof NUTRIENT_REFERENCE_KIND;

interface NutrRow {
  key: RowKey;
  label: string;
  value: number | null;
  ref: number | null; // null = sin referencia que mostrar (saturadas sin meta de kcal)
  unit: string;
}

export function NutrientesTab({ summary, goalView }: Props) {
  const { dayTotals, cholesterolMg } = summary;
  const goalKcal = goalView?.status === "ok" ? goalView.kcal!.meta : null;

  const rows: NutrRow[] = [
    { key: "sugars_g", label: "Azúcares", value: dayTotals.sugars_g, ref: NUTRIENT_REFERENCES.sugars_g, unit: "g" },
    { key: "fiber_g", label: "Fibra", value: dayTotals.fiber_g, ref: NUTRIENT_REFERENCES.fiber_g, unit: "g" },
    {
      key: "saturated_fat_g",
      label: "Grasas saturadas",
      value: dayTotals.saturated_fat_g,
      ref: goalKcal != null ? saturatedFatRefG(goalKcal) : null,
      unit: "g",
    },
    { key: "salt_g", label: "Sal", value: dayTotals.salt_g, ref: NUTRIENT_REFERENCES.salt_g, unit: "g" },
    { key: "cholesterol_mg", label: "Colesterol", value: cholesterolMg, ref: NUTRIENT_REFERENCES.cholesterol_mg, unit: "mg" },
  ];

  if (rows.every((r) => r.value == null)) {
    return (
      <Card>
        <SectionTitle>Nutrientes</SectionTitle>
        <EmptyState>Todavía no hay datos de nutrientes para este día.</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Nutrientes</SectionTitle>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
        La referencia es pública (OMS), no una meta calculada para vos. La fibra es un piso a alcanzar; el resto, límites a
        no pasar.
      </Text>
      {rows.map((r) => {
        // over solo aplica a los límites: pasarse del piso de fibra es BUENO, no se avisa.
        const over = r.value != null && r.ref != null && NUTRIENT_REFERENCE_KIND[r.key] === "max" && r.value > r.ref;
        const pct = r.value != null && r.ref != null && r.ref > 0 ? Math.min(100, Math.round((r.value / r.ref) * 100)) : 0;
        return (
          <View key={r.key} style={{ gap: 4, marginTop: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{r.label}</Text>
              <Text style={{ color: over ? colors.warning : colors.textMuted, fontSize: 13 }}>
                {r.value == null ? "—" : r.ref == null ? `${Math.round(r.value)} ${r.unit}` : `${Math.round(r.value)} / ${r.ref} ${r.unit}`}
              </Text>
            </View>
            {r.value != null && r.ref != null && (
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
                <View
                  testID={`nutr-${r.key}-bar`}
                  style={{ width: over ? "100%" : `${pct}%`, height: 8, backgroundColor: over ? colors.warning : colors.accent }}
                />
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}
```

**Nota:** este tab no usa el helper `Bar` de `ui.tsx` porque necesita un `testID` en la parte
llena para que el test pueda leer el color. `Bar` sigue en uso en `ResumenTab`.

- [ ] **Step 4: Pass `goalView` to the tab**

En `mobile/app/nutricion/detalle.tsx`, cambiar la línea:

```tsx
      {tab === "nutrientes" && <NutrientesTab summary={summary} />}
```

por:

```tsx
      {tab === "nutrientes" && <NutrientesTab summary={summary} goalView={goalView} />}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/tabs/NutrientesTab.tsx mobile/app/nutricion/detalle.tsx mobile/__tests__/detalle.test.tsx
git commit -S -m "feat(nutrición): referencias OMS en la pestaña de nutrientes"
```

---

### Task 7: Pestaña Calorías (torta por comida)

**Files:**
- Create: `mobile/src/nutrition/tabs/CaloriasTab.tsx`
- Modify: `mobile/app/nutricion/detalle.tsx`
- Test: `mobile/__tests__/detalle.test.tsx`

- [ ] **Step 1: Write the failing test**

Agregar al final de `mobile/__tests__/detalle.test.tsx`:

```tsx
const mealsFixture = [
  { id: "m1", eatenAt: 1, mealType: "desayuno", note: null, items: [{ kcal: 500, protein_g: 0, carbs_g: 0, fat_g: 0 }] },
  { id: "m2", eatenAt: 2, mealType: "cena", note: null, items: [{ kcal: 1500, protein_g: 0, carbs_g: 0, fat_g: 0 }] },
];

test("pestaña Calorías: torta con una porción por comida + leyenda con kcal y %", async () => {
  mockDay({ meals: mealsFixture });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-calorias"));
  expect(screen.getByTestId("pie-arc-0")).toBeTruthy();
  expect(screen.getByTestId("pie-arc-1")).toBeTruthy();
  expect(screen.getByText("Desayuno")).toBeTruthy();
  expect(screen.getByText("500 kcal · 25%")).toBeTruthy();
  expect(screen.getByText("1500 kcal · 75%")).toBeTruthy();
});

test("pestaña Calorías sin comidas: empty state, sin torta", async () => {
  mockDay({ meals: [] });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-calorias"));
  expect(screen.getByText(/Todavía no registraste comidas/)).toBeTruthy();
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: FAIL — `Unable to find an element with testID: seg-calorias`.

- [ ] **Step 3: Create `CaloriasTab`**

Crear `mobile/src/nutrition/tabs/CaloriasTab.tsx`:

```tsx
import { View, Text } from "react-native";
import { caloriesByMeal, type MealSliceKey } from "@pulsia/shared";
import type { Meal } from "@pulsia/shared";
import { PieChart } from "../../components/PieChart";
import { colors, spacing } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState } from "./ui";

// Paleta de la torta, desde los tokens. Este mismo mapa alimenta los arcos Y la leyenda, así el
// color de la porción y el de su etiqueta no se pueden desincronizar.
const MEAL_COLORS: Record<MealSliceKey, string> = {
  desayuno: colors.accent,
  almuerzo: colors.success,
  cena: colors.warning,
  snack: colors.accentText,
  sin_tipo: colors.icon,
};

export function CaloriasTab({ meals }: { meals: Meal[] }) {
  const slices = caloriesByMeal(meals);

  if (slices.length === 0) {
    return (
      <Card>
        <SectionTitle>Calorías por comida</SectionTitle>
        <EmptyState>Todavía no registraste comidas este día.</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Calorías por comida</SectionTitle>
      <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <PieChart data={slices.map((s) => ({ label: s.label, value: s.kcal, color: MEAL_COLORS[s.key] }))} size={180} />
      </View>
      {slices.map((s) => (
        <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: MEAL_COLORS[s.key] }} />
          <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{s.label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {s.kcal} kcal · {s.pct}%
          </Text>
        </View>
      ))}
    </Card>
  );
}
```

- [ ] **Step 4: Wire the tab into the shell**

En `mobile/app/nutricion/detalle.tsx`:

1. Agregar el import, debajo del de `ResumenTab`:

```tsx
import { CaloriasTab } from "../../src/nutrition/tabs/CaloriasTab";
```

2. Cambiar el tipo y la lista de tabs:

```tsx
type TabKey = "resumen" | "calorias" | "nutrientes";

const TABS: { value: TabKey; label: string }[] = [
  { value: "resumen", label: "Resumen" },
  { value: "calorias", label: "Calorías" },
  { value: "nutrientes", label: "Nutrientes" },
];
```

3. Tomar `meals` del hook:

```tsx
  const { error, meals, summary, goalView } = useNutritionDay(offset);
```

4. Agregar el render del tab, justo antes de la línea de `nutrientes`:

```tsx
      {tab === "calorias" && <CaloriasTab meals={meals} />}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/tabs/CaloriasTab.tsx mobile/app/nutricion/detalle.tsx mobile/__tests__/detalle.test.tsx
git commit -S -m "feat(nutrición): pestaña Calorías con torta de kcal por comida"
```

---

### Task 8: Pestaña Macros (dona real vs meta)

**Files:**
- Create: `mobile/src/nutrition/tabs/MacrosTab.tsx`
- Modify: `mobile/app/nutricion/detalle.tsx`
- Test: `mobile/__tests__/detalle.test.tsx`

- [ ] **Step 1: Write the failing test**

Agregar al final de `mobile/__tests__/detalle.test.tsx`:

```tsx
test("pestaña Macros: dona con las 3 porciones, kcal al centro y % real vs meta", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-macros"));
  expect(screen.getByTestId("pie-arc-2")).toBeTruthy(); // 3 porciones
  // Comido: 120 g prot = 480 · 180 g carbs = 720 · 60 g grasa = 540 → 1740 kcal
  // Meta:   150 g prot = 600 · 220 g carbs = 880 · 70 g grasa = 630 → 2110 kcal
  expect(screen.getByTestId("macros-center-kcal").props.children).toBe(1740);
  // OJO: la leyenda es UN solo <Text>, así que getByText matchea la línea ENTERA.
  expect(screen.getByText("120 g · 28% · meta 28%")).toBeTruthy(); // 480/1740 y 600/2110
  expect(screen.getByText("180 g · 41% · meta 42%")).toBeTruthy(); // 720/1740 y 880/2110
  expect(screen.getByText("60 g · 31% · meta 30%")).toBeTruthy(); // 540/1740 y 630/2110
});

test("pestaña Macros sin meta: muestra el % real sin la comparación", async () => {
  mockDay({ goalView: { status: "incomplete", missing: ["peso"] } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-macros"));
  expect(screen.getByText("120 g · 28%")).toBeTruthy(); // sin el sufijo de meta
  expect(screen.queryByText(/meta/)).toBeNull();
});

test("pestaña Macros sin comidas: empty state, sin dona", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, protein_g: 0, carbs_g: 0, fat_g: 0 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-macros"));
  expect(screen.getByText(/Todavía no registraste comidas/)).toBeTruthy();
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: FAIL — `Unable to find an element with testID: seg-macros`.

- [ ] **Step 3: Create `MacrosTab`**

Crear `mobile/src/nutrition/tabs/MacrosTab.tsx`:

```tsx
import { View, Text } from "react-native";
import { macroSplit, type MacroSlice } from "@pulsia/shared";
import type { GoalView } from "../goalView";
import type { NutritionDaySummary } from "../daySummary";
import { PieChart } from "../../components/PieChart";
import { colors, spacing } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState } from "./ui";

const MACRO_COLORS: Record<MacroSlice["key"], string> = {
  protein: colors.accent,
  carbs: colors.success,
  fat: colors.warning,
};

interface Props {
  summary: NutritionDaySummary;
  goalView: GoalView | null;
}

export function MacrosTab({ summary, goalView }: Props) {
  const { dayTotals } = summary;
  // La meta de macros sale de goalView, que ya la trae en gramos por macro.
  const meta =
    goalView?.status === "ok"
      ? {
          protein_g: goalView.macros!.find((m) => m.key === "protein")!.meta,
          carbs_g: goalView.macros!.find((m) => m.key === "carbs")!.meta,
          fat_g: goalView.macros!.find((m) => m.key === "fat")!.meta,
        }
      : null;
  const slices = macroSplit(dayTotals, meta);
  const totalKcal = slices.reduce((a, s) => a + s.kcal, 0);

  if (totalKcal <= 0) {
    return (
      <Card>
        <SectionTitle>Reparto de macros</SectionTitle>
        <EmptyState>Todavía no registraste comidas este día.</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Reparto de macros</SectionTitle>
      <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <PieChart
          data={slices.map((s) => ({ label: s.label, value: s.kcal, color: MACRO_COLORS[s.key] }))}
          size={180}
          innerRadius={58}
          center={
            <View style={{ alignItems: "center" }}>
              <Text testID="macros-center-kcal" style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
                {totalKcal}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>kcal de macros</Text>
            </View>
          }
        />
      </View>
      {slices.map((s) => (
        <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: MACRO_COLORS[s.key] }} />
          <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{s.label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {s.g} g · {s.pctActual}%
            {s.pctTarget != null ? ` · meta ${s.pctTarget}%` : ""}
          </Text>
        </View>
      ))}
    </Card>
  );
}
```

- [ ] **Step 4: Wire the tab into the shell**

En `mobile/app/nutricion/detalle.tsx`:

1. Agregar el import, debajo del de `CaloriasTab`:

```tsx
import { MacrosTab } from "../../src/nutrition/tabs/MacrosTab";
```

2. Cambiar el tipo y la lista de tabs a la forma final:

```tsx
type TabKey = "resumen" | "calorias" | "nutrientes" | "macros";

const TABS: { value: TabKey; label: string }[] = [
  { value: "resumen", label: "Resumen" },
  { value: "calorias", label: "Calorías" },
  { value: "nutrientes", label: "Nutrientes" },
  { value: "macros", label: "Macros" },
];
```

3. Agregar el render del tab, después de la línea de `nutrientes`:

```tsx
      {tab === "macros" && <MacrosTab summary={summary} goalView={goalView} />}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: PASS — 14 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/tabs/MacrosTab.tsx mobile/app/nutricion/detalle.tsx mobile/__tests__/detalle.test.tsx
git commit -S -m "feat(nutrición): pestaña Macros con dona de reparto real vs meta"
```

---

### Task 9: Verificación final + PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Run the whole suite**

```bash
cd /Users/kilo/desarrollo26/pulsia && bun run test          # shared + backend
cd /Users/kilo/desarrollo26/pulsia && bun run test:mobile   # jest-expo
```

Expected: todo en verde. Backend no se tocó, pero corre igual porque `shared` cambió.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/kilo/desarrollo26/pulsia && bun run typecheck
```

Expected: sin errores en los tres workspaces.

- [ ] **Step 3: Verify no new dependencies snuck in**

```bash
cd /Users/kilo/desarrollo26/pulsia && git diff main --stat -- '**/package.json' bun.lock
```

Expected: **salida vacía**. Cualquier cambio acá rompe el OTA a vc10 y hay que revertirlo.

- [ ] **Step 4: Verify `ONBOARDING.md` was not touched**

```bash
cd /Users/kilo/desarrollo26/pulsia && git diff main --name-only | grep ONBOARDING
```

Expected: sin coincidencias (la modificación previa del working tree queda sin commitear).

- [ ] **Step 5: Push and open the PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git push -u origin feat/nutricion-dashboard-pestanas
gh pr create --title "feat(nutrición): dashboard del día con pestañas — torta, dona y referencias OMS" --body "$(cat <<'EOF'
## Qué hace

Convierte el Detalle del día en un dashboard de 4 pestañas, al estilo MyFitnessPal.

- **Resumen** — lo de antes: calorías (comido/meta/restante), macros en barras, líquido.
- **Calorías** — torta de kcal por comida + leyenda con kcal y %.
- **Nutrientes** — azúcares/fibra/saturadas/sal/colesterol contra referencias OMS.
- **Macros** — dona con el reparto real vs el de la meta.

## Notas de implementación

- Los cálculos son funciones puras en `shared/` (`references.ts`, `breakdown.ts`), con tests.
- Un solo componente `PieChart` cubre torta y dona (prop `innerRadius`), sobre `react-native-svg`, que ya era dependencia. **Cero dependencias nuevas** → sale por OTA a vc10.
- La fibra es un **piso** (≥30 g) y no un límite: pasarse no pinta ámbar. El resto son límites.
- Las saturadas son el 10% de la energía según la OMS, así que su referencia depende de la meta de kcal y no se muestra si el perfil está incompleto.
- Sin migraciones ni cambios de backend.

## Spec y plan

- Spec: `docs/superpowers/specs/2026-07-16-nutricion-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-07-16-nutricion-dashboard-1-pestanas.md`

## Fuera de alcance

"Alimentos con más X" + selector Día/7/30 van en el PR2. Los gráficos de evolución en el tiempo son una pieza aparte.
EOF
)"
```

- [ ] **Step 6: Verificación en device (después del merge y el OTA)**

Abrir el Detalle del día y confirmar que las 4 etiquetas del `SegmentToggle` entran sin cortarse
("Nutrientes" es la más larga). Si se cortan, acortar las etiquetas — **no** agregar scroll horizontal.

---

## Notas para quien ejecute

- **`bun run test -- <patrón>`** filtra por nombre de archivo en jest-expo. Si el script del móvil
  no acepta el `--`, correr `bunx jest <patrón>` desde `mobile/`.
- Los tests de `shared/` corren con `bun test` (no jest) y usan `import { test, expect } from "bun:test"`.
- El `cd` del shell persiste entre comandos: usar siempre rutas absolutas en `git add`, o
  `cd /Users/kilo/desarrollo26/pulsia && ...` como en los pasos de arriba.
- `colors.warning` es `#B45309`. Los tests comparan contra el literal a propósito: si alguien
  recolorea los tokens, el test avisa que el semáforo cambió.
