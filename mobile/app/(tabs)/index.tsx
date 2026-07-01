import { View, Text } from "react-native";
import { Link } from "expo-router";
import { colors, spacing } from "../../src/theme/tokens";

export default function ProgramaScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Programa</Text>
      <Text style={{ color: colors.textMuted }}>
        Todavía no hay un programa. Configurá el backend para empezar.
      </Text>
      <Link href="/configuracion" style={{ color: colors.accent }}>
        Ir a configuración
      </Link>
    </View>
  );
}
