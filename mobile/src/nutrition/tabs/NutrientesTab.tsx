import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { NUTRIENT_REFERENCES, NUTRIENT_REFERENCE_KIND, saturatedFatRefG } from "@pulsia/shared";
import type { GoalView } from "../goalView";
import type { NutritionDaySummary } from "../daySummary";
import { colors } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState, Bar } from "./ui";

interface Props {
  summary: NutritionDaySummary;
  goalView: GoalView | null;
  offset: number;
}

type RowKey = keyof typeof NUTRIENT_REFERENCE_KIND;

interface NutrRow {
  key: RowKey;
  label: string;
  value: number | null;
  ref: number | null; // null = sin referencia que mostrar (saturadas sin meta de kcal)
  unit: string;
}

export function NutrientesTab({ summary, goalView, offset }: Props) {
  const { dayTotals, cholesterolMg } = summary;
  const goalKcal = goalView?.status === "ok" ? goalView.kcal!.meta : null;

  const rows: NutrRow[] = [
    { key: "sugars_g", label: "Azúcares", value: dayTotals.sugars_g, ref: NUTRIENT_REFERENCES.sugars_g, unit: "g" },
    { key: "fiber_g", label: "Fibra", value: dayTotals.fiber_g, ref: NUTRIENT_REFERENCES.fiber_g, unit: "g" },
    {
      key: "saturated_fat_g",
      label: "Grasas saturadas",
      value: dayTotals.saturated_fat_g,
      // La OMS acota las saturadas al 10% de la ENERGÍA, así que sin meta de kcal no hay referencia.
      ref: goalKcal != null ? saturatedFatRefG(goalKcal) : null,
      unit: "g",
    },
    { key: "salt_g", label: "Sal", value: dayTotals.salt_g, ref: NUTRIENT_REFERENCES.salt_g, unit: "g" },
    { key: "cholesterol_mg", label: "Colesterol", value: cholesterolMg, ref: NUTRIENT_REFERENCES.cholesterol_mg, unit: "mg" },
  ];

  if (rows.every((r) => r.value == null)) {
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
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
        La referencia es pública (OMS), no una meta calculada para vos. La fibra es un piso a alcanzar; el resto, límites a
        no pasar. Tocá un nutriente para ver qué alimentos lo aportan.
      </Text>
      {rows.map((r) => {
        // `over` solo aplica a los límites: pasarse del piso de fibra es BUENO, no se avisa.
        const over = r.value != null && r.ref != null && NUTRIENT_REFERENCE_KIND[r.key] === "max" && r.value > r.ref;
        const pct = r.value != null && r.ref != null && r.ref > 0 ? Math.min(100, Math.round((r.value / r.ref) * 100)) : 0;
        return (
          <Pressable
            key={r.key}
            testID={`nutr-${r.key}-row`}
            // Sin dato no hay nada que desglosar: la fila se ve pero no navega a una lista vacía.
            disabled={r.value == null}
            onPress={() => router.push(`/nutricion/nutriente?key=${r.key}&offset=${offset}`)}
            style={{ gap: 4, marginTop: 4 }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{r.label}</Text>
              <Text style={{ color: over ? colors.warning : colors.textMuted, fontSize: 13 }}>
                {r.value == null ? "—" : r.ref == null ? `${Math.round(r.value)} ${r.unit}` : `${Math.round(r.value)} / ${r.ref} ${r.unit}`}
              </Text>
            </View>
            {r.value != null && r.ref != null && <Bar pct={pct} over={over} testID={`nutr-${r.key}-bar`} />}
          </Pressable>
        );
      })}
    </Card>
  );
}
