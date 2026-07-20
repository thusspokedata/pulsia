import { View, Text } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";
import { fmtDuration } from "../cardio/activityFormat";

interface Props {
  name: string;
  range: string;
  seconds: number;
  maxSeconds: number;
}

// Fila de una zona de FC: nombre + rango de ppm arriba, barra proporcional al tiempo pasado en
// esa zona abajo (con el tiempo en m:ss al lado). Si ninguna zona tiene segundos (maxSeconds=0)
// el llamador debe evitar dividir por cero — acá simplemente no se pinta ancho.
export function HrZoneBar({ name, range, seconds, maxSeconds }: Props) {
  const pct = maxSeconds === 0 ? 0 : Math.min(100, (seconds / maxSeconds) * 100);
  return (
    <View testID={`zone-${name}`} style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{range}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            flex: 1,
            height: 10,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceMuted,
            overflow: "hidden",
          }}
        >
          <View style={{ width: `${pct}%`, height: "100%", borderRadius: radius.pill, backgroundColor: colors.accent }} />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, minWidth: 36, textAlign: "right" }}>
          {fmtDuration(seconds * 1000)}
        </Text>
      </View>
    </View>
  );
}
