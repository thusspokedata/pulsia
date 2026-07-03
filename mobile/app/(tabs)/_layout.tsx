import { Tabs, router } from "expo-router";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/tokens";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, headerShown: true }}>
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
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
