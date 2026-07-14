import { ScrollView, View, Text, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useNutritionDay } from "../../src/nutrition/useNutritionDay";
import { remainingLabel } from "../../src/nutrition/goalView";
import { colors, radius, spacing } from "../../src/theme/tokens";

export default function DetalleDiaScreen() {
  const { offset: offsetParam } = useLocalSearchParams<{ offset?: string }>();
  const offset = Number(offsetParam ?? 0) || 0;
  const { error, summary, goalView } = useNutritionDay(offset);
  const { dayTotals, cholesterolMg, liquid } = summary;

  const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm } as const;
  const sectionTitle = { color: colors.textMuted, fontSize: 13 } as const;

  const bar = (pct: number, over: boolean) => (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
      <View style={{ width: over ? "100%" : `${pct}%`, height: 8, backgroundColor: over ? colors.warning : colors.accent }} />
    </View>
  );

  const nutrRows = [
    ["Azúcares", dayTotals.sugars_g],
    ["Fibra", dayTotals.fiber_g],
    ["Grasas saturadas", dayTotals.saturated_fat_g],
    ["Sal", dayTotals.salt_g],
  ].filter(([, v]) => v != null) as [string, number][];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Detalle del día</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
        Comido = lo registrado · Meta = tu objetivo · Restante = Meta − Comido + Ejercicio. El gasto del ejercicio se estima desde tus sesiones (FC o duración).
      </Text>

      {/* Calorías */}
      <View style={card}>
        <Text style={sectionTitle}>Calorías</Text>
        {goalView?.status === "ok" ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>{goalView.kcal!.comido} <Text style={{ fontSize: 15, color: colors.textMuted }}>/ {goalView.kcal!.meta}</Text></Text>
              <Text style={{ color: goalView.kcal!.over ? colors.warning : colors.textMuted, fontSize: 13 }}>
                {goalView.kcal!.over ? `${-goalView.kcal!.restante} de más` : `te quedan ${goalView.kcal!.restante}`}
              </Text>
            </View>
            {bar(Math.min(100, Math.round((goalView.kcal!.comido / goalView.kcal!.meta) * 100)), goalView.kcal!.over)}
            {goalView.kcal!.exercise > 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Ejercicio +{goalView.kcal!.exercise} kcal (ya sumado al restante)
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>{dayTotals.kcal} kcal</Text>
            <Pressable onPress={() => router.push("/nutricion/objetivo")}>
              <Text style={{ color: colors.accentText, fontSize: 13 }}>Definí tu objetivo / completá tu perfil para ver tu meta →</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Macros */}
      {goalView?.status === "ok" && (
        <View style={card}>
          <Text style={sectionTitle}>Macros</Text>
          {goalView.macros!.map((m) => (
            <View key={m.key} style={{ gap: 4, marginTop: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{m.label}</Text>
                <Text style={{ color: m.over ? colors.warning : colors.textMuted, fontSize: 13 }}>{m.comido} / {m.meta} g · {remainingLabel(m.restante)}</Text>
              </View>
              {bar(m.pct, m.over)}
            </View>
          ))}
        </View>
      )}

      {/* Otros nutrientes */}
      {nutrRows.length > 0 && (
        <View style={card}>
          <Text style={sectionTitle}>Otros nutrientes</Text>
          {nutrRows.map(([label, v]) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>{v} g</Text>
            </View>
          ))}
        </View>
      )}

      {/* Colesterol */}
      {cholesterolMg != null && (
        <View style={card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ color: colors.text, fontSize: 14 }}>Colesterol</Text>
            <Text style={{ color: cholesterolMg > 300 ? colors.warning : colors.textMuted, fontSize: 13 }}>{Math.round(cholesterolMg)} / 300 mg</Text>
          </View>
          {bar(Math.min(100, Math.round((cholesterolMg / 300) * 100)), cholesterolMg > 300)}
        </View>
      )}

      {/* Líquido */}
      <View style={card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ color: colors.text, fontSize: 14 }}>Líquido</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{liquid.total} ml</Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>tomada {Math.round(liquid.drank)} · aporte de alimentos {Math.round(liquid.fromFood)}</Text>
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  );
}
