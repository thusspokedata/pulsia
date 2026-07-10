import { Tabs, router } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../src/theme/tokens";
import { SessionIndicator } from "../../src/components/SessionIndicator";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
      <SessionIndicator />
      <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, headerShown: true, headerStatusBarHeight: 0 }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Programa",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "barbell" : "barbell-outline"} size={size} color={color} />
          ),
          headerRight: () => (
            <Pressable onPress={() => router.push("/configuracion")} style={{ paddingHorizontal: 12 }}>
              <Ionicons name="settings-outline" size={22} color={colors.accent} />
            </Pressable>
          ),
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
