import { View, Text } from "react-native";
import type { FoodSource } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";

// De dónde salió el dato nutricional de un alimento.
//
// "etiqueta" = la IA leyó una tabla nutricional de una foto. "estimado" = TODO lo demás: la IA
// estimando de memoria, o el usuario cargándolo a mano (el formulario arranca en "estimate" y no
// hay control para cambiarlo). La app no puede distinguir esos dos casos — no vio la etiqueta —,
// así que el chip afirma solo lo que el dato respalda: que NO se verificó contra una etiqueta.
// Decir "lo estimó la IA" sería mentira para el alimento que el usuario copió de un envase real.
//
// No usa `warning`: un estimado no es un error ni un exceso, y el ámbar ya significa "te pasaste
// de un límite" en el resto de la app.
export function SourceChip({ source }: { source: FoodSource }) {
  const isLabel = source === "label";
  return (
    <View
      testID={`source-chip-${source}`}
      style={{
        backgroundColor: isLabel ? colors.accentSoft : colors.surfaceMuted,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: isLabel ? colors.accentText : colors.textMuted, fontSize: 11 }}>
        {isLabel ? "etiqueta" : "estimado"}
      </Text>
    </View>
  );
}
