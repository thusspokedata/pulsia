import { View, Text, ScrollView, Pressable } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { availableYears, buildYearHeatmap, type HeatmapCell } from "../session/heatmap";
import { colors, radius, spacing } from "../theme/tokens";

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;

// 4 tonos de acento (level 1→4) + un gris muy claro para level 0 / celdas vacías.
const LEVEL_COLORS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: colors.border,
  1: "#F0B79A",
  2: "#E68A5C",
  3: colors.accent,
  4: "#993C1D",
};

function cellColor(cell: HeatmapCell): string {
  if (!cell.inYear) return "transparent";
  return LEVEL_COLORS[cell.level];
}

interface Props {
  sessions: { startedAt: number; totalDurationMs: number | null }[];
  year: number;
  onSelectYear: (year: number) => void;
}

export function YearHeatmap({ sessions, year, onSelectYear }: Props) {
  const years = availableYears(sessions);

  if (years.length === 0) {
    return <Text style={{ color: colors.textMuted, padding: spacing.md }}>Todavía no hay entrenamientos registrados.</Text>;
  }

  const { weeks } = buildYearHeatmap(sessions, year);
  const width = weeks.length * STEP;
  const height = 7 * STEP;

  return (
    <View style={{ gap: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {years.map((y) => {
          const on = y === year;
          return (
            <Pressable
              key={y}
              testID={`heatmap-year-${y}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onSelectYear(y)}
              style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: on ? colors.accent : colors.surface }}
            >
              <Text style={{ color: on ? "#fff" : colors.text, fontSize: 13 }}>{y}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {weeks.map((week, col) =>
            week.map((cell, row) => (
              <Rect
                key={cell.date + row}
                x={col * STEP}
                y={row * STEP}
                width={CELL}
                height={CELL}
                rx={3}
                fill={cellColor(cell)}
              />
            ))
          )}
        </Svg>
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>menos</Text>
        {([0, 1, 2, 3, 4] as const).map((lvl) => (
          <View key={lvl} style={{ width: CELL, height: CELL, borderRadius: 3, backgroundColor: LEVEL_COLORS[lvl] }} />
        ))}
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>más</Text>
      </View>
    </View>
  );
}
