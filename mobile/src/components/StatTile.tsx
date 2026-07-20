import { View, Text } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

interface Props {
  label: string;
  value: string;
  unit?: string;
}

// Tile de una sola métrica: label chico arriba, valor grande abajo con la unidad al lado.
// Mismo idioma visual que Metric en SessionSummary, pero exportado como componente propio
// para que la pantalla de detalle de cardio lo reuse con buildTiles().
export function StatTile({ label, value, unit }: Props) {
  return (
    <View
      testID={`tile-${label}`}
      style={{
        flexGrow: 1,
        flexBasis: "30%",
        minWidth: 90,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 2,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>{value}</Text>
        {unit ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{unit}</Text> : null}
      </View>
    </View>
  );
}
