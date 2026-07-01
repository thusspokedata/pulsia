import { useCallback, useRef, useState } from "react";
import { View, Text } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { getStoredProgram } from "../../src/storage/program";
import type { Program } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

export default function ProgramaScreen() {
  const [program, setProgram] = useState<Program | null>(null);
  const lastLoaded = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getStoredProgram().then((p) => {
        if (!active) return;
        const serialized = p ? JSON.stringify(p) : null;
        if (serialized === lastLoaded.current) return;
        lastLoaded.current = serialized;
        setProgram(p);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  if (!program) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md }}>
        <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Programa</Text>
        <Text style={{ color: colors.textMuted }}>Todavía no hay un programa. Configurá el backend y generá uno desde Perfil.</Text>
        <Link href="/configuracion" style={{ color: colors.accent }}><Text>Ir a configuración</Text></Link>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>{program.name}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
          <Text style={{ color: colors.accentText }}>{program.weeks.length} semanas</Text>
        </View>
        <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
          <Text style={{ color: colors.accentText }}>{program.weeks[0]?.workouts.length ?? 0} días/semana</Text>
        </View>
      </View>
      <Text style={{ color: colors.textMuted }}>El viewer completo (días, ejercicios, gym/casa) llega en la próxima fase.</Text>
    </View>
  );
}
