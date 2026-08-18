import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import type { DayChecklistEntry, TakeSlot, TakeStatus } from "@pulsia/shared";
import { TAKE_SLOTS, parseCountableDose, formatCountableDose, parseLeadingNumber } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";

export const SLOT_LABELS: Record<TakeSlot, string> = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  cena: "Cena",
  post_entreno: "Post-entreno",
  antes_de_dormir: "Antes de dormir",
};

export interface SupplementChecklistProps {
  entries: DayChecklistEntry[];
  onMark: (entry: DayChecklistEntry, status: TakeStatus, actualDose?: string, note?: string) => void;
  onRemove: (entry: DayChecklistEntry) => void;
}

function Row({ entry, onMark, onRemove }: { entry: DayChecklistEntry; onMark: SupplementChecklistProps["onMark"]; onRemove: SupplementChecklistProps["onRemove"] }) {
  const isAdHoc = entry.origin === "adhoc";
  // Solo las filas del plan tienen panel de desvío; detectamos si la dosis planeada es
  // "contable" (ej. "3 cápsulas") para ofrecer un stepper +/- en lugar del texto libre.
  const countable = isAdHoc ? null : parseCountableDose(entry.dose);

  const [expanded, setExpanded] = useState(false);
  const [dose, setDose] = useState("");
  const [note, setNote] = useState("");
  const [stepCount, setStepCount] = useState(countable?.count ?? 0);

  const taken = entry.status === "taken";
  const skipped = entry.status === "skipped";
  const deviated = entry.status === "deviated";

  function confirmDeviated() {
    if (countable) {
      // "taken" en el diario cuenta plannedDose (la dosis del PLAN ORIGINAL, no la ajustada
      // de hoy), así que la decisión taken/deviated se compara contra ese conteo original —
      // no contra countable.count, que sale de entry.dose (la efectiva/ajustada). Si no,
      // en un día con ajuste reduce (3→1) confirmar en 1 marcaría "taken" y el diario
      // contaría 3. El baseline del stepper SÍ sigue en la efectiva (buena UX).
      const plannedCount = parseLeadingNumber(entry.plannedDose) ?? countable.count;
      const status: TakeStatus = stepCount === plannedCount ? "taken" : "deviated";
      onMark(entry, status, formatCountableDose(stepCount, countable.unit), note || undefined);
      setStepCount(countable.count);
    } else {
      onMark(entry, "deviated", dose || undefined, note || undefined);
      setDose("");
    }
    setExpanded(false);
    setNote("");
  }

  function markTaken() {
    onMark(entry, "taken", undefined, undefined);
    setExpanded(false);
  }

  function markSkipped() {
    onMark(entry, "skipped", undefined, undefined);
    setExpanded(false);
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable onPress={isAdHoc ? undefined : markTaken}
        style={{
          flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          backgroundColor: (taken || isAdHoc) ? colors.successSoft : colors.surfaceMuted,
          borderRadius: radius.md, padding: spacing.md, opacity: skipped ? 0.5 : 1,
        }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: "600", textDecorationLine: skipped ? "line-through" : "none" }}>
            {(taken || isAdHoc) ? "✓ " : ""}{entry.supplementName}
          </Text>
          <Text style={{ color: deviated ? colors.warning : colors.textMuted, fontSize: 12 }}>
            {deviated && entry.actualDose ? `${entry.actualDose} (planeado ${entry.plannedDose})` : entry.dose}
          </Text>
          {entry.adjusted && (
            <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>
              💡 {entry.adjusted.reason}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {isAdHoc ? (
            <Pressable testID={`remove-${entry.takeId}`} onPress={() => onRemove(entry)} hitSlop={8}>
              <Text style={{ color: colors.danger, fontSize: 12 }}>Quitar</Text>
            </Pressable>
          ) : (
            <>
              <Pressable testID={`deviate-${entry.planItemId}`} onPress={() => setExpanded((e) => !e)} hitSlop={8}>
                <Text style={{ color: colors.accentText, fontSize: 12 }}>Desvío</Text>
              </Pressable>
              <Pressable testID={`skip-${entry.planItemId}`} onPress={markSkipped} hitSlop={8}>
                <Text style={{ color: colors.danger, fontSize: 12 }}>Salteado</Text>
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
      {!isAdHoc && expanded && (
        <View style={{ gap: spacing.xs, paddingHorizontal: spacing.sm }}>
          {countable ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg }}>
              <Pressable testID={`step-minus-${entry.planItemId}`} onPress={() => setStepCount((c) => Math.max(0, c - 1))} hitSlop={8}
                style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: "600" }}>−</Text>
              </Pressable>
              <Text testID={`step-count-${entry.planItemId}`} style={{ color: colors.text, fontSize: 18, fontWeight: "600", minWidth: 90, textAlign: "center" }}>
                {formatCountableDose(stepCount, countable.unit)}
              </Text>
              <Pressable testID={`step-plus-${entry.planItemId}`} onPress={() => setStepCount((c) => c + 1)} hitSlop={8}
                style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: "600" }}>+</Text>
              </Pressable>
            </View>
          ) : (
            <TextInput value={dose} onChangeText={setDose} placeholder="Dosis real (p.ej. 10 g)" placeholderTextColor={colors.icon}
              style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
          )}
          <TextInput value={note} onChangeText={setNote} placeholder="Nota (opcional)" placeholderTextColor={colors.icon}
            style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
          <Pressable onPress={confirmDeviated}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.sm, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Confirmar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function SupplementChecklist({ entries, onMark, onRemove }: SupplementChecklistProps) {
  const bySlot = new Map<TakeSlot, DayChecklistEntry[]>();
  for (const e of entries) {
    const list = bySlot.get(e.slot) ?? [];
    list.push(e);
    bySlot.set(e.slot, list);
  }

  return (
    <View style={{ gap: spacing.md }}>
      {TAKE_SLOTS.filter((slot) => bySlot.has(slot)).map((slot) => (
        <View key={slot} style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>{SLOT_LABELS[slot]}</Text>
          {bySlot.get(slot)!.map((entry) => (
            <Row key={entry.planItemId ?? entry.takeId} entry={entry} onMark={onMark} onRemove={onRemove} />
          ))}
        </View>
      ))}
    </View>
  );
}

