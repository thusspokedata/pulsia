import { View, Text } from "react-native";
import { colors, spacing } from "../../src/theme/tokens";

export default function PerfilScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Perfil</Text>
    </View>
  );
}
