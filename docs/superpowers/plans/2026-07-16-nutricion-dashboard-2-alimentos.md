# Dashboard de nutrición — PR2 ("Alimentos con más X") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que tocar un nutriente en la pestaña Nutrientes abra el desglose de **qué alimentos lo aportaron**, ordenados de mayor a menor, con la cantidad comida, y con selector Día / 7 días / 30 días.

**Architecture:** Una función pura `foodsHighestIn` en `shared/` hace el ranking; un hook `useMealsRange` trae las comidas del rango (el backend ya acepta `from`/`to`); y una pantalla nueva `app/nutricion/nutriente.tsx` lo muestra reusando el helper `Bar` (barra horizontal por %) — **no hace falta ningún componente de gráfico nuevo**.

**Tech Stack:** Bun workspaces (`shared` + `mobile`), React Native / Expo SDK 57, expo-router, `bun test` en shared, `jest-expo` + `@testing-library/react-native` en mobile.

**Spec:** `docs/superpowers/specs/2026-07-16-nutricion-dashboard-design.md` (sección "El selector Día/7/30" y `foodsHighestIn`)

**Contexto de producto:** el usuario tiene colesterol alto con antecedentes familiares. El objetivo declarado no es solo ver el número, es **aprender**: entender qué alimentos se lo disparan para decidir si bajar la porción o sacarlos. Por eso el ranking muestra la **cantidad comida** al lado del aporte — "queso: 180 mg" no permite decidir nada; "120 g de queso → 180 mg" sí. Y por eso el rango de 7/30 días importa más que el día: un día es una anécdota, el mes es el patrón.

---

## Desvío deliberado respecto del spec

El spec dice: *"Día reusa los `meals` que `useNutritionDay` ya tiene cargados. Sin fetch."* Eso se escribió asumiendo que el desglose se expandía **dentro** de la pestaña. Este plan lo pone en una **pantalla aparte** (mejor: hay lugar para el selector y el ranking largo sin apretar la tabla), y una pantalla nueva no tiene los `meals` del hook a mano — pasarlos por params de expo-router no es viable (son objetos).

Entonces: **los tres rangos usan el mismo hook `useMealsRange`**, incluido "Día" (= rango de 1 día). Cuesta un fetch extra al abrir, y a cambio hay un solo camino de código en vez de dos. El resto del spec (lazy, el rango desde el `offset` del día que estás mirando, error inline) se mantiene.

---

## Antes de la Task 1: la rama

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout main && git pull
git checkout -b feat/nutricion-alimentos-por-nutriente
```

`ONBOARDING.md` tiene una modificación previa sin commitear que **no es nuestra**: dejala ahí, sin `git add`.

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `shared/src/nutrition/breakdown.ts` (modificar) | Agregar `foodsHighestIn`. |
| `shared/src/nutrition/breakdown.test.ts` (modificar) | Sus tests. |
| `mobile/src/nutrition/useMealsRange.ts` (crear) | Trae las comidas de un rango de N días. |
| `mobile/__tests__/useMealsRange.test.ts` (crear) | Test del cálculo del rango + estados. |
| `mobile/app/nutricion/nutriente.tsx` (crear) | La pantalla: selector de rango + ranking. |
| `mobile/__tests__/nutriente.test.tsx` (crear) | Tests de la pantalla. |
| `mobile/src/nutrition/tabs/NutrientesTab.tsx` (modificar) | Hacer las filas tappables. |
| `mobile/__tests__/detalle.test.tsx` (modificar) | Test de la navegación. |

---

### Task 1: `foodsHighestIn` en `shared/`

**Files:**
- Modify: `shared/src/nutrition/breakdown.ts`
- Test: `shared/src/nutrition/breakdown.test.ts`

`shared/src/index.ts` ya exporta `./nutrition/breakdown` — **no lo toques**.

- [ ] **Step 1: Write the failing tests**

Agregar `foodsHighestIn` al import que ya existe arriba del archivo de tests (no dupliques la línea de import) y agregar al final:

```ts
// El fixture de arriba (`meal`) solo pone kcal. Para el ranking hacen falta ítems con nombre,
// gramos y micros, así que va uno propio.
const itemsMeal = (items: any[]): Meal => ({ id: "m", eatenAt: 1, mealType: null, note: null, items } as any);
const it = (foodName: string, grams: number, o: any = {}) =>
  ({ foodName, grams, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cholesterol_mg: null, sugars_g: null, ...o });

