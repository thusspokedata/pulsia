import { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { Food } from "@pulsia/shared";
import { getFood, getUsdaEntry, type UsdaEntry } from "../../src/api/nutrition";
import { getBackendUrl } from "../../src/storage/config";
import { buildNutrientRows, filaDeSal, sustituirSodioPorSal } from "../../src/nutrition/nutrientRows";
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
  const [entradaUsda, setEntradaUsda] = useState<UsdaEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const url = await getBackendUrl();
      const f = await getFood(url, id);
      setFood(f); setError(null);
      // La descripción de la entrada de USDA NO viaja con el alimento (el alimento guarda solo el
      // `usdaFdcId`): se resuelve aparte. Va en su propio catch porque es un adorno: si el backend
      // no la resuelve, la pantalla muestra el alimento entero y cae al número, en vez de
      // convertir un dato de contexto en un error de carga.
      setEntradaUsda(f.usdaFdcId == null ? null : await getUsdaEntry(url, f.usdaFdcId).catch(() => null));
    } catch (e) { setError((e as Error).message); }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // `persona` en null = modo catálogo. Un alimento del catálogo son valores POR 100 g: compararlos
  // contra una referencia DIARIA diría "el 30 % de tu hierro del día" de algo que nadie come en
  // porciones de 100 g necesariamente. La referencia personal aparece en el detalle de la comida,
  // donde sí hay una cantidad real.
  // La fila del sodio se muestra como SAL, la misma unidad que la comida, el día, el campo del
  // alta y el semáforo del catálogo (ver filaDeSal). Sin referencia: por 100 g no hay ninguna.
  const secciones = food
    ? sustituirSodioPorSal(buildNutrientRows(food, null), filaDeSal(food.sodium_mg ?? null, null))
    : [];

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
            {/* De qué fila de USDA salieron las vitaminas y minerales. Se muestra la DESCRIPCIÓN
                de esa fila (en inglés, tal como la publica USDA) y no el nombre del alimento
                propio: el punto es que el usuario pueda desconfiar del match ("le puse 'lentejas'
                pero USDA matcheó 'Lentils, sprouted, raw'"). Con el nombre propio el chequeo sería
                imposible, y con el fdcId crudo, ilegible. Si no se pudo resolver, queda el número:
                es feo pero verificable. */}
            {food.usdaFdcId != null && (
              <Text testID="alimento-usda" style={{ color: colors.icon, fontSize: 12 }}>
                {entradaUsda != null
                  ? `Vitaminas y minerales de «${entradaUsda.description}» (USDA)`
                  : `Vitaminas y minerales de la entrada ${food.usdaFdcId} de USDA`}
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
