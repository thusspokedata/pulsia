import { useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { foodsHighestIn, type RankNutrient } from "@pulsia/shared";
import { useMealsRange } from "../../src/nutrition/useMealsRange";
import { ChipGroup } from "../../src/components/ChipGroup";
import { Card, SectionTitle, EmptyState, Bar } from "../../src/nutrition/tabs/ui";
import { colors, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

const NUTRIENT_LABEL: Record<RankNutrient, string> = {
  sugars_g: "azúcares",
  fiber_g: "fibra",
  saturated_fat_g: "grasas saturadas",
  salt_g: "sal",
  cholesterol_mg: "colesterol",
};
const NUTRIENT_UNIT: Record<RankNutrient, string> = {
  sugars_g: "g",
  fiber_g: "g",
  saturated_fat_g: "g",
  salt_g: "g",
  cholesterol_mg: "mg",
};

const RANGES = [
  { value: "1", label: "Día" },
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
];

export default function NutrienteScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { key, offset: offsetParam } = useLocalSearchParams<{ key?: string; offset?: string }>();
  const nutrient = (key ?? "cholesterol_mg") as RankNutrient;
  const offset = Number(offsetParam ?? 0) || 0;
  const [days, setDays] = useState(1);
  const { meals, loading, error } = useMealsRange(days, offset);
  const ranked = foodsHighestIn(meals, nutrient);
  const unit = NUTRIENT_UNIT[nutrient];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>
        Alimentos con más {NUTRIENT_LABEL[nutrient]}
      </Text>

      <ChipGroup single options={RANGES} selected={[String(days)]} onChange={(v) => setDays(Number(v[0]))} />

      {loading && <ActivityIndicator color={colors.accent} />}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {!loading && !error && ranked.length === 0 && (
        <Card>
          <EmptyState>Ningún alimento registrado aporta {NUTRIENT_LABEL[nutrient]} en este período.</EmptyState>
        </Card>
      )}

      {!loading && !error && ranked.length > 0 && (
        <Card>
          <SectionTitle>De mayor a menor aporte</SectionTitle>
          {/* La barra mide contra el que MÁS aporta, no contra un total: lo que se compara acá es
              un alimento contra otro ("el huevo pesa el doble que el queso"), no contra una meta. */}
          {ranked.map((f) => (
            <View key={f.name} style={{ gap: 4, marginTop: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{f.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {f.amount} {unit} · {f.pctOfTotal}%
                </Text>
              </View>
              <Bar
                pct={Math.round((f.amount / ranked[0].amount) * 100)}
                over={false}
                testID={`rank-${f.name}-bar`}
              />
              <Text style={{ color: colors.icon, fontSize: 11 }}>{f.grams} g</Text>
            </View>
          ))}
        </Card>
      )}

      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
