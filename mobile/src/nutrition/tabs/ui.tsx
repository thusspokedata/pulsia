import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { colors, radius, spacing } from "../../theme/tokens";

export function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.textMuted, fontSize: 13 }}>{children}</Text>;
}

// Barra de progreso. `over` = se pasó de un LÍMITE (ámbar y llena); nunca se usa para un piso
// como la fibra, donde pasarse es bueno.
export function Bar({ pct, over, testID }: { pct: number; over: boolean; testID?: string }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
      <View testID={testID} style={{ width: over ? "100%" : `${pct}%`, height: 8, backgroundColor: over ? colors.warning : colors.accent }} />
    </View>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.textMuted, fontSize: 13 }}>{children}</Text>;
}

// Fila de leyenda de una torta/dona: puntito del color de la porción + label + el valor a la
// derecha. El valor va como children porque su formato cambia por gráfico (kcal vs gramos y %).
export function LegendRow({ color, label, children }: { color: string; label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{children}</Text>
    </View>
  );
}
