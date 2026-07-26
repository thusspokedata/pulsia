import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { GoalView } from "../goalView";
import type { NutritionDaySummary } from "../daySummary";
import { buildDayNutrientRows } from "../dayNutrientRows";
import { NutrientList } from "../NutrientList";
import { colors, spacing } from "../../theme/tokens";
import { Card, SectionTitle, EmptyState, LegendRow } from "./ui";

interface Props {
  summary: NutritionDaySummary;
  goalView: GoalView | null;
  // Sexo y edad del perfil: las referencias EFSA dependen de eso (el hierro de una mujer en edad
  // fértil es el doble que el de un varón). Sin ellos se cae al fallback conservador.
  persona: { sex?: string; age?: number };
  offset: number;
}

export function NutrientesTab({ summary, goalView, persona, offset }: Props) {
  // Las saturadas se acotan al 10% de la ENERGÍA, así que su referencia sale de la meta de kcal.
  const goalKcal = goalView?.status === "ok" ? goalView.kcal!.meta : null;
  const secciones = buildDayNutrientRows(summary, persona, goalKcal);
  // "Hay suplemento" también es dato: un día sin ningún alimento cargado pero con un suplemento
  // tomado no puede caer en el EmptyState, aunque `r.value` (que es SOLO comida) esté en null.
  const hayDatos = secciones.some((s) => s.rows.some((r) => r.value != null || (r.supplement != null && r.supplement > 0)));
  const perfilIncompleto = persona.sex == null || persona.age == null;
  // Solo hay algo que distinguir con un color si algún nutriente trajo aporte de suplemento ese
  // día: sin toma, la barra es de un solo segmento y la leyenda de tres puntitos sobraría.
  const haySuplementos = Object.keys(summary.supplementNutrients).length > 0;

  if (!hayDatos) {
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
        Las referencias son públicas (EFSA según tu sexo y edad para vitaminas y minerales; OMS para azúcares, fibra,
        saturadas, sal y colesterol), no metas calculadas para vos. Las vitaminas, los minerales y la fibra son pisos a
        alcanzar; azúcares, saturadas, sal y colesterol, límites a no pasar. “≥” significa que algún alimento del día no
        declara ese nutriente, así que el total es un piso. Tocá un nutriente para ver qué alimentos lo aportan.
      </Text>
      {perfilIncompleto && (
        <Pressable testID="nutrientes-aviso-perfil" onPress={() => router.push("/perfil")}>
          <Text style={{ color: colors.accentText, fontSize: 12 }}>
            Completá tu sexo y edad en el perfil para referencias más precisas →
          </Text>
        </Pressable>
      )}
      {haySuplementos && (
        <View testID="nutrientes-leyenda" style={{ gap: 0, marginTop: spacing.xs }}>
          <LegendRow color={colors.accent} label="Comida">{""}</LegendRow>
          <LegendRow color={colors.supplement} label="Suplemento">{""}</LegendRow>
          <LegendRow color={colors.warning} label="Excedente">{""}</LegendRow>
        </View>
      )}
      <NutrientList
        sections={secciones}
        onPressRow={(key) => router.push(`/nutricion/nutriente?key=${key}&offset=${offset}`)}
      />
    </Card>
  );
}
