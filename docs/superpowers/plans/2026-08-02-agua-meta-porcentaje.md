# Agua: meta + % + confirmar antes de borrar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a la card de agua de Nutrición una meta diaria (35 ml/kg del peso, con override manual guardado en AsyncStorage), una barra de % de avance sobre el agua bebida, y una confirmación antes de borrar el último registro.

**Architecture:** Cálculo puro de la meta (`waterGoal.ts`) + persistencia del override en AsyncStorage (`storage/waterGoal.ts`) + un componente extraído `WaterCard.tsx` que reúne todo el bloque de agua (hoy inline en `nutricion.tsx`), maneja el estado de la meta y confirma el borrado con `Alert`. Sin backend, sin migración.

**Tech Stack:** React Native + Expo, TypeScript, jest (jest-expo) + @testing-library/react-native, AsyncStorage. Workspace `mobile/` con `bun`.

**Comandos** (siempre desde `/Users/kilo/desarrollo26/pulsia/mobile`):
- Tests de un archivo: `bun run test <patrón>` (jest toma el patrón como filtro de path).
- Suite completa: `bun run test`
- Typecheck: `bun run typecheck`

---

## Task 1: Cálculo puro de la meta de agua

**Files:**
- Create: `mobile/src/nutrition/waterGoal.ts`
- Test: `mobile/__tests__/water-goal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/water-goal.test.ts`:

```ts
import { computeWaterGoalMl, WATER_GOAL_FALLBACK_ML } from "../src/nutrition/waterGoal";

test("el override manual válido gana sobre el peso", () => {
  expect(computeWaterGoalMl({ overrideMl: 2500, weightKg: 80 })).toBe(2500);
});

test("sin override, usa 35 ml/kg del peso (redondeado)", () => {
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: 80 })).toBe(2800);
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: 72.5 })).toBe(Math.round(35 * 72.5));
});

test("sin override ni peso, cae al fallback fijo", () => {
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: null })).toBe(WATER_GOAL_FALLBACK_ML);
  expect(computeWaterGoalMl({})).toBe(WATER_GOAL_FALLBACK_ML);
});

test("un override inválido (0, negativo, NaN) se ignora y cae a auto", () => {
  expect(computeWaterGoalMl({ overrideMl: 0, weightKg: 80 })).toBe(2800);
  expect(computeWaterGoalMl({ overrideMl: -5, weightKg: 80 })).toBe(2800);
  expect(computeWaterGoalMl({ overrideMl: Number.NaN, weightKg: 80 })).toBe(2800);
});

test("un peso inválido (0, negativo) cae al fallback", () => {
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: 0 })).toBe(WATER_GOAL_FALLBACK_ML);
  expect(computeWaterGoalMl({ overrideMl: null, weightKg: -10 })).toBe(WATER_GOAL_FALLBACK_ML);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test water-goal.test`
Expected: FAIL — `Cannot find module '../src/nutrition/waterGoal'`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/src/nutrition/waterGoal.ts`:

```ts
export const WATER_GOAL_FALLBACK_ML = 2000;
export const WATER_ML_PER_KG = 35;

/**
 * Meta diaria de agua en ml. Orden: override manual válido → 35 ml/kg del peso → fallback fijo.
 * Función pura (sin AsyncStorage) para poder testearla aislada.
 */
