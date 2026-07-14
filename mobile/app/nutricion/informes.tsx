import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { getProfile } from "../../src/storage/profile";
import { getLatestMetrics } from "../../src/api/metrics";
import { getNutritionGoal } from "../../src/api/nutrition";
import { generateReport, getReport } from "../../src/api/reports";
import { dayPeriod } from "../../src/reports/periods";
import { computeNutritionGoal } from "@pulsia/shared";
import type { AthleteContext } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

export default function InformesScreen() {
  const [offset, setOffset] = useState(0);
  const [content, setContent] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const url = useRef<string | null>(null);
  const period = dayPeriod(offset, Date.now());

  const load = useCallback(async (start: number) => {
    setLoading(true); setError(null); setDisabled(false);
    try {
      const u = await getBackendUrl(); url.current = u;
      const rep = await getReport(u, "daily", start);
      setContent(rep?.content ?? null); setCreatedAt(rep?.createdAt ?? null);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(period.start); }, [load, period.start]));

  async function buildAthlete(): Promise<AthleteContext> {
    const p = await getProfile();
    let weightKg = p?.weightKg;
    const gi = url.current ? await getNutritionGoal(url.current) : null;
    if (url.current) {
      try { const lm = await getLatestMetrics(url.current); if (lm.weight_kg?.value != null) weightKg = lm.weight_kg.value; } catch { /* offline */ }
    }
    const goalRes = gi
      ? computeNutritionGoal({
          sex: p?.sex, age: p?.age, heightCm: p?.heightCm, weightKg,
          activityLevel: p?.activityLevel, objective: gi.objective, rateKgPerWeek: gi.rateKgPerWeek, manualKcal: gi.manualKcal,
        })
      : null;
    const goal = goalRes && goalRes.status === "ok"
      ? { status: "ok" as const, kcal: goalRes.kcal, protein_g: goalRes.protein_g, carbs_g: goalRes.carbs_g, fat_g: goalRes.fat_g, bmr: goalRes.bmr }
      : { status: "incomplete" as const };
    return { sex: p?.sex, age: p?.age, heightCm: p?.heightCm, weightKg, activityLevel: p?.activityLevel, objective: gi?.objective, goal };
  }

  async function generate(force: boolean) {
    if (!url.current) return;
    setBusy(true); setError(null); setDisabled(false);
    try {
      const athleteContext = await buildAthlete();
      const rep = await generateReport(url.current, { kind: "daily", periodStart: period.start, periodEnd: period.end, athleteContext, force });
      setContent(rep.content); setCreatedAt(rep.createdAt);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setDisabled(/desactivad/i.test(msg));
    }
    setBusy(false);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => setOffset((o) => o + 1)}><Text style={{ color: colors.accent, fontSize: 18 }}>◀</Text></Pressable>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{period.label}</Text>
        <Pressable onPress={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset <= 0}><Text style={{ color: offset <= 0 ? colors.icon : colors.accent, fontSize: 18 }}>▶</Text></Pressable>
      </View>

      {loading && <ActivityIndicator color={colors.accent} />}
      {error && (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.danger }}>{error}</Text>
          {disabled && (
            <Pressable onPress={() => router.push("/configuracion")}>
              <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>Ir a Configuración →</Text>
            </Pressable>
          )}
        </View>
      )}

      {!loading && content == null && !busy && (
        <Pressable onPress={() => generate(false)} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Generar informe del día</Text>
        </Pressable>
      )}
      {busy && (
        <View style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg }}>
          <ActivityIndicator color={colors.accent} /><Text style={{ color: colors.textMuted }}>El agente está analizando tu día…</Text>
        </View>
      )}
      {content != null && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
          <Text style={{ color: colors.text, lineHeight: 21 }}>{content}</Text>
          {createdAt != null && <Text style={{ color: colors.icon, fontSize: 11 }}>Generado {new Date(createdAt).toLocaleString()}</Text>}
          <Pressable onPress={() => generate(true)} disabled={busy}>
            <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>Regenerar</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
