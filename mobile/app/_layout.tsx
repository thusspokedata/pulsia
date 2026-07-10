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
