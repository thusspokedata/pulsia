import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getBackendUrl } from "../../src/storage/config";
import { extractFood, createFood } from "../../src/api/nutrition";
import type { FoodBasis, FoodSource } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

type Form = {
  name: string; basis: FoodBasis; kcal: string; protein_g: string; carbs_g: string; fat_g: string;
  saturated_fat_g: string; sugars_g: string; fiber_g: string; salt_g: string;
  unitWeightG: string; source: FoodSource;
};
const EMPTY: Form = { name: "", basis: "per_100g", kcal: "", protein_g: "", carbs_g: "", fat_g: "", saturated_fat_g: "", sugars_g: "", fiber_g: "", salt_g: "", unitWeightG: "", source: "estimate" };

export default function AgregarAlimentoScreen() {
  const baseUrl = useRef<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getBackendUrl().then((u) => { baseUrl.current = u; }); }, []);

  async function pickAndExtract(source: "camera" | "library") {
    setError(null);
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError("Necesito permiso de cámara/galería."); return; }
    const res = source === "camera"
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled || !res.assets[0]?.base64) return;
    const asset = res.assets[0];
    const mime = asset.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ? asset.mimeType : "image/jpeg";
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setAnalyzing(true);
    try {
      const ex = await extractFood(baseUrl.current, asset.base64!, mime);
      const numStr = (v: number | null | undefined) => (v == null ? "" : String(v));
      setForm({
        name: ex.name, basis: ex.basis, kcal: String(ex.kcal), protein_g: String(ex.protein_g),
        carbs_g: String(ex.carbs_g), fat_g: String(ex.fat_g),
        saturated_fat_g: numStr(ex.saturated_fat_g), sugars_g: numStr(ex.sugars_g),
        fiber_g: numStr(ex.fiber_g), salt_g: numStr(ex.salt_g),
        unitWeightG: ex.unitWeightG == null ? "" : String(ex.unitWeightG), source: ex.source,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    setError(null);
    const num = (s: string) => Number(s.replace(",", "."));
    const optNum = (s: string) => (s.trim() === "" ? null : num(s));
    const input = {
      name: form.name.trim(), basis: form.basis, kcal: num(form.kcal), protein_g: num(form.protein_g),
      carbs_g: num(form.carbs_g), fat_g: num(form.fat_g),
      saturated_fat_g: optNum(form.saturated_fat_g), sugars_g: optNum(form.sugars_g),
      fiber_g: optNum(form.fiber_g), salt_g: optNum(form.salt_g),
      unitWeightG: form.unitWeightG.trim() === "" ? null : num(form.unitWeightG), source: form.source,
    };
    if (!input.name || [input.kcal, input.protein_g, input.carbs_g, input.fat_g].some((n) => Number.isNaN(n) || n < 0)) {
      setError("Completá nombre y macros (kcal/proteína/carbos/grasa) con números válidos."); return;
    }
    // Los micros son opcionales: si el usuario tipeó algo, tiene que ser un número >= 0.
    for (const [label, v, raw] of [["saturadas", input.saturated_fat_g, form.saturated_fat_g], ["azúcares", input.sugars_g, form.sugars_g], ["fibra", input.fiber_g, form.fiber_g], ["sal", input.salt_g, form.salt_g]] as const) {
      if (raw.trim() !== "" && (v == null || Number.isNaN(v) || v < 0)) { setError(`El valor de ${label} tiene que ser un número mayor o igual a 0.`); return; }
    }
    if (form.unitWeightG.trim() !== "" && (input.unitWeightG == null || Number.isNaN(input.unitWeightG) || input.unitWeightG <= 0)) {
      setError("El peso por unidad tiene que ser un número mayor a 0."); return;
    }
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      await createFood(baseUrl.current, input);
      router.back();
    } catch (e) {
      setError((e as Error).message); setSaving(false);
    }
  }

  const field = (label: string, key: keyof Form, keyboard: "default" | "numeric" = "default") => (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <TextInput
        value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        keyboardType={keyboard} placeholder={label} placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
      />
    </View>
  );

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} style={{
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill,
      backgroundColor: active ? colors.accent : colors.surfaceMuted,
    }}>
      <Text style={{ color: active ? "#fff" : colors.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Agregar alimento</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable onPress={() => pickAndExtract("camera")} style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>📷 Foto</Text>
        </Pressable>
        <Pressable onPress={() => pickAndExtract("library")} style={{ flex: 1, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>🖼️ Galería</Text>
        </Pressable>
      </View>
      {analyzing && (
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <ActivityIndicator color={colors.accent} /><Text style={{ color: colors.textMuted }}>Analizando…</Text>
        </View>
      )}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {field("Nombre", "name")}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {chip("Sólido (100g)", form.basis === "per_100g", () => setForm((f) => ({ ...f, basis: "per_100g" })))}
        {chip("Líquido (100ml)", form.basis === "per_100ml", () => setForm((f) => ({ ...f, basis: "per_100ml" })))}
      </View>
      {field(`Calorías (por 100${form.basis === "per_100ml" ? "ml" : "g"})`, "kcal", "numeric")}
      {field("Proteína (g)", "protein_g", "numeric")}
      {field("Carbohidratos (g)", "carbs_g", "numeric")}
      {field("Grasa (g)", "fat_g", "numeric")}
      {field("Grasas saturadas (g, opcional)", "saturated_fat_g", "numeric")}
      {field("Azúcares (g, opcional)", "sugars_g", "numeric")}
      {field("Fibra (g, opcional)", "fiber_g", "numeric")}
      {field("Sal (g, opcional)", "salt_g", "numeric")}
      {form.salt_g.trim() !== "" && Number(form.salt_g.replace(",", ".")) >= 0 && (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Sodio ≈ {Math.round((Number(form.salt_g.replace(",", ".")) / 2.5) * 1000)} mg / 100{form.basis === "per_100ml" ? "ml" : "g"}
        </Text>
      )}
      {field("Peso por unidad (opcional)", "unitWeightG", "numeric")}
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        Fuente: {form.source === "label" ? "etiqueta (preciso)" : "estimado por IA"}
      </Text>

      <Pressable onPress={save} disabled={saving} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : "Guardar en el catálogo"}</Text>
      </Pressable>
    </ScrollView>
  );
}
