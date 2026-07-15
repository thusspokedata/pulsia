import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import type { DayChecklistEntry, TakeSlot, TakeStatus } from "@pulsia/shared";
import { TAKE_SLOTS } from "@pulsia/shared";
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
}

function Row({ entry, onMark }: { entry: DayChecklistEntry; onMark: SupplementChecklistProps["onMark"] }) {
  const [expanded, setExpanded] = useState(false);
  const [dose, setDose] = useState("");
  const [note, setNote] = useState("");

  const taken = entry.status === "taken";
  const skipped = entry.status === "skipped";
  const deviated = entry.status === "deviated";

  function confirmDeviated() {
    onMark(entry, "deviated", dose || undefined, note || undefined);
    setExpanded(false);
    setDose("");
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
      <Pressable onPress={markTaken}
        style={{
          flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          backgroundColor: taken ? colors.successSoft : colors.surfaceMuted,
          borderRadius: radius.md, padding: spacing.md, opacity: skipped ? 0.5 : 1,
        }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: "600", textDecorationLine: skipped ? "line-through" : "none" }}>
            {taken ? "✓ " : ""}{entry.supplementName}
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
          <Pressable testID={`deviate-${entry.planItemId}`} onPress={() => setExpanded((e) => !e)} hitSlop={8}>
            <Text style={{ color: colors.accentText, fontSize: 12 }}>Desvío</Text>
          </Pressable>
          <Pressable testID={`skip-${entry.planItemId}`} onPress={markSkipped} hitSlop={8}>
            <Text style={{ color: colors.danger, fontSize: 12 }}>Salteado</Text>
          </Pressable>
        </View>
      </Pressable>
      {expanded && (
        <View style={{ gap: spacing.xs, paddingHorizontal: spacing.sm }}>
          <TextInput value={dose} onChangeText={setDose} placeholder="Dosis real (p.ej. 10 g)" placeholderTextColor={colors.icon}
            style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
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

export function SupplementChecklist({ entries, onMark }: SupplementChecklistProps) {
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
            <Row key={entry.planItemId} entry={entry} onMark={onMark} />
          ))}
        </View>
      ))}
    </View>
  );
}

