import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList } from "react-native";
import { router, Stack } from "expo-router";
import { EXERCISE_CATALOG, exerciseNameEs, hasExerciseMedia } from "@pulsia/shared";
import { colors, spacing, radius } from "../src/theme/tokens";

// Sin acentos ni mayúsculas: "prensa" encuentra "Prensa", y "biceps" encuentra "bíceps".
// Los diacríticos van como \u0300-\u036f y NO como caracteres literales: un editor que
// re-normalice el archivo a NFC rompería el rango en silencio.
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function EjerciciosScreen() {
  const [q, setQ] = useState("");

  const filas = useMemo(
    () =>
      EXERCISE_CATALOG.map((e) => ({
        id: e.id,
        es: exerciseNameEs(e.id) ?? e.garminName,
        en: e.garminName,
        musculo: e.primaryMuscles[0],
        media: hasExerciseMedia(e.id),
      })),
    [],
  );

  const visibles = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return filas;
    // Matchea en español Y en inglés: el nombre inglés sirve para buscarlo en el reloj.
    return filas.filter((f) => norm(f.es).includes(t) || norm(f.en).includes(t));
  }, [filas, q]);

  return (
    <>
      <Stack.Screen options={{ title: "Ejercicios" }} />
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm }}>
        <TextInput
          placeholder="Buscar ejercicio"
          placeholderTextColor={colors.textMuted}
          value={q}
          onChangeText={setQ}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.sm,
            padding: spacing.sm,
            color: colors.text,
          }}
        />
        <FlatList
          data={visibles}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => (
            // Acá la fila navega SIEMPRE, tenga o no animación: el buscador también sirve para
            // explorar el catálogo. Es la única pantalla donde el acceso no es condicional.
            // El chevron marca cuáles además tienen demostración.
            <Pressable
              testID={`fila-${item.id}`}
              onPress={() => router.push(`/ejercicio/${item.id}`)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                backgroundColor: colors.surface,
                borderRadius: radius.sm,
                padding: spacing.sm,
                marginBottom: spacing.xs,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{item.es}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.musculo}</Text>
              </View>
              {item.media && <Text style={{ color: colors.accent, fontSize: 16 }}>›</Text>}
            </Pressable>
          )}
        />
      </View>
    </>
  );
}
