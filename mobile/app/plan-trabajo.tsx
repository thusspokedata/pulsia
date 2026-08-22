import { useEffect, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { buildGoalRationale, type Program } from "@pulsia/shared";
import { getBackendUrl } from "../src/storage/config";
import { getStoredProgram } from "../src/storage/program";
import { loadDailyGoalContext } from "../src/nutrition/dailyGoal";
import ObjectiveEditor from "../src/components/ObjectiveEditor";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm } as const;
const sectionTitle = { fontSize: 16, fontWeight: "700", color: colors.text } as const;
const bullet = { color: colors.textMuted, fontSize: 13, lineHeight: 19 } as const;

/**
 * Pantalla global "Plan de trabajo": junta en un solo lugar el objetivo (editable), la meta
 * nutricional con su porqué determinista, y el programa actual con su porqué (global + por día,
 * de TODAS las semanas). No inventa cálculos propios: reusa ObjectiveEditor (Fase 1),
 * loadDailyGoalContext + buildGoalRationale (Fase 2) y getStoredProgram (el programa vive en
 * AsyncStorage, no hay endpoint "último programa").
 */
export default function PlanTrabajoScreen() {
  const screenPad = useScreenPadding(spacing.xl);

  // Meta nutricional + su porqué.
  const [goalLines, setGoalLines] = useState<string[] | null>(null);
  const [goalKcal, setGoalKcal] = useState<number | null>(null);
  const [goalLoading, setGoalLoading] = useState(true);

  // Programa actual + su porqué.
  const [program, setProgram] = useState<Program | null>(null);
  const [programLoading, setProgramLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      if (!url) { setGoalLoading(false); }
      else {
        try {
          const ctx = await loadDailyGoalContext(url);
          if (ctx.goalResult?.status === "ok" && ctx.goalInput) {
            setGoalKcal(ctx.goalResult.kcal);
            setGoalLines(buildGoalRationale(ctx.goalResult, {
              sex: ctx.profile?.sex, age: ctx.profile?.age, heightCm: ctx.profile?.heightCm,
              weightKg: ctx.weightKg, activityLevel: ctx.profile?.activityLevel,
              objective: ctx.goalInput.objective, rateKgPerWeek: ctx.goalInput.rateKgPerWeek,
              manualKcal: ctx.goalInput.manualKcal,
            }).lines);
          }
        } catch { /* meta no disponible: la sección se omite */ }
        finally { setGoalLoading(false); }
      }

      try { setProgram(await getStoredProgram()); }
      finally { setProgramLoading(false); }
    })();
  }, []);

  // Rationales del programa: se consideran TODAS las semanas, no solo la primera —
  // de lo contrario un rationale que solo existe en una semana posterior queda oculto
  // y la pantalla puede mostrar erróneamente la nota de "regenerá el plan".
  const weeks = program?.weeks ?? [];
  const hasAnyDayRationale = weeks.some((wk) => wk.workouts.some((w) => !!w.rationale));
  const hasProgramRationale = !!program?.rationale || hasAnyDayRationale;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.xl }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text }}>Plan de trabajo</Text>

      {/* 1. Objetivo de trabajo */}
      <View style={{ gap: spacing.md }}>
        <Text style={sectionTitle}>Objetivo de trabajo</Text>
        <ObjectiveEditor />
      </View>

      {/* 2. Meta nutricional + su porqué */}
      <View style={{ gap: spacing.md }}>
        <Text style={sectionTitle}>Meta nutricional</Text>
        {goalLoading ? (
          <Text style={{ color: colors.textMuted }}>Cargando…</Text>
        ) : goalLines ? (
          <View style={card}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>{goalKcal} kcal / día</Text>
            {goalLines.map((line, i) => (
              <Text key={i} style={bullet}>• {line}</Text>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.textMuted }}>Todavía no hay meta nutricional calculable (completá tu perfil).</Text>
        )}
      </View>

      {/* 3. Programa actual + su porqué */}
      <View style={{ gap: spacing.md }}>
        <Text style={sectionTitle}>Programa actual</Text>
        {programLoading ? (
          <Text style={{ color: colors.textMuted }}>Cargando…</Text>
        ) : !program ? (
          <Text style={{ color: colors.textMuted }}>Todavía no hay un plan generado.</Text>
        ) : !hasProgramRationale ? (
          <Text style={{ color: colors.textMuted }}>Regenerá el plan para ver el porqué de cada día.</Text>
        ) : (
          <>
            {program.rationale && (
              <View style={card}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{program.name}</Text>
                <Text style={bullet}>{program.rationale}</Text>
              </View>
            )}
            {weeks.map((wk) => (
              <View key={wk.weekNumber} style={{ gap: spacing.md }}>
                {weeks.length > 1 && (
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>Semana {wk.weekNumber}</Text>
                )}
                {wk.workouts.map((w, i) => (
                  <View key={i} style={card}>
                    <Text style={{ color: colors.text, fontWeight: "600" }}>{w.dayLabel}</Text>
                    {w.rationale ? (
                      <Text style={bullet}>{w.rationale}</Text>
                    ) : (
                      <Text style={bullet}>Regenerá el plan para ver el porqué de este día.</Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}
