import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getBackendUrl } from "../../src/storage/config";
import { buildAthleteContext } from "../../src/nutrition/athleteContext";
import { getPlan, generatePlan, updatePlanItem } from "../../src/api/supplements";
import { dateKey } from "../../src/session/dateKey";
import { SLOT_LABELS } from "../../src/components/SupplementChecklist";
import { ChipGroup } from "../../src/components/ChipGroup";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";
import { TAKE_SLOTS, frequencyAppliesOn } from "@pulsia/shared";
import type { PlanView, PlanItemView, Frequency, TakeSlot } from "@pulsia/shared";

const WEEKDAY_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const SLOT_OPTIONS = TAKE_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }));
const FREQ_TYPE_OPTIONS = [
  { value: "daily", label: "todos los días" },
  { value: "every_other_day", label: "día por medio" },
  { value: "weekdays", label: "días fijos" },
];
const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, i) => ({ value: String(i), label }));

function frequencyLabel(freq: Frequency): string {
  if (freq.type === "daily") return "todos los días";
  if (freq.type === "every_other_day") return "día por medio";
  return freq.days.map((d) => WEEKDAY_LABELS[d]).join("/");
}

function EditItem({ item, saving, onSave, onCancel }: {
  item: PlanItemView;
  saving: boolean;
  onSave: (patch: { slot: TakeSlot; frequency: Frequency; dose: string }) => void;
  onCancel: () => void;
}) {
  const [slot, setSlot] = useState<TakeSlot>(item.slot);
  const [type, setType] = useState<Frequency["type"]>(item.frequency.type);
  const [days, setDays] = useState<string[]>(item.frequency.type === "weekdays" ? item.frequency.days.map(String) : []);
  const [dose, setDose] = useState(item.dose);

  const canSave = !saving && dose.trim().length > 0 && (type !== "weekdays" || days.length > 0);

  function save() {
    if (!canSave) return;
    let frequency: Frequency;
    if (type === "daily") frequency = { type: "daily" };
    else if (type === "every_other_day") {
      // Si el ítem ya era día-por-medio, conservar su ancla (re-anclar a hoy podría
      // invertir la paridad de todo el esquema); solo anclar a hoy al CAMBIAR a este tipo.
      const anchorDate = item.frequency.type === "every_other_day" ? item.frequency.anchorDate : dateKey(Date.now());
      frequency = { type: "every_other_day", anchorDate };
    } else frequency = { type: "weekdays", days: days.map(Number).sort((a, b) => a - b) };
    onSave({ slot, frequency, dose: dose.trim() });
  }

  return (
    <View style={{ gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Franja</Text>
      <ChipGroup single options={SLOT_OPTIONS} selected={[slot]} onChange={(v) => setSlot(v[0] as TakeSlot)} />
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Frecuencia</Text>
      <ChipGroup single options={FREQ_TYPE_OPTIONS} selected={[type]} onChange={(v) => setType(v[0] as Frequency["type"])} />
      {type === "weekdays" && (
        <ChipGroup options={WEEKDAY_OPTIONS} selected={days} onChange={setDays} />
      )}
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Dosis</Text>
      <TextInput value={dose} onChangeText={setDose} placeholder="Dosis"
        placeholderTextColor={colors.icon}
        style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
      {type === "weekdays" && days.length === 0 && (
        <Text style={{ color: colors.danger, fontSize: 12 }}>Elegí al menos un día.</Text>
      )}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable onPress={save} disabled={!canSave}
          style={{ flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", opacity: canSave ? 1 : 0.5 }}>
          {saving && <ActivityIndicator size="small" color="#fff" />}
          <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar cambios</Text>
        </Pressable>
        <Pressable onPress={onCancel}
          style={{ flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.sm, alignItems: "center" }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WeekPreview({ items }: { items: PlanItemView[] }) {
  const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs } as const;
  // Aritmética de calendario (no +86_400_000 ms): un día de 25 h por DST duplicaría
  // una fecha y perdería la séptima. `new Date(Date.now())` (y no `new Date()`) para
  // que los tests puedan fijar el tiempo espiando Date.now.
  const base = new Date(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const date = dateKey(d.getTime());
    const label = i === 0 ? "Hoy" : WEEKDAY_LABELS[d.getDay()];
    const names = items.filter((it) => frequencyAppliesOn(it.frequency, date)).map((it) => it.supplementName);
    return { date, label, text: names.length > 0 ? names.join(" · ") : "—" };
  });
  return (
    <View style={card}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>Semana</Text>
      {days.map((d, i) => (
        <View key={d.date} testID={`week-day-${i}`}
          style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600", width: 36 }}>{d.label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{d.text}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PlanSuplementosScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const url = useRef<string | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const u = await getBackendUrl();
      url.current = u;
      setPlan(await getPlan(u));
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function generate() {
    if (!url.current) return;
    setGenerating(true); setError(null);
    try {
      const athleteContext = await buildAthleteContext(url.current);
      const date = dateKey(Date.now());
      const userNote = nota.trim() || null;
      const result = await generatePlan(url.current, { athleteContext, date, userNote });
      setPlan(result);
      setExpandedId(null);
    } catch (e) { setError((e as Error).message); }
    setGenerating(false);
  }

  async function saveItem(item: PlanItemView, patch: { slot: TakeSlot; frequency: Frequency; dose: string }) {
    if (!url.current || !plan) return;
    setSavingId(item.id); setError(null);
    try {
      const updated = await updatePlanItem(url.current, item.id, patch);
      setPlan({ ...plan, items: plan.items.map((it) => (it.id === item.id ? updated : it)) });
      setExpandedId(null);
    } catch (e) { setError((e as Error).message); }
    setSavingId(null);
  }

  const bySlot = new Map<TakeSlot, PlanItemView[]>();
  for (const it of plan?.items ?? []) {
    const list = bySlot.get(it.slot) ?? [];
    list.push(it);
    bySlot.set(it.slot, list);
  }

  const card = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Plan de suplementos</Text>

      {loading && <ActivityIndicator color={colors.accent} />}
      {error && (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.danger }}>{error}</Text>
          {/catálogo/i.test(error) && (
            <Pressable onPress={() => router.push("/nutricion/catalogo")}>
              <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>Ir al catálogo →</Text>
            </Pressable>
          )}
        </View>
      )}

      {!loading && plan == null && (
        <View style={{ ...card, alignItems: "center" }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Todavía no hay plan.</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>
            La IA arma un plan de tomas a partir de tu catálogo de suplementos.
          </Text>
          {generating ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Pressable onPress={generate}
              style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", alignSelf: "stretch" }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Generar plan con IA</Text>
            </Pressable>
          )}
        </View>
      )}

      {plan != null && (
        <View style={{ gap: spacing.md }}>
          {TAKE_SLOTS.filter((slot) => bySlot.has(slot)).map((slot) => (
            <View key={slot} style={{ gap: spacing.xs }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>{SLOT_LABELS[slot]}</Text>
              {bySlot.get(slot)!.map((item) => (
                <View key={item.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
                  <Pressable onPress={() => setExpandedId((id) => (id === item.id ? null : item.id))}
                    style={{ padding: spacing.md, gap: 2 }}>
                    <Text style={{ color: colors.text, fontWeight: "600" }}>{item.supplementName}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {item.dose} · {frequencyLabel(item.frequency)}
                    </Text>
                    {item.reason && (
                      <Text style={{ color: colors.icon, fontSize: 11, fontStyle: "italic" }}>{item.reason}</Text>
                    )}
                  </Pressable>
                  {expandedId === item.id && (
                    // EditItem queda montado durante el guardado: si falla, la edición no se pierde.
                    <EditItem
                      item={item}
                      saving={savingId === item.id}
                      onSave={(patch) => saveItem(item, patch)}
                      onCancel={() => setExpandedId(null)}
                    />
                  )}
                </View>
              ))}
            </View>
          ))}

          <WeekPreview items={plan.items} />

          <View style={{ ...card }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Nota para la IA (opcional)</Text>
            <TextInput value={nota} onChangeText={setNota} placeholder="Nota para la IA (p.ej. el zinc a la mañana no)"
              placeholderTextColor={colors.icon}
              style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, color: colors.text }} />
            {generating ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Pressable onPress={generate}
                style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
                <Text style={{ color: colors.accentText, fontWeight: "700" }}>Regenerar plan</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <Text style={{ color: colors.icon, fontSize: 11, textAlign: "center" }}>
        ⚠️ Esto no reemplaza la evaluación de un médico o nutricionista.
      </Text>
    </ScrollView>
  );
}
