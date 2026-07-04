import { View, Text } from "react-native";
import Body, { type ExtendedBodyPart } from "react-native-body-highlighter";
import { buildBodyData } from "../session/muscleMap";
import { colors, radius, spacing } from "../theme/tokens";

const SECONDARY_COLOR = "#F0B79A"; // coral suave (secundarios)
const DEFAULT_FILL = colors.border; // gris (untargeted)

// Silueta frente + espalda que resalta los músculos trabajados (spec C3).
// intensity 1 → colors[0] (primary, acento coral); intensity 2 → colors[1] (secondary, coral suave).
export function MuscleMap({ primary, secondary }: { primary: string[]; secondary: string[] }) {
  const { data, hasFullBody } = buildBodyData(primary, secondary);
  const bodyColors = [colors.accent, SECONDARY_COLOR];
  // MUSCLE_MAP sólo produce slugs válidos del union Slug de la lib.
  const bodyData = data as ExtendedBodyPart[];

  return (
    <View testID="muscle-map" style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.lg }}>
        <Body
          data={bodyData}
          side="front"
          colors={bodyColors}
          defaultFill={DEFAULT_FILL}
          border="none"
          scale={1.3}
        />
        <Body
          data={bodyData}
          side="back"
          colors={bodyColors}
          defaultFill={DEFAULT_FILL}
          border="none"
          scale={1.3}
        />
      </View>

      {/* Leyenda */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Primarios</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SECONDARY_COLOR }} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Secundarios</Text>
        </View>
      </View>

      {hasFullBody ? (
        <View style={{ alignSelf: "center" }}>
          <Text
            testID="muscle-map-fullbody"
            style={{
              color: colors.accentText,
              backgroundColor: colors.accentSoft,
              fontSize: 12,
              fontWeight: "600",
              borderRadius: radius.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              overflow: "hidden",
            }}
          >
            Cuerpo completo
          </Text>
        </View>
      ) : null}
    </View>
  );
}
