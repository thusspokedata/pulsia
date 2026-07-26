import { useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  foodsHighestIn,
  saltGFromSodiumMg,
  NUTRIENTS,
  NUTRIENT_REFERENCES,
  NUTRIENT_REFERENCE_KIND,
  type FoodRank,
  type NutrientKey,
  type RankNutrient,
} from "@pulsia/shared";
import { useMealsRange } from "../../src/nutrition/useMealsRange";
import { getRangeNutrients } from "../../src/api/supplements";
import { getBackendUrl } from "../../src/storage/config";
import { dayBounds } from "../../src/nutrition/dayBounds";
import { dateKey } from "../../src/session/dateKey";
import { ChipGroup } from "../../src/components/ChipGroup";
import { Card, SectionTitle, EmptyState, Bar } from "../../src/nutrition/tabs/ui";
import { LineChart } from "../../src/components/LineChart";
import { dailyNutrientSeries } from "../../src/nutrition/nutrientSeries";
import { colors, radius, spacing } from "../../src/theme/tokens";
import { useScreenPadding } from "../../src/theme/screen";

// La etiqueta y la unidad salen del REGISTRO, no de una lista escrita a mano acá: con 30
// nutrientes navegables, olvidarse de uno mostraba "Alimentos con más undefined". La sal es la
// única excepción, porque no es una columna sino un derivado del sodio.
const DEFS = new Map(NUTRIENTS.map((n) => [n.key as string, n]));

// Minúscula solo en la PRIMERA letra: el título es una frase ("alimentos con más ...") pero
// bajarlo todo convertiría "Vitamina B12" en "vitamina b12".
function enFrase(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function etiquetaDe(nutrient: RankNutrient): string {
  if (nutrient === "salt_g") return "sal";
  return enFrase(DEFS.get(nutrient)!.label);
}

function unidadDe(nutrient: RankNutrient): string {
  return nutrient === "salt_g" ? "g" : DEFS.get(nutrient)!.unit;
}

// El `key` llega de la URL, así que puede ser cualquier cosa. Sin este guard, una clave vieja o
// mal escrita reventaba la pantalla al buscar su etiqueta.
function esRankeable(key: string | undefined): key is RankNutrient {
  return key === "salt_g" || (key != null && DEFS.has(key as NutrientKey));
}

const RANGES = [
  { value: "1", label: "Día" },
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
];

// El aporte de suplementos del rango, como filas de FoodRank (grams/pctOfTotal en 0 — la pantalla
// los recalcula al combinar con la comida). `salt_g` no es una columna del backend: el
// `byNutrient` habla en sodio, así que para la sal se pide "sodium_mg" y se convierte cada fila
// ANTES de entrar al ranking (mismo criterio que rankAmount en breakdown.ts).
// Degradación limpia: getRangeNutrients ya nunca tira (atrapa red/timeout/5xx puertas adentro),
// pero el try/catch de acá cubre además un getBackendUrl que fallara — si algo sale mal, la
// pantalla se queda solo con la comida en vez de romperse.
function useSupplementRanks(days: number, offset: number, nutrient: RankNutrient): FoodRank[] {
  const [rows, setRows] = useState<FoodRank[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getBackendUrl();
        const from = dateKey(dayBounds(offset + days - 1).noon);
        const to = dateKey(dayBounds(offset).noon);
        const { byNutrient } = await getRangeNutrients(url, from, to);
        const backendKey = nutrient === "salt_g" ? "sodium_mg" : nutrient;
        const entries = byNutrient[backendKey] ?? [];
        const next: FoodRank[] = [];
        for (const e of entries) {
          const amount = nutrient === "salt_g" ? saltGFromSodiumMg(e.amount) : e.amount;
          if (amount == null || amount <= 0) continue; // igual que foodsHighestIn: 0/negativo no rankea
          next.push({
            name: e.supplementName,
            amount: Math.round(amount * 10) / 10, // 1 decimal, como el resto de los micros
            grams: 0,
            pctOfTotal: 0, // se recalcula en el componente, sobre el total combinado
            source: "supplement",
          });
        }
        if (!cancelled) setRows(next);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, offset, nutrient]);

  return rows;
}

// 0 cuando no hay total: mismo criterio que `pct` en breakdown.ts (evita 0/0 → NaN).
function pctOf(v: number, total: number): number {
  return total > 0 ? Math.round((v / total) * 100) : 0;
}

