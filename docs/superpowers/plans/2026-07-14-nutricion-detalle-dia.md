# Nutrición — Detalle del día + card más clara — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Card de totales más clara (rótulos sin ambigüedad, barras ámbar cuando te pasás) y **clickeable → pantalla "Detalle del día"** explícita. De paso extraer un hook + funciones puras para de-duplicar el cómputo del día entre el tab y el detalle.

**Architecture:** Mobile-only, todo JS → OTA vc10. Lógica pura en `goalView.ts` (+ flag `over`) y una nueva `daySummary.ts` (totales del día, testeable); un hook `useNutritionDay(offset)` que hace fetch + cómputo, usado por el tab y el detalle. Sin backend, sin migración.

**Tech Stack:** Expo/expo-router, jest. Reusa `computeNutritionGoal`/`buildGoalView`, `sumNullableMicro`, `dayAtNoon`.

**Referencia:** spec `docs/superpowers/specs/2026-07-14-nutricion-detalle-dia-design.md`.

## File structure

- `mobile/src/nutrition/goalView.ts` — flag `over` en `MacroBar`+`kcal`; labels con nombre completo; helper `remainingLabel`.
- `mobile/src/nutrition/daySummary.ts` — `buildNutritionDaySummary` (pura).
- `mobile/src/nutrition/dayBounds.ts` — `dayBounds(offset)` extraído.
- `mobile/src/nutrition/useNutritionDay.ts` — hook fetch+cómputo.
- `mobile/app/(tabs)/nutricion.tsx` — usa el hook; card clickeable + barras over.
- `mobile/app/nutricion/detalle.tsx` — pantalla nueva.

---

### Task 1: `goalView` — flag `over`, nombres completos, `remainingLabel`

**Files:**
- Modify: `mobile/src/nutrition/goalView.ts`
- Test: `mobile/__tests__/goalView.test.ts`

- [ ] **Step 1: Tests que fallan**

En `mobile/__tests__/goalView.test.ts`, agregá al final:
```ts
import { buildGoalView as bgv, remainingLabel } from "../src/nutrition/goalView";

test("over=true cuando comido supera la meta (macro y kcal)", () => {
  const goal = { status: "ok", source: "auto", kcal: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, bmr: 900, tdee: 1000 } as const;
  const v = bgv(goal, { kcal: 1200, protein_g: 90, carbs_g: 40, fat_g: 40 });
  expect(v.kcal!.over).toBe(true);                                   // 1200 > 1000
  expect(v.macros!.find((m) => m.key === "protein")!.over).toBe(true); // 90 > 50
  expect(v.macros!.find((m) => m.key === "carbs")!.over).toBe(false);  // 40 < 100
});

test("labels con nombre completo", () => {
  const goal = { status: "ok", source: "auto", kcal: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, bmr: 900, tdee: 1000 } as const;
  const v = bgv(goal, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  expect(v.macros!.map((m) => m.label)).toEqual(["Proteína", "Carbohidratos", "Grasa"]);
});

test("remainingLabel: faltan / cumplida / de más", () => {
  expect(remainingLabel(45)).toBe("faltan 45");
  expect(remainingLabel(0)).toBe("meta cumplida");
  expect(remainingLabel(-36)).toBe("36 de más");
});
```

- [ ] **Step 2: Verlos fallar**

Run: `cd mobile && npm test -- goalView --runInBand`
Expected: FAIL (`over` no existe, labels son "P"/"C"/"G", `remainingLabel` no existe).

- [ ] **Step 3: Implementar**

