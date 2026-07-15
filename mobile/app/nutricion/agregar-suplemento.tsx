import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getBackendUrl } from "../../src/storage/config";
import { extractSupplement, createSupplement, updateSupplement, listSupplements } from "../../src/api/supplements";
import type { SupplementSource, SupplementComponent } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

type ComponentRow = { name: string; amount: string; unit: string };
const EMPTY_COMPONENT: ComponentRow = { name: "", amount: "", unit: "" };

export default function AgregarSuplementoScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const baseUrl = useRef<string | null>(null);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(!!id);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingLabel, setServingLabel] = useState("");
  const [labelMaxPerDay, setLabelMaxPerDay] = useState("");
  const [components, setComponents] = useState<ComponentRow[]>([{ ...EMPTY_COMPONENT }]);
  const [source, setSource] = useState<SupplementSource>("estimate");
  const [info, setInfo] = useState<string | null>(null); // viene de la extracción o del suplemento editado; NO editable
  const [notes, setNotes] = useState("");
  const [componentsEdited, setComponentsEdited] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (id) {
        try {
          const list = await listSupplements(url);
          const s = list.find((x) => x.id === id);
          if (!s) { setError("No se encontró el suplemento."); }
          else {
            setName(s.name);
            setBrand(s.brand ?? "");
            setServingLabel(s.servingLabel);
            setLabelMaxPerDay(s.labelMaxPerDay ?? "");
            setComponents(s.components.map((c: SupplementComponent) => ({ name: c.name, amount: String(c.amount), unit: c.unit })));
            setSource(s.source);
            setInfo(s.info ?? null);
            setNotes(s.notes ?? "");
          }
        } catch (e) { setError((e as Error).message); }
      }
      setLoading(false);
    })();
  }, [id]);

  async function pickAndExtract(kind: "camera" | "library") {
    setError(null);
    const perm = kind === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError("Necesito permiso de cámara/galería."); return; }
    const res = kind === "camera"
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled || !res.assets[0]?.base64) return;
    const asset = res.assets[0];
    const mime = asset.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ? asset.mimeType : "image/jpeg";
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setAnalyzing(true);
    try {
      const ex = await extractSupplement(baseUrl.current, asset.base64!, mime);
      setName(ex.name);
      setBrand(ex.brand ?? "");
      setServingLabel(ex.servingLabel);
      setLabelMaxPerDay(ex.labelMaxPerDay ?? "");
      setComponents(ex.components.map((c) => ({ name: c.name, amount: String(c.amount), unit: c.unit })));
      setSource(ex.source);
      setInfo(ex.info);
      setComponentsEdited(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  function updateComponent(i: number, patch: Partial<ComponentRow>) {
    setComponents((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    setComponentsEdited(true);
  }

  function addComponent() {
    setComponents((prev) => [...prev, { ...EMPTY_COMPONENT }]);
  }

  function removeComponent(i: number) {
    setComponents((prev) => prev.filter((_, idx) => idx !== i));
    setComponentsEdited(true);
  }

  async function save() {
    setError(null);
    // Partición de filas: las totalmente vacías se ignoran; las válidas se guardan;
    // una fila a medio cargar (o con cantidad inválida) corta el guardado con error,
    // para no descartar componentes en silencio.
    const validComponents: { name: string; amount: number; unit: string }[] = [];
    for (let i = 0; i < components.length; i++) {
      const raw = components[i];
      const cName = raw.name.trim();
      const cUnit = raw.unit.trim();
      if (cName === "" && raw.amount.trim() === "" && cUnit === "") continue; // fila vacía
      const amount = Number(raw.amount.replace(",", "."));
      if (cName === "" || cUnit === "" || raw.amount.trim() === "" || Number.isNaN(amount) || amount <= 0) {
        setError(`El componente ${i + 1} está incompleto o tiene una cantidad inválida.`); return;
      }
      validComponents.push({ name: cName, amount, unit: cUnit });
    }
    if (!name.trim()) { setError("Completá el nombre."); return; }
    if (!servingLabel.trim()) { setError("Completá la porción."); return; }
    if (validComponents.length === 0) { setError("Cargá al menos un componente."); return; }
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }

    const input = {
      name: name.trim(),
      brand: brand.trim() === "" ? null : brand.trim(),
      servingLabel: servingLabel.trim(),
      components: validComponents,
      labelMaxPerDay: labelMaxPerDay.trim() === "" ? null : labelMaxPerDay.trim(),
      source,
      info,
      notes: notes.trim() === "" ? null : notes.trim(),
    };

    if (id && componentsEdited) {
      Alert.alert(
        "Explicación posiblemente desactualizada",
        "Editaste los componentes: la explicación generada por IA puede haber quedado desactualizada. Podés regenerarla desde el detalle con \"Explicar con IA\".",
      );
    }

    setSaving(true);
    try {
      if (id) await updateSupplement(baseUrl.current, id, input);
      else await createSupplement(baseUrl.current, input);
      router.back();
    } catch (e) {
      setError((e as Error).message); setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>Cargando suplemento…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{id ? "Editar suplemento" : "Agregar suplemento"}</Text>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable onPress={() => pickAndExtract("camera")} style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>📷 Cámara</Text>
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

      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Nombre</Text>
        <TextInput
          value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={colors.icon}
          style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
        />
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Marca (opcional)</Text>
        <TextInput
          value={brand} onChangeText={setBrand} placeholder="Marca" placeholderTextColor={colors.icon}
          style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
        />
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Porción</Text>
        <TextInput
          value={servingLabel} onChangeText={setServingLabel} placeholder="Porción" placeholderTextColor={colors.icon}
          style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
        />
      </View>

      <Text style={{ color: colors.text, fontWeight: "600" }}>Componentes</Text>
      {components.map((c, i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <TextInput
            value={c.name} onChangeText={(v) => updateComponent(i, { name: v })}
            placeholder={i === 0 ? "Componente" : `Componente ${i + 1}`} placeholderTextColor={colors.icon}
            style={{ flex: 2, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
          />
          <TextInput
            value={c.amount} onChangeText={(v) => updateComponent(i, { amount: v })} keyboardType="numeric"
            placeholder={i === 0 ? "Cantidad" : `Cantidad ${i + 1}`} placeholderTextColor={colors.icon}
            style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
          />
          <TextInput
            value={c.unit} onChangeText={(v) => updateComponent(i, { unit: v })}
            placeholder={i === 0 ? "Unidad" : `Unidad ${i + 1}`} placeholderTextColor={colors.icon}
            style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
          />
          {components.length > 1 && (
            <Pressable onPress={() => removeComponent(i)} hitSlop={8}>
              <Text style={{ color: colors.danger, fontSize: 12 }}>Quitar</Text>
            </Pressable>
          )}
        </View>
      ))}
      <Pressable onPress={addComponent} style={{ alignSelf: "flex-start" }}>
        <Text style={{ color: colors.accentText }}>+ Componente</Text>
      </Pressable>

      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Máx. por día en etiqueta (opcional)</Text>
        <TextInput
          value={labelMaxPerDay} onChangeText={setLabelMaxPerDay} placeholder="Máx. por día"
          placeholderTextColor={colors.icon}
          style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
        />
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Notas (opcional)</Text>
        <TextInput
          value={notes} onChangeText={setNotes} placeholder="Notas" placeholderTextColor={colors.icon}
          style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }}
        />
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        Fuente: {source === "label" ? "etiqueta (preciso)" : "estimado por IA"}
      </Text>

      <Pressable onPress={save} disabled={saving} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : id ? "Guardar cambios" : "Guardar"}</Text>
      </Pressable>
    </ScrollView>
  );
}
