import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import type { WorkoutSession } from "@pulsia/shared";
import { getSessions } from "../../src/api/sessions";
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
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [selected, setSelected] = useState<WorkoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLoaded = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const url = await getBackendUrl();
        if (!active) return;
        if (!url) {
          if (lastLoaded.current !== "no-url") {
            lastLoaded.current = "no-url";
            setError("Configurá el backend");
            setSessions([]);
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
          setSessions(sorted);
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
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Historial</Text>
      {error ? (
        <Text style={{ color: colors.textMuted }}>{error}</Text>
      ) : loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : sessions.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>Todavía no hay entrenamientos</Text>
      ) : (
        sessions.map((s) => {
          const sum = summarize(s);
          return (
            <Pressable
              key={s.id}
              testID={`hist-item-${s.id}`}
              onPress={() => setSelected(s)}
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
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{sum.completionPct}%</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmt(sum.durationMs)}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