En `mobile/src/nutrition/goalView.ts`:
- En `interface MacroBar`, agregá `over: boolean;` (tras `pct`).
- En `interface GoalView`, cambiá `kcal?` a incluir `over`:
```ts
  kcal?: { meta: number; comido: number; restante: number; over: boolean };
```
- En `buildGoalView`, el helper `bar` y el `kcal`:
```ts
  const bar = (key: MacroBar["key"], label: string, c: number, meta: number): MacroBar => {
    const restante = Math.round(meta - c);
    return { key, label, comido: Math.round(c), meta, restante, pct: clampPct(c, meta), over: restante < 0 };
  };
  return {
    status: "ok",
    kcal: { meta: goal.kcal, comido: Math.round(comido.kcal), restante: Math.round(goal.kcal - comido.kcal), over: Math.round(comido.kcal) > goal.kcal },
    macros: [
      bar("protein", "Proteína", comido.protein_g, goal.protein_g),
      bar("carbs", "Carbohidratos", comido.carbs_g, goal.carbs_g),
      bar("fat", "Grasa", comido.fat_g, goal.fat_g),
    ],
  };
```
- Al final del archivo, agregá:
```ts
// Texto del restante según estado (compartido por la card y el detalle).
export function remainingLabel(restante: number): string {
  if (restante > 0) return `faltan ${restante}`;
  if (restante === 0) return "meta cumplida";
  return `${-restante} de más`;
}
```

- [ ] **Step 4: Verlos pasar + typecheck**

Run: `cd mobile && npm test -- goalView --runInBand && bunx tsc --noEmit`
Expected: PASS. **Nota:** tsc va a marcar error en `mobile/app/(tabs)/nutricion.tsx:146` que usa `m.label` con el label viejo — es esperado (se arregla en Task 4). Si tsc falla SOLO por usos de `m.label`/`goalView` en `nutricion.tsx`, seguí; se resuelve en Task 4. (El test de goalView debe pasar igual.)

- [ ] **Step 5: Commit**

IMPORTANT: firmar con `-S`, SIN Co-Authored-By.
```bash
git add mobile/src/nutrition/goalView.ts mobile/__tests__/goalView.test.ts
git commit -S -m "feat(mobile): goalView con flag over + nombres completos + remainingLabel"
```

---

### Task 2: `daySummary` — totales del día (función pura)

**Files:**
- Create: `mobile/src/nutrition/daySummary.ts`
- Test: `mobile/__tests__/daySummary.test.ts`

- [ ] **Step 1: Test que falla**

Creá `mobile/__tests__/daySummary.test.ts`:
```ts
import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import type { Meal, WaterLog } from "@pulsia/shared";

const meal = (items: any[]): Meal => ({ id: "m", eatenAt: 1, mealType: null, note: null, items } as any);
const item = (o: any) => ({ id: "i", foodId: null, foodName: "x", quantity: 1, quantityUnit: "g", grams: 100,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, saturated_fat_g: null, sugars_g: null, fiber_g: null, salt_g: null, cholesterol_mg: null, water_ml: null, ...o });

test("suma kcal/macros y micros null-safe", () => {
  const meals = [meal([item({ kcal: 200, protein_g: 10, carbs_g: 20, fat_g: 5, sugars_g: 8, cholesterol_mg: 50, water_ml: 40 }), item({ kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 2 })])];
  const s = buildNutritionDaySummary(meals, []);
  expect(s.dayTotals.kcal).toBe(300);
  expect(s.dayTotals.protein_g).toBe(15);
  expect(s.dayTotals.sugars_g).toBe(8);   // uno con dato, el otro null → 8
  expect(s.dayTotals.fiber_g).toBeNull();  // ninguno tiene → null
  expect(s.cholesterolMg).toBe(50);
});

test("líquido = agua tomada + aporte de alimentos", () => {
  const meals = [meal([item({ water_ml: 40 }), item({ water_ml: 60 })])];
  const water: WaterLog[] = [{ id: "w1", ml: 250, loggedAt: 1 }, { id: "w2", ml: 250, loggedAt: 2 }];
  const s = buildNutritionDaySummary(meals, water);
  expect(s.liquid).toEqual({ total: 600, drank: 500, fromFood: 100 });
});

test("sin comidas: totales en 0 y micros null", () => {
  const s = buildNutritionDaySummary([], []);
  expect(s.dayTotals.kcal).toBe(0);
  expect(s.dayTotals.sugars_g).toBeNull();
  expect(s.liquid).toEqual({ total: 0, drank: 0, fromFood: 0 });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `cd mobile && npm test -- daySummary --runInBand`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

Creá `mobile/src/nutrition/daySummary.ts`:
```ts
import { sumNullableMicro } from "@pulsia/shared";
import type { Meal, WaterLog } from "@pulsia/shared";

