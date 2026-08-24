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

// Barra de progreso de hasta tres segmentos: turquesa (comida) hasta la meta, violeta (suplemento)
// y ámbar el excedente. Recibe los números crudos en vez de un `pct`/`over` ya calculados, para
// que el color no pueda contradecir al texto de la fila.
// (`value` sigue siendo la comida; `supplement` es el aporte del suplemento. Los call-sites que no
// pasan `supplement` se comportan igual que antes — retrocompatible.)
export function Bar({
  value, supplement = 0, target, kind = "limit", height = 8, testID,
}: { value: number; supplement?: number; target: number; kind?: BarKind; height?: number; testID?: string }) {
  const { foodPct, supplementPct, overPct } = barSegments3(value, supplement, target, kind);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceMuted, overflow: "hidden", flexDirection: "row" }}>
      <View testID={testID} style={{ width: `${foodPct}%`, height, backgroundColor: colors.accent }} />
      {supplementPct > 0 && (
        <View testID={testID ? `${testID}-supp` : undefined} style={{ width: `${supplementPct}%`, height, backgroundColor: colors.supplement }} />
      )}
      {overPct > 0 && (
        <View testID={testID ? `${testID}-over` : undefined} style={{ width: `${overPct}%`, height, backgroundColor: colors.warning }} />
      )}
    </View>
  );
}

// Barra bicolor de un tipo de grasa: color base (verde/ámbar, según convenga) hasta `fillPct` y,
// SOLO si te pasaste, rojo (`colors.danger`) el excedente. A diferencia de `Bar`, el color base es
// configurable: las grasas "buenas" (mono/omega3/omega6) van en verde y las de "comer menos"
// (saturada/trans) en ámbar, pero el excedente es SIEMPRE rojo — es la misma semántica del
// semáforo nutricional, no un color más de la paleta de macros.
export function FatSplitBar({
  fillPct, overPct, baseColor, height = 8, testID,
}: { fillPct: number; overPct: number; baseColor: string; height?: number; testID?: string }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceMuted, overflow: "hidden", flexDirection: "row" }}>
      <View testID={testID} style={{ width: `${fillPct}%`, height, backgroundColor: baseColor }} />
      {overPct > 0 && (
        <View testID={testID ? `${testID}-over` : undefined} style={{ width: `${overPct}%`, height, backgroundColor: colors.danger }} />
      )}
    </View>
  );
}

export interface BarSegments3 { foodPct: number; supplementPct: number; overPct: number; }

// Generaliza barSegments a 3 vías: comida (teal) + suplemento (violeta) + excedente (ámbar). El
// total consumido es food+supplement; se parte en la línea de la meta como el diseño de 2 colores.
// Clamps simétricos: ningún segmento con valor > 0 puede redondear a 0% y desaparecer.
export function barSegments3(food: number, supplement: number, target: number, kind: BarKind = "limit"): BarSegments3 {
  const f = Math.max(0, Number.isFinite(food) ? food : 0);
  const s = Math.max(0, Number.isFinite(supplement) ? supplement : 0);
  const total = f + s;
  if (!Number.isFinite(target) || target <= 0 || total <= 0) return { foodPct: 0, supplementPct: 0, overPct: 0 };
  if (total <= target || kind === "floor") {
    const rawFoodPct = f > 0 ? Math.max(1, Math.round((f / target) * 100)) : 0;
    const suppPct = s > 0 ? Math.max(1, Math.round((s / target) * 100)) : 0;
    // No dejar que la suma pase 100 por los clamps.
    const capped = Math.min(100, rawFoodPct + suppPct);
    // El propio foodPct también tiene que quedar adentro de `capped`: sin este min, un piso
    // (fibra) o un límite sin pasarse pero con un solo valor ya >100% (p.ej. floor al 150%)
    // dibujaba la barra más ancha que el contenedor en vez de quedar llena al 100%.
    const foodPct = Math.min(rawFoodPct, capped);
    return { foodPct, supplementPct: Math.max(0, capped - foodPct), overPct: 0 };
  }
  // Te pasaste: la barra se llena (100%); food/supp/over proporcionales al total, con clamps.
  // `reserved` aparta 1% para CADA segmento no nulo (comida, suplemento) ANTES de fijar el
  // excedente: sin esto, una meta chica frente al total (comida=1, suplemento=99, meta=1) dejaba
  // `inTarget` en apenas 1%, justo lo que entra en el clamp mínimo de UN solo segmento, y el otro
  // —el dominante— desaparecía en 0% pese a valer > 0. Restarle el reservado al tope de overPct en
  // vez de a foodPct protege a los DOS segmentos, no solo al de comida.
  const reserved = (f > 0 ? 1 : 0) + (s > 0 ? 1 : 0);
  const maxOverPct = Math.max(1, 100 - reserved);
  const overPct = Math.max(1, Math.min(maxOverPct, Math.round(((total - target) / total) * 100)));
  const inTarget = 100 - overPct; // porción dentro de la meta, con lugar reservado para los dos
  const rawFoodPct = f > 0 ? Math.round((f / total) * 100) : 0;
  const foodPct = f > 0 ? Math.max(1, Math.min(inTarget - (s > 0 ? 1 : 0), rawFoodPct)) : 0;
  const supplementPct = s > 0 ? Math.max(1, inTarget - foodPct) : 0;
  return { foodPct, supplementPct, overPct };
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
