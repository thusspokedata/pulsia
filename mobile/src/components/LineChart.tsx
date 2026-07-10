import { View, Text } from "react-native";
import Svg, { Path, Circle, Text as SvgText } from "react-native-svg";
import { scalePoints, toPath, type XY } from "../session/chart";
import { colors, spacing } from "../theme/tokens";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function LineChart({ data, height = 160, unit = "" }: { data: XY[]; height?: number; unit?: string }) {
  const width = 320;
  if (data.length === 0) {
    return <Text style={{ color: colors.textMuted, padding: spacing.md }}>Sin datos todavía.</Text>;
  }
  const pts = scalePoints(data, { width, height, padding: 16 });
  // Etiquetas del eje Y (mín/máx del dato) con `unit`, para poder leer la escala de la curva.
  const ys = data.map((d) => d.y);
  const maxY = Math.max(...ys);
  const minY = Math.min(...ys);
  const suffix = unit ? ` ${unit}` : "";
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={toPath(pts)} stroke={colors.accent} strokeWidth={2} fill="none" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.accent} />
        ))}
        <SvgText testID="linechart-max" x={width - 2} y={12} fontSize={11} fill={colors.textMuted} textAnchor="end">
          {`${fmt(maxY)}${suffix}`}
        </SvgText>
        {maxY !== minY ? (
          <SvgText testID="linechart-min" x={width - 2} y={height - 4} fontSize={11} fill={colors.textMuted} textAnchor="end">
            {`${fmt(minY)}${suffix}`}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}
