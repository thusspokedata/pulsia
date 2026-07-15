import { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listSupplements, explainSupplement, deleteSupplement } from "../../src/api/supplements";
import type { Supplement } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

export default function SuplementosScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const [items, setItems] = useState<Supplement[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const u = await getBackendUrl();
      setUrl(u);
      setItems(await listSupplements(u));
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function onExplain(s: Supplement) {
    setExplaining(s.id);
    try {
      const updated = await explainSupplement(url, s.id);
      setItems((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
    } catch (e) { setError((e as Error).message); }
    setExplaining(null);
  }

  function onDelete(s: Supplement) {
    Alert.alert("Borrar suplemento", `¿Borrar "${s.name}" del catálogo?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        try { await deleteSupplement(url, s.id); setItems((prev) => prev.filter((x) => x.id !== s.id)); }
        catch (e) { setError((e as Error).message); }
      } },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Suplementos</Text>

      <Pressable onPress={() => router.push("/nutricion/agregar-suplemento")}
        style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>Agregar por foto</Text>
      </Pressable>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {items.length === 0 && !error && (
        <Text style={{ color: colors.textMuted }}>Todavía no cargaste suplementos. Sacale una foto a la etiqueta y la IA extrae los componentes.</Text>
      )}

      {items.map((s) => {
        const open = openId === s.id;
        return (
          <Pressable key={s.id} onPress={() => setOpenId(open ? null : s.id)}
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{s.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{s.servingLabel}</Text>
            </View>
            {open && (
              <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                {s.components.map((cmp, i) => (
                  <Text key={i} style={{ color: colors.text, fontSize: 13 }}>
                    {cmp.name} · {cmp.amount} {cmp.unit}
                  </Text>
                ))}
                {s.labelMaxPerDay && <Text style={{ color: colors.textMuted, fontSize: 12 }}>Máx. etiqueta: {s.labelMaxPerDay}</Text>}
                {s.info ? (
                  <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{s.info}</Text>
                ) : explaining === s.id ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Pressable onPress={() => onExplain(s)}
                    style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.sm, alignItems: "center" }}>
                    <Text style={{ color: colors.accentText }}>Explicar con IA</Text>
                  </Pressable>
                )}
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Pressable onPress={() => router.push(`/nutricion/agregar-suplemento?id=${s.id}`)} hitSlop={8}>
                    <Text style={{ color: colors.accentText, fontSize: 12 }}>Editar</Text>
                  </Pressable>
                  <Pressable onPress={() => onDelete(s)} hitSlop={8}>
                    <Text style={{ color: colors.danger, fontSize: 12 }}>Borrar</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
