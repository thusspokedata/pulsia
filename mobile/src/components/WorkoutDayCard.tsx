import { View, Text, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { Workout } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";

interface Props { workout: Workout; }

export function WorkoutDayCard({ workout }: Props) {
  async function copy() {
    await Clipboard.setStringAsync(workout.exercises.map((e) => e.garminName).join("\n"));
  }
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>{workout.dayLabel}</Text>
        <Pressable onPress={copy} style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}>
          <Text style={{ color: colors.accentText, fontSize: 12 }}>Copiar a Garmin</Text>
        </Pressable>
      </View>
      {workout.exercises.map((e, i) => (
        <View key={`${e.catalogId}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs }}>
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: spacing.sm, minWidth: 56, alignItems: "center" }}>
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "500" }}>{e.sets} × {e.reps}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>{e.garminName}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{e.targetLoad} · descanso {e.restSeconds}s</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