export default function NutrienteScreen() {
  const screenPad = useScreenPadding(spacing.lg);
  const { key, offset: offsetParam } = useLocalSearchParams<{ key?: string; offset?: string }>();
  const nutrient: RankNutrient = esRankeable(key) ? key : "cholesterol_mg";
  const offset = Number(offsetParam ?? 0) || 0;
  const [days, setDays] = useState(1);
  const { meals, loading, error } = useMealsRange(days, offset);
  const foodRanked = foodsHighestIn(meals, nutrient);
  const supplementRanked = useSupplementRanks(days, offset, nutrient);
  // Se combina y se recalcula el % sobre el total COMBINADO (comida + suplemento): el % de cada
  // fila tiene que sumar 100 entre todas, no solo entre las de comida. Mismo desempate por nombre
  // que foodsHighestIn, para que la lista no baile entre renders.
  const combinedTotal = foodRanked.reduce((a, f) => a + f.amount, 0) + supplementRanked.reduce((a, f) => a + f.amount, 0);
  const ranked: FoodRank[] = [...foodRanked, ...supplementRanked]
    .map((f) => ({ ...f, pctOfTotal: pctOf(f.amount, combinedTotal) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const unit = unidadDe(nutrient);
  // El aporte se redondea a 1 decimal en foodsHighestIn, así que un alimento con trazas (0.04 g)
  // sale con amount 0. Sin el guard, la barra del "que más aporta" haría 0/0 → width "NaN%".
  const maxAmount = ranked[0]?.amount || 1;

  const series = dailyNutrientSeries(meals, nutrient);
  // Solo llevan línea de referencia los nutrientes con un valor público FIJO. Quedan sin línea
  // las saturadas (10% de la energía → dependen de la meta de kcal) y las vitaminas y minerales
  // (referencia EFSA → depende del sexo y la edad del perfil): esta pantalla no carga ni la meta
  // ni el perfil, y dibujar una línea genérica sería peor que no dibujar ninguna.
  const refKey = nutrient as keyof typeof NUTRIENT_REFERENCES;
  const refValue = nutrient in NUTRIENT_REFERENCES ? NUTRIENT_REFERENCES[refKey] : null;
  const refLine = refValue != null
    ? { value: refValue, label: `${NUTRIENT_REFERENCE_KIND[refKey] === "min" ? "mínimo" : "máx"} ${refValue} ${unit}` }
    : undefined;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ ...screenPad, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>
        Alimentos con más {etiquetaDe(nutrient)}
      </Text>

      <ChipGroup single options={RANGES} selected={[String(days)]} onChange={(v) => setDays(Number(v[0]))} />

      {loading && <ActivityIndicator color={colors.accent} />}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {!loading && !error && ranked.length === 0 && (
        <Card>
          <EmptyState>Ningún alimento registrado aporta {etiquetaDe(nutrient)} en este período.</EmptyState>
        </Card>
      )}

      {/* El gate `days >= 7` es explícito a propósito, aunque hoy sea redundante: con "Día" el rango
          pedido al backend es de un solo día, así que nunca podría haber dos puntos y el gate de
          `points.length >= 2` de abajo ya alcanzaría para ocultar el gráfico. Lo dejamos igual
          porque declara la intención ("con Día no hay evolución") sin depender de ese acoplamiento:
          si mañana "Día" pidiera, por ejemplo, ±3 días, sin este gate aparecería un gráfico que
          nadie pidió. El gate es por `series.points.length`, NO por `ranked.length`: el ranking
          descarta los aportes en 0 (no tiene sentido rankear "lo que más aporta 0"), pero la curva
          SÍ cuenta un 0 declarado como dato real (ver `dailyNutrientSeries`). Si gatearamos por
          `ranked` acá, una dieta con el nutriente en 0 declarado (p.ej. colesterol en varios días
          basados en plantas) mostraría el empty state de "ningún alimento aporta..." y ocultaría
          la curva — que sería justo la mejor noticia posible, un plano en 0. Gatear por
          `series.points.length` sigue evitando el mensaje duplicado: un rango sin NINGÚN dato
          (`points.length === 0`) implica también `ranked.length === 0`, así que solo queda el
          empty state de abajo. */}
      {!loading && !error && days >= 7 && series.points.length > 0 && (
        <Card>
          <SectionTitle>Evolución</SectionTitle>
          {series.points.length >= 2 ? (
            <>
              <LineChart data={series.points} unit={unit} refLine={refLine} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Promedio {series.average} {unit} · {series.points.length} de {days} días con registro
              </Text>
            </>
          ) : (
            <EmptyState>Registrá al menos dos días para ver la evolución.</EmptyState>
          )}
        </Card>
      )}

      {!loading && !error && ranked.length > 0 && (
        <Card>
          <SectionTitle>De mayor a menor aporte</SectionTitle>
          {/* La barra mide contra el que MÁS aporta, no contra un total: lo que se compara acá es
              un alimento contra otro ("el huevo pesa el doble que el queso"), no contra una meta. */}
          {ranked.map((f) => (
            <View key={`${f.source}-${f.name}`} style={{ gap: 4, marginTop: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                  {f.source === "supplement" && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.supplement }} />
                  )}
                  <Text style={{ color: colors.text, fontSize: 14 }}>{f.name}</Text>
                  {f.source === "supplement" && (
                    <View
                      style={{
                        backgroundColor: colors.supplementSoft,
                        borderRadius: radius.pill,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ color: colors.supplement, fontSize: 11, fontWeight: "600" }}>suplemento</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {f.amount} {unit} · {f.pctOfTotal}%
                </Text>
              </View>
              <Bar value={f.amount} target={maxAmount} testID={`rank-${f.name}-bar`} />
              {/* Los suplementos no tienen "gramos comidos": no hay porción que bajar. */}
              {f.source === "food" && <Text style={{ color: colors.icon, fontSize: 11 }}>{f.grams} g</Text>}
            </View>
          ))}
        </Card>
      )}

      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>← Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