test("ordena los alimentos por aporte del nutriente, de mayor a menor", () => {
  const meals = [itemsMeal([it("Queso", 100, { cholesterol_mg: 90 }), it("Huevo", 60, { cholesterol_mg: 220 })])];
  expect(foodsHighestIn(meals, "cholesterol_mg").map((f) => f.name)).toEqual(["Huevo", "Queso"]);
});

test("suma el mismo alimento comido varias veces (aporte y gramos)", () => {
  const meals = [
    itemsMeal([it("Queso", 100, { cholesterol_mg: 90 })]),
    itemsMeal([it("Queso", 50, { cholesterol_mg: 45 })]),
  ];
  expect(foodsHighestIn(meals, "cholesterol_mg")).toEqual([
    { name: "Queso", amount: 135, grams: 150, pctOfTotal: 100 },
  ]);
});

test("el % es sobre el total del nutriente en el rango", () => {
  const meals = [itemsMeal([it("Queso", 100, { cholesterol_mg: 75 }), it("Huevo", 60, { cholesterol_mg: 225 })])];
  expect(foodsHighestIn(meals, "cholesterol_mg").map((f) => f.pctOfTotal)).toEqual([75, 25]);
});

test("los ítems SIN el dato se saltean y no cuentan en el total", () => {
  // Si el alimento sin dato contara como 0, seguiría apareciendo con 0% y ensuciaría la lista.
  const meals = [itemsMeal([it("Queso", 100, { cholesterol_mg: 100 }), it("Lechuga", 50)])];
  const ranked = foodsHighestIn(meals, "cholesterol_mg");
  expect(ranked.map((f) => f.name)).toEqual(["Queso"]);
  expect(ranked[0].pctOfTotal).toBe(100);
});

test("los ítems con el dato en 0 tampoco aparecen (aportan nada que aprender)", () => {
  const meals = [itemsMeal([it("Queso", 100, { cholesterol_mg: 100 }), it("Manzana", 150, { cholesterol_mg: 0 })])];
  expect(foodsHighestIn(meals, "cholesterol_mg").map((f) => f.name)).toEqual(["Queso"]);
});

test("empate de aporte: ordena por nombre, para que la lista no baile entre renders", () => {
  const meals = [itemsMeal([it("Zapallo", 100, { sugars_g: 5 }), it("Aceituna", 100, { sugars_g: 5 })])];
  expect(foodsHighestIn(meals, "sugars_g").map((f) => f.name)).toEqual(["Aceituna", "Zapallo"]);
});

