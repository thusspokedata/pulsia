import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { CatalogExercise } from "@pulsia/shared";
import { exerciseNameEs, hasExerciseMedia } from "@pulsia/shared";
import { colors, spacing } from "../theme/tokens";

interface Props {
  alternativas: CatalogExercise[];
  /** catalogId de la alternativa ya elegida, o null. */
  elegido: string | null;
  onPick: (catalogId: string, garminName: string) => void;
}

/**
 * Lista de alternativas del cambio de ejercicio, extraída de `sesion.tsx` para poder montarla
 * aislada en los tests.
 *
 * Cada fila tiene DOS zonas táctiles HERMANAS, no anidadas: elegir la alternativa y mirar la
 * demostración. React Native resuelve el toque por negociación de responder, no por bubbling
 * como el DOM, así que `stopPropagation()` sobre un Pressable anidado NO garantizaría que el
 * padre no reciba el gesto — y acá la consecuencia es real: mirar el dibujo no debe cambiarte
 * el ejercicio de la sesión. La estructura de hermanos lo hace imposible por construcción.
 */
export function AlternativasPicker({ alternativas, elegido, onPick }: Props) {
  if (alternativas.length === 0) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        No hay alternativas con tu equipo — podés saltar el ejercicio.
      </Text>
    );
  }

  return (
    <>
      {alternativas.map((e) => (
        <View
          key={e.id}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs }}
        >
          {/* zona 1: elegir la alternativa */}
          <Pressable testID={`alt-${e.id}`} style={{ flex: 1 }} onPress={() => onPick(e.id, e.garminName)}>
            <Text style={{ color: elegido === e.id ? colors.accent : colors.text, fontSize: 14 }}>
              {exerciseNameEs(e.id) ?? e.garminName}
            </Text>
          </Pressable>

          {/* zona 2: mirar la demostración. Hermano, NO hijo: no hay gesto que negociar. */}
          {hasExerciseMedia(e.id) && (
            <Pressable testID={`alt-ver-${e.id}`} hitSlop={8} onPress={() => router.push(`/ejercicio/${e.id}`)}>
              <Text style={{ color: colors.accent, fontSize: 15 }}>👁</Text>
            </Pressable>
          )}
        </View>
      ))}
    </>
  );
}
