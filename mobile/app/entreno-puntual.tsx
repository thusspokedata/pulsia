import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView, TextInput } from "react-native";
import { router } from "expo-router";
import type { MuscleGroup, Equipment, TrainingProfile } from "@pulsia/shared";
import { getBackendUrl } from "../src/storage/config";
import { getProfile } from "../src/storage/profile";
import { setStoredOneOffProgram, setStoredOneOffProgramId } from "../src/storage/oneOffProgram";
import { generateOneOff } from "../src/api/programs";
import { colors, radius, spacing } from "../src/theme/tokens";
import { useScreenPadding } from "../src/theme/screen";

const FOCUS_OPTIONS: { value: MuscleGroup; label: string }[] = [
  { value: "chest", label: "Pecho" },
  { value: "back", label: "Espalda" },
  { value: "shoulders", label: "Hombros" },
  { value: "biceps", label: "Bíceps" },
  { value: "triceps", label: "Tríceps" },
  { value: "quads", label: "Cuádriceps" },
  { value: "hamstrings", label: "Isquios" },
  { value: "glutes", label: "Glúteos" },
  { value: "abs", label: "Abdominales" },
];

const LOCATION_OPTIONS: { value: "gym" | "home"; label: string }[] = [
  { value: "gym", label: "Gimnasio" },
  { value: "home", label: "Casa" },
];

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: "bodyweight", label: "Peso corporal" },
  { value: "dumbbell", label: "Mancuerna" },
  { value: "barbell", label: "Barra" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "resistance_band", label: "Banda" },
  { value: "pull_up_bar", label: "Barra dominadas" },
  { value: "bench", label: "Banco" },
  { value: "cable_machine", label: "Polea" },
  { value: "machine", label: "Máquina" },
  { value: "trx", label: "TRX" },
];

const TIME_OPTIONS = [20, 30, 45, 60, 90];

function Chip({ label, on, testID, onPress }: { label: string; on: boolean; testID: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: on ? colors.accent : colors.border,
        backgroundColor: on ? colors.accent : colors.bg,
      }}
    >
      <Text style={{ color: on ? "#fff" : colors.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function EntrenoPuntualScreen() {
  const screenPad = useScreenPadding(spacing.xl);
  const [profile, setProfile] = useState<TrainingProfile | null>(null);
  const [focus, setFocus] = useState<MuscleGroup[]>([]);
  const [location, setLocation] = useState<"gym" | "home">("gym");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [minutes, setMinutes] = useState<number>(60);
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar el profile y sembrar minutos + equipo del lugar inicial (gym).
  useEffect(() => {
    (async () => {
      const p = await getProfile();
      if (!p) return;
      setProfile(p);
      setMinutes(p.sessionMinutes);
      setEquipment(location === "home" ? p.homeEquipment : p.gymEquipment);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChangeLocation(next: "gym" | "home") {
    setLocation(next);
    if (profile) setEquipment(next === "home" ? profile.homeEquipment : profile.gymEquipment);
  }

  function toggleFocus(m: MuscleGroup) {
    setFocus((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }
  function toggleEquipment(e: Equipment) {
    setEquipment((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  function effectiveMinutes(): number {
    const custom = parseInt(customMinutes, 10);
    if (customMinutes.trim() !== "" && Number.isFinite(custom)) {
      return Math.min(180, Math.max(15, custom));
    }
    return minutes;
  }

  async function onGenerate() {
    if (focus.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const url = await getBackendUrl();
      if (!url || !profile) {
        setError("Configurá backend y perfil primero");
        setLoading(false);
        return;
      }
      const { id, program } = await generateOneOff(url, {
        profile,
        location,
        focus,
        sessionMinutes: effectiveMinutes(),
        equipment,
        notes: notes.trim() || undefined,
      });
      await setStoredOneOffProgram(program);
      await setStoredOneOffProgramId(id);
      const wk = program.weeks[0].workouts[0];
      router.push({
        pathname: "/sesion",
        params: { week: "1", dayLabel: wk.dayLabel, location, oneOff: "true" },
      });
    } catch {
      setError("No se pudo generar el entreno");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, ...screenPad, gap: spacing.lg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ fontSize: 16, color: colors.text }}>Generando…</Text>
        <Text style={{ color: colors.textMuted, textAlign: "center" }}>Esto puede tardar hasta un par de minutos.</Text>
      </View>
    );
  }

  const customParsed = parseInt(customMinutes, 10);
  const customOn = customMinutes.trim() !== "" && Number.isFinite(customParsed);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: colors.bg, ...screenPad, gap: spacing.lg }}>
      <Text style={{ fontSize: 18, fontWeight: "500", color: colors.text }}>Entreno puntual</Text>
      <Text style={{ color: colors.textMuted }}>Elegí qué músculos, cuánto tiempo, con qué equipo y cualquier nota para hoy.</Text>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Músculos</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {FOCUS_OPTIONS.map((o) => (
            <Chip key={o.value} testID={`focus-${o.value}`} label={o.label} on={focus.includes(o.value)} onPress={() => toggleFocus(o.value)} />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Lugar</Text>
        <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, overflow: "hidden" }}>
          {LOCATION_OPTIONS.map((o) => {
            const on = o.value === location;
            return (
              <Pressable
                key={o.value}
                testID={`loc-${o.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onChangeLocation(o.value)}
                style={{ flex: 1, paddingVertical: spacing.sm, alignItems: "center", backgroundColor: on ? colors.accent : colors.bg }}
              >
                <Text style={{ color: on ? "#fff" : colors.textMuted, fontSize: 13 }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Equipo disponible</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {EQUIPMENT_OPTIONS.map((o) => (
            <Chip key={o.value} testID={`equip-${o.value}`} label={o.label} on={equipment.includes(o.value)} onPress={() => toggleEquipment(o.value)} />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Tiempo (min)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" }}>
          {TIME_OPTIONS.map((t) => (
            <Chip
              key={t}
              testID={`time-${t}`}
              label={String(t)}
              on={!customOn && minutes === t}
              onPress={() => { setCustomMinutes(""); setMinutes(t); }}
            />
          ))}
          <TextInput
            testID="time-custom"
            value={customMinutes}
            onChangeText={setCustomMinutes}
            placeholder="Otro"
            keyboardType="number-pad"
            style={{
              minWidth: 64, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
              borderRadius: radius.pill, borderWidth: 1,
              borderColor: customOn ? colors.accent : colors.border, color: colors.text,
            }}
          />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Notas para hoy (opcional)</Text>
        <TextInput
          testID="oneoff-notes"
          value={notes}
          onChangeText={setNotes}
          maxLength={500}
          placeholder="ej: me duele la cintura, no puedo hacer burpees"
          multiline
          style={{
            minHeight: 64, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1,
            borderColor: colors.border, color: colors.text, textAlignVertical: "top",
          }}
        />
      </View>

      <Pressable
        testID="generar-puntual"
        disabled={focus.length === 0 || loading}
        onPress={onGenerate}
        style={{
          backgroundColor: focus.length === 0 || loading ? colors.border : colors.accent,
          borderRadius: radius.sm,
          padding: spacing.md,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff" }}>Generar entreno</Text>
      </Pressable>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  );
}
