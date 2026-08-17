import { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { listSupplements, addAdHocTake } from "../../src/api/supplements";
import { dateKey } from "../../src/session/dateKey";
import { SLOT_LABELS } from "../../src/components/SupplementChecklist";
import { ChipGroup } from "../../src/components/ChipGroup";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { TAKE_SLOTS } from "@pulsia/shared";
import type { Supplement, TakeSlot } from "@pulsia/shared";

const SLOT_OPTIONS = TAKE_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }));

export default function AgregarTomaScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const [items, setItems] = useState<Supplement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slot, setSlot] = useState<TakeSlot>("desayuno");
  const [count, setCount] = useState(1);
  const [freeDose, setFreeDose] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setItems(await listSupplements(await getBackendUrl())); }
      catch (e) { setError((e as Error).message); }
    })();
  }, []);

  const selected = items.find((s) => s.id === selectedId) ?? null;
  const unitLabel = selected?.unitLabel ?? null;
  const canSave = !saving && selected != null && (unitLabel ? count > 0 : freeDose.trim().length > 0);

  const add = useCallback(async () => {
    if (!selected) return;
    setSaving(true); setError(null);
    try {
      const dose = unitLabel ? `${count} ${unitLabel}` : freeDose.trim();
      await addAdHocTake(await getBackendUrl(), { date: dateKey(Date.now()), supplementId: selected.id, slot, dose });
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }, [selected, unitLabel, count, freeDose, slot]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Agregar suplemento a hoy</Text>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Suplemento</Text>
      {items.map((s) => (
        <Pressable key={s.id} onPress={() => setSelectedId(s.id)}
          style={{ backgroundColor: selectedId === s.id ? colors.accentSoft : colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: selectedId === s.id ? colors.accent : colors.border, padding: spacing.md }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{s.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Porción: {s.servingLabel}</Text>
        </Pressable>
      ))}

      {selected && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Franja</Text>
          <ChipGroup single options={SLOT_OPTIONS} selected={[slot]} onChange={(v) => setSlot(v[0] as TakeSlot)} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Dosis</Text>
          {unitLabel ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Pressable testID="dose-stepper-dec" onPress={() => setCount((n) => Math.max(1, n - 1))}
                style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 18 }}>−</Text>
              </Pressable>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{count} {unitLabel}</Text>
              <Pressable testID="dose-stepper-inc" onPress={() => setCount((n) => n + 1)}
                style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 18 }}>+</Text>
              </Pressable>
            </View>
          ) : (
            <TextInput testID="dose-free" value={freeDose} onChangeText={setFreeDose} placeholder="Dosis (p.ej. 1 cápsula)" placeholderTextColor={colors.icon}
              style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
          )}
          <Pressable onPress={add} disabled={!canSave}
            style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: canSave ? 1 : 0.5 }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Agregar</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
