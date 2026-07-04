import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { getBackendUrl } from "../src/storage/config";
import { getMemory, refreshMemory } from "../src/api/memory";
import { colors, radius, spacing } from "../src/theme/tokens";

export default function MemoriaScreen() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (!url) {
        setError("Configurá el backend");
        setLoading(false);
        return;
      }
      try {
        setContent(await getMemory(url));
      } catch {
        setError("No se pudo cargar la memoria");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onRefresh() {
    const url = baseUrl.current;
    if (!url) return;
    setRefreshing(true);
    setError(null);
    try {
      setContent(await refreshMemory(url));
    } catch {
      setError("No se pudo actualizar la memoria");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Qué sabe la IA de mí</Text>
      {error && <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }}>
          <Text testID="memoria-content" style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
            {content || "Todavía no hay memoria. Entrená y actualizá para que la IA aprenda de vos."}
          </Text>
        </View>
      )}
      <Pressable
        testID="memoria-actualizar"
        onPress={onRefresh}
        disabled={refreshing || loading}
        style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: refreshing ? 0.6 : 1 }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>{refreshing ? "Actualizando…" : "Actualizar memoria"}</Text>
      </Pressable>
    </ScrollView>
  );
}
