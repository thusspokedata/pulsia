import { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { NUTRIENT_REFERENCES } from "@pulsia/shared";
import type { Meal, MealItem } from "@pulsia/shared";
import { getMeal } from "../../src/api/nutrition";
import { getBackendUrl } from "../../src/storage/config";
import { loadDailyGoalContext, type DailyGoalContext } from "../../src/nutrition/dailyGoal";
import { buildGoalView, macroTargetLabel } from "../../src/nutrition/goalView";
import {
  buildNutrientRows,
  filaDeAzucar,
  filaDeSal,
  separarValoresYParciales,
  sustituirAzucar,
  sustituirSodioPorSal,
} from "../../src/nutrition/nutrientRows";
import { sumarAzucarLibreDeItems, sumarNutrientesDeItems } from "../../src/nutrition/daySummary";
import { referenciasOms } from "../../src/nutrition/dayNutrientRows";
import { NutrientList } from "../../src/nutrition/NutrientList";
import { Card, SectionTitle, Bar } from "../../src/nutrition/tabs/ui";
import { hhmm } from "../../src/session/metricDate";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

const UNIT_LABEL: Record<MealItem["quantityUnit"], string> = { g: "g", ml: "ml", unit: "u" };

function titulo(meal: Meal): string {
  const tipo = meal.mealType ? meal.mealType[0].toUpperCase() + meal.mealType.slice(1) : "Comida";
  return `${tipo} · ${hhmm(meal.eatenAt)}`;
}

function Ingrediente({ item, index }: { item: MealItem; index: number }) {
  // La cantidad se muestra como la cargó el usuario ("2 u"), con los gramos al lado sólo cuando no
  // coinciden: repetir "150 g (150 g)" es ruido, pero "2 u" sin gramos esconde cuánto se comió.
  const cantidad = `${item.quantity} ${UNIT_LABEL[item.quantityUnit]}`;
  const gramos = item.quantityUnit === "unit" ? ` (${item.grams} g)` : "";
  return (
    <View style={{ gap: 2, marginTop: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{item.foodName}</Text>
        <Text testID={`ingrediente-${index}-cantidad`} style={{ color: colors.textMuted, fontSize: 13 }}>
          {`${cantidad}${gramos}`}
        </Text>
      </View>
      <Text testID={`ingrediente-${index}-macros`} style={{ color: colors.icon, fontSize: 12 }}>
        {`${item.kcal} kcal · P${item.protein_g} C${item.carbs_g} G${item.fat_g}`}
      </Text>
    </View>
  );
}

export default function ComidaDetalleScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [meal, setMeal] = useState<Meal | null>(null);
  const [goalCtx, setGoalCtx] = useState<DailyGoalContext>({ profile: null, goalResult: null, goalInput: null });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const url = await getBackendUrl();
      // La comida se pide puntual (`GET /nutrition/meals/:id`) en vez de reusar `useNutritionDay`:
      // desde acá sólo se conoce el id, y para llegar al día habría que saber el offset — que
      // depende del `eatenAt` de la comida que justamente todavía no se cargó.
      const [m, ctx] = await Promise.all([getMeal(url, id), loadDailyGoalContext(url)]);
      setMeal(m); setGoalCtx(ctx); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const { profile, goalResult } = goalCtx;
  const items = meal?.items ?? [];
  // El aporte de ESTA comida contra la meta del día. `exercise` va en 0 a propósito: el bonus por
  // ejercicio es del día entero y repartirlo entre las comidas no significa nada; acá la referencia
  // es la meta base.
  const goalView = goalResult
    ? buildGoalView(goalResult, {
        kcal: items.reduce((a, it) => a + it.kcal, 0),
        protein_g: items.reduce((a, it) => a + it.protein_g, 0),
        carbs_g: items.reduce((a, it) => a + it.carbs_g, 0),
        fat_g: items.reduce((a, it) => a + it.fat_g, 0),
      }, 0)
    : null;

  // Sin sexo ni edad las referencias EFSA caen al fallback conservador (el valor más alto de los
  // dos sexos). Es correcto, pero el usuario merece saber que está mirando un valor genérico.
  const perfilIncompleto = profile == null || profile.sex == null || profile.age == null;
  // La MISMA suma que el total del día (ver daySummary.ts), sobre los ítems de esta comida: respeta
  // los decimales de cada nutriente, devuelve `null` cuando NINGÚN ítem tenía dato (que es lo que
  // hace que la fila diga "sin dato" en vez de "0") y marca `partial` cuando algunos ítems lo
  // declaraban y otros no. El `partial` se propaga: una comida de lentejas más un alimento cargado
  // a mano sin hierro tiene que decir "≥ 2,5 mg" acá igual que en la pestaña del día.
  const sumas = sumarNutrientesDeItems(items);
  const { values: nutrientes, partial: parciales } = separarValoresYParciales(sumas);
  // La meta de kcal del día: es lo que hace calculable el techo de saturadas (10 % de la energía).
  const goalKcal = goalView?.status === "ok" ? goalView.kcal!.meta : null;
  // El azúcar LIBRE de ESTA comida (mismo helper que el total del día): la fila mide libres, no el
  // total, para no marcar excedente cuando el azúcar es intrínseco (pura fruta entera). Una comida
  // no tiene aporte de suplemento, así que supplementFree va en null.
  const libre = sumarAzucarLibreDeItems(items);
  const conSal = sustituirSodioPorSal(
    buildNutrientRows(nutrientes, { sex: profile?.sex, age: profile?.age }, {
      partial: parciales,
      // Las MISMAS 5 referencias de la OMS que la pestaña del día (azúcares, fibra, colesterol,
      // saturadas y sal). Sin ellas esta pantalla decía "sobre la referencia diaria" y mostraba
      // referencia solo para las vitaminas y la sal: la misma fila con referencia en una pantalla
      // y sin ella en la otra es una incoherencia de cara al usuario, no una decisión.
      refs: {
        ...referenciasOms(goalKcal),
        // El agua va SIN referencia. La AI de EFSA es de agua TOTAL del día (bebida + la que
        // aportan los alimentos, ~2-2,5 L), y la columna `water_ml` de una comida es solo la
        // segunda mitad de una sola comida: compararlas diría "tomaste el 12 % de lo que
        // necesitás" el día que el usuario tomó 2,1 L. La pestaña del día sí puede compararlas
        // porque ahí se usa el líquido total (bebido + de los alimentos); acá no hay equivalente.
        water_ml: null,
      },
    }),
    // La sal es la unidad que habla el resto de la app (ver filaDeSal). La referencia es la
    // diaria de la OMS, igual que el resto de las filas de esta pantalla: el título dice
    // "sobre la referencia diaria" y lo que se lee es cuánto aportó ESTA comida al día.
    // Hereda el `partial` DEL SODIO: es el mismo dato en otra unidad, así que si el sodio de la
    // comida tenía agujeros, la sal también (mismo criterio que dayNutrientRows.ts).
    filaDeSal(sumas.sodium_mg.value, NUTRIENT_REFERENCES.salt_g, sumas.sodium_mg.partial),
  );
  // La fila de `sugars_g` (total) se sustituye por la de azúcares LIBRES, igual que en la pestaña
  // del día: compara contra el límite OMS (50 g) solo la parte que cuenta. El total viaja en `split`
  // para que la UI aclare cuánto era intrínseco (fruta/verdura entera, que no suma).
  const secciones = sustituirAzucar(
    conSal,
    filaDeAzucar(libre.value, sumas.sugars_g.value, NUTRIENT_REFERENCES.sugars_g, libre.partial, null),
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!meal && !error && <ActivityIndicator color={colors.accent} />}

      {meal && (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
            <Text testID="comida-titulo" style={{ fontSize: 20, fontWeight: "700", color: colors.text, flex: 1 }}>
              {titulo(meal)}
            </Text>
            <Pressable
              onPress={() => router.push(`/nutricion/nueva-comida?mealId=${meal.id}`)}
              style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
            >
              <Text style={{ color: colors.accentText, fontWeight: "600" }}>Editar</Text>
            </Pressable>
          </View>
          {meal.note ? <Text style={{ color: colors.textMuted, fontSize: 13, fontStyle: "italic" }}>💬 {meal.note}</Text> : null}

          <Card>
            <SectionTitle>Aporte a los objetivos del día</SectionTitle>
            {goalView?.status === "ok" ? (
              <>
                <View style={{ gap: 4, marginTop: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>Calorías</Text>
                    <Text testID="comida-goal-kcal" style={{ color: colors.textMuted, fontSize: 13 }}>
                      {`${goalView.kcal!.comido} / ${goalView.kcal!.meta} kcal`}
                    </Text>
                  </View>
                  <Bar value={goalView.kcal!.comido} target={goalView.kcal!.meta} />
                </View>
                {goalView.macros!.map((m) => (
                  <View key={m.key} style={{ gap: 4, marginTop: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                      <Text style={{ color: colors.text, fontSize: 14 }}>{m.label}</Text>
                      <Text testID={`comida-goal-${m.key}`} style={{ color: colors.textMuted, fontSize: 13 }}>
                        {`${m.comido} / ${macroTargetLabel(m)}`}
                      </Text>
                    </View>
                    <Bar value={m.comido} target={m.metaTotal} />
                  </View>
                ))}
              </>
            ) : (
              <Pressable onPress={() => router.push("/nutricion/objetivo")}>
                <Text style={{ color: colors.accentText, fontSize: 13 }}>
                  Definí tu objetivo / completá tu perfil para ver cuánto aporta esta comida →
                </Text>
              </Pressable>
            )}
          </Card>

          <Card>
            <SectionTitle>Nutrientes de esta comida, sobre la referencia diaria</SectionTitle>
            {perfilIncompleto && (
              <Pressable testID="comida-aviso-perfil" onPress={() => router.push("/perfil")}>
                <Text style={{ color: colors.accentText, fontSize: 12 }}>
                  Completá tu sexo y edad en el perfil para referencias más precisas →
                </Text>
              </Pressable>
            )}
            <NutrientList sections={secciones} />
          </Card>

          <Card>
            <SectionTitle>Ingredientes</SectionTitle>
            {items.map((it, i) => <Ingrediente key={it.id} item={it} index={i} />)}
          </Card>

          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
