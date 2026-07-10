import { View, Text } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { scalePoints, toPath, type XY } from "../session/chart";
import { colors, spacing } from "../theme/tokens";

export function LineChart({ data, height = 160, unit = "" }: { data: XY[]; height?: number; unit?: string }) {
  const width = 320;
  if (data.length === 0) {
    return <Text style={{ color: colors.textMuted, padding: spacing.md }}>Sin datos todavía.</Text>;
  }
  const pts = scalePoints(data, { width, height, padding: 16 });
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={toPath(pts)} stroke={colors.accent} strokeWidth={2} fill="none" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.accent} />
        ))}
      </Svg>
    </View>
  );
}
