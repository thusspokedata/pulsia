import { ScrollView, Text } from "react-native";
import ObjectiveEditor from "../src/components/ObjectiveEditor";
import { colors, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

export default function ObjetivoTrabajoScreen() {
  const screenPad = useScreenPadding(spacing.xl);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.lg }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Objetivo de trabajo</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>El norte contra el que se justifica todo el plan. Editalo cuando quieras.</Text>
      <ObjectiveEditor />
    </ScrollView>
  );
}
