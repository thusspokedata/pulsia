import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

export function NotesEditor({
  value,
  onChangeText,
  onBlur,
  onSave,
  editable = true,
  label = "Nota de la sesión",
  placeholder = "Cómo te sentiste, molestias, observaciones…",
}: {
  value: string;
  onChangeText: (t: string) => void;
  onBlur?: () => void;
  onSave?: () => Promise<void> | void;
  editable?: boolean;
  label?: string;
  placeholder?: string;
}) {
  // "idle" | "saving" | "saved". El "saved" se desvanece solo a los ~2s.
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, []);

  async function handleSave() {
    if (!onSave || status === "saving") return; // ignorar doble tap mientras guarda
    if (fadeTimer.current) {
      clearTimeout(fadeTimer.current);
      fadeTimer.current = null;
    }
    setStatus("saving");
    try {
      await onSave();
      setStatus("saved");
      fadeTimer.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      // El padre ya muestra el error; solo salimos del estado "guardando".
      setStatus("idle");
    }
  }

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
      {onSave && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable
            testID="notes-save"
            onPress={handleSave}
            disabled={status === "saving"}
            style={{
              backgroundColor: colors.accent,
              borderRadius: radius.md,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              opacity: status === "saving" ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
              {status === "saving" ? "Guardando…" : "Guardar nota"}
            </Text>
          </Pressable>
          {status === "saved" && (
            <Text testID="notes-saved" style={{ color: colors.successText, fontSize: 13, fontWeight: "600" }}>
              Guardado ✓
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
