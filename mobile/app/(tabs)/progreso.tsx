import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl } from "../../src/storage/config";
import { getLatestMetrics, getMetricSeries, postReading } from "../../src/api/metrics";
import { getPerformance } from "../../src/api/progress";
import { LineChart } from "../../src/components/LineChart";
import { buildReadingFromForm } from "../../src/session/metricForm";
import { METRIC_TYPES, METRIC_LABELS, METRIC_UNITS, type MetricType, type BodyMetric, type PerformanceTrends } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

export default function ProgresoScreen() {
  const baseUrl = useRef<string | null>(null);
  const latestReqRef = useRef<MetricType>("weight_kg");
  const [latest, setLatest] = useState<Partial<Record<MetricType, { value: number; measuredAt: number }>>>({});
  const [selected, setSelected] = useState<MetricType>("weight_kg");
  const [series, setSeries] = useState<BodyMetric[]>([]);
  const [perf, setPerf] = useState<PerformanceTrends | null>(null);
  const [form, setForm] = useState<Partial<Record<MetricType, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadSeries(url: string, type: MetricType) {
    const data = await getMetricSeries(url, type);
    if (latestReqRef.current === type) setSeries(data);
  }

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (!url) { setError("Configurá el backend"); return; }
      latestReqRef.current = selected;
      try {
        setLatest(await getLatestMetrics(url));
        setPerf(await getPerformance(url));
        await loadSeries(url, selected);
      } catch { setError("No se pudo cargar el progreso"); }
    })();
  }, []);

  async function onSelect(type: MetricType) {
    setSelected(type);
    latestReqRef.current = type;
    if (!baseUrl.current) return;
    try {
      await loadSeries(baseUrl.current, type);
      setError(null);
    } catch { setError("No se pudo cargar la métrica"); }
  }

  async function onSave() {
    const url = baseUrl.current;
    if (!url) return;
    const { reading, invalid } = buildReadingFromForm(form, Date.now());
    if (!reading) { setError("Cargá al menos un valor válido"); return; }
    setSaving(true); setError(null);
    try {
      await postReading(url, reading);
      setForm({});
      if (invalid.length > 0) {
        setError(`Revisá: ${invalid.map((t) => METRIC_LABELS[t]).join(", ")}`);
      }
    } catch {
      setSaving(false);
      setError("No se pudo guardar la medición");
      return;
    }
    try {
      setLatest(await getLatestMetrics(url));
      await loadSeries(url, selected);
    } catch {
      setError((prev) => prev ?? "Guardado. No se pudo refrescar la vista.");
    }
    finally { setSaving(false); }
  }

  const chartData = series.map((m) => ({ x: m.measuredAt, y: m.value }));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Valores actuales</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {METRIC_TYPES.map((t) => (
          <View key={t} style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, minWidth: 100 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{METRIC_LABELS[t]}</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
              {latest[t] ? `${latest[t]!.value} ${METRIC_UNITS[t]}` : "—"}
            </Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Tendencia</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {METRIC_TYPES.map((t) => (
          <Pressable key={t} onPress={() => onSelect(t)}
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: selected === t ? colors.accent : colors.surface }}>
            <Text style={{ color: selected === t ? "#fff" : colors.text, fontSize: 13 }}>{METRIC_LABELS[t]}</Text>
          </Pressable>
        ))}
      </View>
      <LineChart data={chartData} unit={METRIC_UNITS[selected]} />

      {perf && perf.perExercise.length > 0 ? (
        <>
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Fuerza (1RM estimado)</Text>
          {perf.perExercise.slice(0, 5).map((e) => (
            <View key={e.catalogId} style={{ gap: spacing.xs }}>
              <Text style={{ color: colors.text }}>{e.garminName}</Text>
              <LineChart data={e.points.map((p) => ({ x: p.measuredAt, y: p.est1RM }))} unit="kg" />
            </View>
          ))}
        </>
      ) : null}

      {perf && perf.volumeSeries.length > 0 ? (
        <>
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Volumen por sesión</Text>
          <LineChart data={perf.volumeSeries.map((v) => ({ x: v.measuredAt, y: v.volumeKg }))} unit="kg" />
        </>
      ) : null}

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Registrar medición</Text>
      {METRIC_TYPES.map((t) => (
        <View key={t} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text }}>{METRIC_LABELS[t]} ({METRIC_UNITS[t]})</Text>
          <TextInput
            keyboardType="decimal-pad" value={form[t] ?? ""}
            onChangeText={(v) => setForm((f) => ({ ...f, [t]: v }))}
            placeholder="—" placeholderTextColor={colors.textMuted}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8, width: 100, color: colors.text }}
          />
        </View>
      ))}
      <Pressable onPress={onSave} disabled={saving}
        style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>{saving ? "Guardando…" : "Guardar medición"}</Text>
      </Pressable>
    </ScrollView>
  );
}
