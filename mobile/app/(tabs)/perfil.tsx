import { useEffect, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { TrainingProfileSchema, type TrainingProfile } from "@pulsia/shared";
import { getProfile, setProfile } from "../../src/storage/profile";
import { ChipGroup } from "../../src/components/ChipGroup";
import { colors, radius, spacing } from "../../src/theme/tokens";

const EXPERIENCE = [
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzado" },
];
const GOAL = [
  { value: "hypertrophy", label: "Hipertrofia" },
  { value: "strength", label: "Fuerza" },
  { value: "endurance", label: "Resistencia" },
  { value: "fat_loss", label: "Pérdida de grasa" },
  { value: "general_fitness", label: "Fitness general" },
];
const EQUIPMENT = [
  { value: "bodyweight", label: "Peso corporal" },
  { value: "dumbbell", label: "Mancuernas" },
  { value: "barbell", label: "Barra" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "resistance_band", label: "Banda" },
  { value: "pull_up_bar", label: "Barra dominadas" },
  { value: "bench", label: "Banco" },
  { value: "cable_machine", label: "Cable" },
  { value: "machine", label: "Máquina" },
  { value: "trx", label: "TRX" },
];

export default function PerfilScreen() {
  const [experience, setExperience] = useState("beginner");
  const [goal, setGoal] = useState("general_fitness");
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  const [sessionMinutes, setSessionMinutes] = useState("45");
  const [age, setAge] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [gymEquipment, setGymEquipment] = useState<string[]>([]);
  const [homeEquipment, setHomeEquipment] = useState<string[]>(["bodyweight"]);
  const [limitations, setLimitations] = useState("");
  const [saved, setSaved] = useState<TrainingProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      if (!p) return;
      setExperience(p.experience);
      setGoal(p.goal);
      setDaysPerWeek(String(p.daysPerWeek));
      setSessionMinutes(String(p.sessionMinutes));
      setAge(p.age != null ? String(p.age) : "");
      setWeightKg(p.weightKg != null ? String(p.weightKg) : "");
      setHeightCm(p.heightCm != null ? String(p.heightCm) : "");
      setGymEquipment(p.gymEquipment);
      setHomeEquipment(p.homeEquipment);
      setLimitations(p.limitations.join("\n"));
      setSaved(p);
    });
  }, []);

  async function onSave() {
    const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));
    const candidate = {
      experience,
      goal,
      age: numOrUndef(age),
      weightKg: numOrUndef(weightKg),
      heightCm: numOrUndef(heightCm),
      daysPerWeek: Number(daysPerWeek),
      sessionMinutes: Number(sessionMinutes),
      gymEquipment,
      homeEquipment,
      limitations: limitations.split("\n").map((l) => l.trim()).filter(Boolean),
    };
    const parsed = TrainingProfileSchema.safeParse(candidate);
    if (!parsed.success) {
      setError("Revisá los datos: días 1-7, minutos 15-180.");
      return;
    }
    try {
      await setProfile(parsed.data);
      setSaved(parsed.data);
      setError(null);
    } catch {
      setError("No se pudo guardar el perfil. Intentá de nuevo.");
    }
  }

  const label = { color: colors.textMuted, marginBottom: spacing.xs } as const;
  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md, color: colors.text, backgroundColor: colors.bg,
  } as const;
  const primary = {
    backgroundColor: colors.accent, borderRadius: radius.sm, padding: spacing.md, alignItems: "center",
  } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <View><Text style={label}>Experiencia</Text><ChipGroup single options={EXPERIENCE} selected={[experience]} onChange={(v) => setExperience(v[0])} /></View>
      <View><Text style={label}>Objetivo</Text><ChipGroup single options={GOAL} selected={[goal]} onChange={(v) => setGoal(v[0])} /></View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Text style={label}>Días/semana</Text><TextInput style={input} keyboardType="number-pad" value={daysPerWeek} onChangeText={setDaysPerWeek} /></View>
        <View style={{ flex: 1 }}><Text style={label}>Min/sesión</Text><TextInput style={input} keyboardType="number-pad" value={sessionMinutes} onChangeText={setSessionMinutes} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Text style={label}>Edad (opc.)</Text><TextInput style={input} keyboardType="number-pad" value={age} onChangeText={setAge} placeholder="años" /></View>
        <View style={{ flex: 1 }}><Text style={label}>Peso kg (opc.)</Text><TextInput style={input} keyboardType="numeric" value={weightKg} onChangeText={setWeightKg} placeholder="kg" /></View>
        <View style={{ flex: 1 }}><Text style={label}>Altura cm (opc.)</Text><TextInput style={input} keyboardType="number-pad" value={heightCm} onChangeText={setHeightCm} placeholder="cm" /></View>
      </View>
      <View><Text style={label}>Equipamiento gimnasio</Text><ChipGroup options={EQUIPMENT} selected={gymEquipment} onChange={setGymEquipment} /></View>
      <View><Text style={label}>Equipamiento casa</Text><ChipGroup options={EQUIPMENT} selected={homeEquipment} onChange={setHomeEquipment} /></View>
      <View><Text style={label}>Limitaciones (una por línea)</Text><TextInput style={[input, { minHeight: 72 }]} multiline value={limitations} onChangeText={setLimitations} placeholder="dolor lumbar leve" /></View>

      {error && <Text style={{ color: colors.accentText }}>{error}</Text>}

      <Pressable style={primary} onPress={onSave}><Text style={{ color: "#fff" }}>Guardar perfil</Text></Pressable>

      {saved && (
        <Pressable
          style={[primary, { backgroundColor: colors.accentSoft }]}
          onPress={() => router.push("/generando")}
        >
          <Text style={{ color: colors.accentText }}>Generar programa</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
