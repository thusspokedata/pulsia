import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listFoods, deleteFood } from "../../src/api/nutrition";
import type { Food } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

export default function CatalogoScreen() {
  const baseUrl = useRef<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = await getBackendUrl();
    baseUrl.current = url;
    try { setFoods(await listFoods(url)); } catch (e) { setError((e as Error).message); }
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
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Catálogo de alimentos</Text>
      <Pressable onPress={() => router.push("/nutricion/agregar-alimento")} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>+ Agregar alimento</Text>
      </Pressable>
      <TextInput value={q} onChangeText={setQ} placeholder="Buscar…" placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {filtered.length === 0 && <Text style={{ color: colors.textMuted }}>Todavía no hay alimentos. Agregá el primero con una foto.</Text>}
      {filtered.map((f) => (
        <View key={f.id} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{f.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {f.kcal} kcal · P{f.protein_g} C{f.carbs_g} G{f.fat_g} /100{f.basis === "per_100ml" ? "ml" : "g"}
              {f.unitWeightG != null ? ` · 1 u ≈ ${f.unitWeightG}${f.basis === "per_100ml" ? "ml" : "g"}` : ""}
            </Text>
          </View>
          <Pressable onPress={() => remove(f)} style={{ padding: spacing.sm }}>
            <Text style={{ color: colors.danger }}>Borrar</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
