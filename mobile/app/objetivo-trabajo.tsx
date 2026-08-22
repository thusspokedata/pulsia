import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl } from "../src/storage/config";
import { getObjective, putObjective, draftObjective } from "../src/api/objective";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

export default function ObjetivoTrabajoScreen() {
  const screenPad = useScreenPadding(spacing.xl);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "draft">(null);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (!url) { setError("Configurá el backend"); setLoading(false); return; }
      try { setContent(await getObjective(url)); }
      catch { setError("No se pudo cargar el objetivo"); }
      finally { setLoading(false); }
    })();
  }, []);

  async function onDraft() {
    const url = baseUrl.current; if (!url) return;
    setBusy("draft"); setError(null);
    try { setContent(await draftObjective(url)); }
    catch { setError("No se pudo sugerir el objetivo"); }
    finally { setBusy(null); }
  }
  async function onSave() {
    const url = baseUrl.current; if (!url) return;
    setBusy("save"); setError(null);
    try { setContent(await putObjective(url, content)); }
    catch { setError("No se pudo guardar el objetivo"); }
    finally { setBusy(null); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Objetivo de trabajo</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>El norte contra el que se justifica todo el plan. Editalo cuando quieras.</Text>
      {error && <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <TextInput
          testID="objetivo-input"
          value={content}
          onChangeText={setContent}
          multiline
          placeholder="Ej: recomposición en 12 semanas, priorizar fuerza en tren superior…"
          placeholderTextColor={colors.textMuted}
          style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 14, minHeight: 140, textAlignVertical: "top" }}
        />
      )}
      <Pressable testID="objetivo-sugerir" onPress={onDraft} disabled={busy != null || loading || !baseUrl.current}
        style={{ borderColor: colors.accent, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: busy || !baseUrl.current ? 0.6 : 1 }}>
        <Text style={{ color: colors.accentText, fontWeight: "600" }}>{busy === "draft" ? "Sugiriendo…" : "Sugerir con IA"}</Text>
      </Pressable>
      <Pressable testID="objetivo-guardar" onPress={onSave} disabled={busy != null || loading || !baseUrl.current}
        style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: busy || !baseUrl.current ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>{busy === "save" ? "Guardando…" : "Guardar"}</Text>
      </Pressable>
    </ScrollView>
  );
}
