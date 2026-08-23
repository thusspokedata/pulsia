import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { foodsByMacro, type MacroRankKey } from "@pulsia/shared";
import { useMealsRange } from "../../src/nutrition/useMealsRange";
import { Card, SectionTitle, EmptyState, Bar } from "../../src/nutrition/tabs/ui";
import { colors, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

// El macro llega por la URL (la pestaña Macros usa las keys de MacroSlice: protein/carbs/fat), así
// que puede ser cualquier cosa. Este mapa resuelve la etiqueta (una frase, en minúscula) y el
// campo del ítem, y sirve de guard: una key desconocida cae en proteína en vez de reventar.
const MACROS: Record<string, { field: MacroRankKey; label: string }> = {
  protein: { field: "protein_g", label: "proteína" },
  carbs: { field: "carbs_g", label: "carbohidratos" },
  fat: { field: "fat_g", label: "grasa" },
};

export default function MacroScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { macro, offset: offsetParam } = useLocalSearchParams<{ macro?: string; offset?: string }>();
  const { field, label } = MACROS[macro ?? ""] ?? MACROS.protein;
  const offset = Number(offsetParam ?? 0) || 0;
  // Por día, siempre: NUT-13 es el desglose del día (el rango multi-día quedó fuera de alcance).
  const { meals, loading, error } = useMealsRange(1, offset);
  const ranked = foodsByMacro(meals, field);
  // El aporte se redondea a 1 decimal, así que un alimento con trazas sale con amount 0; el guard
  // evita 0/0 → width "NaN%" en la barra del que más aporta (mismo criterio que nutriente.tsx).
  const maxAmount = ranked[0]?.amount || 1;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Alimentos con más {label}</Text>

      {loading && <ActivityIndicator color={colors.accent} />}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {!loading && !error && ranked.length === 0 && (
        <Card>
          <EmptyState>Todavía no registraste comidas con {label} este día.</EmptyState>
        </Card>
      )}

      {!loading && !error && ranked.length > 0 && (
        <Card>
          <SectionTitle>De mayor a menor aporte</SectionTitle>
          {/* La barra mide contra el que MÁS aporta, no contra una meta: se compara un alimento
              contra otro ("el pollo aporta el doble de proteína que el arroz"). */}
          {ranked.map((f) => (
            <View key={f.name} style={{ gap: 4, marginTop: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{f.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {f.amount} g · {f.pctOfTotal}%
                </Text>
              </View>
              <Bar value={f.amount} target={maxAmount} testID={`macro-rank-${f.name}-bar`} />
              <Text style={{ color: colors.icon, fontSize: 11 }}>{f.grams} g comidos</Text>
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
