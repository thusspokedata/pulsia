import { View, Text } from "react-native";
import { foodFlags, type FoodFlagsInput, type NutrientSentiment } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";
import { NUTRIENT_LABELS, flagText, unknownLabel } from "./nutrientText";

// Máximo de chips en una fila de lista. Más que esto y la fila se convierte en un párrafo.
const MAX_CHIPS = 3;

type ChipStyle = { bg: string; fg: string };

// Reusa los tokens semánticos existentes. `danger` está documentado como "rojo semántico
// (errores)" y que un alimento tenga azúcar no es un error, pero es la lectura universal de un
// semáforo y evita tocar la identidad visual, que el owner se reservó decidir. Si algún día se
// agrega un rojo propio menos agresivo, se cambia acá y en ningún otro lado.
//
// `Partial<Record<NutrientSentiment, …>>` en vez de `Record<string, …>`: así solo se pueden usar
// claves que son de verdad un NutrientSentiment (un typo no compila), y el `Partial` documenta
// que `neutral` no tiene entrada a propósito — nunca se renderiza como chip, así que inventarle
// un color sería identidad visual sin uso.
const CHIP_STYLE: Partial<Record<NutrientSentiment, ChipStyle>> = {
  bad: { bg: colors.dangerSoft, fg: colors.danger },
  warn: { bg: colors.warningSoft, fg: colors.warning },
  good: { bg: colors.successSoft, fg: colors.successText },
  unknown: { bg: colors.surfaceMuted, fg: colors.textMuted },
};

// Mismo gris que "unknown" — no hay una nueva identidad visual que inventar —, pero con una
// clave propia: el chip "+N" (cuántos quedaron afuera del cap de 3) no significa "sin dato",
// significa "hay más chips de los que entran acá". Si el día de mañana "unknown" suma un ícono
// de "?" para remarcar la ausencia de dato, el "+N" no tiene que heredarlo — no le corresponde.
const OVERFLOW_CHIP_STYLE: ChipStyle = { bg: colors.surfaceMuted, fg: colors.textMuted };

function Chip({ text, style, testID }: { text: string; style: ChipStyle; testID: string }) {
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: style.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: style.fg, fontSize: 11, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

// neutral no tiene estilo propio en CHIP_STYLE y cae al gris de "unknown" por el `??`. NO es que
// nunca se renderice: la variante `full` dibuja los seis nutrientes, así que un neutral aparece
// como chip "ok". Comparte el gris con "sin dato" a propósito —ninguno de los dos es una alarma—
// y lo que los distingue es el TEXTO, que es lo que sostiene la accesibilidad de esta feature.
function sentimentChipStyle(sentiment: NutrientSentiment): ChipStyle {
  return CHIP_STYLE[sentiment] ?? CHIP_STYLE.unknown!;
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
                {/* !Number.isFinite cubre null/undefined Y NaN: nutrientValue en shared ya
                    normaliza NaN a null, pero ese valor puede llegar acá desde datos que no
                    pasaron por ese helper (ver NutrientFlags.test para el caso "1e" a medio
                    tipear), y `f.value == null` dejaba pasar "NaN mg" a la pantalla. */}
                {!Number.isFinite(f.value) ? "sin dato" : `${f.value}${f.nutrient === "cholesterol_mg" ? " mg" : " g"}`}
              </Text>
              <Chip
                text={flagText(f.nutrient, f.sentiment) ?? (f.level === "unknown" ? "sin dato" : "ok")}
                style={sentimentChipStyle(f.sentiment)}
                testID={`nutrient-chip-${f.sentiment}`}
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
        return text ? (
          <Chip
            key={f.nutrient}
            text={text}
            style={sentimentChipStyle(f.sentiment)}
            testID={`nutrient-chip-${f.sentiment}`}
          />
        ) : null;
      })}
      {extra > 0 && <Chip text={`+${extra}`} style={OVERFLOW_CHIP_STYLE} testID="nutrient-chip-overflow" />}
      {/* El aviso de faltantes va aparte del cap: el cap ordena por severidad, así que si
          compitiera, un alimento con tres alarmas escondería que además hay datos que no tenemos. */}
      {missing && <Chip text={missing} style={CHIP_STYLE.unknown!} testID="nutrient-chip-unknown" />}
    </View>
  );
}