export interface NutritionDaySummary {
  dayTotals: {
    kcal: number; protein_g: number; carbs_g: number; fat_g: number;
    sugars_g: number | null; fiber_g: number | null; saturated_fat_g: number | null; salt_g: number | null;
  };
  cholesterolMg: number | null;
  liquid: { total: number; drank: number; fromFood: number };
}

export function buildNutritionDaySummary(meals: Meal[], water: WaterLog[]): NutritionDaySummary {
  const items = meals.flatMap((m) => m.items);
  const micro = (key: "sugars_g" | "fiber_g" | "saturated_fat_g" | "salt_g"): number | null =>
    sumNullableMicro(items.map((it) => it[key]));
  const dayTotals = {
    kcal: items.reduce((a, it) => a + it.kcal, 0),
    protein_g: items.reduce((a, it) => a + it.protein_g, 0),
    carbs_g: items.reduce((a, it) => a + it.carbs_g, 0),
    fat_g: items.reduce((a, it) => a + it.fat_g, 0),
    sugars_g: micro("sugars_g"), fiber_g: micro("fiber_g"),
    saturated_fat_g: micro("saturated_fat_g"), salt_g: micro("salt_g"),
  };
  const cholesterolMg = sumNullableMicro(items.map((it) => it.cholesterol_mg));
  const fromFood = sumNullableMicro(items.map((it) => it.water_ml)) ?? 0;
  const drank = water.reduce((a, w) => a + w.ml, 0);
  return { dayTotals, cholesterolMg, liquid: { total: Math.round(fromFood + drank), drank, fromFood } };
}
```

- [ ] **Step 4: Verlo pasar**

Run: `cd mobile && npm test -- daySummary --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/daySummary.ts mobile/__tests__/daySummary.test.ts
git commit -S -m "feat(mobile): buildNutritionDaySummary (totales del día como función pura)"
```

---

### Task 3: `dayBounds` extraído + hook `useNutritionDay`

**Files:**
- Create: `mobile/src/nutrition/dayBounds.ts`
- Create: `mobile/src/nutrition/useNutritionDay.ts`

- [ ] **Step 1: Extraer `dayBounds`**

Creá `mobile/src/nutrition/dayBounds.ts` (copiado tal cual del tab):
```ts
import { dayAtNoon } from "../session/metricDate";

export function dayBounds(offset: number): { from: number; to: number; noon: number } {
  const noon = dayAtNoon(offset, Date.now()); // mediodía del día (offset 0 = hoy)
  const start = noon - 12 * 3600_000; // 00:00
  const end = start + 24 * 3600_000 - 1; // 23:59:59.999
  return { from: start, to: end, noon };
}
```

- [ ] **Step 2: Crear el hook**

Creá `mobile/src/nutrition/useNutritionDay.ts`:
```ts
import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getBackendUrl } from "../storage/config";
import { listMeals, listWater, getNutritionGoal } from "../api/nutrition";
import { getProfile } from "../storage/profile";
import { getLatestMetrics } from "../api/metrics";
import { computeNutritionGoal } from "@pulsia/shared";
import type { Meal, WaterLog, NutritionGoalInput, TrainingProfile, NutritionGoalResult } from "@pulsia/shared";
import { buildGoalView, type GoalView } from "./goalView";
import { buildNutritionDaySummary, type NutritionDaySummary } from "./daySummary";
import { dayBounds } from "./dayBounds";

export interface NutritionDay {
  error: string | null;
  setError: (msg: string | null) => void;
  meals: Meal[];
  water: WaterLog[];
  summary: NutritionDaySummary;
  goalResult: NutritionGoalResult | null;
  goalView: GoalView | null;
  baseUrl: string | null;
  reload: () => Promise<void>;
}

