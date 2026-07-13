import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listFoods, createMeal } from "../../src/api/nutrition";
import { buildMealInput, mealTotals, itemPreview, allowedUnits, type MealRow } from "../../src/nutrition/mealForm";
import type { Food, MealType, QuantityUnit } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

const MEAL_TYPES: MealType[] = ["desayuno", "almuerzo", "cena", "snack"];

export default function NuevaComidaScreen() {
  const params = useLocalSearchParams<{ eatenAt?: string }>();
  const baseUrl = useRef<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [rows, setRows] = useState<MealRow[]>([]);
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // eatenAt: si vino por params (día seleccionado en el tab), usarlo; si no, ahora.
  const eatenAt = useRef<number>(params.eatenAt ? Number(params.eatenAt) : Date.now());

  useFocusEffect(useCallback(() => {
    (async () => { const url = await getBackendUrl(); baseUrl.current = url; try { setFoods(await listFoods(url)); } catch (e) { setError((e as Error).message); } })();
  }, []));

  function addFood(food: Food) {
    const unit = allowedUnits(food)[0];
    setRows((rs) => [...rs, { food, quantity: unit === "unit" ? 1 : 100, unit }]);
    setQ("");
  }
  function setQty(i: number, v: string) {
    const n = Number(v.replace(",", "."));
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, quantity: Number.isNaN(n) ? 0 : n } : r)));
  }
  function setUnit(i: number, unit: QuantityUnit) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, unit } : r)));
  }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  async function save() {
    setError(null);
    if (rows.length === 0) { setError("Agregá al menos un alimento."); return; }
    if (rows.some((r) => r.quantity <= 0)) { setError("Las cantidades tienen que ser mayores a 0."); return; }
    if (!baseUrl.current) return;
    setSaving(true);
    try {
      await createMeal(baseUrl.current, buildMealInput({ eatenAt: eatenAt.current, mealType, note, rows }));
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  const totals = mealTotals(rows);
  const matches = q.trim() ? foods.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Nueva comida</Text>

      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        {MEAL_TYPES.map((t) => (
          <Pressable key={t} onPress={() => setMealType((cur) => (cur === t ? null : t))} style={{
            paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill,
            backgroundColor: mealType === t ? colors.accent : colors.surfaceMuted,
          }}>
            <Text style={{ color: mealType === t ? "#fff" : colors.text }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {/* Ítems agregados */}
      {rows.map((r, i) => {
        const preview = r.quantity > 0 ? itemPreview(r.food, r.quantity, r.unit) : null;
        return (
          <View key={`${r.food.id}-${i}`} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontWeight: "600", flex: 1 }}>{r.food.name}</Text>
              <Pressable onPress={() => removeRow(i)}><Text style={{ color: colors.danger }}>Quitar</Text></Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              <TextInput value={String(r.quantity)} onChangeText={(v) => setQty(i, v)} keyboardType="numeric"
                style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text, width: 80 }} />
              {allowedUnits(r.food).map((u) => (
                <Pressable key={u} onPress={() => setUnit(i, u)} style={{
                  paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill,
                  backgroundColor: r.unit === u ? colors.accent : colors.surfaceMuted,
                }}>
                  <Text style={{ color: r.unit === u ? "#fff" : colors.text }}>{u === "unit" ? "unidad" : u}</Text>
                </Pressable>
              ))}
              {preview && <Text style={{ color: colors.textMuted, marginLeft: "auto" }}>{preview.kcal} kcal</Text>}
            </View>
          </View>
        );
      })}

      {/* Buscador del catálogo */}
      <TextInput value={q} onChangeText={setQ} placeholder="Buscar alimento del catálogo…" placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />
      {matches.map((f) => (
        <Pressable key={f.id} onPress={() => addFood(f)} style={{ padding: spacing.sm, backgroundColor: colors.accentSoft, borderRadius: radius.sm }}>
          <Text style={{ color: colors.accentText }}>+ {f.name}</Text>
        </Pressable>
      ))}
      {q.trim() !== "" && matches.length === 0 && (
        <Pressable onPress={() => router.push("/nutricion/agregar-alimento")}>
          <Text style={{ color: colors.accent }}>No está en el catálogo — agregarlo con una foto</Text>
        </Pressable>
      )}

      {/* Nota + totales + guardar */}
      <TextInput value={note} onChangeText={setNote} placeholder="Cómo te sentiste después (opcional)" placeholderTextColor={colors.icon} multiline
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text, minHeight: 60 }} />
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
        <Text style={{ color: colors.text, fontWeight: "700" }}>Total: {totals.kcal} kcal</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>P {totals.protein_g}g · C {totals.carbs_g}g · G {totals.fat_g}g</Text>
      </View>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={save} disabled={saving} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : "Guardar comida"}</Text>
      </Pressable>
    </ScrollView>
  );
}
