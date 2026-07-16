import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useNutritionDay } from "../../src/nutrition/useNutritionDay";
import { ResumenTab } from "../../src/nutrition/tabs/ResumenTab";
import { CaloriasTab } from "../../src/nutrition/tabs/CaloriasTab";
import { NutrientesTab } from "../../src/nutrition/tabs/NutrientesTab";
import { SegmentToggle } from "../../src/components/SegmentToggle";
import { colors, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

type TabKey = "resumen" | "calorias" | "nutrientes";

const TABS: { value: TabKey; label: string }[] = [
  { value: "resumen", label: "Resumen" },
  { value: "calorias", label: "Calorías" },
  { value: "nutrientes", label: "Nutrientes" },
];

export default function DetalleDiaScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { offset: offsetParam } = useLocalSearchParams<{ offset?: string }>();
  const offset = Number(offsetParam ?? 0) || 0;
  const { error, meals, summary, goalView } = useNutritionDay(offset);
  const [tab, setTab] = useState<TabKey>("resumen");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Detalle del día</Text>
      <SegmentToggle options={TABS} value={tab} onChange={(v) => setTab(v as TabKey)} />

      {tab === "resumen" && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
            Comido = lo registrado · Meta = tu objetivo · Restante = Meta − Comido + Ejercicio. El gasto del ejercicio se
            estima desde tus sesiones (FC o duración).
          </Text>
          <ResumenTab summary={summary} goalView={goalView} />
        </>
      )}
      {tab === "calorias" && <CaloriasTab meals={meals} />}
      {tab === "nutrientes" && <NutrientesTab summary={summary} goalView={goalView} />}

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  );
}
