import { View, Text } from "react-native";
import type { SourceMacros, SourceMicros } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";

// De dónde salió el dato nutricional de un alimento. Son DOS procedencias distintas y hay que
// decir las dos, porque un mismo alimento puede tener los macros de una etiqueta y las vitaminas
// de la base de composición de USDA.
//
//   sourceMacros: "label"  = la IA leyó una tabla nutricional de una foto
//                 "ai"     = la IA lo estimó de memoria
//                 "manual" = lo cargó el usuario a mano
//                 "usda"   = los macros salieron de la base de composición de USDA (seed del
//                            catálogo base) → fuente real, se destaca igual que "etiqueta"
//                 "recipe" = macros compuestos desde los ingredientes de una receta → chip "receta"
//   sourceMicros: "usda"   = las vitaminas y minerales salieron de la base de USDA
//                 "ai"     = las estimó el modelo → chip "micros IA", sin destacar (es una
//                            estimación, no un dato de laboratorio)
//                 null     = no hubo match: el bloque quedó vacío, y no hay nada que anunciar
//
// El chip de macros antes decía "estimado" para todo lo que no fuera etiqueta, porque el dato
// guardado era un único `source` con el valor "estimate" y la app NO podía distinguir a la IA del
// usuario cargando a mano. Ahora el schema separa `ai` de `manual`, así que el chip puede afirmar
// cuál de los dos fue sin inventar nada.
//
// No usa `warning`: un estimado no es un error ni un exceso, y el ámbar ya significa "te pasaste
// de un límite" en el resto de la app.
const MACROS_LABEL: Record<SourceMacros, string> = {
  label: "etiqueta",
  ai: "estimado",
  manual: "a mano",
  usda: "USDA",
  recipe: "receta",
};

// Los macros de una fuente real (una etiqueta leída, o la base de USDA) se destacan; los estimados
// (ai) o tipeados a mano, no.
const MACROS_STRONG: Record<SourceMacros, boolean> = {
  label: true,
  usda: true,
  ai: false,
  manual: false,
  recipe: true,
};

function Chip({ text, strong, testID }: { text: string; strong: boolean; testID: string }) {
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: strong ? colors.accentSoft : colors.surfaceMuted,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: strong ? colors.accentText : colors.textMuted, fontSize: 11 }}>{text}</Text>
    </View>
  );
}

export function SourceChip({
  sourceMacros,
  sourceMicros,
}: {
  sourceMacros: SourceMacros;
  sourceMicros?: SourceMicros;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 0 }}>
      {/* El destacado (accent) es para el dato que viene de una fuente real y no de una
          estimación: una etiqueta leída, o la tabla de composición de USDA. */}
      <Chip
        text={MACROS_LABEL[sourceMacros]}
        strong={MACROS_STRONG[sourceMacros]}
        testID={`source-chip-${sourceMacros}`}
      />
      {sourceMicros === "usda" && <Chip text="USDA" strong testID="source-chip-micros-usda" />}
      {sourceMicros === "ai" && <Chip text="micros IA" strong={false} testID="source-chip-micros-ai" />}
    </View>
  );
}
