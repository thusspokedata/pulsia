import type { BodyMetric, MetricType, WorkoutSession } from "@pulsia/shared";
import { METRIC_LABELS, METRIC_UNITS, computePerformanceTrends } from "@pulsia/shared";

const EIGHT_WEEKS_MS = 56 * 24 * 60 * 60 * 1000;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Para un tipo: valor más reciente vs más antiguo dentro de la ventana.
function metricLine(type: MetricType, points: BodyMetric[]): string | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.measuredAt - b.measuredAt);
  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;
  const unit = METRIC_UNITS[type];
  if (sorted.length === 1) return `${METRIC_LABELS[type]}: ${fmt(last)} ${unit}`;
  const delta = last - first;
  const sign = delta > 0 ? "+" : "";
  return `${METRIC_LABELS[type]}: ${fmt(first)} → ${fmt(last)} ${unit} (${sign}${fmt(delta)})`;
}

export function buildProgressSummary(input: {
  metrics: BodyMetric[];
  sessions: WorkoutSession[];
  heightCm?: number | null;
  nowMs: number;
  windowMs?: number;
}): string {
  const windowMs = input.windowMs ?? EIGHT_WEEKS_MS;
  const since = input.nowMs - windowMs;
  const recentMetrics = input.metrics.filter((m) => m.measuredAt >= since);

  const byType = new Map<MetricType, BodyMetric[]>();
  for (const m of recentMetrics) {
    const arr = byType.get(m.metricType) ?? [];
    arr.push(m);
    byType.set(m.metricType, arr);
  }

  const bodyLines: string[] = [];
  for (const [type, pts] of byType) {
    const line = metricLine(type, pts);
    if (line) bodyLines.push(line);
  }

  // IMC derivado del último peso + altura del perfil.
  const weightPts = byType.get("weight_kg");
  if (weightPts && weightPts.length > 0 && input.heightCm && input.heightCm > 0) {
    const lastW = [...weightPts].sort((a, b) => a.measuredAt - b.measuredAt).at(-1)!.value;
    const bmi = lastW / (input.heightCm / 100) ** 2;
    bodyLines.push(`IMC: ${bmi.toFixed(1)}`);
  }

  // Fuerza: top ~5 ejercicios por frecuencia, delta de 1RMe en la ventana.
  const recentSessions = input.sessions.filter((s) => s.startedAt >= since);
  const trends = computePerformanceTrends(recentSessions);
  const strengthLines = trends.perExercise.slice(0, 5).map((e) => {
    const first = e.points[0].est1RM;
    const last = e.points[e.points.length - 1].est1RM;
    const delta = last - first;
    const sign = delta > 0 ? "+" : "";
    return `${e.garminName}: 1RMe ${fmt(first)}→${fmt(last)} kg (${sign}${fmt(delta)})`;
  });

  // Volumen medio por sesión: primer vs último punto de la ventana.
  let volumeLine: string | null = null;
  if (trends.volumeSeries.length >= 2) {
    const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmt(n));
    const first = trends.volumeSeries[0].volumeKg;
    const last = trends.volumeSeries[trends.volumeSeries.length - 1].volumeKg;
    volumeLine = `Volumen/sesión: ${fmtK(first)} → ${fmtK(last)} kg`;
  }

  if (bodyLines.length === 0 && strengthLines.length === 0 && !volumeLine) return "";

  const parts = ["Progreso medido (últimas ~8 semanas):"];
  for (const l of bodyLines) parts.push(`- ${l}`);
  if (strengthLines.length) parts.push(`- Fuerza (1RM estimado): ${strengthLines.join("; ")}`);
  if (volumeLine) parts.push(`- ${volumeLine}`);
  return parts.join("\n");
}
