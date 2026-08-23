import { ScrollView, View, Text, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { fatBreakdown, FAT_BAR_ORDER, NUTRIENTS, type FatType, type FatBar, type FatGrams } from "@pulsia/shared";
import { useNutritionDay } from "../../src/nutrition/useNutritionDay";
import { Card, SectionTitle, EmptyState, FatSplitBar, barSegments } from "../../src/nutrition/tabs/ui";
import { colors, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

// Verdes las "buenas" (mono/omega3/omega6, entran en el reparto sano de grasas) y ámbar las de
// "comer menos" (saturada/trans) — mismo criterio de color que el semáforo nutricional. El
// excedente en sí es SIEMPRE rojo (lo pinta FatSplitBar), independientemente de este tono base.
const FAT_TONE: Record<FatType, "good" | "caution"> = {
  monounsaturated_fat_g: "good",
  omega6_g: "good",
  omega3_g: "good",
  saturated_fat_g: "caution",
  trans_fat_g: "caution",
};

function baseColorDe(bar: FatBar): string {
  return FAT_TONE[bar.type] === "good" ? colors.success : colors.warning;
}

// Los gramos ya vienen redondeados a los decimales del nutriente (sumNutrientByKey), pero la suma
// de varios ítems puede dejar un resto de punto flotante (0.1 + 0.2) — este redondeo final es solo
// una red de seguridad para la UI, no cambia el dato.
const FAT_DECIMALS = new Map<FatType, number>(FAT_BAR_ORDER.map((t) => [t, NUTRIENTS.find((n) => n.key === t)?.decimals ?? 1]));
function redondear(n: number, type: FatType): number {
  const f = 10 ** (FAT_DECIMALS.get(type) ?? 1);
  return Math.round(n * f) / f;
}

// fillPct/overPct de cada barra según el tipo de umbral. Los "max" con tope se parten en la línea
// del umbral (igual que el resto de la app); los "recommended" con referencia (mono) nunca
// muestran excedente aunque se pasen; y sin umbral (omega3, o sin meta de kcal) se compara contra
// el que más aporta ESE día, para que la barra siga teniendo sentido visual.
function segmentsDe(bar: FatBar, maxGrams: number): { fillPct: number; overPct: number } {
  if (bar.kind === "max" && bar.thresholdG != null) return barSegments(bar.grams, bar.thresholdG, "limit");
  if (bar.kind === "recommended" && bar.thresholdG != null) return barSegments(bar.grams, bar.thresholdG, "floor");
  const fillPct = maxGrams > 0 ? Math.min(100, Math.round((bar.grams / maxGrams) * 100)) : 0;
  return { fillPct, overPct: 0 };
}

// El hint bajo la barra: el mensaje depende del tipo de referencia, no solo de si hay número.
// Omega3 no tiene tope (la AHA no fija %), así que su hint es siempre el mismo texto cualitativo.
function hintDe(bar: FatBar): string | null {
  if (bar.type === "omega3_g") return "cuanto más, mejor";
  if (bar.thresholdG == null) return null; // sin meta de kcal cargada: no hay umbral que mostrar
  return bar.kind === "max" ? `máx ${bar.thresholdG} g` : `recomendado ~${bar.thresholdG} g`;
}

export default function GrasasScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { offset: offsetParam } = useLocalSearchParams<{ offset?: string }>();
  const offset = Number(offsetParam ?? 0) || 0;
  const { summary, goalView } = useNutritionDay(offset);

  const goalKcal = goalView?.status === "ok" ? goalView.kcal!.meta : null;
  // Los gramos por tipo salen del registro del día (summary.nutrients), no de dayTotals: dayTotals
  // solo lleva los macros gruesos + saturada/sal, no mono/poli/omega/trans.
  const fatGrams: FatGrams = Object.fromEntries(
    FAT_BAR_ORDER.map((t) => [t, summary.nutrients[t]?.value ?? null]),
  ) as FatGrams;
  const bars = fatBreakdown(fatGrams, goalKcal);
  const totalGrams = bars.reduce((a, b) => a + b.grams, 0);
  const maxGrams = Math.max(...bars.map((b) => b.grams), 1);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Grasa por tipo</Text>

      {totalGrams <= 0 ? (
        <Card>
          <EmptyState>Todavía no registraste grasa este día.</EmptyState>
        </Card>
      ) : (
        <Card>
          <SectionTitle>Desglose por tipo</SectionTitle>
          {bars.map((bar) => {
            const { fillPct, overPct } = segmentsDe(bar, maxGrams);
            const hint = hintDe(bar);
            return (
              <Pressable
                key={bar.type}
                testID={`fat-row-${bar.type}`}
                onPress={() => router.push(`/nutricion/nutriente?key=${bar.type}&offset=${offset}`)}
                style={{ gap: 4, marginTop: spacing.sm }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{bar.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{redondear(bar.grams, bar.type)} g</Text>
                </View>
                <FatSplitBar fillPct={fillPct} overPct={overPct} baseColor={baseColorDe(bar)} testID={`fat-bar-${bar.type}`} />
                {(hint || bar.exceeded) && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    {hint && <Text style={{ color: colors.icon, fontSize: 11 }}>{hint}</Text>}
                    {bar.exceeded && (
                      <Text style={{ color: colors.danger, fontSize: 11 }}>te pasaste {redondear(bar.overG, bar.type)} g</Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </Card>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        Tocá un tipo de grasa para ver qué alimentos lo aportan.
      </Text>

      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
