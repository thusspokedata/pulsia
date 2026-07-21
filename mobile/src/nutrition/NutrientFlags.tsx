import { View, Text } from "react-native";
import { foodFlags, type FoodFlagsInput, type NutrientSentiment } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";
import { NUTRIENT_LABELS, flagText, unknownLabel } from "./nutrientText";

// Máximo de chips en una fila de lista. Más que esto y la fila se convierte en un párrafo.
const MAX_CHIPS = 3;

// Reusa los tokens semánticos existentes. `danger` está documentado como "rojo semántico
// (errores)" y que un alimento tenga azúcar no es un error, pero es la lectura universal de un
// semáforo y evita tocar la identidad visual, que el owner se reservó decidir. Si algún día se
// agrega un rojo propio menos agresivo, se cambia acá y en ningún otro lado.
const CHIP_STYLE: Record<string, { bg: string; fg: string }> = {
  bad: { bg: "#FBEAE7", fg: colors.danger },
  warn: { bg: "#FBF0E2", fg: colors.warning },
  good: { bg: colors.successSoft, fg: colors.successText },
  unknown: { bg: colors.surfaceMuted, fg: colors.textMuted },
};

function Chip({ text, sentiment }: { text: string; sentiment: NutrientSentiment }) {
  // neutral no tiene estilo propio porque nunca se renderiza como chip; cae al gris por el ??
  const s = CHIP_STYLE[sentiment] ?? CHIP_STYLE.unknown!;
  return (
    <View
      testID={`nutrient-chip-${sentiment}`}
      style={{
        backgroundColor: s.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: s.fg, fontSize: 11, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function NutrientFlags({
  food,
  variant = "compact",
}: {
  food: FoodFlagsInput;
  variant?: "compact" | "full";
}) {
  const flags = foodFlags(food);

  if (variant === "full") {
    return (
      <View testID="nutrient-flags-full" style={{ gap: spacing.xs }}>
        {flags.all.map((f) => (
          <View
            key={f.nutrient}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {NUTRIENT_LABELS[f.nutrient]}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {f.value == null ? "sin dato" : `${f.value}${f.nutrient === "cholesterol_mg" ? " mg" : " g"}`}
              </Text>
              <Chip
                text={flagText(f.nutrient, f.sentiment) ?? (f.level === "unknown" ? "sin dato" : "ok")}
                sentiment={f.sentiment}
              />
            </View>
          </View>
        ))}
        <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: spacing.xs }}>
          Umbrales por 100 {food.basis === "per_100ml" ? "ml" : "g"} · grasa, saturadas, azúcar y
          sal según FSA (Reino Unido); colesterol y fibra según %DV de la FDA.
        </Text>
      </View>
    );
  }

  const shown = flags.notable.slice(0, MAX_CHIPS);
  const extra = flags.notable.length - shown.length;
  const missing = unknownLabel(flags.unknown);
  if (shown.length === 0 && !missing) return null;

  return (
    <View
      testID="nutrient-flags"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}
    >
      {shown.map((f) => {
        const text = flagText(f.nutrient, f.sentiment);
        return text ? <Chip key={f.nutrient} text={text} sentiment={f.sentiment} /> : null;
      })}
      {extra > 0 && <Chip text={`+${extra}`} sentiment="unknown" />}
      {/* El aviso de faltantes va aparte del cap: el cap ordena por severidad, así que si
          compitiera, un alimento con tres alarmas escondería que además hay datos que no tenemos. */}
      {missing && <Chip text={missing} sentiment="unknown" />}
    </View>
  );
}
