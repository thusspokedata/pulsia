import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listFoods, createFood, updateFood, getFood, deleteFood } from "../../src/api/nutrition";
import { allowedUnits, type MealRow } from "../../src/nutrition/mealForm";
import { recipeTotals, buildRecipeFoodInput } from "../../src/nutrition/recipeForm";
import type { Food, QuantityUnit } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { NutrientFlags } from "../../src/nutrition/NutrientFlags";

export default function CrearComidaScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const params = useLocalSearchParams<{ id?: string }>();
  const foodId = params.id;
  const baseUrl = useRef<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<MealRow[]>([]);
  const [cookedWeight, setCookedWeight] = useState(""); // texto; "" = usar suma de ingredientes
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notEditable, setNotEditable] = useState(false);
  const [loading, setLoading] = useState(!!foodId);
  const initedRef = useRef(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      let cat: Food[] = [];
      let catOk = false;
      try { cat = await listFoods(url); setFoods(cat); catOk = true; } catch (e) { setError((e as Error).message); }
      if (foodId && !initedRef.current && catOk) {
        initedRef.current = true;
        try {
          const f = await getFood(url, foodId);
          setName(f.name);
          setCookedWeight(f.recipe?.cookedWeightG != null ? String(f.recipe.cookedWeightG) : "");
          const reconstructed = (f.recipe?.items ?? []).map((it) => {
            const ing = cat.find((c) => c.id === it.foodId);
            return ing && allowedUnits(ing).includes(it.unit)
              ? { food: ing, quantity: it.quantity, unit: it.unit }
              : null;
          });
          if (reconstructed.some((r) => r === null)) setNotEditable(true);
          else setRows(reconstructed as MealRow[]);
        } catch (e) { setError((e as Error).message); initedRef.current = false; }
      }
      setLoading(false);
    })();
  }, [foodId]));

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

  function parsedCookedWeight(): number | null {
    const t = cookedWeight.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function save() {
    setError(null);
    if (notEditable) { setError("Esta receta no se puede editar: uno de sus ingredientes fue borrado del catálogo o cambió de unidad. Borrala y volvé a crearla."); return; }
    if (name.trim() === "") { setError("Ponele un nombre a la comida."); return; }
    if (rows.length === 0) { setError("Agregá al menos un ingrediente."); return; }
    if (rows.some((r) => r.quantity <= 0)) { setError("Los pesos tienen que ser mayores a 0."); return; }
    if (cookedWeight.trim() !== "" && parsedCookedWeight() == null) { setError("El peso cocido tiene que ser un número mayor a 0 (o dejalo vacío)."); return; }
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      const input = buildRecipeFoodInput({ name, rows, cookedWeightG: parsedCookedWeight() });
      if (foodId) await updateFood(baseUrl.current, foodId, input);
      else await createFood(baseUrl.current, input);
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  function confirmDelete() {
    if (!foodId) return;
    Alert.alert("Borrar comida", "¿Borrar esta receta del catálogo?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
        try { await deleteFood(baseUrl.current, foodId); router.back(); }
        catch (e) { setError((e as Error).message); }
      } },
    ]);
  }

  const hasWeight = rows.some((r) => r.quantity > 0) || parsedCookedWeight() != null;
  const totals = hasWeight ? recipeTotals(rows, parsedCookedWeight()) : null;
  const matches = q.trim() ? foods.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())) : [];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>Cargando receta…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{foodId ? "Editar comida" : "Crear comida"}</Text>
      {notEditable && (
        <Text style={{ color: colors.danger, fontSize: 13 }}>
          Esta receta no se puede editar: uno de sus ingredientes fue borrado del catálogo o cambió de unidad. Borrala y volvé a crearla.
        </Text>
      )}

      <TextInput value={name} onChangeText={setName} placeholder="Nombre de la comida (ej: Cazuela de pollo)" placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />

      {rows.map((r, i) => (
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
          </View>
        </View>
      ))}

      <TextInput value={q} onChangeText={setQ} placeholder="Buscar ingrediente del catálogo…" placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />
      {matches.map((f) => (
        <Pressable key={f.id} onPress={() => addFood(f)} style={{ padding: spacing.sm, backgroundColor: colors.accentSoft, borderRadius: radius.sm }}>
          <Text style={{ color: colors.accentText }}>+ {f.name}</Text>
          <NutrientFlags food={f} />
        </Pressable>
      ))}
      {q.trim() !== "" && matches.length === 0 && (
        <Pressable onPress={() => router.push("/nutricion/agregar-alimento")}>
          <Text style={{ color: colors.accent }}>No está en el catálogo — agregarlo (foto / nombre / USDA)</Text>
        </Pressable>
      )}

      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>Peso del plato terminado (opcional)</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Pesá la olla/fuente cocida para capturar el agua/caldo que se agrega o evapora. Si lo dejás vacío, se usa la suma de los ingredientes.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <TextInput value={cookedWeight} onChangeText={setCookedWeight} keyboardType="numeric" placeholder="ej: 1200" placeholderTextColor={colors.icon}
            style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text, width: 120 }} />
          <Text style={{ color: colors.textMuted }}>g</Text>
        </View>
      </View>

      {totals && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>Total: {totals.total.kcal} kcal · {totals.effectiveWeightG} g</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>P {totals.total.protein_g}g · C {totals.total.carbs_g}g · G {totals.total.fat_g}g</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Por 100 g: {totals.per100.kcal} kcal · P {totals.per100.protein_g} C {totals.per100.carbs_g} G {totals.per100.fat_g}</Text>
        </View>
      )}

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={save} disabled={saving || notEditable || rows.length === 0} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving || notEditable || rows.length === 0 ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : foodId ? "Guardar cambios" : "Guardar comida"}</Text>
      </Pressable>
      {foodId && (
        <Pressable onPress={confirmDelete} style={{ backgroundColor: colors.danger, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Borrar comida</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
