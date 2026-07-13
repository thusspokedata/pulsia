import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listMeals, deleteMeal } from "../../src/api/nutrition";
import { dayAtNoon, dayLabel } from "../../src/session/metricDate";
import type { Meal } from "@pulsia/shared";
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (off: number) => {
    const url = await getBackendUrl(); baseUrl.current = url;
    const { from, to } = dayBounds(off);
    try { setMeals(await listMeals(url, from, to)); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);

  useFocusEffect(useCallback(() => { void load(offset); }, [load, offset]));

  function mealKcal(m: Meal): number { return m.items.reduce((a, it) => a + it.kcal, 0); }
  const dayTotals = meals.reduce((acc, m) => {
    for (const it of m.items) { acc.kcal += it.kcal; acc.p += it.protein_g; acc.c += it.carbs_g; acc.g += it.fat_g; }
    return acc;
  }, { kcal: 0, p: 0, c: 0, g: 0 });

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
        <Pressable key={m.id} onLongPress={() => remove(m)} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs }}>
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
