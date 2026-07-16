import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { remainingLabel } from "../goalView";
import type { GoalView } from "../goalView";
import type { NutritionDaySummary } from "../daySummary";
import { colors } from "../../theme/tokens";
import { Card, SectionTitle, Bar } from "./ui";

interface Props {
  summary: NutritionDaySummary;
  goalView: GoalView | null;
}

export function ResumenTab({ summary, goalView }: Props) {
  const { dayTotals, liquid } = summary;
  return (
    <>
      <Card>
        <SectionTitle>Calorías</SectionTitle>
        {goalView?.status === "ok" ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>
                {goalView.kcal!.comido} <Text style={{ fontSize: 15, color: colors.textMuted }}>/ {goalView.kcal!.meta}</Text>
              </Text>
              <Text style={{ color: goalView.kcal!.over ? colors.warning : colors.textMuted, fontSize: 13 }}>
                {goalView.kcal!.over ? `${-goalView.kcal!.restante} de más` : `te quedan ${goalView.kcal!.restante}`}
              </Text>
            </View>
            {/* La barra mide contra el presupuesto real del día (meta + ejercicio), igual que el restante. */}
            <Bar
              pct={Math.min(100, Math.round((goalView.kcal!.comido / (goalView.kcal!.meta + goalView.kcal!.exercise)) * 100))}
              over={goalView.kcal!.over}
            />
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
      </Card>

      {goalView?.status === "ok" && (
        <Card>
          <SectionTitle>Macros</SectionTitle>
          {goalView.macros!.map((m) => (
            <View key={m.key} style={{ gap: 4, marginTop: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{m.label}</Text>
                <Text style={{ color: m.over ? colors.warning : colors.textMuted, fontSize: 13 }}>
                  {m.comido} / {m.meta} g · {remainingLabel(m.restante)}
                </Text>
              </View>
              <Bar pct={m.pct} over={m.over} />
            </View>
          ))}
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ color: colors.text, fontSize: 14 }}>Líquido</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{liquid.total} ml</Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          tomada {Math.round(liquid.drank)} · aporte de alimentos {Math.round(liquid.fromFood)}
        </Text>
      </Card>
    </>
  );
}
