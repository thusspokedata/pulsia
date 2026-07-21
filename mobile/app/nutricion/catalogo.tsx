import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listFoods, deleteFood } from "../../src/api/nutrition";
import { filterFoodsByNutrient, FLAGGED_NUTRIENTS, type Food, type FlaggedNutrient } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { SourceChip } from "../../src/nutrition/SourceChip";
import { NutrientFlags } from "../../src/nutrition/NutrientFlags";
import { NUTRIENT_LABELS } from "../../src/nutrition/nutrientText";

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

export default function CatalogoScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const baseUrl = useRef<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [q, setQ] = useState("");
  const [nutrient, setNutrient] = useState<FlaggedNutrient | null>(null);
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

  // El texto se aplica primero y el nutriente después, para que el filtro por nutriente opere
  // sobre lo que el usuario ya acotó con el buscador.
  const byText = foods.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const result = nutrient ? filterFoodsByNutrient(byText, nutrient) : null;
  const filtered = result ? result.matches : byText;
  const missing = result ? result.unknown : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Catálogo de alimentos</Text>
      <Pressable onPress={() => router.push("/nutricion/agregar-alimento")} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>+ Agregar alimento</Text>
      </Pressable>
      <TextInput value={q} onChangeText={setQ} placeholder="Buscar…" placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />
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
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {foods.length === 0 && <Text style={{ color: colors.textMuted }}>Todavía no hay alimentos. Agregá el primero con una foto.</Text>}
      {foods.length > 0 && filtered.length === 0 && missing.length === 0 && <Text style={{ color: colors.textMuted }}>No se encontraron alimentos para "{q}".</Text>}
      {filtered.map((f) => <FoodRow key={f.id} food={f} onDelete={remove} />)}
      {missing.length > 0 && nutrient && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.md }}>
            Sin datos de {NUTRIENT_LABELS[nutrient]} ({missing.length})
          </Text>
          {missing.map((f) => <FoodRow key={f.id} food={f} onDelete={remove} />)}
        </>
      )}
    </ScrollView>
  );
}
