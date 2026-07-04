import { useCallback, useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { WorkoutSession } from "@pulsia/shared";
import { getActiveSession } from "../storage/activeSession";
import { colors, radius, spacing } from "../theme/tokens";

// Formato mm:ss (duplicado local, como en otras pantallas).
function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Banner global de "sesión en curso": visible en todas las tabs. Al montar/enfocar lee la
// sesión activa; si hay, muestra el tiempo corriendo (tick 1s) y navega a /sesion al tocarlo.
export function SessionIndicator() {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Re-leer la sesión activa cada vez que la pantalla toma foco (empezar/terminar la cambian).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getActiveSession().then((s) => {
        if (active) setSession(s);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!session) return null;

  return (
    <Pressable
      testID="session-indicator"
      onPress={() => router.push("/sesion")}
      style={{ backgroundColor: colors.accentSoft, padding: spacing.sm, borderRadius: radius.sm, margin: spacing.sm }}
    >
      <Text style={{ color: colors.accentText, fontSize: 13, textAlign: "center" }}>
        ⏱ Entrenamiento en curso — {fmt(nowMs - session.startedAt)}
      </Text>
    </Pressable>
  );
}
