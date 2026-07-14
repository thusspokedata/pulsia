import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, Alert, TextInput } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listMeals, deleteMeal, listWater, logWater, deleteWater } from "../../src/api/nutrition";
import { dayAtNoon, dayLabel } from "../../src/session/metricDate";
import type { Meal, WaterLog } from "@pulsia/shared";
import { sumNullableMicro } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

function dayBounds(offset: number): { from: number; to: number; noon: number } {
  const noon = dayAtNoon(offset, Date.now()); // mediodía del día (offset 0 = hoy), patrón de Progreso
  const start = noon - 12 * 3600_000; // 00:00
  const end = start + 24 * 3600_000 - 1; // 23:59:59.999
  return { from: start, to: end, noon };
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function NutricionScreen() {
  const baseUrl = useRef<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [mlInput, setMlInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (off: number) => {
    const url = await getBackendUrl(); baseUrl.current = url;
    const { from, to } = dayBounds(off);
    try {
      const [ms, ws] = await Promise.all([listMeals(url, from, to), listWater(url, from, to)]);
      setMeals(ms); setWater(ws); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useFocusEffect(useCallback(() => { void load(offset); }, [load, offset]));

  function mealKcal(m: Meal): number { return m.items.reduce((a, it) => a + it.kcal, 0); }
  const items = meals.flatMap((m) => m.items);
  const dayMicro = (key: "saturated_fat_g" | "sugars_g" | "fiber_g" | "salt_g"): number | null =>
    sumNullableMicro(items.map((it) => it[key]));
  const dayTotals = {
    kcal: items.reduce((a, it) => a + it.kcal, 0),
    p: items.reduce((a, it) => a + it.protein_g, 0),
    c: items.reduce((a, it) => a + it.carbs_g, 0),
    g: items.reduce((a, it) => a + it.fat_g, 0),
    sugars_g: dayMicro("sugars_g"), fiber_g: dayMicro("fiber_g"),
    saturated_fat_g: dayMicro("saturated_fat_g"), salt_g: dayMicro("salt_g"),
  };
  const cholesterolMg = sumNullableMicro(items.map((it) => it.cholesterol_mg));
  const waterFromFood = sumNullableMicro(items.map((it) => it.water_ml)) ?? 0;
  const waterDrank = water.reduce((a, w) => a + w.ml, 0);
  const liquidTotal = Math.round(waterFromFood + waterDrank);

  async function remove(m: Meal) {
    Alert.alert("Borrar comida", "¿Borrar esta comida?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        if (!baseUrl.current) return;
        try { await deleteMeal(baseUrl.current, m.id); setMeals((xs) => xs.filter((x) => x.id !== m.id)); }
        catch (e) { setError((e as Error).message); }
      } },
    ]);
  }

  function waterLoggedAt(): number { return offset === 0 ? Date.now() : dayBounds(offset).noon; }

  async function addWater(ml: number) {
    if (!baseUrl.current || !Number.isFinite(ml) || ml <= 0) return;
    try { await logWater(baseUrl.current, { ml, loggedAt: waterLoggedAt() }); await load(offset); }
    catch (e) { setError((e as Error).message); }
  }

  async function undoLastWater() {
    if (!baseUrl.current || water.length === 0) return;
    const last = water[water.length - 1]; // listWater viene ordenado asc por loggedAt
    try { await deleteWater(baseUrl.current, last.id); await load(offset); }
    catch (e) { setError((e as Error).message); }
  }

  const { noon } = dayBounds(offset);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      {/* Navegador de fechas (patrón Progreso) */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => setOffset((o) => o - 1)}><Text style={{ color: colors.accent, fontSize: 18 }}>◀</Text></Pressable>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{dayLabel(offset, Date.now())}</Text>
        <Pressable onPress={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0}>
          <Text style={{ color: offset >= 0 ? colors.icon : colors.accent, fontSize: 18 }}>▶</Text>
        </Pressable>
      </View>

      {/* Totales del día */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{dayTotals.kcal} kcal</Text>
        <Text style={{ color: colors.textMuted }}>P {Math.round(dayTotals.p)}g · C {Math.round(dayTotals.c)}g · G {Math.round(dayTotals.g)}g</Text>
        {(dayTotals.sugars_g != null || dayTotals.fiber_g != null || dayTotals.saturated_fat_g != null || dayTotals.salt_g != null) && (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {[
              dayTotals.sugars_g != null ? `azúc ${dayTotals.sugars_g}g` : null,
              dayTotals.fiber_g != null ? `fibra ${dayTotals.fiber_g}g` : null,
              dayTotals.saturated_fat_g != null ? `sat ${dayTotals.saturated_fat_g}g` : null,
              dayTotals.salt_g != null ? `sal ${dayTotals.salt_g}g` : null,
            ].filter(Boolean).join(" · ")}
          </Text>
        )}
        {cholesterolMg != null && (
          <Text style={{ color: cholesterolMg > 300 ? colors.warning : colors.textMuted, fontSize: 12, marginTop: 2 }}>
            Colesterol {Math.round(cholesterolMg)} / 300 mg
          </Text>
        )}
      </View>

      {/* Líquido del día */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>💧 Líquido {liquidTotal} ml</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          tomada {Math.round(waterDrank)} + alimentos {Math.round(waterFromFood)}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <Pressable onPress={() => addWater(250)} style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
            <Text style={{ color: colors.accentText, fontWeight: "600" }}>+1 vaso (250 ml)</Text>
          </Pressable>
          <TextInput
            value={mlInput} onChangeText={setMlInput} keyboardType="numeric" placeholder="ml" placeholderTextColor={colors.icon}
            style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }}
          />
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
