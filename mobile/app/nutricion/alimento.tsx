import { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { Food } from "@pulsia/shared";
import { getFood } from "../../src/api/nutrition";
import { getBackendUrl } from "../../src/storage/config";
import { buildNutrientRows } from "../../src/nutrition/nutrientRows";
import { NutrientList } from "../../src/nutrition/NutrientList";
import { SourceChip } from "../../src/nutrition/SourceChip";
import { Card, SectionTitle } from "../../src/nutrition/tabs/ui";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

const baseLabel = (food: Food) => (food.basis === "per_100ml" ? "100 ml" : "100 g");

export default function AlimentoDetalleScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [food, setFood] = useState<Food | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const url = await getBackendUrl();
      setFood(await getFood(url, id)); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // `persona` en null = modo catálogo. Un alimento del catálogo son valores POR 100 g: compararlos
  // contra una referencia DIARIA diría "el 30 % de tu hierro del día" de algo que nadie come en
  // porciones de 100 g necesariamente. La referencia personal aparece en el detalle de la comida,
  // donde sí hay una cantidad real.
  const secciones = food ? buildNutrientRows(food, null) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!food && !error && <ActivityIndicator color={colors.accent} />}

      {food && (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, flex: 1 }}>{food.name}</Text>
            <Pressable
              onPress={() => router.push(`/nutricion/agregar-alimento?foodId=${food.id}`)}
              style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
            >
              <Text style={{ color: colors.accentText, fontWeight: "600" }}>Editar</Text>
            </Pressable>
          </View>
          <SourceChip sourceMacros={food.sourceMacros} sourceMicros={food.sourceMicros} />

          <Card>
            <Text testID="alimento-base" style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
              {`Valores por ${baseLabel(food)}`}
            </Text>
            <Text testID="alimento-macros" style={{ color: colors.textMuted, fontSize: 13 }}>
              {`${food.kcal} kcal · P${food.protein_g} C${food.carbs_g} G${food.fat_g}`}
            </Text>
            {food.unitWeightG != null && (
              <Text style={{ color: colors.icon, fontSize: 12 }}>
                {`1 unidad ≈ ${food.unitWeightG} ${food.basis === "per_100ml" ? "ml" : "g"}`}
              </Text>
            )}
            {/* De qué fila de USDA salieron las vitaminas y minerales. Se muestra el fdcId y no un
                nombre porque el alimento guarda SOLO el id (`usda_fdc_id`): la descripción de esa
                fila vive en la tabla `usda_food` del backend y no viaja en `GET /nutrition/foods/:id`.
                Escribir acá el nombre del alimento propio sería afirmar que USDA matcheó eso, que
                es justo lo que el usuario tiene que poder desconfiar. */}
            {food.usdaFdcId != null && (
              <Text testID="alimento-usda" style={{ color: colors.icon, fontSize: 12 }}>
                {`Vitaminas y minerales de la entrada ${food.usdaFdcId} de USDA`}
              </Text>
            )}
          </Card>

          <Card>
            <SectionTitle>{`Nutrientes por ${baseLabel(food)}`}</SectionTitle>
            <NutrientList sections={secciones} />
          </Card>

          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
