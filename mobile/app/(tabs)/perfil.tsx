import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { TrainingProfileSchema, ageFromBirthDate, isTrainingEnabled, type TrainingProfile } from "@pulsia/shared";
import { getProfile, setProfile } from "../../src/storage/profile";
import { getBackendUrl } from "../../src/storage/config";
import { getLatestMetrics, postReading } from "../../src/api/metrics";
import { putProfile } from "../../src/api/profile";
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
  { value: "recomposition", label: "Recomposición" },
  { value: "general_fitness", label: "Fitness general" },
];
const SEX = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Femenino" },
  { value: "other", label: "Otro" },
  { value: "prefer_not_to_say", label: "Prefiero no decir" },
];
// La descripción explica el MOVIMIENTO DIARIO base (sin contar entrenamientos): es la semilla del
// TDEE, así que elegir bien cambia el gasto estimado (factores 1.2 / 1.375 / 1.55 / 1.725).
const ACTIVITY = [
  { value: "sedentary", label: "Sedentario", desc: "Trabajo sentado y poco movimiento; casi nada de ejercicio." },
  { value: "light", label: "Ligero", desc: "Ejercicio ligero o caminatas 1-3 días por semana." },
  { value: "moderate", label: "Moderado", desc: "Activo la mayoría de los días: ejercicio moderado 3-5 días o trabajo de pie." },
  { value: "active", label: "Activo", desc: "Muy activo: entrenás fuerte 6-7 días o tenés trabajo físico." },
];
// Cuánto se muestra "Datos guardados ✓" antes de auto-ocultarse.
const SAVED_FLASH_MS = 2500;
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
  const [trainingEnabled, setTrainingEnabled] = useState(true);
  const [experience, setExperience] = useState("beginner");
  const [goal, setGoal] = useState("general_fitness");
  const [sex, setSex] = useState<string | undefined>(undefined);
  const [activityLevel, setActivityLevel] = useState<string | undefined>(undefined);
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  const [sessionMinutes, setSessionMinutes] = useState("45");
  const [age, setAge] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [gymEquipment, setGymEquipment] = useState<string[]>([]);
  const [homeEquipment, setHomeEquipment] = useState<string[]>(["bodyweight"]);
  const [limitations, setLimitations] = useState("");
  const [saved, setSaved] = useState<TrainingProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Feedback efímero de "Datos guardados" tras un guardado exitoso (se auto-oculta).
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El peso es fuente única: se muestra la última medición del backend. Guardamos el valor
  // cargado para detectar si el usuario lo editó (y recién ahí registrar una medición nueva).
  const backendUrl = useRef<string | null>(null);
  const loadedWeight = useRef<string>("");
  // Si el usuario ya tocó el campo, no lo pisamos con el valor del backend (el fetch puede
  // tardar hasta 15s y llegar después de que empezó a escribir).
  const weightEdited = useRef(false);

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      if (p) {
        setTrainingEnabled(isTrainingEnabled(p));
        setExperience(p.experience);
        setGoal(p.goal);
        setSex(p.sex);
        setActivityLevel(p.activityLevel);
        // En "solo seguimiento" days/min quedan undefined; al reactivar el plan hay que caer a los
        // defaults (si no, el input mostraría "undefined" y Number("undefined")=NaN rompe el guardado).
        setDaysPerWeek(p.daysPerWeek != null ? String(p.daysPerWeek) : "3");
        setSessionMinutes(p.sessionMinutes != null ? String(p.sessionMinutes) : "45");
        setAge(p.age != null ? String(p.age) : "");
        setBirthDate(p.birthDate ?? "");
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
      // No pisar lo que el usuario haya escrito mientras el fetch estaba en vuelo.
      if (!weightEdited.current) {
        setWeightKg(weightStr);
        loadedWeight.current = weightStr;
      }
    })();
  }, []);

  // Limpiar el timer del flash si la pantalla se desmonta mientras está visible.
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  function flashSaved() {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
  }

  async function onSave() {
    const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));
    // Con fecha de nacimiento, la edad se deriva de ahí (se mantiene fresca). Si está cargada pero
    // mal formada, cortamos con un error claro en vez de guardar una edad manual desalineada.
    const bd = birthDate.trim();
    const derivedAge = bd ? ageFromBirthDate(bd) : undefined;
    if (bd && derivedAge == null) {
      setError("Fecha de nacimiento inválida. Usá el formato AAAA-MM-DD.");
      return;
    }
    // La edad derivada válida pero fuera del rango del perfil (12–100) daría un error genérico de
    // "días/minutos" al parsear; mejor decir cuál es el problema real.
    if (bd && derivedAge != null && (derivedAge < 12 || derivedAge > 100)) {
      setError("La edad que sale de esa fecha está fuera de rango (12–100 años).");
      return;
    }
    const candidate = {
      experience,
      goal,
      sex,
      activityLevel: activityLevel as TrainingProfile["activityLevel"],
      age: bd ? derivedAge : numOrUndef(age),
      birthDate: bd || undefined,
      weightKg: numOrUndef(weightKg),
      heightCm: numOrUndef(heightCm),
      trainingEnabled,
      // En modo "solo seguimiento" no se pide plan → días/min no aplican.
      daysPerWeek: trainingEnabled ? Number(daysPerWeek) : undefined,
      sessionMinutes: trainingEnabled ? Number(sessionMinutes) : undefined,
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
      flashSaved();
    } catch {
      setError("No se pudo guardar el perfil. Intentá de nuevo.");
      return;
    }
    // Si el peso cambió respecto de lo cargado, registrarlo como medición weight_kg (fuente única).
    // No rompemos el guardado del perfil si esto falla (offline, etc.).
    const url = backendUrl.current;
    // Subir el perfil al backend (fuente de verdad para la web). Best-effort: si el backend
    // está caído no rompemos el guardado local; se reintenta en el próximo arranque via sync.
    if (url) {
      try {
        await putProfile(url, parsed.data);
      } catch {
        /* se sincroniza en el próximo arranque */
      }
    }
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

  // Con fecha de nacimiento cargada, la edad se muestra derivada (read-only) en vez del input manual.
  const birthDateEntered = birthDate.trim() !== "";
  const derivedAgeNow = birthDateEntered ? ageFromBirthDate(birthDate.trim()) : undefined;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <Pressable
        testID="perfil-memoria-link"
        onPress={() => router.push("/memoria")}
        style={{ alignItems: "center", paddingVertical: spacing.sm }}
      >
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>Qué sabe la IA de mí →</Text>
      </Pressable>
      <Pressable
        testID="perfil-objetivo-link"
        onPress={() => router.push("/objetivo-trabajo")}
        style={{ alignItems: "center", paddingVertical: spacing.sm }}
      >
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>Objetivo de trabajo →</Text>
      </Pressable>
      <Pressable
        testID="perfil-plan-trabajo-link"
        onPress={() => router.push("/plan-trabajo")}
        style={{ alignItems: "center", paddingVertical: spacing.sm }}
      >
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>Plan de trabajo (el porqué) →</Text>
      </Pressable>

      <View>
        <Text style={label}>¿Querés que la app arme un plan de entrenamiento?</Text>
        <ChipGroup
          single
          options={[{ value: "yes", label: "Sí, con plan" }, { value: "no", label: "Solo seguimiento" }]}
          selected={[trainingEnabled ? "yes" : "no"]}
          onChange={(v) => setTrainingEnabled(v[0] === "yes")}
        />
        {!trainingEnabled ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.xs }}>
            Sin plan: seguís usando salud, nutrición y actividad. Podés reactivarlo cuando quieras.
          </Text>
        ) : null}
      </View>

      {trainingEnabled ? (
        <>
          <View><Text style={label}>Experiencia</Text><ChipGroup single options={EXPERIENCE} selected={[experience]} onChange={(v) => setExperience(v[0])} /></View>
          <View><Text style={label}>Objetivo</Text><ChipGroup single options={GOAL} selected={[goal]} onChange={(v) => setGoal(v[0])} /></View>
        </>
      ) : null}
      <View><Text style={label}>Sexo</Text><ChipGroup single options={SEX} selected={sex ? [sex] : []} onChange={(v) => setSex(v[0])} /></View>
      <View>
        <Text style={label}>Nivel de actividad (sin contar entrenamientos)</Text>
        <ChipGroup single options={ACTIVITY} selected={activityLevel ? [activityLevel] : []} onChange={(v) => setActivityLevel(v[0])} />
        {activityLevel ? (
          <Text testID="activity-desc" style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.xs }}>
            {ACTIVITY.find((a) => a.value === activityLevel)?.desc}
          </Text>
        ) : null}
      </View>
      {trainingEnabled ? (
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Text style={label}>Días/semana</Text><TextInput testID="perfil-days" style={input} keyboardType="number-pad" value={daysPerWeek} onChangeText={setDaysPerWeek} /></View>
          <View style={{ flex: 1 }}><Text style={label}>Min/sesión</Text><TextInput testID="perfil-minutes" style={input} keyboardType="number-pad" value={sessionMinutes} onChangeText={setSessionMinutes} /></View>
        </View>
      ) : null}
      <View>
        <Text style={label}>Fecha de nacimiento (opc.)</Text>
        <TextInput style={input} value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-DD" autoCapitalize="none" />
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.xs }}>
          Si la cargás, la edad se calcula sola y se mantiene al día.
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={label}>Edad{birthDateEntered ? "" : " (opc.)"}</Text>
          {birthDateEntered ? (
            <Text testID="perfil-derived-age" style={[input, { color: derivedAgeNow != null ? colors.text : colors.textMuted }]}>
              {derivedAgeNow != null ? `${derivedAgeNow} años` : "—"}
            </Text>
          ) : (
            <TextInput style={input} keyboardType="number-pad" value={age} onChangeText={setAge} placeholder="años" />
          )}
        </View>
        <View style={{ flex: 1 }}><Text style={label}>Peso actual (última medición)</Text><TextInput style={input} keyboardType="numeric" value={weightKg} onChangeText={(v) => { weightEdited.current = true; setWeightKg(v); }} placeholder="kg" /></View>
        <View style={{ flex: 1 }}><Text style={label}>Altura cm (opc.)</Text><TextInput style={input} keyboardType="number-pad" value={heightCm} onChangeText={setHeightCm} placeholder="cm" /></View>
      </View>
      {trainingEnabled ? (
        <>
          <View><Text style={label}>Equipamiento gimnasio</Text><ChipGroup options={EQUIPMENT} selected={gymEquipment} onChange={setGymEquipment} /></View>
          <View><Text style={label}>Equipamiento casa</Text><ChipGroup options={EQUIPMENT} selected={homeEquipment} onChange={setHomeEquipment} /></View>
        </>
      ) : null}
      <View><Text style={label}>Limitaciones (una por línea)</Text><TextInput style={[input, { minHeight: 72 }]} multiline value={limitations} onChangeText={setLimitations} placeholder="dolor lumbar leve" /></View>

      {error && <Text style={{ color: colors.accentText }}>{error}</Text>}
      {savedFlash && <Text testID="perfil-saved-flash" accessibilityLiveRegion="polite" style={{ color: colors.accent }}>Datos guardados ✓</Text>}

      <Pressable style={primary} onPress={onSave}><Text style={{ color: "#fff" }}>Guardar perfil</Text></Pressable>

      {saved && trainingEnabled && (
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