test("sin comidas, o sin ningún dato del nutriente → lista vacía (sin dividir por cero)", () => {
  expect(foodsHighestIn([], "cholesterol_mg")).toEqual([]);
  expect(foodsHighestIn([itemsMeal([it("Lechuga", 50)])], "cholesterol_mg")).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test src/nutrition/breakdown.test.ts
```

Expected: FAIL — `foodsHighestIn is not a function` / error de import.

- [ ] **Step 3: Write minimal implementation**

Agregar al final de `shared/src/nutrition/breakdown.ts`:

```ts
// Los micros que se pueden rankear. Son los del snapshot de MealItem que tienen referencia en la
// UI; `water_ml` queda afuera a propósito (el líquido tiene su propia vista).
export type RankNutrient = "sugars_g" | "fiber_g" | "saturated_fat_g" | "salt_g" | "cholesterol_mg";

export interface FoodRank {
  name: string;
  amount: number; // del nutriente, sumado en el rango
  grams: number; // cantidad comida, sumada — sin esto no se puede decidir si bajar la porción
  pctOfTotal: number; // 0–100
}

// Qué alimentos aportaron un nutriente, de mayor a menor. Agrupa por nombre: el mismo alimento
// comido en 5 comidas distintas es UNA fila, que es como se piensa ("¿cuánto queso comí?").
// Los ítems sin el dato (null) o en 0 no entran ni al ranking ni al total: un alimento que no
// aporta nada no enseña nada, y contarlo como 0 solo ensucia la lista.
export function foodsHighestIn(meals: Meal[], nutrient: RankNutrient): FoodRank[] {
  const by = new Map<string, { amount: number; grams: number }>();
  for (const m of meals) {
    for (const item of m.items) {
      const v = item[nutrient];
      if (v == null || v <= 0) continue;
      const acc = by.get(item.foodName) ?? { amount: 0, grams: 0 };
      by.set(item.foodName, { amount: acc.amount + v, grams: acc.grams + item.grams });
    }
  }
  const total = [...by.values()].reduce((a, v) => a + v.amount, 0);
  if (total <= 0) return [];
  return [...by.entries()]
    .map(([name, v]) => ({
      name,
      amount: Math.round(v.amount * 10) / 10, // 1 decimal, como el resto de los micros
      grams: Math.round(v.grams),
      pctOfTotal: pct(v.amount, total),
    }))
    // Desempate por nombre: sin esto el orden depende del de inserción y la lista baila.
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun test src/nutrition/breakdown.test.ts
```

Expected: PASS — 20 tests (los 13 que ya estaban + 7 nuevos).

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add shared/src/nutrition/breakdown.ts shared/src/nutrition/breakdown.test.ts
git commit -S -m "feat(nutrición): foodsHighestIn — qué alimentos aportan cada nutriente"
```

---

### Task 2: hook `useMealsRange`

**Files:**
- Create: `mobile/src/nutrition/useMealsRange.ts`
- Test: `mobile/__tests__/useMealsRange.test.ts`

**Contexto:** `mobile/src/nutrition/dayBounds.ts` da `{from, to}` de UN día por `offset` (positivo = pasado). Para N días hacia atrás desde `offset`: el `from` es el `dayBounds(offset + days - 1).from` y el `to` es el `dayBounds(offset).to`. Con `days = 1` eso colapsa al día solo, que es lo que queremos.

- [ ] **Step 1: Write the failing test**

Crear `mobile/__tests__/useMealsRange.test.ts`:

```ts
import { rangeBounds } from "../src/nutrition/useMealsRange";
import { dayBounds } from "../src/nutrition/dayBounds";

test("1 día = el día solo (mismos límites que dayBounds)", () => {
  expect(rangeBounds(1, 0)).toEqual({ from: dayBounds(0).from, to: dayBounds(0).to });
});

test("7 días termina HOY y arranca 6 días atrás (7 días contando hoy, no 8)", () => {
  expect(rangeBounds(7, 0)).toEqual({ from: dayBounds(6).from, to: dayBounds(0).to });
});

test("el rango se ancla al día que estás mirando, no a hoy", () => {
  // offset 3 = mirando 3 días atrás → 7 días termina ahí y arranca 9 días atrás.
  expect(rangeBounds(7, 3)).toEqual({ from: dayBounds(9).from, to: dayBounds(3).to });
});

test("30 días", () => {
  expect(rangeBounds(30, 0)).toEqual({ from: dayBounds(29).from, to: dayBounds(0).to });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- useMealsRange
```

Expected: FAIL — `Cannot find module '../src/nutrition/useMealsRange'`.

- [ ] **Step 3: Write minimal implementation**

Crear `mobile/src/nutrition/useMealsRange.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { getBackendUrl } from "../storage/config";
import { listMeals } from "../api/nutrition";
import type { Meal } from "@pulsia/shared";
import { dayBounds } from "./dayBounds";

export interface MealsRange {
  meals: Meal[];
  loading: boolean;
  error: string | null;
}

// Rango de `days` días que TERMINA en el día `offset` (offset positivo = pasado, convención del
// repo). `days = 1` colapsa al día solo. El -1 es porque el día del offset ya cuenta: 7 días
// son hoy + 6 atrás, no hoy + 7.
export function rangeBounds(days: number, offset: number): { from: number; to: number } {
  return { from: dayBounds(offset + days - 1).from, to: dayBounds(offset).to };
}

// Comidas de un rango. Distinto de useNutritionDay: no calcula metas ni gasto, solo trae comidas
// para rankear. Refetchea cuando cambian `days` u `offset`.
export function useMealsRange(days: number, offset: number): MealsRange {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = await getBackendUrl();
      const { from, to } = rangeBounds(days, offset);
      setMeals(await listMeals(url, from, to));
    } catch (e) {
      setError((e as Error).message);
      setMeals([]); // no dejar colgado el ranking del rango anterior si este falló
    }
    setLoading(false);
  }, [days, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return { meals, loading, error };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- useMealsRange
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/useMealsRange.ts mobile/__tests__/useMealsRange.test.ts
git commit -S -m "feat(nutrición): useMealsRange — comidas de un rango de N días"
```

---

### Task 3: la pantalla del nutriente

**Files:**
- Create: `mobile/app/nutricion/nutriente.tsx`
- Test: `mobile/__tests__/nutriente.test.tsx`

**Contexto:** `ChipGroup` (`mobile/src/components/ChipGroup.tsx`) es el selector de la casa para este tipo de rango (lo usa la pantalla de Informes con `single`). Leelo. `Card`/`SectionTitle`/`EmptyState`/`Bar` están en `mobile/src/nutrition/tabs/ui.tsx`. `useScreenPadding` (`mobile/src/theme/screen.ts`) es obligatorio: esta pantalla no tiene header y sin eso los chips se meten abajo de la barra de estado.

- [ ] **Step 1: Write the failing test**

Crear `mobile/__tests__/nutriente.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import NutrienteScreen from "../app/nutricion/nutriente";
import { listMeals } from "../src/api/nutrition";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ key: "cholesterol_mg", offset: "0" }),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({ listMeals: jest.fn(async () => []) }));

const meal = (items: any[]) => ({ id: "m", eatenAt: 1, mealType: null, note: null, items });
const item = (foodName: string, grams: number, cholesterol_mg: number | null) => ({
  id: "i", foodId: null, foodName, quantity: grams, quantityUnit: "g", grams,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  saturated_fat_g: null, sugars_g: null, fiber_g: null, salt_g: null, cholesterol_mg, water_ml: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Huevo", 120, 440), item("Queso", 60, 110)])]);
});

test("rankea los alimentos por aporte, con la cantidad comida y el %", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Huevo")).toBeTruthy());
  expect(screen.getByText("440 mg · 80%")).toBeTruthy();
  expect(screen.getByText("120 g")).toBeTruthy(); // la cantidad: sin esto no se puede decidir la porción
  expect(screen.getByText("110 mg · 20%")).toBeTruthy();
});

test("arranca en Día: pide un rango de 1 solo día", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(listMeals).toHaveBeenCalled());
  const [, from, to] = (listMeals as jest.Mock).mock.calls[0];
  expect(to - from).toBeLessThan(24 * 3600_000); // un día, no más
});

test("cambiar a 30 días refetchea con el rango largo", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(listMeals).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByText("30 días"));
  await waitFor(() => expect(listMeals).toHaveBeenCalledTimes(2));
  const [, from, to] = (listMeals as jest.Mock).mock.calls[1];
  expect(Math.round((to - from) / (24 * 3600_000))).toBe(30);
});

test("sin datos del nutriente en el rango: lo dice, no muestra una lista vacía", async () => {
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Lechuga", 50, null)])]);
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText(/Ningún alimento registrado aporta/)).toBeTruthy());
});

test("si falla la carga, muestra el error", async () => {
  (listMeals as jest.Mock).mockRejectedValue(new Error("sin red"));
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("sin red")).toBeTruthy());
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- nutriente
```

Expected: FAIL — `Cannot find module '../app/nutricion/nutriente'`.

- [ ] **Step 3: Write minimal implementation**

Crear `mobile/app/nutricion/nutriente.tsx`:

```tsx
import { useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { foodsHighestIn, type RankNutrient } from "@pulsia/shared";
import { useMealsRange } from "../../src/nutrition/useMealsRange";
import { ChipGroup } from "../../src/components/ChipGroup";
import { Card, SectionTitle, EmptyState, Bar } from "../../src/nutrition/tabs/ui";
import { colors, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

const NUTRIENT_LABEL: Record<RankNutrient, string> = {
  sugars_g: "azúcares",
  fiber_g: "fibra",
  saturated_fat_g: "grasas saturadas",
  salt_g: "sal",
  cholesterol_mg: "colesterol",
};
const NUTRIENT_UNIT: Record<RankNutrient, string> = {
  sugars_g: "g",
  fiber_g: "g",
  saturated_fat_g: "g",
  salt_g: "g",
  cholesterol_mg: "mg",
};

const RANGES = [
  { value: "1", label: "Día" },
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
];

export default function NutrienteScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { key, offset: offsetParam } = useLocalSearchParams<{ key?: string; offset?: string }>();
  const nutrient = (key ?? "cholesterol_mg") as RankNutrient;
  const offset = Number(offsetParam ?? 0) || 0;
  const [days, setDays] = useState(1);
  const { meals, loading, error } = useMealsRange(days, offset);
  const ranked = foodsHighestIn(meals, nutrient);
  const unit = NUTRIENT_UNIT[nutrient];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>
        Alimentos con más {NUTRIENT_LABEL[nutrient]}
      </Text>

      <ChipGroup single options={RANGES} selected={[String(days)]} onChange={(v) => setDays(Number(v[0]))} />

      {loading && <ActivityIndicator color={colors.accent} />}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {!loading && !error && ranked.length === 0 && (
        <Card>
          <EmptyState>Ningún alimento registrado aporta {NUTRIENT_LABEL[nutrient]} en este período.</EmptyState>
        </Card>
      )}

      {!loading && !error && ranked.length > 0 && (
        <Card>
          <SectionTitle>De mayor a menor aporte</SectionTitle>
          {/* La barra mide contra el que MÁS aporta, no contra un total: lo que se compara acá es
              un alimento contra otro ("el huevo pesa el doble que el queso"), no contra una meta. */}
          {ranked.map((f) => (
            <View key={f.name} style={{ gap: 4, marginTop: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{f.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {f.amount} {unit} · {f.pctOfTotal}%
                </Text>
              </View>
              <Bar pct={Math.round((f.amount / ranked[0].amount) * 100)} over={false} />
              <Text style={{ color: colors.icon, fontSize: 11 }}>{f.grams} g</Text>
            </View>
          ))}
        </Card>
      )}

      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- nutriente
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/nutricion/nutriente.tsx mobile/__tests__/nutriente.test.tsx
git commit -S -m "feat(nutrición): pantalla de alimentos que aportan un nutriente, con rango Día/7/30"
```

---

### Task 4: hacer tappables las filas de Nutrientes

**Files:**
- Modify: `mobile/src/nutrition/tabs/NutrientesTab.tsx`
- Modify: `mobile/app/nutricion/detalle.tsx` (pasar el `offset`)
- Test: `mobile/__tests__/detalle.test.tsx`

- [ ] **Step 1: Write the failing tests**

Primero, agregá `router` a los imports **arriba** del archivo (junto a los que ya están, no al final):

```tsx
import { router } from "expo-router";
```

El mock de `expo-router` que ya está en el archivo incluye `router: { push: jest.fn() }` — verificalo antes de escribir los tests; si no está, agregalo.

Después, agregar al final de `mobile/__tests__/detalle.test.tsx`:

```tsx
test("tocar un nutriente abre el desglose de alimentos, con su key y el día que estás mirando", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-cholesterol_mg-row"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/nutriente?key=cholesterol_mg&offset=0");
});

test("un nutriente SIN dato no navega (no hay nada que desglosar)", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, fiber_g: null } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-fiber_g-row"));
  expect(router.push).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: FAIL — `Unable to find an element with testID: nutr-cholesterol_mg-row`.

- [ ] **Step 3: Make the rows tappable**

En `mobile/src/nutrition/tabs/NutrientesTab.tsx`:

1. Agregar `Pressable` al import de `react-native` y `router` al de `expo-router` (el archivo hoy no importa expo-router; agregá `import { router } from "expo-router";`).

2. Agregar `offset` a las props:

```tsx
interface Props {
  summary: NutritionDaySummary;
  goalView: GoalView | null;
  offset: number;
}

export function NutrientesTab({ summary, goalView, offset }: Props) {
```

3. Envolver cada fila en un `Pressable`. Reemplazar el `<View key={r.key} style={{ gap: 4, marginTop: 4 }}>` que abre cada fila por:

```tsx
          <Pressable
            key={r.key}
            testID={`nutr-${r.key}-row`}
            // Sin dato no hay nada que desglosar: la fila se ve pero no navega a una lista vacía.
            disabled={r.value == null}
            onPress={() => router.push(`/nutricion/nutriente?key=${r.key}&offset=${offset}`)}
            style={{ gap: 4, marginTop: 4 }}
          >
```

y su `</View>` de cierre por `</Pressable>`.

4. Actualizar la nota explicativa de la card para que se entienda que se puede tocar. Reemplazar el texto que hoy dice `"La referencia es pública (OMS), no una meta calculada para vos. La fibra es un piso a alcanzar; el resto, límites a no pasar."` por:

```tsx
        La referencia es pública (OMS), no una meta calculada para vos. La fibra es un piso a alcanzar; el resto, límites a
        no pasar. Tocá un nutriente para ver qué alimentos lo aportan.
```

- [ ] **Step 4: Pass the offset from the shell**

En `mobile/app/nutricion/detalle.tsx`, cambiar:

```tsx
      {tab === "nutrientes" && <NutrientesTab summary={summary} goalView={goalView} />}
```

por:

```tsx
      {tab === "nutrientes" && <NutrientesTab summary={summary} goalView={goalView} offset={offset} />}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- detalle
```

Expected: PASS — 24 tests (los 22 que ya estaban + 2 nuevos).

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/tabs/NutrientesTab.tsx mobile/app/nutricion/detalle.tsx mobile/__tests__/detalle.test.tsx
git commit -S -m "feat(nutrición): tocar un nutriente abre qué alimentos lo aportan"
```

---

### Task 5: Verificación final + PR

- [ ] **Step 1: Run everything**

```bash
cd /Users/kilo/desarrollo26/pulsia && bun run test
cd /Users/kilo/desarrollo26/pulsia && bun run test:mobile
cd /Users/kilo/desarrollo26/pulsia && bun run typecheck
```

Expected: todo verde.

- [ ] **Step 2: Verify no new dependencies**

```bash
cd /Users/kilo/desarrollo26/pulsia && git diff main..HEAD --stat -- '**/package.json' bun.lock
```

Expected: **salida vacía**. Cualquier cambio acá rompe el OTA a vc10.

- [ ] **Step 3: Verify `ONBOARDING.md` is not committed**

```bash
cd /Users/kilo/desarrollo26/pulsia && git diff main..HEAD --name-only | grep ONBOARDING
```

Expected: sin coincidencias. **Usá `main..HEAD`, no `main`** — `git diff main` compara contra el árbol de trabajo y arrastra la modificación local del usuario, que debe quedar afuera.

- [ ] **Step 4: Push and open the PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git push -u origin feat/nutricion-alimentos-por-nutriente
gh pr create --title "feat(nutrición): qué alimentos aportan cada nutriente, con rango Día/7/30" --body "$(cat <<'EOF'
## Qué hace

Cierra el PR2 del dashboard de nutrición: tocar un nutriente en la pestaña Nutrientes abre el desglose de **qué alimentos lo aportaron**, de mayor a menor, con la cantidad comida y el % del total. Selector **Día / 7 días / 30 días**.

Motivación (pedido del usuario): no alcanza con ver "colesterol 340 mg" — hace falta saber qué lo subió para aprender a comer mejor y decidir si bajar la porción o sacar el alimento. Por eso cada fila muestra los gramos comidos, y por eso el rango de 30 días importa: un día es una anécdota, el mes es el patrón.

## Notas de implementación

- `foodsHighestIn` es puro, en `shared/`, con tests. Agrupa por nombre (el mismo alimento en 5 comidas = 1 fila) y saltea los ítems sin el dato o en 0: contarlos como 0 solo ensucia la lista.
- `useMealsRange` usa el `from`/`to` que el backend ya aceptaba. **Sin cambios de backend ni migraciones.**
- Sin componente de gráfico nuevo: cada fila reusa el helper `Bar`, midiendo contra el alimento que más aporta (se compara alimento contra alimento, no contra una meta).
- **Cero dependencias nuevas** → sale por OTA a vc10.

## Desvío del spec (deliberado)

El spec decía que "Día" reusaría los `meals` que `useNutritionDay` ya tiene cargados, sin fetch. Eso asumía expansión inline; esto es una pantalla aparte, que no los tiene a mano. Los tres rangos usan el mismo hook: cuesta un fetch extra y a cambio hay un solo camino de código.

## Spec y plan

- Spec: `docs/superpowers/specs/2026-07-16-nutricion-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-07-16-nutricion-dashboard-2-alimentos.md`
EOF
)"
```

- [ ] **Step 5: Trigger the review**

```bash
cd /Users/kilo/desarrollo26/pulsia && gh pr comment <NRO> --body "@claude review"
```

---

## Notas para quien ejecute

- Los tests de `shared/` corren con `bun test` e importan de `"bun:test"`; los de `mobile/` con jest-expo (`bun run test -- <patrón>` desde `mobile/`).
- El cwd del shell persiste: usá `cd /Users/kilo/desarrollo26/pulsia && ...` con rutas absolutas en los `git add`.
- **No toques `ONBOARDING.md`**: tiene una modificación del usuario sin commitear.
- Commits firmados (`-S`), **nunca** con atribución a Claude/Anthropic.
- Verificá que los tests **muerdan**: cuando termines una tarea, rompé la implementación a propósito y confirmá que falla el test correcto. Si una mutación plausible no rompe nada, reportalo en vez de taparlo.
