import { View, Text } from "react-native";
import type { NutritionDaySummary } from "../daySummary";
import { colors } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState } from "./ui";

interface Props {
  summary: NutritionDaySummary;
}

export function NutrientesTab({ summary }: Props) {
  const { dayTotals, cholesterolMg } = summary;
  const rows = [
    ["Azúcares", dayTotals.sugars_g, "g"],
    ["Fibra", dayTotals.fiber_g, "g"],
    ["Grasas saturadas", dayTotals.saturated_fat_g, "g"],
    ["Sal", dayTotals.salt_g, "g"],
    ["Colesterol", cholesterolMg, "mg"],
  ] as [string, number | null, string][];

  if (rows.every(([, v]) => v == null)) {
    return (
      <Card>
        <SectionTitle>Nutrientes</SectionTitle>
        <EmptyState>Todavía no hay datos de nutrientes para este día.</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Nutrientes</SectionTitle>
      {rows.map(([label, v, unit]) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>{v == null ? "—" : `${Math.round(v)} ${unit}`}</Text>
        </View>
      ))}
    </Card>
  );
}
