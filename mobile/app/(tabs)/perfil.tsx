import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { TrainingProfileSchema, type TrainingProfile } from "@pulsia/shared";
import { getProfile, setProfile } from "../../src/storage/profile";
import { getBackendUrl } from "../../src/storage/config";
import { getLatestMetrics, postReading } from "../../src/api/metrics";
import { weightToRecordOnSave } from "../../src/profile/weightMeasurement";
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
const SEX = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Femenino" },
  { value: "other", label: "Otro" },
  { value: "prefer_not_to_say", label: "Prefiero no decir" },
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
  const [sex, setSex] = useState<string | undefined>(undefined);
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
  // El peso es fuente única: se muestra la última medición del backend. Guardamos el valor
  // cargado para detectar si el usuario lo editó (y recién ahí registrar una medición nueva).
  const backendUrl = useRef<string | null>(null);
  const loadedWeight = useRef<string>("");

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      if (p) {
        setExperience(p.experience);
        setGoal(p.goal);
        setSex(p.sex);
        setDaysPerWeek(String(p.daysPerWeek));
        setSessionMinutes(String(p.sessionMinutes));
        setAge(p.age != null ? String(p.age) : "");
        setHeightCm(p.heightCm != null ? String(p.heightCm) : "");
        setGymEquipment(p.gymEquipment);
        setHomeEquipment(p.homeEquipment);
        setLimitations(p.limitations.join("\n"));
        setSaved(p);
      }
      // Peso: preferimos la última medición weight_kg del backend (misma fuente que "Valores
      // actuales" en Progreso). Fallback al peso del perfil local si no hay backend/medición.
      let weightStr = p?.weightKg != null ? String(p.weightKg) : "";
      try {
        const url = await getBackendUrl();
        backendUrl.current = url;
        if (url) {
          const latest = await getLatestMetrics(url);
          const w = latest.weight_kg?.value;
          if (w != null) weightStr = String(w);
        }
      } catch {
        // offline / sin backend → nos quedamos con el peso local
      }
      setWeightKg(weightStr);
      loadedWeight.current = weightStr;
    })();
  }, []);

  async function onSave() {
    const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));
    const candidate = {
      experience,
      goal,
      sex,
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
      return;
    }
    // Si el peso cambió respecto de lo cargado, registrarlo como medición weight_kg (fuente única).
    // No rompemos el guardado del perfil si esto falla (offline, etc.).
    const url = backendUrl.current;
    const toRecord = weightToRecordOnSave(loadedWeight.current, weightKg);
    if (url && toRecord != null) {
      try {
        await postReading(url, { measuredAt: Date.now(), entries: [{ metricType: "weight_kg", value: toRecord }] });
        loadedWeight.current = String(toRecord);
      } catch {
        setError("Perfil guardado, pero no se pudo registrar la medición de peso.");
      }
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
      <Pressable
        testID="perfil-memoria-link"
        onPress={() => router.push("/memoria")}
        style={{ alignItems: "center", paddingVertical: spacing.sm }}
      >
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>Qué sabe la IA de mí →</Text>
      </Pressable>

      <View><Text style={label}>Experiencia</Text><ChipGroup single options={EXPERIENCE} selected={[experience]} onChange={(v) => setExperience(v[0])} /></View>
      <View><Text style={label}>Objetivo</Text><ChipGroup single options={GOAL} selected={[goal]} onChange={(v) => setGoal(v[0])} /></View>
      <View><Text style={label}>Sexo</Text><ChipGroup single options={SEX} selected={sex ? [sex] : []} onChange={(v) => setSex(v[0])} /></View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Text style={label}>Días/semana</Text><TextInput style={input} keyboardType="number-pad" value={daysPerWeek} onChangeText={setDaysPerWeek} /></View>
        <View style={{ flex: 1 }}><Text style={label}>Min/sesión</Text><TextInput style={input} keyboardType="number-pad" value={sessionMinutes} onChangeText={setSessionMinutes} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Text style={label}>Edad (opc.)</Text><TextInput style={input} keyboardType="number-pad" value={age} onChangeText={setAge} placeholder="años" /></View>
        <View style={{ flex: 1 }}><Text style={label}>Peso actual (última medición)</Text><TextInput style={input} keyboardType="numeric" value={weightKg} onChangeText={setWeightKg} placeholder="kg" /></View>
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
