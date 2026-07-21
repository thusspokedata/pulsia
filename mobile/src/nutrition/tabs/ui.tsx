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

export type BarKind = "limit" | "floor";

export interface BarSegments {
  fillPct: number; // turquesa
  overPct: number; // naranja (el excedente)
}

/**
 * Parte la barra en la línea de la meta. La barra representa SIEMPRE lo consumido: al pasarse,
 * el turquesa es la porción que entra en la meta y el naranja el excedente, así que se sigue
 * viendo cuánto llevabas (antes se pintaba entera de ámbar y esa información se perdía).
 *
 * `kind: "floor"` es para los pisos como la fibra, donde pasarse es BUENO y nunca se avisa.
 */
export function barSegments(value: number, target: number, kind: BarKind = "limit"): BarSegments {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return { fillPct: 0, overPct: 0 };
  const v = Math.max(0, value); // un consumo negativo no dibuja barra negativa
  if (v <= target || kind === "floor") {
    return { fillPct: Math.min(100, Math.round((v / target) * 100)), overPct: 0 };
  }
  // Los dos segmentos se ven SIEMPRE que te pasaste: sin los clamps, un excedente de 0.4%
  // redondea a 0% de ámbar, y uno de 200x redondea a 0% de turquesa. En ambos casos la barra
  // vuelve a ser de un solo color y se pierde la información que este diseño vino a mostrar.
  const fillPct = Math.max(1, Math.min(99, Math.round((target / v) * 100)));
  return { fillPct, overPct: 100 - fillPct }; // se derivan uno del otro: siempre suman 100
}

// Barra de progreso de dos segmentos: turquesa hasta la meta, ámbar el excedente. Recibe los
// números crudos en vez de un `pct`/`over` ya calculados, para que el color no pueda contradecir
// al texto de la fila.
export function Bar({
  value, target, kind = "limit", height = 8, testID,
}: { value: number; target: number; kind?: BarKind; height?: number; testID?: string }) {
  const { fillPct, overPct } = barSegments(value, target, kind);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceMuted, overflow: "hidden", flexDirection: "row" }}>
      <View testID={testID} style={{ width: `${fillPct}%`, height, backgroundColor: colors.accent }} />
      {overPct > 0 && (
        <View testID={testID ? `${testID}-over` : undefined} style={{ width: `${overPct}%`, height, backgroundColor: colors.warning }} />
      )}
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
