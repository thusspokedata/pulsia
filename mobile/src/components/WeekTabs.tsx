import { ScrollView, Text, Pressable } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

interface Props { weeks: number[]; selected: number; onSelect: (w: number) => void; }

export function WeekTabs({ weeks, selected, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {weeks.map((w) => {
        const on = w === selected;
        return (
          <Pressable
            key={w}
            testID={`week-${w}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(w)}
            style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: on ? colors.accent : colors.surface }}
          >
            <Text style={{ color: on ? "#fff" : colors.text, fontSize: 13 }}>Semana {w}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
