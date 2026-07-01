import { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { router } from "expo-router";
import { getBackendUrl } from "../src/storage/config";
import { getProfile } from "../src/storage/profile";
import { setStoredProgram } from "../src/storage/program";
import { generateProgram, GenerationError } from "../src/api/programs";
import { colors, radius, spacing } from "../src/theme/tokens";

const MESSAGES = [
  "Analizando tu perfil…",
  "Eligiendo ejercicios…",
  "Armando la progresión…",
  "Ajustando cargas y descansos…",
];

export default function GenerandoScreen() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [error, setError] = useState<GenerationError | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setMsgIndex((i) => (i + 1) % MESSAGES.length), 2500);
    return () => clearInterval(t);
  }, []);

  async function run() {
    setError(null);
    const [url, profile] = await Promise.all([getBackendUrl(), getProfile()]);
    if (!url) { setError(new GenerationError("network", "Configurá la URL del backend.")); return; }
    if (!profile) { setError(new GenerationError("invalid", "Completá tu perfil primero.")); return; }
    try {
      const { program } = await generateProgram(url, profile);
      await setStoredProgram(program);
      router.replace("/");
    } catch (e) {
      setError(e instanceof GenerationError ? e : new GenerationError("network", "Error inesperado."));
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, []);

  if (error) {
    const goConfig = error.code === "noApiKey";
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg, justifyContent: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "500", color: colors.text }}>No se pudo generar</Text>
        <Text style={{ color: colors.textMuted }}>{error.message}</Text>
        <Pressable
          style={{ backgroundColor: colors.accent, borderRadius: radius.sm, padding: spacing.md, alignItems: "center" }}
          onPress={() => (goConfig ? router.replace("/configuracion") : run())}
        >
          <Text style={{ color: "#fff" }}>{goConfig ? "Cargá tu API key en Configuración" : "Reintentar"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ fontSize: 16, color: colors.text }}>{MESSAGES[msgIndex]}</Text>
      <Text style={{ color: colors.textMuted, textAlign: "center" }}>Esto puede tardar hasta un minuto.</Text>
    </View>
  );
}
