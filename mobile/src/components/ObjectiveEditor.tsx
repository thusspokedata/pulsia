import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl } from "../storage/config";
import { getObjective, putObjective, draftObjective } from "../api/objective";
import { colors, radius, spacing } from "../theme/tokens";

/**
 * Editor del "objetivo de trabajo": carga el contenido actual, permite sugerirlo con IA
 * (draftObjective) y guardarlo (putObjective). Compartido por la pantalla standalone
 * (app/objetivo-trabajo.tsx) y la sección 1 de la pantalla global (app/plan-trabajo.tsx) —
 * ambas montan el mismo estado/handlers, así que vive acá una sola vez.
 */
export default function ObjectiveEditor() {
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
    <View style={{ gap: spacing.md }}>
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
    </View>
  );
}
