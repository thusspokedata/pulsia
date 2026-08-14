import { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { deleteMeal, logWater, deleteWater } from "../../src/api/nutrition";
import { getDayChecklist, putTake } from "../../src/api/supplements";
import { getBackendUrl } from "../../src/storage/config";
import { dayLabel, dayAtNoon, hhmm } from "../../src/session/metricDate";
import { dateKey } from "../../src/session/dateKey";
import { dayBounds } from "../../src/nutrition/dayBounds";
import { useNutritionDay } from "../../src/nutrition/useNutritionDay";
import { macroTargetLabel, remainingLabel } from "../../src/nutrition/goalView";
import { SupplementChecklist } from "../../src/components/SupplementChecklist";
import { WaterCard } from "../../src/components/WaterCard";
import { getSupplementsCollapsed, setSupplementsCollapsed } from "../../src/storage/supplementsCollapsed";
import { Bar } from "../../src/nutrition/tabs/ui";
import type { Meal, DayChecklistEntry, TakeStatus } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

const SHORT: Record<"protein" | "carbs" | "fat", string> = { protein: "Prot", carbs: "Carb", fat: "Gras" };

export default function NutricionScreen() {
  const [offset, setOffset] = useState(0);
  const { error, setError, meals, water, summary, goalView, weightKg, baseUrl, reload } = useNutritionDay(offset);
  const { dayTotals, cholesterolMg, liquid } = summary;
  const [checklist, setChecklist] = useState<{ hasPlan: boolean; entries: DayChecklistEntry[] } | null>(null);
  const [supplementsCollapsed, setCollapsed] = useState(true);

  useFocusEffect(useCallback(() => { void getSupplementsCollapsed().then(setCollapsed); }, []));

  function toggleSupplements() {
    setCollapsed((c) => { const next = !c; void setSupplementsCollapsed(next); return next; });
  }

  const loadChecklist = useCallback(async () => {
    try {
      const url = await getBackendUrl();
      setChecklist(await getDayChecklist(url, dateKey(dayAtNoon(offset, Date.now()))));
    } catch (e) { setError((e as Error).message); }
  }, [offset]);
  useFocusEffect(useCallback(() => { void loadChecklist(); }, [loadChecklist]));

  async function onMarkTake(entry: DayChecklistEntry, status: TakeStatus, actualDose?: string, note?: string) {
    try {
      const url = await getBackendUrl();
      await putTake(url, { date: dateKey(dayAtNoon(offset, Date.now())), planItemId: entry.planItemId, status, actualDose, note });
      await loadChecklist();
    } catch (e) { setError((e as Error).message); }
  }

  function mealKcal(m: Meal): number { return m.items.reduce((a, it) => a + it.kcal, 0); }

  function remove(m: Meal) {
    Alert.alert("Borrar comida", "¿Borrar esta comida?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        if (!baseUrl) return;
        try { await deleteMeal(baseUrl, m.id); await reload(); } catch (e) { setError((e as Error).message); }
      } },
    ]);
  }

  function waterLoggedAt(): number { return offset === 0 ? Date.now() : dayBounds(offset).noon; }

  async function addWater(ml: number) {
    if (!baseUrl || !Number.isFinite(ml) || ml <= 0) return;
    try { await logWater(baseUrl, { ml, loggedAt: waterLoggedAt() }); await reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function undoLastWater() {
    if (!baseUrl || water.length === 0) return;
    const last = water[water.length - 1];
    try { await deleteWater(baseUrl, last.id); await reload(); } catch (e) { setError((e as Error).message); }
  }

  const { noon } = dayBounds(offset);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => setOffset((o) => o + 1)}><Text style={{ color: colors.accent, fontSize: 18 }}>◀</Text></Pressable>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{dayLabel(offset, Date.now())}</Text>
        <Pressable onPress={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset <= 0}>
          <Text style={{ color: offset <= 0 ? colors.icon : colors.accent, fontSize: 18 }}>▶</Text>
        </Pressable>
      </View>

      {/* Totales del día — toda la card abre el detalle */}
      <Pressable onPress={() => router.push(`/nutricion/detalle?offset=${offset}`)}
        style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          {goalView?.status === "ok" ? (
            <View>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{goalView.kcal!.comido} / {goalView.kcal!.meta} kcal</Text>
              <Text style={{ color: goalView.kcal!.over ? colors.warning : colors.textMuted }}>
                {goalView.kcal!.over ? `${-goalView.kcal!.restante} kcal de más` : `te quedan ${goalView.kcal!.restante} kcal`}
              </Text>
              {goalView.kcal!.exercise > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>🔥 +{goalView.kcal!.exercise} kcal ejercicio</Text>
              )}
            </View>
          ) : (
            <View>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{dayTotals.kcal} kcal</Text>
              <Text style={{ color: colors.textMuted }}>Prot {Math.round(dayTotals.protein_g)}g · Carb {Math.round(dayTotals.carbs_g)}g · Gras {Math.round(dayTotals.fat_g)}g</Text>
            </View>
          )}
          <Pressable onPress={() => router.push("/nutricion/objetivo")} hitSlop={8}>
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "600" }}>Objetivo ⚙</Text>
          </Pressable>
        </View>
        {goalView?.status === "ok" && (
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            {goalView.macros!.map((m) => (
              <View key={m.key} style={{ gap: 2 }}>
                <Text style={{ color: m.over ? colors.warning : colors.textMuted, fontSize: 12 }}>
                  {SHORT[m.key]} {m.comido} / {macroTargetLabel(m)} · {remainingLabel(m.restante)}
                </Text>
                <Bar value={m.comido} target={m.metaTotal} height={6} />
              </View>
            ))}
          </View>
        )}
        {goalView?.status === "incomplete" && (
          <Pressable onPress={() => router.push("/nutricion/objetivo")} style={{ marginTop: spacing.xs }} hitSlop={8}>
            <Text style={{ color: colors.accentText, fontSize: 12 }}>Definí tu objetivo / completá tu perfil para ver tu meta →</Text>
          </Pressable>
        )}
        {cholesterolMg != null && (
          <Text style={{ color: cholesterolMg > 300 ? colors.warning : colors.textMuted, fontSize: 12, marginTop: 6 }}>
            Colesterol {Math.round(cholesterolMg)} / 300 mg
          </Text>
        )}
        <Text style={{ color: colors.icon, fontSize: 11, marginTop: 8 }}>toca para ver el detalle ›</Text>
      </Pressable>

      {/* Líquido del día */}
      <WaterCard
        water={water}
        liquid={liquid}
        weightKg={weightKg}
        onAddWater={addWater}
        onUndoLast={undoLastWater}
      />

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable onPress={() => router.push(`/nutricion/nueva-comida?eatenAt=${offset === 0 ? Date.now() : noon}`)}
          style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>+ Nueva comida</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/nutricion/catalogo")}
          style={{ flex: 1, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>Catálogo</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/nutricion/suplementos")}
          style={{ flex: 1, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>Suplementos</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.push("/nutricion/informes")}
        style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
        <Text style={{ color: colors.accentText, fontWeight: "600" }}>📋 Informes</Text>
      </Pressable>

      {/* Suplementos del día — colapsable (estado recordado), después de Informes */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
        <Pressable onPress={toggleSupplements} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <Text style={{ color: colors.icon, fontSize: 14, width: 14 }}>{supplementsCollapsed ? "▸" : "▾"}</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>💊 Suplementos</Text>
          </View>
          {checklist?.hasPlan && (
            <Pressable onPress={() => router.push("/nutricion/plan-suplementos")} hitSlop={8}>
              <Text style={{ color: colors.accentText, fontSize: 12 }}>Ver plan ›</Text>
            </Pressable>
          )}
        </Pressable>
        {!supplementsCollapsed && (
          <>
            {checklist && !checklist.hasPlan && (
              <Pressable onPress={() => router.push("/nutricion/plan-suplementos")}
                style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Armar plan con IA</Text>
              </Pressable>
            )}
            {checklist && checklist.hasPlan && checklist.entries.length === 0 && (
              <Text style={{ color: colors.textMuted }}>Hoy no toca ningún suplemento.</Text>
            )}
            {checklist && checklist.hasPlan && checklist.entries.length > 0 && (
              <SupplementChecklist entries={checklist.entries} onMark={onMarkTake} />
            )}
          </>
        )}
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {meals.length === 0 && <Text style={{ color: colors.textMuted }}>No hay comidas registradas este día.</Text>}

      {meals.map((m) => (
        <Pressable key={m.id} onPress={() => router.push(`/nutricion/comida?id=${m.id}`)} onLongPress={() => remove(m)} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{hhmm(m.eatenAt)}{m.mealType ? ` · ${m.mealType}` : ""}</Text>
            <Text style={{ color: colors.accentText }}>{mealKcal(m)} kcal</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {m.items.map((it) => `${it.foodName} (${it.quantity}${it.quantityUnit === "unit" ? "u" : it.quantityUnit})`).join(" · ")}
          </Text>
          {m.note ? <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>💬 {m.note}</Text> : null}
        </Pressable>
      ))}
      <Text style={{ color: colors.icon, fontSize: 11, textAlign: "center" }}>Mantené presionada una comida para borrarla.</Text>
    </ScrollView>
  );
}
