import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { router } from "expo-router";
import type { MuscleGroup } from "@pulsia/shared";
import { getBackendUrl } from "../src/storage/config";
import { getProfile } from "../src/storage/profile";
import { setStoredOneOffProgram, setStoredOneOffProgramId } from "../src/storage/oneOffProgram";
import { generateOneOff } from "../src/api/programs";
import { colors, radius, spacing } from "../src/theme/tokens";

const FOCUS_OPTIONS: { value: MuscleGroup; label: string }[] = [
  { value: "chest", label: "Pecho" },
  { value: "back", label: "Espalda" },
  { value: "shoulders", label: "Hombros" },
  { value: "biceps", label: "Bíceps" },
  { value: "triceps", label: "Tríceps" },
  { value: "quads", label: "Cuádriceps" },
  { value: "hamstrings", label: "Isquios" },
  { value: "glutes", label: "Glúteos" },
  { value: "abs", label: "Abdominales" },
];

const LOCATION_OPTIONS: { value: "gym" | "home"; label: string }[] = [
  { value: "gym", label: "Gimnasio" },
  { value: "home", label: "Casa" },
];

export default function EntrenoPuntualScreen() {
  const [focus, setFocus] = useState<MuscleGroup | null>(null);
  const [location, setLocation] = useState<"gym" | "home">("gym");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!focus) return;
    setLoading(true);
    setError(null);
    try {
      const url = await getBackendUrl();
      const profile = await getProfile();
      if (!url || !profile) {
        setError("Configurá backend y perfil primero");
        setLoading(false);
        return;
      }
      const { id, program } = await generateOneOff(url, { profile, location, focus });
      await setStoredOneOffProgram(program);
      await setStoredOneOffProgramId(id);
      const wk = program.weeks[0].workouts[0];
      router.push({
        pathname: "/sesion",
        params: { week: "1", dayLabel: wk.dayLabel, location, oneOff: "true" },
      });
    } catch {
      setError("No se pudo generar el entreno");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ fontSize: 16, color: colors.text }}>Generando…</Text>
        <Text style={{ color: colors.textMuted, textAlign: "center" }}>Esto puede tardar hasta un par de minutos.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg }}>
      <Text style={{ fontSize: 18, fontWeight: "500", color: colors.text }}>Entreno puntual</Text>
      <Text style={{ color: colors.textMuted }}>Elegí qué músculo querés entrenar y dónde.</Text>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Músculo</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {FOCUS_OPTIONS.map((o) => {
            const isOn = focus === o.value;
            return (
              <Pressable
                key={o.value}
                testID={`focus-${o.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isOn }}
                onPress={() => setFocus(o.value)}
                style={{
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: isOn ? colors.accent : colors.border,
                  backgroundColor: isOn ? colors.accent : colors.bg,
                }}
              >
                <Text style={{ color: isOn ? "#fff" : colors.text, fontSize: 13 }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Lugar</Text>
        <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, overflow: "hidden" }}>
          {LOCATION_OPTIONS.map((o) => {
            const on = o.value === location;
            return (
              <Pressable
                key={o.value}
                testID={`loc-${o.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setLocation(o.value)}
                style={{ flex: 1, paddingVertical: spacing.sm, alignItems: "center", backgroundColor: on ? colors.accent : colors.bg }}
              >
                <Text style={{ color: on ? "#fff" : colors.textMuted, fontSize: 13 }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        testID="generar-puntual"
        disabled={!focus || loading}
        onPress={onGenerate}
        style={{
          backgroundColor: !focus || loading ? colors.border : colors.accent,
          borderRadius: radius.sm,
          padding: spacing.md,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff" }}>Generar entreno</Text>
      </Pressable>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  );
}
