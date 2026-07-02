import { View, Text, Pressable } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

interface Option { value: string; label: string; }
interface Props { options: Option[]; value: string; onChange: (v: string) => void; }

export function SegmentToggle({ options, value, onChange }: Props) {
  return (
    <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, overflow: "hidden" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`seg-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: spacing.sm, alignItems: "center", backgroundColor: on ? colors.accent : colors.bg }}
          >
            <Text style={{ color: on ? "#fff" : colors.textMuted, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
