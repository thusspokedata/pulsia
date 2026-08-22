import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { buildGoalRationale, type Program } from "@pulsia/shared";
import { getBackendUrl } from "../src/storage/config";
import { getObjective, putObjective, draftObjective } from "../src/api/objective";
import { getStoredProgram } from "../src/storage/program";
import { loadDailyGoalContext } from "../src/nutrition/dailyGoal";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm } as const;
const sectionTitle = { fontSize: 16, fontWeight: "700", color: colors.text } as const;
const bullet = { color: colors.textMuted, fontSize: 13, lineHeight: 19 } as const;

/**
 * Pantalla global "Plan de trabajo": junta en un solo lugar el objetivo (editable), la meta
 * nutricional con su porqué determinista, y el programa actual con su porqué (global + por día,
 * de TODAS las semanas). No inventa cálculos propios: reusa getObjective/putObjective/draftObjective
 * (Fase 1), loadDailyGoalContext + buildGoalRationale (Fase 2) y getStoredProgram (el programa vive
 * en AsyncStorage, no hay endpoint "último programa").
 */
export default function PlanTrabajoScreen() {
  const screenPad = useScreenPadding(spacing.xl);
  const baseUrl = useRef<string | null>(null);

  // Objetivo de trabajo (editable inline, misma UX que objetivo-trabajo.tsx).
  const [objectiveContent, setObjectiveContent] = useState("");
  const [objectiveLoading, setObjectiveLoading] = useState(true);
  const [objectiveBusy, setObjectiveBusy] = useState<null | "save" | "draft">(null);
  const [objectiveError, setObjectiveError] = useState<string | null>(null);

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
      baseUrl.current = url;
      if (!url) { setObjectiveError("Configurá el backend"); setObjectiveLoading(false); setGoalLoading(false); }
      else {
        try { setObjectiveContent(await getObjective(url)); }
        catch { setObjectiveError("No se pudo cargar el objetivo"); }
        finally { setObjectiveLoading(false); }

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

  async function onObjectiveDraft() {
    const url = baseUrl.current; if (!url) return;
    setObjectiveBusy("draft"); setObjectiveError(null);
    try { setObjectiveContent(await draftObjective(url)); }
    catch { setObjectiveError("No se pudo sugerir el objetivo"); }
    finally { setObjectiveBusy(null); }
  }
  async function onObjectiveSave() {
    const url = baseUrl.current; if (!url) return;
    setObjectiveBusy("save"); setObjectiveError(null);
    try { setObjectiveContent(await putObjective(url, objectiveContent)); }
    catch { setObjectiveError("No se pudo guardar el objetivo"); }
    finally { setObjectiveBusy(null); }
  }

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
        {objectiveError && <Text style={{ color: colors.danger, fontSize: 12 }}>{objectiveError}</Text>}
        {objectiveLoading ? (
          <Text style={{ color: colors.textMuted }}>Cargando…</Text>
        ) : (
          <TextInput
            testID="objetivo-input"
            value={objectiveContent}
            onChangeText={setObjectiveContent}
            multiline
            placeholder="Ej: recomposición en 12 semanas, priorizar fuerza en tren superior…"
            placeholderTextColor={colors.textMuted}
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 14, minHeight: 120, textAlignVertical: "top" }}
          />
        )}
        <Pressable testID="objetivo-sugerir" onPress={onObjectiveDraft} disabled={objectiveBusy != null || objectiveLoading || !baseUrl.current}
          style={{ borderColor: colors.accent, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: objectiveBusy || !baseUrl.current ? 0.6 : 1 }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>{objectiveBusy === "draft" ? "Sugiriendo…" : "Sugerir con IA"}</Text>
        </Pressable>
        <Pressable testID="objetivo-guardar" onPress={onObjectiveSave} disabled={objectiveBusy != null || objectiveLoading || !baseUrl.current}
          style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: objectiveBusy || !baseUrl.current ? 0.6 : 1 }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>{objectiveBusy === "save" ? "Guardando…" : "Guardar"}</Text>
        </Pressable>
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
