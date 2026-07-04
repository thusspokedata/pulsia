import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import type { WorkoutSession } from "@pulsia/shared";
import { getSessions, getSessionById, deleteSessionById, type SessionListItem } from "../../src/api/sessions";
import { getBackendUrl } from "../../src/storage/config";
import { summarize } from "../../src/session/summary";
import { SessionSummary } from "../../src/components/SessionSummary";
import { colors, spacing, radius } from "../../src/theme/tokens";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export default function HistorialScreen() {
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [selected, setSelected] = useState<WorkoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const lastLoaded = useRef<string | null>(null);
  const baseUrl = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const url = await getBackendUrl();
        if (!active) return;
        baseUrl.current = url;
        if (!url) {
          if (lastLoaded.current !== "no-url") {
            lastLoaded.current = "no-url";
            setError("Configurá el backend");
            setItems([]);
            setLoading(false);
          }
          return;
        }
        try {
          const list = await getSessions(url);
          if (!active) return;
          const sorted = [...list].sort((a, b) => b.startedAt - a.startedAt);
          const serialized = JSON.stringify(sorted);
          if (serialized === lastLoaded.current) return;
          lastLoaded.current = serialized;
          setError(null);
          setItems(sorted);
          setLoading(false);
        } catch {
          if (active && lastLoaded.current !== "error") {
            lastLoaded.current = "error";
            setError("No se pudo cargar el historial");
            setLoading(false);
          }
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  async function onOpen(item: SessionListItem) {
    const url = baseUrl.current;
    if (!url) return;
    // Error separado del de la lista: si falla abrir una sesión NO debe ocultar el historial.
    setDetailError(null);
    setDetailLoading(true);
    try {
      const full = await getSessionById(url, item.id);
      setSelected(full);
    } catch {
      setDetailError("No se pudo abrir el entrenamiento");
    } finally {
      setDetailLoading(false);
    }
  }

  function confirmDelete(item: SessionListItem) {
    Alert.alert("Eliminar entrenamiento", "Se borrará de la base de datos. ¿Seguro?", [
      { text: "No", style: "cancel" },
      { text: "Sí, eliminar", style: "destructive", onPress: () => onDelete(item) },
    ]);
  }

  async function onDelete(item: SessionListItem) {
    const url = baseUrl.current;
    if (!url) return;
    setDetailError(null); // limpiar cualquier error previo antes de reintentar
    try {
      await deleteSessionById(url, item.id);
      setItems((prev) => {
        const next = prev.filter((x) => x.id !== item.id);
        // Actualizar el dedupe del focus-effect para que no reintroduzca el item borrado.
        lastLoaded.current = JSON.stringify(next);
        return next;
      });
    } catch {
      setDetailError("No se pudo eliminar");
    }
  }

  if (selected != null) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <Pressable testID="hist-back" onPress={() => setSelected(null)} style={{ paddingVertical: spacing.xs }}>
          <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>← Volver al historial</Text>
        </Pressable>
        <SessionSummary summary={summarize(selected)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      {detailLoading && <Text testID="hist-opening" style={{ color: colors.textMuted, fontSize: 12 }}>Abriendo…</Text>}
      {detailError && <Text testID="hist-detail-error" style={{ color: colors.danger, fontSize: 12 }}>{detailError}</Text>}
      {error ? (
        <Text style={{ color: colors.textMuted }}>{error}</Text>
      ) : loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : items.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>Todavía no hay entrenamientos</Text>
      ) : (
        items.map((s) => (
          <Pressable
            key={s.id}
            testID={`hist-item-${s.id}`}
            onPress={() => onOpen(s)}
            disabled={detailLoading}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
                {s.dayLabel}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmtDate(s.startedAt)}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>⏱ {fmt(s.totalDurationMs ?? 0)}</Text>
            <Pressable
              testID={`hist-del-${s.id}`}
              onPress={() => confirmDelete(s)}
              hitSlop={8}
              style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}
            >
              <Text style={{ fontSize: 16 }}>🗑</Text>
            </Pressable>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
