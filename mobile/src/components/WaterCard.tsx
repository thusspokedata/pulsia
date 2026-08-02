import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import type { WaterLog } from "@pulsia/shared";
import { Bar } from "../nutrition/tabs/ui";
import { computeWaterGoalMl } from "../nutrition/waterGoal";
import { getWaterGoalOverride, setWaterGoalOverride } from "../storage/waterGoal";
import { colors, radius, spacing } from "../theme/tokens";

interface LiquidSummary { total: number; drank: number; fromFood: number }

export function WaterCard({
  water, liquid, weightKg, onAddWater, onUndoLast,
}: {
  water: WaterLog[];
  liquid: LiquidSummary;
  weightKg?: number | null;
  onAddWater: (ml: number) => void;
  onUndoLast: () => void;
}) {
  const [mlInput, setMlInput] = useState("");
  const [overrideMl, setOverrideMl] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const dirty = useRef(false); // el usuario ya editó la meta localmente

  useEffect(() => {
    let alive = true;
    void (async () => {
      const v = await getWaterGoalOverride();
      // No pisar una edición local que llegó antes de que resuelva la carga inicial,
      // ni tocar el estado si el componente ya se desmontó.
      if (alive && !dirty.current) setOverrideMl(v);
    })();
    return () => { alive = false; };
  }, []);

  const goal = computeWaterGoalMl({ overrideMl, weightKg });
  const drank = Math.round(liquid.drank);
  const pct = goal > 0 ? Math.round((liquid.drank / goal) * 100) : 0;

  async function saveGoal() {
    const n = Number(goalInput.replace(",", "."));
    if (Number.isFinite(n) && n > 0) {
      dirty.current = true;
      await setWaterGoalOverride(n);
      setOverrideMl(Math.round(n));
    }
    setEditing(false);
  }

  async function useAuto() {
    dirty.current = true;
    await setWaterGoalOverride(null);
    setOverrideMl(null);
    setEditing(false);
  }

  function confirmUndo() {
    if (water.length === 0) return;
    const last = water[water.length - 1];
    Alert.alert("Borrar registro", `¿Borrar el último registro de agua (${Math.round(last.ml)} ml)?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => onUndoLast() },
    ]);
  }

  function submitMl() {
    const n = Number(mlInput.replace(",", "."));
    if (Number.isFinite(n) && n > 0) { onAddWater(n); setMlInput(""); }
  }

  return (
    <View testID="water-card" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>💧 Agua {drank} / {goal} ml</Text>
        <Pressable testID="water-goal-edit" onPress={() => { setGoalInput(String(goal)); setEditing((e) => !e); }} hitSlop={8}>
          <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "600" }}>Meta ✎</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Bar value={liquid.drank} target={goal} kind="floor" height={8} testID="water-bar" />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, minWidth: 40, textAlign: "right" }}>{pct}%</Text>
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 12 }}>tomada {drank} + alimentos {Math.round(liquid.fromFood)}</Text>

      {editing && (
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <TextInput testID="water-goal-input" value={goalInput} onChangeText={setGoalInput} keyboardType="numeric" placeholder="meta ml" placeholderTextColor={colors.icon}
            style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
          <Pressable testID="water-goal-save" onPress={saveGoal} style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar</Text>
          </Pressable>
          <Pressable testID="water-goal-auto" onPress={useAuto} hitSlop={8}>
            <Text style={{ color: colors.accentText, fontSize: 12 }}>Auto (35 ml/kg)</Text>
          </Pressable>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
        <Pressable testID="water-add-glass" onPress={() => onAddWater(250)} style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>+1 vaso (250 ml)</Text>
        </Pressable>
        <TextInput testID="water-ml-input" value={mlInput} onChangeText={setMlInput} keyboardType="numeric" placeholder="ml" placeholderTextColor={colors.icon}
          style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
        <Pressable testID="water-add" onPress={submitMl} style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Agregar</Text>
        </Pressable>
      </View>

      {water.length > 0 && (
        <Pressable testID="water-undo" onPress={confirmUndo}>
          <Text style={{ color: colors.accentText, fontSize: 12 }}>Borrar último ({Math.round(water[water.length - 1].ml)} ml)</Text>
        </Pressable>
      )}
    </View>
  );
}