export function useNutritionDay(offset: number): NutritionDay {
  const baseUrl = useRef<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [goalInput, setGoalInput] = useState<NutritionGoalInput | null>(null);
  const [profile, setProfile] = useState<TrainingProfile | null>(null);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const url = await getBackendUrl(); baseUrl.current = url;
    const { from, to } = dayBounds(offset);
    try {
      const [ms, ws, gi, p] = await Promise.all([
        listMeals(url, from, to), listWater(url, from, to), getNutritionGoal(url), getProfile(),
      ]);
      setMeals(ms); setWater(ws); setGoalInput(gi); setProfile(p);
      let w = p?.weightKg;
      try { const latest = await getLatestMetrics(url); if (latest.weight_kg?.value != null) w = latest.weight_kg.value; } catch { /* offline */ }
      setWeightKg(w); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [offset]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const summary = buildNutritionDaySummary(meals, water);
  const goalResult = goalInput
    ? computeNutritionGoal({
        sex: profile?.sex, age: profile?.age, heightCm: profile?.heightCm, weightKg,
        activityLevel: profile?.activityLevel,
        objective: goalInput.objective, rateKgPerWeek: goalInput.rateKgPerWeek, manualKcal: goalInput.manualKcal,
      })
    : null;
  const goalView = goalResult
    ? buildGoalView(goalResult, {
        kcal: summary.dayTotals.kcal, protein_g: summary.dayTotals.protein_g,
        carbs_g: summary.dayTotals.carbs_g, fat_g: summary.dayTotals.fat_g,
      })
    : null;

  return { error, setError, meals, water, summary, goalResult, goalView, baseUrl: baseUrl.current, reload };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && bunx tsc --noEmit`
Expected: como en Task 1, puede seguir marcando errores SOLO en `nutricion.tsx` (que aún no usa el hook). El hook y `dayBounds.ts` en sí no deben tener errores. Se resuelve en Task 4.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/nutrition/dayBounds.ts mobile/src/nutrition/useNutritionDay.ts
git commit -S -m "feat(mobile): hook useNutritionDay (fetch + cómputo del día) + dayBounds extraído"
```

---

### Task 4: Refactor del tab + card clickeable con estado excedido

**Files:**
- Modify: `mobile/app/(tabs)/nutricion.tsx`

- [ ] **Step 1: Reescribir el componente**

Reemplazá TODO `mobile/app/(tabs)/nutricion.tsx` por:
```tsx
import { useState } from "react";
import { ScrollView, View, Text, Pressable, Alert, TextInput } from "react-native";
import { router } from "expo-router";
import { deleteMeal, logWater, deleteWater } from "../../src/api/nutrition";
import { dayLabel } from "../../src/session/metricDate";
import { dayBounds } from "../../src/nutrition/dayBounds";
import { useNutritionDay } from "../../src/nutrition/useNutritionDay";
import { remainingLabel } from "../../src/nutrition/goalView";
import type { Meal } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

const SHORT: Record<"protein" | "carbs" | "fat", string> = { protein: "Prot", carbs: "Carb", fat: "Gras" };

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function NutricionScreen() {
  const [offset, setOffset] = useState(0);
  const [mlInput, setMlInput] = useState("");
  const { error, setError, meals, water, summary, goalView, baseUrl, reload } = useNutritionDay(offset);
  const { dayTotals, cholesterolMg, liquid } = summary;

  function mealKcal(m: Meal): number { return m.items.reduce((a, it) => a + it.kcal, 0); }

  function remove(m: Meal) {
    Alert.alert("Borrar comida", "¿Borrar esta comida?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        if (!baseUrl) return;
        try { await deleteMeal(baseUrl, m.id); await reload(); } catch (e) { setError((e as Error).message); }
      } },
    ]);
  }

  function waterLoggedAt(): number { return offset === 0 ? Date.now() : dayBounds(offset).noon; }

  async function addWater(ml: number) {
    if (!baseUrl || !Number.isFinite(ml) || ml <= 0) return;
    try { await logWater(baseUrl, { ml, loggedAt: waterLoggedAt() }); await reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function undoLastWater() {
    if (!baseUrl || water.length === 0) return;
    const last = water[water.length - 1];
    try { await deleteWater(baseUrl, last.id); await reload(); } catch (e) { setError((e as Error).message); }
  }

  const { noon } = dayBounds(offset);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => setOffset((o) => o - 1)}><Text style={{ color: colors.accent, fontSize: 18 }}>◀</Text></Pressable>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{dayLabel(offset, Date.now())}</Text>
        <Pressable onPress={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0}>
          <Text style={{ color: offset >= 0 ? colors.icon : colors.accent, fontSize: 18 }}>▶</Text>
        </Pressable>
      </View>

      {/* Totales del día — toda la card abre el detalle */}
      <Pressable onPress={() => router.push(`/nutricion/detalle?offset=${offset}`)}
        style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          {goalView?.status === "ok" ? (
            <View>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{goalView.kcal!.comido} / {goalView.kcal!.meta} kcal</Text>
              <Text style={{ color: goalView.kcal!.over ? colors.warning : colors.textMuted }}>
                {goalView.kcal!.over ? `${-goalView.kcal!.restante} kcal de más` : `te quedan ${goalView.kcal!.restante} kcal`}
              </Text>
            </View>
          ) : (
            <View>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{dayTotals.kcal} kcal</Text>
              <Text style={{ color: colors.textMuted }}>Prot {Math.round(dayTotals.protein_g)}g · Carb {Math.round(dayTotals.carbs_g)}g · Gras {Math.round(dayTotals.fat_g)}g</Text>
            </View>
          )}
          <Pressable onPress={() => router.push("/nutricion/objetivo")} hitSlop={8}>
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "600" }}>Objetivo ⚙</Text>
          </Pressable>
        </View>
        {goalView?.status === "ok" && (
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            {goalView.macros!.map((m) => (
              <View key={m.key} style={{ gap: 2 }}>
                <Text style={{ color: m.over ? colors.warning : colors.textMuted, fontSize: 12 }}>
                  {SHORT[m.key]} {m.comido} / {m.meta} g · {remainingLabel(m.restante)}
                </Text>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
                  <View style={{ width: m.over ? "100%" : `${m.pct}%`, height: 6, backgroundColor: m.over ? colors.warning : colors.accent }} />
                </View>
              </View>
            ))}
          </View>
        )}
        {goalView?.status === "incomplete" && (
          <Pressable onPress={() => router.push("/nutricion/objetivo")} style={{ marginTop: spacing.xs }} hitSlop={8}>
            <Text style={{ color: colors.accentText, fontSize: 12 }}>Definí tu objetivo / completá tu perfil para ver tu meta →</Text>
          </Pressable>
        )}
        {cholesterolMg != null && (
          <Text style={{ color: cholesterolMg > 300 ? colors.warning : colors.textMuted, fontSize: 12, marginTop: 6 }}>
            Colesterol {Math.round(cholesterolMg)} / 300 mg
          </Text>
        )}
        <Text style={{ color: colors.icon, fontSize: 11, marginTop: 8 }}>toca para ver el detalle ›</Text>
      </Pressable>

      {/* Líquido del día */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>💧 Líquido {liquid.total} ml</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>tomada {Math.round(liquid.drank)} + alimentos {Math.round(liquid.fromFood)}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <Pressable onPress={() => addWater(250)} style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
            <Text style={{ color: colors.accentText, fontWeight: "600" }}>+1 vaso (250 ml)</Text>
          </Pressable>
          <TextInput value={mlInput} onChangeText={setMlInput} keyboardType="numeric" placeholder="ml" placeholderTextColor={colors.icon}
            style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
          <Pressable onPress={() => { const n = Number(mlInput.replace(",", ".")); if (Number.isFinite(n) && n > 0) { void addWater(n); setMlInput(""); } }}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Agregar</Text>
          </Pressable>
        </View>
        {water.length > 0 && (
          <Pressable onPress={undoLastWater}>
            <Text style={{ color: colors.accentText, fontSize: 12 }}>Deshacer último ({Math.round(water[water.length - 1].ml)} ml)</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable onPress={() => router.push(`/nutricion/nueva-comida?eatenAt=${offset === 0 ? Date.now() : noon}`)}
          style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>+ Nueva comida</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/nutricion/catalogo")}
          style={{ flex: 1, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>Catálogo</Text>
        </Pressable>
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {meals.length === 0 && <Text style={{ color: colors.textMuted }}>No hay comidas registradas este día.</Text>}

      {meals.map((m) => (
        <Pressable key={m.id} onPress={() => router.push(`/nutricion/nueva-comida?mealId=${m.id}`)} onLongPress={() => remove(m)} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{hhmm(m.eatenAt)}{m.mealType ? ` · ${m.mealType}` : ""}</Text>
            <Text style={{ color: colors.accentText }}>{mealKcal(m)} kcal</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {m.items.map((it) => `${it.foodName} (${it.quantity}${it.quantityUnit === "unit" ? "u" : it.quantityUnit})`).join(" · ")}
          </Text>
          {m.note ? <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>💬 {m.note}</Text> : null}
        </Pressable>
      ))}
      <Text style={{ color: colors.icon, fontSize: 11, textAlign: "center" }}>Mantené presionada una comida para borrarla.</Text>
    </ScrollView>
  );
}
```
(Notá: se movieron los micros/colesterol al detalle salvo la línea de colesterol que se deja en la card por ser dato prioritario; la línea de micros "azúc/fibra/sat/sal" se saca de la card — ahora vive en el detalle. El líquido sigue como tarjeta aparte con sus controles.)

- [ ] **Step 2: Typecheck + sweep**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores (ahora sí, todo el archivo usa los nombres nuevos).
Run: `cd mobile && npm test -- --runInBand`
Expected: verde (flake `generando.test.tsx` se ignora si aparece solo).

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(tabs)/nutricion.tsx"
git commit -S -m "feat(mobile): card de Nutrición clickeable + rótulos claros + barras ámbar al excederse"
```

---

### Task 5: Pantalla "Detalle del día"

**Files:**
- Create: `mobile/app/nutricion/detalle.tsx`

- [ ] **Step 1: Crear la pantalla**

Creá `mobile/app/nutricion/detalle.tsx`:
```tsx
import { ScrollView, View, Text, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useNutritionDay } from "../../src/nutrition/useNutritionDay";
import { remainingLabel } from "../../src/nutrition/goalView";
import { colors, radius, spacing } from "../../src/theme/tokens";

export default function DetalleDiaScreen() {
  const { offset: offsetParam } = useLocalSearchParams<{ offset?: string }>();
  const offset = Number(offsetParam ?? 0) || 0;
  const { error, summary, goalView } = useNutritionDay(offset);
  const { dayTotals, cholesterolMg, liquid } = summary;

  const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm } as const;
  const sectionTitle = { color: colors.textMuted, fontSize: 13 } as const;

  const bar = (comido: number, meta: number, pct: number, over: boolean) => (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
      <View style={{ width: over ? "100%" : `${pct}%`, height: 8, backgroundColor: over ? colors.warning : colors.accent }} />
    </View>
  );

  const nutrRows = [
    ["Azúcares", dayTotals.sugars_g],
    ["Fibra", dayTotals.fiber_g],
    ["Grasas saturadas", dayTotals.saturated_fat_g],
    ["Sal", dayTotals.salt_g],
  ].filter(([, v]) => v != null) as [string, number][];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Detalle del día</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
        Comido = lo registrado · Meta = tu objetivo · Restante = Meta − Comido. Todavía no incluye el gasto del ejercicio.
      </Text>

      {/* Calorías */}
      <View style={card}>
        <Text style={sectionTitle}>Calorías</Text>
        {goalView?.status === "ok" ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>{goalView.kcal!.comido} <Text style={{ fontSize: 15, color: colors.textMuted }}>/ {goalView.kcal!.meta}</Text></Text>
              <Text style={{ color: goalView.kcal!.over ? colors.warning : colors.textMuted, fontSize: 13 }}>
                {goalView.kcal!.over ? `${-goalView.kcal!.restante} de más` : `te quedan ${goalView.kcal!.restante}`}
              </Text>
            </View>
            {bar(goalView.kcal!.comido, goalView.kcal!.meta, Math.min(100, Math.round((goalView.kcal!.comido / goalView.kcal!.meta) * 100)), goalView.kcal!.over)}
          </>
        ) : (
          <>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>{dayTotals.kcal} kcal</Text>
            <Pressable onPress={() => router.push("/nutricion/objetivo")}>
              <Text style={{ color: colors.accentText, fontSize: 13 }}>Definí tu objetivo / completá tu perfil para ver tu meta →</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Macros */}
      {goalView?.status === "ok" && (
        <View style={card}>
          <Text style={sectionTitle}>Macros</Text>
          {goalView.macros!.map((m) => (
            <View key={m.key} style={{ gap: 4, marginTop: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{m.label}</Text>
                <Text style={{ color: m.over ? colors.warning : colors.textMuted, fontSize: 13 }}>{m.comido} / {m.meta} g · {remainingLabel(m.restante)}</Text>
              </View>
              {bar(m.comido, m.meta, m.pct, m.over)}
            </View>
          ))}
        </View>
      )}

      {/* Otros nutrientes */}
      {nutrRows.length > 0 && (
        <View style={card}>
          <Text style={sectionTitle}>Otros nutrientes</Text>
          {nutrRows.map(([label, v]) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>{v} g</Text>
            </View>
          ))}
        </View>
      )}

      {/* Colesterol */}
      {cholesterolMg != null && (
        <View style={card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ color: colors.text, fontSize: 14 }}>Colesterol</Text>
            <Text style={{ color: cholesterolMg > 300 ? colors.warning : colors.textMuted, fontSize: 13 }}>{Math.round(cholesterolMg)} / 300 mg</Text>
          </View>
          {bar(Math.round(cholesterolMg), 300, Math.min(100, Math.round((cholesterolMg / 300) * 100)), cholesterolMg > 300)}
        </View>
      )}

      {/* Líquido */}
      <View style={card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ color: colors.text, fontSize: 14 }}>Líquido</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{liquid.total} ml</Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>tomada {Math.round(liquid.drank)} · aporte de alimentos {Math.round(liquid.fromFood)}</Text>
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Typecheck + sweep**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.
Run: `cd mobile && npm test -- --runInBand`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/nutricion/detalle.tsx
git commit -S -m "feat(mobile): pantalla Detalle del día (calorías, macros, nutrientes, colesterol, líquido)"
```

---

## Self-Review

**Spec coverage:**
- Estado excedido uniforme (ámbar + "de más") → Task 1 (`over` + `remainingLabel`) usado en card (Task 4) y detalle (Task 5). ✅
- Resumen del día pura + hook (de-dup, atiende nit review #2a) → Tasks 2/3. ✅
- Card clara + clickeable (Prot/Carb/Gras, tappable, hint, Objetivo anidado) → Task 4. ✅
- Pantalla Detalle (leyenda, Calorías, Macros nombres completos, Otros nutrientes, Colesterol, Líquido) → Task 5. ✅
- Read-only, sin backend/migración, OTA vc10. ✅

**Placeholder scan:** sin TBD; todo el código inline.

**Type consistency:**
- `MacroBar.over` / `kcal.over` (Task 1) consumidos por card (Task 4) y detalle (Task 5).
- `NutritionDaySummary` (Task 2) devuelto por el hook (Task 3), consumido por Task 4/5 (`dayTotals.protein_g`, `cholesterolMg`, `liquid`).
- `useNutritionDay` return `{ error, setError, meals, water, summary, goalView, baseUrl, reload }` — usado consistente en Task 4; el detalle (Task 5) usa el subconjunto `{ error, summary, goalView }`.
- `dayBounds` (Task 3) importado por el hook y por el tab (Task 4, para `waterLoggedAt`/`noon`).

**Riesgos para el ejecutor:**
- Tasks 1 y 3 dejan `nutricion.tsx` con errores de tsc temporales (usa nombres viejos) — se resuelven al reescribir el tab en Task 4. Los TESTS de Task 1/2 deben pasar igual (no dependen del tab).
- `Pressable` anidado (card → detalle, con Objetivo ⚙ y CTA adentro): el toque del botón interno no dispara la navegación de la card (RN maneja el hijo primero). Se agregó `hitSlop` a los botones internos.
- El tab pierde la optimista `setMeals(filter)` al borrar: ahora hace `reload()` (una lectura más, pero simple y consistente). Aceptable.
- La línea de micros "azúc/fibra/sat/sal" se saca de la card (va al detalle); la de colesterol se deja en la card por prioridad. Si el usuario la quería en la card, es trivial re-agregar.
