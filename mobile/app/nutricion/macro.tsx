import { useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { foodsByMacro, macroValueOf, expandRecipe, recipeSubRows, type MacroRankKey } from "@pulsia/shared";
import { useMealsRange } from "../../src/nutrition/useMealsRange";
import { useFoodCatalog } from "../../src/nutrition/useFoodCatalog";
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
  const catalog = useFoodCatalog();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const ranked = foodsByMacro(meals, field);
  // El aporte se redondea a 1 decimal, así que un alimento con trazas sale con amount 0; el guard
  // evita 0/0 → width "NaN%" en la barra del que más aporta (mismo criterio que nutriente.tsx).
  const maxAmount = ranked[0]?.amount || 1;

  // Devuelve las sub-filas de una receta expandible, o null si la fila no es expandible.
  const expansionFor = (foodId: string | null, rowAmount: number) => {
    if (foodId == null) return null;
    const food = catalog.get(foodId);
    if (!food?.recipe) return null;
    const { contributions, complete } = expandRecipe(
      food.recipe.items,
      (id) => catalog.get(id) ?? null,
      macroValueOf(field),
    );
    if (!complete || contributions.length === 0) return null;
    // Reparte la porción de la fila entre los ingredientes por fracción, conservando el total
    // (el residuo del redondeo va a la fila de mayor aporte). Devuelve [] si Σ<=0.
    const rows = recipeSubRows(contributions, rowAmount);
    return rows.length > 0 ? rows : null;
  };

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
          {ranked.map((f) => {
            const sub = expansionFor(f.foodId, f.amount);
            const isOpen = f.foodId != null && open.has(f.foodId);
            return (
              <View key={f.name} style={{ gap: 4, marginTop: spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                    {sub && (
                      <Pressable
                        testID={`macro-expand-${f.name}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver ingredientes de ${f.name}`}
                        accessibilityState={{ expanded: isOpen }}
                        onPress={() =>
                          setOpen((prev) => {
                            const next = new Set(prev);
                            if (f.foodId != null) (next.has(f.foodId) ? next.delete(f.foodId) : next.add(f.foodId));
                            return next;
                          })
                        }
                        hitSlop={8}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{isOpen ? "▾" : "▸"}</Text>
                      </Pressable>
                    )}
                    <Text style={{ color: colors.text, fontSize: 14, flexShrink: 1 }}>{f.name}</Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {f.amount} g · {f.pctOfTotal}%
                  </Text>
                </View>
                <Bar value={f.amount} target={maxAmount} testID={`macro-rank-${f.name}-bar`} />
                <Text style={{ color: colors.icon, fontSize: 11 }}>{f.grams} g comidos</Text>
                {sub && isOpen && (
                  <View style={{ marginLeft: spacing.lg, marginTop: 2, gap: 2 }}>
                    {sub.map((s, i) => (
                      <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{s.name}</Text>
                        <Text style={{ color: colors.icon, fontSize: 12 }}>{s.amount} g · {s.pct}%</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
