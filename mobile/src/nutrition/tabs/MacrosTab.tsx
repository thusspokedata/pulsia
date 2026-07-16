import { View, Text } from "react-native";
import { macroSplit, type MacroSlice } from "@pulsia/shared";
import type { GoalView } from "../goalView";
import type { NutritionDaySummary } from "../daySummary";
import { PieChart } from "../../components/PieChart";
import { colors, spacing } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState } from "./ui";

const MACRO_COLORS: Record<MacroSlice["key"], string> = {
  protein: colors.accent,
  carbs: colors.success,
  fat: colors.warning,
};

interface Props {
  summary: NutritionDaySummary;
  goalView: GoalView | null;
}

export function MacrosTab({ summary, goalView }: Props) {
  const { dayTotals } = summary;
  // La meta de macros sale de goalView, que ya la trae en gramos por macro.
  const meta =
    goalView?.status === "ok"
      ? {
          protein_g: goalView.macros!.find((m) => m.key === "protein")!.meta,
          carbs_g: goalView.macros!.find((m) => m.key === "carbs")!.meta,
          fat_g: goalView.macros!.find((m) => m.key === "fat")!.meta,
        }
      : null;
  const slices = macroSplit(dayTotals, meta);
  const totalKcal = slices.reduce((a, s) => a + s.kcal, 0);

  if (totalKcal <= 0) {
    return (
      <Card>
        <SectionTitle>Reparto de macros</SectionTitle>
        <EmptyState>Todavía no registraste comidas este día.</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Reparto de macros</SectionTitle>
      <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <PieChart
          data={slices.map((s) => ({ label: s.label, value: s.kcal, color: MACRO_COLORS[s.key] }))}
          size={180}
          innerRadius={58}
          center={
            <View style={{ alignItems: "center" }}>
              <Text testID="macros-center-kcal" style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
                {totalKcal}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>kcal de macros</Text>
            </View>
          }
        />
      </View>
      {slices.map((s) => (
        <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: MACRO_COLORS[s.key] }} />
          <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{s.label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {s.g} g · {s.pctActual}%
            {s.pctTarget != null ? ` · meta ${s.pctTarget}%` : ""}
          </Text>
        </View>
      ))}
    </Card>
  );
}
