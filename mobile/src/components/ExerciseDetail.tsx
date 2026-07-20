import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, Animated } from "react-native";
import { getExerciseById, exerciseNameEs, exerciseMediaFor } from "@pulsia/shared";
import { EXERCISE_ASSETS } from "./exerciseAssets";
import { colors, spacing, radius } from "../theme/tokens";

const CICLO_MS = 1200;

export function ExerciseDetail({ catalogId }: { catalogId: string }) {
  const ex = getExerciseById(catalogId);
  const media = exerciseMediaFor(catalogId);
  const [animando, setAnimando] = useState(true);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!media || !animando) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: CICLO_MS / 2, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: CICLO_MS / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [media, animando, fade]);

  if (!ex) {
    return (
      <View style={{ padding: spacing.md }}>
        <Text style={{ color: colors.textMuted }}>Ejercicio no encontrado.</Text>
      </View>
    );
  }

  const es = exerciseNameEs(catalogId) ?? ex.garminName;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
    >
      {media && (
        <Pressable
          testID="exercise-animation"
          onPress={() => setAnimando((v) => !v)}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.md,
            alignItems: "center",
          }}
        >
          <View style={{ width: 240, height: 240 }}>
            <Image
              source={EXERCISE_ASSETS[media.frames[0]]}
              style={{ position: "absolute", width: 240, height: 240, resizeMode: "contain" }}
            />
            <Animated.Image
              source={EXERCISE_ASSETS[media.frames[1]]}
              style={{
                position: "absolute",
                width: 240,
                height: 240,
                resizeMode: "contain",
                opacity: fade,
              }}
            />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.xs }}>
            {animando ? "Tocá para pausar" : "Tocá para animar"}
          </Text>
        </Pressable>
      )}

      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>{es}</Text>
        {es !== ex.garminName && (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{ex.garminName}</Text>
        )}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {[...ex.primaryMuscles, ...ex.secondaryMuscles].map((m, i) => (
          <View
            key={m}
            style={{
              backgroundColor: i < ex.primaryMuscles.length ? colors.accentSoft : colors.surfaceMuted,
              borderRadius: radius.sm,
              paddingVertical: 3,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: i < ex.primaryMuscles.length ? colors.accentText : colors.textMuted,
              }}
            >
              {m}
            </Text>
          </View>
        ))}
      </View>

      {media && media.cues.length > 0 && (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "500" }}>Cómo se hace</Text>
          {media.cues.map((c, i) => (
            <View key={i} style={{ flexDirection: "row", gap: spacing.sm }}>
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>{i + 1}.</Text>
              <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{c}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
