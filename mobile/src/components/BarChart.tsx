import { View, Text } from "react-native";
import Svg, { Rect, Line } from "react-native-svg";
import { colors, spacing } from "../theme/tokens";
import type { DailyMinutes } from "../session/weeklyBars";

const WEEKDAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

// Barras verticales para una serie diaria (p.ej. últimas 4 semanas). Reusa la
// idea de viewBox responsive de chart.ts, pero acá el eje X es categórico
// (un día = una barra), no continuo.
export function BarChart({ data, height = 140 }: { data: DailyMinutes[]; height?: number }) {
  if (data.length === 0) {
    return <Text style={{ color: colors.textMuted, padding: spacing.md }}>Sin datos todavía.</Text>;
  }

  const width = Math.max(320, data.length * 12);
  const padding = 16;
  const maxMinutes = Math.max(1, ...data.map((d) => d.minutes));
  const innerW = width - padding * 2;
  const innerH = height - padding * 2 - 14; // deja lugar a los ticks de día abajo
  const barGap = 2;
  const barWidth = Math.max(2, innerW / data.length - barGap);

  return (
    <View>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.xs }}>
        Máx: {Math.round(maxMinutes)} min
      </Text>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line
          x1={padding}
          y1={padding + innerH}
          x2={width - padding}
          y2={padding + innerH}
          stroke={colors.border}
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const barHeight = maxMinutes > 0 ? (d.minutes / maxMinutes) * innerH : 0;
          const x = padding + i * (innerW / data.length);
          const y = padding + innerH - barHeight;
          return (
            <Rect
              key={d.date}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(0, barHeight)}
              rx={2}
              fill={colors.accent}
              opacity={d.minutes > 0 ? 1 : 0.15}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: padding }}>
        {data.map((d, i) =>
          i % 7 === 0 ? (
            <Text key={d.date} style={{ color: colors.textMuted, fontSize: 10 }}>
              {WEEKDAY_LABELS[new Date(d.date + "T00:00:00").getDay()]}
            </Text>
          ) : null
        )}
      </View>
    </View>
  );
}
