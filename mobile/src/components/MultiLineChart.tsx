import { View, Text } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { scaleMultiSeries } from "../session/multiChart";
import { toPath, type XY } from "../session/chart";
import { colors, spacing } from "../theme/tokens";

export interface MultiLineChartSeries {
  label: string;
  color: string;
  unit?: string;
  data: XY[];
}

export function MultiLineChart({ series, height = 160 }: { series: MultiLineChartSeries[]; height?: number }) {
  const width = 320;
  const hasData = series.some((s) => s.data.length > 0);
  if (!hasData) {
    return <Text style={{ color: colors.textMuted, padding: spacing.md }}>Sin datos todavía.</Text>;
  }
  const scaled = scaleMultiSeries(
    series.map((s) => ({ points: s.data })),
    { width, height, padding: 16 },
  );
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {scaled.map((s, i) => (
          <Path key={`path-${i}`} d={toPath(s.points)} stroke={series[i].color} strokeWidth={2} fill="none" />
        ))}
        {scaled.map((s, i) =>
          s.points.map((p, j) => <Circle key={`pt-${i}-${j}`} cx={p.x} cy={p.y} r={3} fill={series[i].color} />),
        )}
      </Svg>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs }}>
        {series.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
