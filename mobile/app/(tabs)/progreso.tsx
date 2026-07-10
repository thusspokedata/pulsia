import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl } from "../../src/storage/config";
import { getLatestMetrics, getMetricSeries, postReading } from "../../src/api/metrics";
import { getPerformance } from "../../src/api/progress";
import { getSessions, type SessionListItem } from "../../src/api/sessions";
import { LineChart } from "../../src/components/LineChart";
import { MultiLineChart } from "../../src/components/MultiLineChart";
import { YearHeatmap } from "../../src/components/YearHeatmap";
import { BarChart } from "../../src/components/BarChart";
import { buildReadingFromForm, buildBpReadingFromForm, type BpForm } from "../../src/session/metricForm";
import { availableYears } from "../../src/session/heatmap";
import { buildDailyMinutes } from "../../src/session/weeklyBars";
import { BODY_METRIC_TYPES, METRIC_LABELS, METRIC_UNITS, type MetricType, type BodyMetric, type PerformanceTrends } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

const BP_COLOR_SYSTOLIC = colors.accent;
const BP_COLOR_DIASTOLIC = "#2E6E8E";
const BP_COLOR_PULSE = "#6B8E4E";

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
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [heatmapYear, setHeatmapYear] = useState<number | null>(null);
  const [bpSystolicSeries, setBpSystolicSeries] = useState<BodyMetric[]>([]);
  const [bpDiastolicSeries, setBpDiastolicSeries] = useState<BodyMetric[]>([]);
  const [bpPulseSeries, setBpPulseSeries] = useState<BodyMetric[]>([]);
  const [bpForm, setBpForm] = useState<BpForm>({});
  const [bpSaving, setBpSaving] = useState(false);

  async function loadSeries(url: string, type: MetricType) {
    const data = await getMetricSeries(url, type);
    if (latestReqRef.current === type) setSeries(data);
  }

  async function loadBpSeries(url: string) {
    const [sys, dia, pulse] = await Promise.all([
      getMetricSeries(url, "bp_systolic"),
      getMetricSeries(url, "bp_diastolic"),
      getMetricSeries(url, "bp_pulse"),
    ]);
    setBpSystolicSeries(sys);
    setBpDiastolicSeries(dia);
    setBpPulseSeries(pulse);
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
        await Promise.all([loadSeries(url, selected), loadBpSeries(url)]);
      } catch { setError("No se pudo cargar el progreso"); }
      try {
        const sess = await getSessions(url);
        setSessions(sess);
        const years = availableYears(sess);
        if (years.length > 0) setHeatmapYear(years[0]);
      } catch { setError((prev) => prev ?? "No se pudo cargar el historial de entrenamientos"); }
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

  async function onSaveBp() {
    const url = baseUrl.current;
    if (!url) return;
    const { reading, invalid, error: bpError } = buildBpReadingFromForm(bpForm, Date.now());
    if (bpError) { setError(bpError); return; }
    if (!reading) { setError("Cargá al menos un valor válido"); return; }
    setBpSaving(true); setError(null);
    try {
      await postReading(url, reading);
      setBpForm({});
      if (invalid.length > 0) {
        setError(`Revisá: ${invalid.map((t) => METRIC_LABELS[t]).join(", ")}`);
      }
    } catch {
      setBpSaving(false);
      setError("No se pudo guardar la medición");
      return;
    }
    try {
      setLatest(await getLatestMetrics(url));
      await loadBpSeries(url);
    } catch {
      setError((prev) => prev ?? "Guardado. No se pudo refrescar la vista.");
    }
    finally { setBpSaving(false); }
  }

  const chartData = series.map((m) => ({ x: m.measuredAt, y: m.value }));
  const bpCurrent = latest.bp_systolic && latest.bp_diastolic
    ? `${latest.bp_systolic.value} / ${latest.bp_diastolic.value}${latest.bp_pulse ? ` · ${latest.bp_pulse.value} bpm` : ""}`
    : "—";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Valores actuales</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {BODY_METRIC_TYPES.map((t) => (
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
        {BODY_METRIC_TYPES.map((t) => (
          <Pressable key={t} onPress={() => onSelect(t)}
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: selected === t ? colors.accent : colors.surface }}>
            <Text style={{ color: selected === t ? "#fff" : colors.text, fontSize: 13 }}>{METRIC_LABELS[t]}</Text>
          </Pressable>
        ))}
      </View>
      <LineChart data={chartData} unit={METRIC_UNITS[selected]} />

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Presión arterial</Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Actual</Text>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{bpCurrent}</Text>
      </View>
      <MultiLineChart
        series={[
          { label: "Alta", color: BP_COLOR_SYSTOLIC, unit: "mmHg", data: bpSystolicSeries.map((m) => ({ x: m.measuredAt, y: m.value })) },
          { label: "Baja", color: BP_COLOR_DIASTOLIC, unit: "mmHg", data: bpDiastolicSeries.map((m) => ({ x: m.measuredAt, y: m.value })) },
          { label: "Pulso", color: BP_COLOR_PULSE, unit: "bpm", data: bpPulseSeries.map((m) => ({ x: m.measuredAt, y: m.value })) },
        ]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.text }}>Alta (mmHg)</Text>
        <TextInput
          keyboardType="decimal-pad" value={bpForm.alta ?? ""}
          onChangeText={(v) => setBpForm((f) => ({ ...f, alta: v }))}
          placeholder="—" placeholderTextColor={colors.textMuted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8, width: 100, color: colors.text }}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.text }}>Baja (mmHg)</Text>
        <TextInput
          keyboardType="decimal-pad" value={bpForm.baja ?? ""}
          onChangeText={(v) => setBpForm((f) => ({ ...f, baja: v }))}
          placeholder="—" placeholderTextColor={colors.textMuted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8, width: 100, color: colors.text }}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.text }}>Pulso (bpm)</Text>
        <TextInput
          keyboardType="decimal-pad" value={bpForm.pulso ?? ""}
          onChangeText={(v) => setBpForm((f) => ({ ...f, pulso: v }))}
          placeholder="—" placeholderTextColor={colors.textMuted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8, width: 100, color: colors.text }}
        />
      </View>
      <Pressable onPress={onSaveBp} disabled={bpSaving}
        style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: bpSaving ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>{bpSaving ? "Guardando…" : "Guardar presión"}</Text>
      </Pressable>

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
      {BODY_METRIC_TYPES.map((t) => (
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

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Días entrenados</Text>
      {sessions.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>Todavía no hay entrenamientos registrados.</Text>
      ) : (
        <YearHeatmap sessions={sessions} year={heatmapYear ?? new Date().getFullYear()} onSelectYear={setHeatmapYear} />
      )}

      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>Tiempo por día (últimas 4 semanas)</Text>
      {sessions.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>Todavía no hay entrenamientos registrados.</Text>
      ) : (
        <BarChart data={buildDailyMinutes(sessions, Date.now())} />
      )}
    </ScrollView>
  );
}
