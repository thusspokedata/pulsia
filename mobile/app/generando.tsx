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

interface ScreenError {
  message: string;
  button: string;
  onPress: () => void;
}

export default function GenerandoScreen() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [error, setError] = useState<ScreenError | null>(null);
  const started = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (mounted.current) setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2500);
    return () => clearInterval(t);
  }, []);

  async function run() {
    setError(null);
    const [url, profile] = await Promise.all([getBackendUrl(), getProfile()]);
    if (!mounted.current) return;
    if (!url) {
      setError({ message: "Configurá la URL del backend.", button: "Ir a Configuración", onPress: () => router.replace("/configuracion") });
      return;
    }
    if (!profile) {
      setError({ message: "Completá tu perfil primero.", button: "Ir a Perfil", onPress: () => router.replace("/perfil") });
      return;
    }
    try {
      const { program } = await generateProgram(url, profile);
      if (!mounted.current) return;
      await setStoredProgram(program);
      if (!mounted.current) return;
      router.replace("/");
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof GenerationError && e.code === "noApiKey") {
        setError({ message: e.message, button: "Cargá tu API key en Configuración", onPress: () => router.replace("/configuracion") });
      } else {
        const message = e instanceof GenerationError ? e.message : "Error inesperado.";
        setError({ message, button: "Reintentar", onPress: () => run() });
      }
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg, justifyContent: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "500", color: colors.text }}>No se pudo generar</Text>
        <Text style={{ color: colors.textMuted }}>{error.message}</Text>
        <Pressable
          style={{ backgroundColor: colors.accent, borderRadius: radius.sm, padding: spacing.md, alignItems: "center" }}
          onPress={error.onPress}
        >
          <Text style={{ color: "#fff" }}>{error.button}</Text>
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
