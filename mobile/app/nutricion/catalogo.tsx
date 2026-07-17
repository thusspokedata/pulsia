import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listFoods, deleteFood } from "../../src/api/nutrition";
import type { Food } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { SourceChip } from "../../src/nutrition/SourceChip";

export default function CatalogoScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const baseUrl = useRef<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = await getBackendUrl();
    baseUrl.current = url;
    try { setFoods(await listFoods(url)); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function remove(f: Food) {
    Alert.alert("Borrar alimento", `¿Borrar "${f.name}"? Tus comidas pasadas no cambian.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        if (!baseUrl.current) return;
        try { await deleteFood(baseUrl.current, f.id); setFoods((xs) => xs.filter((x) => x.id !== f.id)); }
        catch (e) { setError((e as Error).message); }
      } },
    ]);
  }

  const filtered = foods.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Catálogo de alimentos</Text>
      <Pressable onPress={() => router.push("/nutricion/agregar-alimento")} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>+ Agregar alimento</Text>
      </Pressable>
      <TextInput value={q} onChangeText={setQ} placeholder="Buscar…" placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {foods.length === 0 && <Text style={{ color: colors.textMuted }}>Todavía no hay alimentos. Agregá el primero con una foto.</Text>}
      {foods.length > 0 && filtered.length === 0 && <Text style={{ color: colors.textMuted }}>No se encontraron alimentos para "{q}".</Text>}
      {filtered.map((f) => (
        <View key={f.id} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable style={{ flex: 1 }} onPress={() => router.push(`/nutricion/agregar-alimento?foodId=${f.id}`)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1 }}>{f.name}</Text>
              <SourceChip source={f.source} />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {f.kcal} kcal · P{f.protein_g} C{f.carbs_g} G{f.fat_g} /100{f.basis === "per_100ml" ? "ml" : "g"}
              {f.sugars_g != null ? ` · azúc ${f.sugars_g}` : ""}
              {f.fiber_g != null ? ` · fibra ${f.fiber_g}` : ""}
              {f.saturated_fat_g != null ? ` · sat ${f.saturated_fat_g}` : ""}
              {f.salt_g != null ? ` · sal ${f.salt_g}` : ""}
              {f.unitWeightG != null ? ` · 1 u ≈ ${f.unitWeightG}${f.basis === "per_100ml" ? "ml" : "g"}` : ""}
            </Text>
          </Pressable>
          <Pressable onPress={() => remove(f)} style={{ padding: spacing.sm }}>
            <Text style={{ color: colors.danger }}>Borrar</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
