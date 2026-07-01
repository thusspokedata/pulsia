import { View, Text, Pressable } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

export interface ChipOption {
  value: string;
  label: string;
}

interface Props {
  options: ChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  single?: boolean;
}

export function ChipGroup({ options, selected, onChange, single }: Props) {
  function toggle(value: string) {
    if (single) {
      onChange([value]);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {options.map((o) => {
        const isOn = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            testID={`chip-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            onPress={() => toggle(o.value)}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: isOn ? colors.accent : colors.border,
              backgroundColor: isOn ? colors.accent : colors.bg,
            }}
          >
            <Text style={{ color: isOn ? "#fff" : colors.text, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
