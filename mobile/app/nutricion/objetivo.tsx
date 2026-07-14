import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { computeNutritionGoal, type NutritionObjective } from "@pulsia/shared";
import { getProfile } from "../../src/storage/profile";
import { getBackendUrl } from "../../src/storage/config";
import { getLatestMetrics } from "../../src/api/metrics";
import { getNutritionGoal, putNutritionGoal } from "../../src/api/nutrition";
import { ChipGroup } from "../../src/components/ChipGroup";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import type { TrainingProfile } from "@pulsia/shared";

const OBJECTIVES = [
  { value: "lose", label: "Perder" },
  { value: "maintain", label: "Mantener" },
  { value: "gain", label: "Ganar" },
];
const RATES = [
  { value: "0.25", label: "0,25 kg/sem" },
  { value: "0.5", label: "0,5 kg/sem" },
];

export default function ObjetivoScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const baseUrl = useRef<string | null>(null);
  const [profile, setProfileState] = useState<TrainingProfile | null>(null);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [objective, setObjective] = useState<NutritionObjective>("maintain");
  const [rate, setRate] = useState("0.5");
  const [manualKcal, setManualKcal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      setProfileState(p);
      setWeightKg(p?.weightKg);
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (url) {
        try {
          const latest = await getLatestMetrics(url);
          if (latest.weight_kg?.value != null) setWeightKg(latest.weight_kg.value);
        } catch { /* offline: peso del perfil */ }
        try {
          const g = await getNutritionGoal(url);
          setObjective(g.objective);
          setRate(String(g.rateKgPerWeek === 0 ? 0.5 : g.rateKgPerWeek));
          setManualKcal(g.manualKcal != null ? String(g.manualKcal) : "");
        } catch (e) { setError((e as Error).message); }
      }
    })();
  }, []);

  const manual = manualKcal.trim() === "" ? null : Number(manualKcal.replace(",", "."));
  const result = computeNutritionGoal({
    sex: profile?.sex, age: profile?.age, heightCm: profile?.heightCm, weightKg,
    activityLevel: profile?.activityLevel,
    objective, rateKgPerWeek: objective === "maintain" ? 0 : Number(rate),
    manualKcal: manual != null && Number.isFinite(manual) && manual > 0 ? manual : null,
  });

  async function save() {
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      await putNutritionGoal(baseUrl.current, {
        objective, rateKgPerWeek: objective === "maintain" ? 0 : Number(rate),
        manualKcal: manual != null && Number.isFinite(manual) && manual > 0 ? Math.round(manual) : null,
      });
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Objetivo nutricional</Text>

      <View><Text style={{ color: colors.textMuted, marginBottom: spacing.xs }}>Objetivo</Text>
        <ChipGroup single options={OBJECTIVES} selected={[objective]} onChange={(v) => setObjective(v[0] as NutritionObjective)} />
      </View>
      {objective !== "maintain" && (
        <View><Text style={{ color: colors.textMuted, marginBottom: spacing.xs }}>Ritmo</Text>
          <ChipGroup single options={RATES} selected={[rate]} onChange={(v) => setRate(v[0])} />
        </View>
      )}
      <View><Text style={{ color: colors.textMuted, marginBottom: spacing.xs }}>Meta calórica manual (opcional, pisa el cálculo)</Text>
        <TextInput value={manualKcal} onChangeText={setManualKcal} keyboardType="numeric" placeholder="kcal" placeholderTextColor={colors.icon}
          style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text }} />
      </View>

      {/* Vista previa de la meta */}
      <View style={card}>
        {result.status === "ok" ? (
          <>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{result.kcal} kcal / día</Text>
            <Text style={{ color: colors.textMuted }}>Prot {result.protein_g}g · Carb {result.carbs_g}g · Gras {result.fat_g}g</Text>
            <Text style={{ color: colors.icon, fontSize: 12 }}>
              {result.source === "manual" ? "meta manual" : `BMR ${result.bmr} · TDEE ${result.tdee}`}
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Faltan datos del perfil para calcular la meta:</Text>
            <Text style={{ color: colors.textMuted }}>{result.missing.join(", ")}</Text>
            <Pressable onPress={() => router.push("/(tabs)/perfil")}>
              <Text style={{ color: colors.accentText, fontWeight: "600" }}>Completar perfil →</Text>
            </Pressable>
          </>
        )}
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={save} disabled={saving} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : "Guardar objetivo"}</Text>
      </Pressable>
    </ScrollView>
  );
}
