import { View, Text, TextInput } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

export function NotesEditor({
  value,
  onChangeText,
  onBlur,
  editable = true,
  label = "Nota de la sesión",
  placeholder = "Cómo te sentiste, molestias, observaciones…",
}: {
  value: string;
  onChangeText: (t: string) => void;
  onBlur?: () => void;
  editable?: boolean;
  label?: string;
  placeholder?: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <TextInput
        testID="notes-input"
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={1000}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          padding: spacing.sm,
          color: colors.text,
          minHeight: 72,
          textAlignVertical: "top",
        }}
      />
    </View>
  );
}
