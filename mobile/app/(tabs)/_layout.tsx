import { Tabs, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isTrainingEnabled } from "@pulsia/shared";
import { colors } from "../../src/theme/tokens";
import { SessionIndicator } from "../../src/components/SessionIndicator";
import { getProfile } from "../../src/storage/profile";

// Atajo a Configuración (backend + API key). Vive en el header de "Programa"; cuando el usuario
// está en modo "solo seguimiento" esa tab se oculta, así que lo movemos al header de "Progreso"
// para no dejarlo sin acceso.
function SettingsGear() {
  return (
    <Pressable onPress={() => router.push("/configuracion")} style={{ paddingHorizontal: 12 }}>
      <Ionicons name="settings-outline" size={22} color={colors.accent} />
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // null = todavía leyendo el perfil. Gateamos el render para fijar bien initialRouteName (si el
  // entrenamiento está apagado, la tab "Programa" no existe y hay que aterrizar en "Progreso").
  const [training, setTraining] = useState<boolean | null>(null);
  useEffect(() => {
    getProfile().then((p) => setTraining(p ? isTrainingEnabled(p) : true)).catch(() => setTraining(true));
  }, []);

  if (training === null) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
      <SessionIndicator />
      <Tabs
        initialRouteName={training ? "index" : "progreso"}
        screenOptions={{ tabBarActiveTintColor: colors.accent, headerShown: true, headerStatusBarHeight: 0 }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: "Programa",
          // Modo "solo seguimiento": se oculta la tab de entrenamiento (y con ella el acceso al
          // entreno puntual, que se abre desde esta pantalla).
          href: training ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "barbell" : "barbell-outline"} size={size} color={color} />
          ),
          headerRight: () => <SettingsGear />,
        }}
      />
      <Tabs.Screen
        name="historial"
        options={{
          title: "Historial",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "time" : "time-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progreso"
        options={{
          title: "Progreso",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "trending-up" : "trending-up-outline"} size={size} color={color} />
          ),
          // Sin plan, la tab "Programa" no está: el engranaje de Configuración viene acá.
          headerRight: training ? undefined : () => <SettingsGear />,
        }}
      />
      <Tabs.Screen
        name="nutricion"
        options={{
          title: "Nutrición",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "restaurant" : "restaurant-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
          ),
        }}
      />
      </Tabs>
    </View>
  );
}
