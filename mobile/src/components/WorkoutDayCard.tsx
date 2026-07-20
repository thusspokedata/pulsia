import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { Workout } from "@pulsia/shared";
import { hasExerciseMedia } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";

interface Props { workout: Workout; }

export function WorkoutDayCard({ workout }: Props) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.sm }}>
      <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>{workout.dayLabel}</Text>
      {workout.exercises.map((e, i) => {
        const conMedia = hasExerciseMedia(e.catalogId);
        // El nombre va en INGLÉS a propósito: es el que sirve para buscar el ejercicio en el
        // reloj Garmin. No pasarlo por exerciseNameEs.
        const fila = (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs }}>
            <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: spacing.sm, minWidth: 56, alignItems: "center" }}>
              <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "500" }}>{e.sets} × {e.reps}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{e.garminName}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{e.targetLoad} · descanso {e.restSeconds}s</Text>
            </View>
            {conMedia && <Text style={{ color: colors.accent, fontSize: 16 }}>›</Text>}
          </View>
        );
        // Acceso CONDICIONAL: sin ilustración no hay nada que mostrar, así que no ofrecemos
        // un toque que no lleva a ningún lado.
        return conMedia ? (
          <Pressable key={`${e.catalogId}-${i}`} testID={`ver-${e.catalogId}`} onPress={() => router.push(`/ejercicio/${e.catalogId}`)}>
            {fila}
          </Pressable>
        ) : (
          <View key={`${e.catalogId}-${i}`}>{fila}</View>
        );
      })}
    </View>
  );
}
