import { View } from "react-native";
import { caloriesByMeal, type MealSliceKey } from "@pulsia/shared";
import type { Meal } from "@pulsia/shared";
import { PieChart } from "../../components/PieChart";
import { colors, spacing } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState, LegendRow } from "./ui";

// Paleta de la torta, desde los tokens. Este mismo mapa alimenta los arcos Y la leyenda, así el
// color de la porción y el de su etiqueta no se pueden desincronizar.
const MEAL_COLORS: Record<MealSliceKey, string> = {
  desayuno: colors.accent,
  almuerzo: colors.success,
  cena: colors.warning,
  snack: colors.accentText,
  sin_tipo: colors.icon,
};

export function CaloriasTab({ meals }: { meals: Meal[] }) {
  const slices = caloriesByMeal(meals);

  if (slices.length === 0) {
    return (
      <Card>
        <SectionTitle>Calorías por comida</SectionTitle>
        <EmptyState>Todavía no registraste comidas este día.</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Calorías por comida</SectionTitle>
      <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <PieChart data={slices.map((s) => ({ label: s.label, value: s.kcal, color: MEAL_COLORS[s.key] }))} size={180} />
      </View>
      {slices.map((s) => (
        <LegendRow key={s.key} color={MEAL_COLORS[s.key]} label={s.label}>
          {s.kcal} kcal · {s.pct}%
        </LegendRow>
      ))}
    </Card>
  );
}
