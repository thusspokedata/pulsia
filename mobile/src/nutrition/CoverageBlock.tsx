import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { NUTRIENTS, type CoverageResult, type CoverageState, type NutrientCoverage, type ReportKind } from "@pulsia/shared";
import { colors, spacing } from "../theme/tokens";
import { LineChart } from "../components/LineChart";
import { Card, SectionTitle, EmptyState } from "./tabs/ui";
import { useCoverage } from "./useCoverage";
import type { CoveragePoint } from "./coverageEvolution";
import { periodFor } from "../reports/periods";

const LABEL = new Map(NUTRIENTS.map((n) => [n.key as string, n.label]));
const STATE_COLOR: Record<CoverageState, string> = {
  food: colors.accent,
  supplement: colors.supplement,
  uncovered: colors.danger,
  few_data: colors.icon,
};
const GROUPS: { state: CoverageState; title: string }[] = [
  { state: "food", title: "Desde la comida" },
  { state: "supplement", title: "Gracias al suplemento" },
  { state: "uncovered", title: "Sin cubrir" },
  { state: "few_data", title: "Pocos datos" },
];

function pct(n: NutrientCoverage): number {
  return Math.round((((n.foodAvg ?? 0) + n.suppAvg) / n.ref) * 100);
}

// Barra apilada horizontal (dona simplificada, sin dependencia de torta SVG): proporción por estado.
function Donut({ counts }: { counts: CoverageResult["counts"] }) {
  const total = counts.food + counts.supplement + counts.uncovered + counts.fewData;
  const segs: { c: string; n: number }[] = [
    { c: STATE_COLOR.food, n: counts.food },
    { c: STATE_COLOR.supplement, n: counts.supplement },
    { c: STATE_COLOR.uncovered, n: counts.uncovered },
    { c: STATE_COLOR.few_data, n: counts.fewData },
  ];
  return (
    <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surfaceMuted }}>
      {total > 0 && segs.map((s, i) => (s.n > 0 ? <View key={i} style={{ flex: s.n, backgroundColor: s.c }} /> : null))}
    </View>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t}</Text>
    </View>
  );
}

function MicroRow({ n, offset }: { n: NutrientCoverage; offset: number }) {
  const p = pct(n);
  // La barra se llena hasta el piso (100%): comida (teal) y, encima, suplemento (violeta). El
  // excedente NO se pinta —para un piso, pasarse es bueno, no un límite que avisar (a diferencia de
  // sodio/azúcar)—; el número real ("2500%") ya lo dice el texto de la fila.
  const foodW = Math.min(100, ((n.foodAvg ?? 0) / n.ref) * 100);
  const suppW = Math.min(100 - foodW, (n.suppAvg / n.ref) * 100);
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/nutricion/nutriente", params: { key: n.key, offset: String(offset) } })}
      style={{ marginVertical: 6 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ color: colors.text, fontSize: 13 }}>{LABEL.get(n.key)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{n.state === "few_data" ? "pocos datos" : `${p}%`}</Text>
      </View>
      <View style={{ height: 9, borderRadius: 5, overflow: "hidden", backgroundColor: colors.surfaceMuted, flexDirection: "row", opacity: n.state === "few_data" ? 0.5 : 1 }}>
        <View style={{ width: `${foodW}%`, backgroundColor: colors.accent }} />
        <View style={{ width: `${suppW}%`, backgroundColor: colors.supplement }} />
      </View>
    </Pressable>
  );
}

export function CoverageView({
  current, evolution, daysInPeriod, offset, expanded: initialExpanded = false,
}: {
  current: CoverageResult; evolution: CoveragePoint[]; daysInPeriod: number; offset: number; expanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  if (current.onlyFoodPct == null) {
    return (
      <Card>
        <EmptyState>Sin datos suficientes en este período para calcular la cobertura.</EmptyState>
      </Card>
    );
  }
  const prev = evolution.length >= 2 ? evolution[evolution.length - 2].y : null;
  const delta = prev != null ? current.onlyFoodPct - prev : null;
  return (
    <Card>
      <SectionTitle>Cobertura de micros</SectionTitle>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
        {current.daysRegistered} de {daysInPeriod} días registrados
      </Text>

      <Donut counts={current.counts} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs }}>
        <Legend c={colors.accent} t={`Comida ${current.counts.food}`} />
        <Legend c={colors.supplement} t={`Suplemento ${current.counts.supplement}`} />
        <Legend c={colors.danger} t={`Sin cubrir ${current.counts.uncovered}`} />
      </View>

      <View style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={{ color: colors.accent, fontSize: 26, fontWeight: "800" }}>{current.onlyFoodPct}%</Text>
          {delta != null && (
            <Text style={{ color: delta > 0 ? colors.accentText : delta < 0 ? colors.danger : colors.textMuted, fontSize: 13, fontWeight: "700" }}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"} {Math.abs(delta)} pts
            </Text>
          )}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>de los micros cubiertos solo con comida</Text>
        {evolution.length >= 2 && (
          <View style={{ marginTop: spacing.sm }}>
            <LineChart data={evolution} unit="%" />
          </View>
        )}
      </View>

      <Pressable onPress={() => setExpanded((e) => !e)} style={{ marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600", textAlign: "center" }}>
          {expanded ? "▲ Ocultar detalle por micro" : "▼ Ver detalle por micro"}
        </Text>
      </Pressable>

      {expanded && GROUPS.map((g) => {
        const rows = current.byNutrient.filter((n) => n.state === g.state);
        if (rows.length === 0) return null;
        return (
          <View key={g.state} style={{ marginTop: spacing.sm }}>
            <Text style={{ color: STATE_COLOR[g.state], fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.sm }}>{g.title}</Text>
            {rows.map((n) => <MicroRow key={n.key} n={n} offset={offset} />)}
          </View>
        );
      })}
    </Card>
  );
}

// Wrapper con fetch. Se monta en informes.tsx.
export function CoverageBlock({ kind, offset, now }: { kind: ReportKind; offset: number; now?: number }) {
  // `now` se CONGELA al montar: como default de parámetro (`now = Date.now()`) se re-evaluaba en
  // cada render → cambiaba las deps del useEffect de useCoverage → loop infinito de fetch. El
  // período depende de offset+now y no necesita "tickear" mientras el bloque está en pantalla.
  const [fixedNow] = useState(() => now ?? Date.now());
  const { current, evolution, loading } = useCoverage(kind, offset, fixedNow);
  if (loading) return <ActivityIndicator color={colors.accent} />;
  if (!current) return null;
  const period = periodFor(kind, offset, fixedNow);
  const daysInPeriod = Math.round((period.end - period.start) / 86_400_000);
  return <CoverageView current={current} evolution={evolution} daysInPeriod={daysInPeriod} offset={offset} />;
}
