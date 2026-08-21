/*
 * Pulsia — compañero de salud y entrenamiento self-hosted.
 * Copyright (C) 2026 thusspokedata
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { authLanding, NUTRICION_ROUTE } from "../src/auth/landing";
import { colors } from "../src/theme/tokens";
import { setupRestNotifications } from "../src/notifications/setup";
import { getBackendUrl } from "../src/storage/config";
import { syncProfileToBackend } from "../src/profile/syncProfile";
import { useSyncPendingSessions } from "../src/sync/useSyncPendingSessions";

const queryClient = new QueryClient();

function Guarded() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Marca si ya hicimos el aterrizaje inicial en esta corrida. Tras el primer landing dejamos de
  // redirigir, así el `replace("/")` de otros flujos (fin de sesión, generar programa) puede volver
  // a Programa sin que lo pisemos hacia Nutrición. Ver src/auth/landing.ts.
  const landedRef = useRef(false);

  // Re-sincroniza sesiones pendientes al abrir/enfocar la app cuando hay sesión (SES-1).
  useSyncPendingSessions(status === "in");

  useEffect(() => {
    const inAuth = segments[0] === "login" || segments[0] === "registro";
    const to = authLanding({ status, inAuth, alreadyLanded: landedRef.current });
    if (!to) return;
    if (to === NUTRICION_ROUTE) landedRef.current = true;
    router.replace(to);
  }, [status, segments, router]);

  // Backfill best-effort del perfil al autenticarse: si el backend no tiene perfil pero el
  // dispositivo sí, lo sube (ver src/profile/syncProfile.ts). No bloquea el render.
  useEffect(() => {
    if (status !== "in") return;
    (async () => {
      try {
        const url = await getBackendUrl();
        if (url) void syncProfileToBackend(url);
      } catch {
        /* sin backend configurado: no hay nada que sincronizar */
      }
    })();
  }, [status]);

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="registro" options={{ headerShown: true, title: "Crear cuenta" }} />
      <Stack.Screen name="configuracion" options={{ headerShown: true, title: "Configuración", presentation: "modal" }} />
      <Stack.Screen name="sesion" options={{ headerShown: true, title: "Entrenamiento" }} />
      <Stack.Screen name="ejercicios" options={{ headerShown: true, title: "Ejercicios" }} />
      {/*
       * Modal a propósito, no por estética: con `presentation: "modal"` la pantalla de sesión
       * queda montada abajo en el stack y NO se desmonta. Esta app arrastra dos bugs caros de
       * atribución de tiempo al remontar la sesión (#145) y con las pausas mid-serie (#147);
       * sacar al usuario de `sesion.tsx` con una serie abierta los reabriría.
       */}
      <Stack.Screen
        name="ejercicio/[catalogId]"
        options={{ headerShown: true, presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void setupRestNotifications();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <Guarded />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
