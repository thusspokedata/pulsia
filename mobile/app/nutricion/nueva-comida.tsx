import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listFoods, createMeal, getMeal, updateMeal, deleteMeal } from "../../src/api/nutrition";
import { buildMealInput, mealTotals, itemPreview, allowedUnits, type MealRow } from "../../src/nutrition/mealForm";
import type { Food, MealType, QuantityUnit } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { NutrientFlags } from "../../src/nutrition/NutrientFlags";

const MEAL_TYPES: MealType[] = ["desayuno", "almuerzo", "cena", "snack"];

export default function NuevaComidaScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const params = useLocalSearchParams<{ eatenAt?: string; mealId?: string }>();
  const mealId = params.mealId;
  const baseUrl = useRef<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [rows, setRows] = useState<MealRow[]>([]);
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notEditable, setNotEditable] = useState(false);
  const [loading, setLoading] = useState(!!mealId);
  const initedRef = useRef(false);
  // eatenAt: si vino por params (día seleccionado en el tab), usarlo; si no, ahora.
  const eatenAt = useRef<number>(params.eatenAt ? Number(params.eatenAt) : Date.now());

  useFocusEffect(useCallback(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      let cat: Food[] = [];
      let catOk = false;
      try { cat = await listFoods(url); setFoods(cat); catOk = true; } catch (e) { setError((e as Error).message); }
      if (mealId && !initedRef.current && catOk) {
        initedRef.current = true;
        try {
          const m = await getMeal(url, mealId);
          eatenAt.current = m.eatenAt;
          setMealType(m.mealType);
          setNote(m.note ?? "");
          const reconstructed = m.items.map((it) => {
            const food = cat.find((f) => f.id === it.foodId);
            return food && allowedUnits(food).includes(it.quantityUnit)
              ? { food, quantity: it.quantity, unit: it.quantityUnit }
              : null;
          });
          if (reconstructed.some((r) => r === null)) setNotEditable(true);
          else setRows(reconstructed as MealRow[]);
        } catch (e) { setError((e as Error).message); initedRef.current = false; }
      }
      setLoading(false);
    })();
  }, [mealId]));

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
    if (notEditable) { setError("Esta comida no se puede editar: uno de sus alimentos fue borrado del catálogo o cambió de unidad/formato. Borrala y volvé a cargarla."); return; }
    if (rows.length === 0) { setError("Agregá al menos un alimento."); return; }
    if (rows.some((r) => r.quantity <= 0)) { setError("Las cantidades tienen que ser mayores a 0."); return; }
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      const input = buildMealInput({ eatenAt: eatenAt.current, mealType, note, rows });
      if (mealId) await updateMeal(baseUrl.current, mealId, input);
      else await createMeal(baseUrl.current, input);
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  function confirmDelete() {
    if (!mealId) return;
    Alert.alert("Borrar comida", "¿Borrar esta comida?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
        try { await deleteMeal(baseUrl.current, mealId); router.back(); }
        catch (e) { setError((e as Error).message); }
      } },
    ]);
  }

  const totals = mealTotals(rows);
  const matches = q.trim() ? foods.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())) : [];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>Cargando comida…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{mealId ? "Editar comida" : "Nueva comida"}</Text>
      {notEditable && (
        <Text style={{ color: colors.danger, fontSize: 13 }}>
          Esta comida no se puede editar: uno de sus alimentos fue borrado del catálogo o cambió de unidad/formato. Borrala y volvé a cargarla.
        </Text>
      )}

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
          <NutrientFlags food={f} />
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
        {(totals.sugars_g != null || totals.fiber_g != null || totals.saturated_fat_g != null || totals.salt_g != null) && (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {[
              totals.sugars_g != null ? `azúc ${totals.sugars_g}g` : null,
              totals.fiber_g != null ? `fibra ${totals.fiber_g}g` : null,
              totals.saturated_fat_g != null ? `sat ${totals.saturated_fat_g}g` : null,
              totals.salt_g != null ? `sal ${totals.salt_g}g` : null,
            ].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
      {mealId && rows.length === 0 && !notEditable && (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          Una comida no puede quedar sin alimentos: agregá uno o borrá la comida.
        </Text>
      )}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={save} disabled={saving || notEditable || rows.length === 0} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving || notEditable || rows.length === 0 ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : mealId ? "Guardar cambios" : "Guardar comida"}</Text>
      </Pressable>
      {mealId && (
        <Pressable onPress={confirmDelete} style={{ backgroundColor: colors.danger, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Borrar comida</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
