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
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { colors } from "../src/theme/tokens";
import { setupRestNotifications } from "../src/notifications/setup";

const queryClient = new QueryClient();

function Guarded() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const inAuth = segments[0] === "login" || segments[0] === "registro";
    if (status === "out" && !inAuth) router.replace("/login");
    else if (status === "in" && inAuth) router.replace("/");
  }, [status, segments, router]);

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
