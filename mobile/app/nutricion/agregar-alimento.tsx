import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getBackendUrl } from "../../src/storage/config";
import { extractFood, createFood } from "../../src/api/nutrition";
import type { FoodBasis, FoodSource } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

type Form = {
  name: string; basis: FoodBasis; kcal: string; protein_g: string; carbs_g: string; fat_g: string;
  unitWeightG: string; source: FoodSource;
};
const EMPTY: Form = { name: "", basis: "per_100g", kcal: "", protein_g: "", carbs_g: "", fat_g: "", unitWeightG: "", source: "estimate" };

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
    if (!baseUrl.current) return;
    setAnalyzing(true);
    try {
      const ex = await extractFood(baseUrl.current, asset.base64!, mime);
      setForm({
        name: ex.name, basis: ex.basis, kcal: String(ex.kcal), protein_g: String(ex.protein_g),
        carbs_g: String(ex.carbs_g), fat_g: String(ex.fat_g),
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
    const input = {
      name: form.name.trim(), basis: form.basis, kcal: num(form.kcal), protein_g: num(form.protein_g),
      carbs_g: num(form.carbs_g), fat_g: num(form.fat_g),
      unitWeightG: form.unitWeightG.trim() === "" ? null : num(form.unitWeightG), source: form.source,
    };
    if (!input.name || [input.kcal, input.protein_g, input.carbs_g, input.fat_g].some((n) => Number.isNaN(n) || n < 0)) {
      setError("Completá nombre y macros (kcal/proteína/carbos/grasa) con números válidos."); return;
    }
    if (!baseUrl.current) return;
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