export function computeWaterGoalMl(input: {
  overrideMl?: number | null;
  weightKg?: number | null;
}): number {
  const { overrideMl, weightKg } = input;
  if (overrideMl != null && Number.isFinite(overrideMl) && overrideMl > 0) {
    return Math.round(overrideMl);
  }
  if (weightKg != null && Number.isFinite(weightKg) && weightKg > 0) {
    return Math.round(WATER_ML_PER_KG * weightKg);
  }
  return WATER_GOAL_FALLBACK_ML;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test water-goal.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/waterGoal.ts mobile/__tests__/water-goal.test.ts
git commit -S -m "feat(agua): cálculo puro de la meta (35 ml/kg + override + fallback)"
```

---

## Task 2: Persistencia del override en AsyncStorage

**Files:**
- Create: `mobile/src/storage/waterGoal.ts`
- Test: `mobile/__tests__/water-goal-storage.test.ts`

Sigue el patrón de `mobile/src/storage/sounds.ts` (getter/setter simples sobre AsyncStorage).

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/water-goal-storage.test.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWaterGoalOverride, setWaterGoalOverride } from "../src/storage/waterGoal";

beforeEach(async () => { await AsyncStorage.clear(); });

test("por defecto (nada guardado) el override es null", async () => {
  expect(await getWaterGoalOverride()).toBeNull();
});

test("guarda y recupera un override (redondeado)", async () => {
  await setWaterGoalOverride(2450.6);
  expect(await getWaterGoalOverride()).toBe(2451);
  expect(await AsyncStorage.getItem("pulsia.waterGoalOverrideMl")).toBe("2451");
});

test("setWaterGoalOverride(null) borra la clave (vuelve a auto)", async () => {
  await setWaterGoalOverride(3000);
  await setWaterGoalOverride(null);
  expect(await getWaterGoalOverride()).toBeNull();
  expect(await AsyncStorage.getItem("pulsia.waterGoalOverrideMl")).toBeNull();
});

test("un valor <= 0 o inválido no persiste (cae a auto)", async () => {
  await setWaterGoalOverride(0);
  expect(await getWaterGoalOverride()).toBeNull();
  await setWaterGoalOverride(-100);
  expect(await getWaterGoalOverride()).toBeNull();
});

test("un valor corrupto en storage se lee como null", async () => {
  await AsyncStorage.setItem("pulsia.waterGoalOverrideMl", "wat");
  expect(await getWaterGoalOverride()).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test water-goal-storage.test`
Expected: FAIL — `Cannot find module '../src/storage/waterGoal'`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/src/storage/waterGoal.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.waterGoalOverrideMl";

/** Override manual de la meta de agua (ml). `null` = usar el cálculo automático. */
export async function getWaterGoalOverride(): Promise<number | null> {
  const v = await AsyncStorage.getItem(KEY);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setWaterGoalOverride(ml: number | null): Promise<void> {
  if (ml == null || !Number.isFinite(ml) || ml <= 0) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, String(Math.round(ml)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test water-goal-storage.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/storage/waterGoal.ts mobile/__tests__/water-goal-storage.test.ts
git commit -S -m "feat(agua): persistir el override de la meta en AsyncStorage"
```

---

## Task 3: Componente `WaterCard`

**Files:**
- Create: `mobile/src/components/WaterCard.tsx`
- Test: `mobile/__tests__/water-card.test.tsx`

Extrae todo el bloque de agua a un componente aislado. Reúne el estado de la meta (lee/escribe el
override), la barra de %, la fila de acción (+1 vaso / input / Agregar) y el borrado con confirmación
(`Alert`). Reusa `Bar` de `src/nutrition/tabs/ui` con `kind="floor"` (barra de "piso": clampea al 100%
sin segmento de exceso). El % en texto puede superar el 100% (informativo).

**Nota de diseño:** el `Alert` de confirmación vive **dentro** de `WaterCard` (botón → `Alert` → al
confirmar llama `onUndoLast`). Es un refinamiento sobre el spec (que lo ubicaba en `nutricion.tsx`):
mantener la confirmación junto al botón lo hace testeable y cohesivo. `onUndoLast` es el borrado crudo.

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/water-card.test.tsx`:

```tsx
import { Alert } from "react-native";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WaterCard } from "../src/components/WaterCard";
import type { WaterLog } from "@pulsia/shared";

const water: WaterLog[] = [{ id: "w1", ml: 250, loggedAt: Date.now() } as WaterLog];
const liquid = { total: 900, drank: 700, fromFood: 200 };

beforeEach(async () => { await AsyncStorage.clear(); jest.restoreAllMocks(); });

test("muestra la meta (35 ml/kg) y el % de lo bebido", async () => {
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={jest.fn()} onUndoLast={jest.fn()} />);
  // meta = round(35*80) = 2800; % = round(700/2800*100) = 25
  await waitFor(() => expect(screen.getByText("💧 Agua 700 / 2800 ml")).toBeTruthy());
  expect(screen.getByText("25%")).toBeTruthy();
});

test("+1 vaso llama onAddWater(250)", async () => {
  const onAddWater = jest.fn();
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={onAddWater} onUndoLast={jest.fn()} />);
  await fireEvent.press(screen.getByTestId("water-add-glass"));
  expect(onAddWater).toHaveBeenCalledWith(250);
});

test("borrar el último pide confirmación y solo borra al confirmar", async () => {
  const onUndoLast = jest.fn();
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    const confirm = (buttons ?? []).find((b) => b.style === "destructive");
    confirm?.onPress?.();
  });
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={jest.fn()} onUndoLast={onUndoLast} />);
  await fireEvent.press(screen.getByTestId("water-undo"));
  expect(Alert.alert).toHaveBeenCalled();
  expect(onUndoLast).toHaveBeenCalledTimes(1);
});

test("editar la meta guarda el override y lo refleja", async () => {
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={jest.fn()} onUndoLast={jest.fn()} />);
  await fireEvent.press(screen.getByTestId("water-goal-edit"));
  await fireEvent.changeText(screen.getByTestId("water-goal-input"), "3000");
  await fireEvent.press(screen.getByTestId("water-goal-save"));
  await waitFor(() => expect(screen.getByText("💧 Agua 700 / 3000 ml")).toBeTruthy());
  expect(await AsyncStorage.getItem("pulsia.waterGoalOverrideMl")).toBe("3000");
});

test("'Auto' limpia el override y vuelve al cálculo por peso", async () => {
  await AsyncStorage.setItem("pulsia.waterGoalOverrideMl", "3000");
  await render(<WaterCard water={water} liquid={liquid} weightKg={80} onAddWater={jest.fn()} onUndoLast={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("💧 Agua 700 / 3000 ml")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("water-goal-edit"));
  await fireEvent.press(screen.getByTestId("water-goal-auto"));
  await waitFor(() => expect(screen.getByText("💧 Agua 700 / 2800 ml")).toBeTruthy());
  expect(await AsyncStorage.getItem("pulsia.waterGoalOverrideMl")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test water-card.test`
Expected: FAIL — `Cannot find module '../src/components/WaterCard'`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/src/components/WaterCard.tsx`:

```tsx
import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import type { WaterLog } from "@pulsia/shared";
import { Bar } from "../nutrition/tabs/ui";
import { computeWaterGoalMl } from "../nutrition/waterGoal";
import { getWaterGoalOverride, setWaterGoalOverride } from "../storage/waterGoal";
import { colors, radius, spacing } from "../theme/tokens";

interface LiquidSummary { total: number; drank: number; fromFood: number }

export function WaterCard({
  water, liquid, weightKg, onAddWater, onUndoLast,
}: {
  water: WaterLog[];
  liquid: LiquidSummary;
  weightKg?: number | null;
  onAddWater: (ml: number) => void;
  onUndoLast: () => void;
}) {
  const [mlInput, setMlInput] = useState("");
  const [overrideMl, setOverrideMl] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  useEffect(() => { void (async () => setOverrideMl(await getWaterGoalOverride()))(); }, []);

  const goal = computeWaterGoalMl({ overrideMl, weightKg });
  const drank = Math.round(liquid.drank);
  const pct = goal > 0 ? Math.round((liquid.drank / goal) * 100) : 0;

  async function saveGoal() {
    const n = Number(goalInput.replace(",", "."));
    if (Number.isFinite(n) && n > 0) {
      await setWaterGoalOverride(n);
      setOverrideMl(Math.round(n));
    }
    setEditing(false);
  }

  async function useAuto() {
    await setWaterGoalOverride(null);
    setOverrideMl(null);
    setEditing(false);
  }

  function confirmUndo() {
    if (water.length === 0) return;
    const last = water[water.length - 1];
    Alert.alert("Borrar registro", `¿Borrar el último registro de agua (${Math.round(last.ml)} ml)?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => onUndoLast() },
    ]);
  }

  function submitMl() {
    const n = Number(mlInput.replace(",", "."));
    if (Number.isFinite(n) && n > 0) { onAddWater(n); setMlInput(""); }
  }

  return (
    <View testID="water-card" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>💧 Agua {drank} / {goal} ml</Text>
        <Pressable testID="water-goal-edit" onPress={() => { setGoalInput(String(goal)); setEditing((e) => !e); }} hitSlop={8}>
          <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "600" }}>Meta ✎</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Bar value={liquid.drank} target={goal} kind="floor" height={8} testID="water-bar" />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, minWidth: 40, textAlign: "right" }}>{pct}%</Text>
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 12 }}>tomada {drank} + alimentos {Math.round(liquid.fromFood)}</Text>

      {editing && (
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <TextInput testID="water-goal-input" value={goalInput} onChangeText={setGoalInput} keyboardType="numeric" placeholder="meta ml" placeholderTextColor={colors.icon}
            style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
          <Pressable testID="water-goal-save" onPress={saveGoal} style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar</Text>
          </Pressable>
          <Pressable testID="water-goal-auto" onPress={useAuto} hitSlop={8}>
            <Text style={{ color: colors.accentText, fontSize: 12 }}>Auto (35 ml/kg)</Text>
          </Pressable>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
        <Pressable testID="water-add-glass" onPress={() => onAddWater(250)} style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>+1 vaso (250 ml)</Text>
        </Pressable>
        <TextInput testID="water-ml-input" value={mlInput} onChangeText={setMlInput} keyboardType="numeric" placeholder="ml" placeholderTextColor={colors.icon}
          style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
        <Pressable testID="water-add" onPress={submitMl} style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Agregar</Text>
        </Pressable>
      </View>

      {water.length > 0 && (
        <Pressable testID="water-undo" onPress={confirmUndo}>
          <Text style={{ color: colors.accentText, fontSize: 12 }}>Borrar último ({Math.round(water[water.length - 1].ml)} ml)</Text>
        </Pressable>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test water-card.test`
Expected: PASS (5 tests). Si algún token de color no existe, revisar `mobile/src/theme/tokens.ts`
(todos los usados aquí ya se usan en el bloque de agua actual de `nutricion.tsx`, así que existen).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/WaterCard.tsx mobile/__tests__/water-card.test.tsx
git commit -S -m "feat(agua): componente WaterCard (meta, % y borrado con confirmación)"
```

---

## Task 4: Cablear `WaterCard` en la pantalla + exponer `weightKg`

**Files:**
- Modify: `mobile/src/nutrition/useNutritionDay.ts:73` (agregar `weightKg` al return)
- Modify: `mobile/app/(tabs)/nutricion.tsx` (usar `<WaterCard>`, borrar el bloque inline y el estado `mlInput`)

- [ ] **Step 1: Exponer `weightKg` desde el hook**

En `mobile/src/nutrition/useNutritionDay.ts`, el `return` (línea 73) hoy es:

```ts
  return { error, setError, meals, water, summary, profile, goalResult, goalView, exercise, baseUrl: baseUrl.current, reload };
```

Cambiarlo a (agregar `weightKg`, que ya está desestructurado en la línea 63):

```ts
  return { error, setError, meals, water, summary, profile, weightKg, goalResult, goalView, exercise, baseUrl: baseUrl.current, reload };
```

- [ ] **Step 2: Usar `WaterCard` en `nutricion.tsx`**

En `mobile/app/(tabs)/nutricion.tsx`:

1. Import: agregar `WaterCard` y quitar `TextInput` (queda sin uso tras extraer el bloque). Línea 2 pasa de:

```ts
import { ScrollView, View, Text, Pressable, Alert, TextInput } from "react-native";
```
a:
```ts
import { ScrollView, View, Text, Pressable, Alert } from "react-native";
```
Y agregar junto a los demás imports de componentes (cerca de la línea 12):
```ts
import { WaterCard } from "../../src/components/WaterCard";
```

2. Desestructurar `weightKg` del hook (línea 22):
```ts
  const { error, setError, meals, water, summary, goalView, weightKg, baseUrl, reload } = useNutritionDay(offset);
```

3. Borrar el estado `mlInput` (línea 21): eliminar
```ts
  const [mlInput, setMlInput] = useState("");
```
(y `useState` sigue importado y usado por `offset`).

4. `undoLastWater` queda como borrado crudo (la confirmación ahora vive en `WaterCard`). No se toca su cuerpo.

5. Reemplazar TODO el bloque `{/* Líquido del día */}` (hoy líneas ~129-149, el `<View>` con el input de ml y "Deshacer último") por:

```tsx
      {/* Líquido del día */}
      <WaterCard
        water={water}
        liquid={liquid}
        weightKg={weightKg}
        onAddWater={addWater}
        onUndoLast={undoLastWater}
      />
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sin errores. (Si `tsc` marca `TextInput`/`mlInput`/`setMlInput` sin uso, es porque quedó una referencia — buscar y limpiar.)

- [ ] **Step 4: Correr toda la suite**

Run: `bun run test`
Expected: PASS. La suite del móvil venía en ~814 tests; deben pasar todos + los 15 nuevos (5+5+5).
Prestar atención a que ningún test preexistente que tocara el bloque de agua se rompa (buscar en
`__tests__` referencias a "Deshacer último" / agua; si alguno esperaba ese texto, actualizarlo a
"Borrar último").

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/useNutritionDay.ts "mobile/app/(tabs)/nutricion.tsx"
git commit -S -m "feat(agua): cablear WaterCard en Nutrición y exponer weightKg del día"
```

---

## Notas de integración / verificación final

- **JS puro, sin migración ni backend** → tras mergear va por **OTA a vc10** (runtime android
  `784872cb`); verificar el runtime al publicar (ver [[ota-fingerprint-gotcha]] / [[ota-always-publish]]).
- **Semántica confirmada por el owner:** la barra mide agua **bebida** (`liquid.drank`) vs meta; el
  agua de alimentos (`fromFood`) queda como texto informativo y no cuenta al %.
- **Verificación en device (owner):** meta auto por peso, editar/guardar override, botón "Auto",
  barra/% correctos, y que "Borrar último" pida confirmación.
