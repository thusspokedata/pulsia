import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import type { SessionSummary as SessionSummaryData } from "../session/summary";
import { colors, radius, spacing } from "../theme/tokens";
import { MuscleMap } from "./MuscleMap";
import { LineChart } from "./LineChart";
import type { XY } from "../session/chart";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function Metric({ label, value, sub, testID }: { label: string; value: string; sub?: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{
        flexGrow: 1,
        flexBasis: "30%",
        minWidth: 90,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 2,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>{value}</Text>
      {sub ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{sub}</Text> : null}
    </View>
  );
}

export function SessionSummary({ summary }: { summary: SessionSummaryData }) {
  const [showSets, setShowSets] = useState(false);
  const hasHr = summary.avgHr != null || summary.maxHr != null;
  const load =
    summary.sessionLoadRpe != null ? `${summary.sessionLoadRpe}` : `${num(summary.totalVolumeKg)} kg`;
  const hrCurve: XY[] | null =
    summary.hrSeries != null && summary.hrSeries.length >= 2
      ? summary.hrSeries.map((p) => ({ x: p.t / 60000, y: p.bpm }))
      : null;

  return (
    <View testID="summary" style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{summary.dayLabel}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Entrenamiento completado · {fmtDate(summary.startedAt)}</Text>
      </View>

      {/* Grid de métricas clave */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Metric label="Tiempo total" value={fmt(summary.durationMs)} />
        <Metric
          testID="summary-completion"
          label="Cumplimiento"
          value={`${summary.completionPct}%`}
          sub={`Ejercicios ${summary.exercisesDone}/${summary.exercisesTotal}`}
        />
        <Metric testID="summary-volume" label="Volumen total" value={`${num(summary.totalVolumeKg)} kg`} />
        <Metric label="Reps totales" value={`${summary.totalReps}`} />
        <Metric label="Carga" value={load} />
        {hasHr ? (
          <Metric
            testID="summary-avghr"
            label="FC media / máx"
            value={`${summary.avgHr ?? "—"}`}
            sub={`máx ${summary.maxHr ?? "—"}`}
          />
        ) : null}
      </View>

      {/* Trabajo vs descanso */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Trabajo</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{fmt(summary.workMs)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Descanso</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{fmt(summary.restMs)}</Text>
        </View>
      </View>

      {/* Por ejercicio */}
      {summary.perExercise.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Por ejercicio</Text>
          <View style={{ gap: spacing.xs }}>
            {summary.perExercise.map((ex) => {
              const hasExHr = ex.avgHr != null || ex.maxHr != null;
              return (
                <View
                  key={ex.order}
                  testID={`exercise-row-${ex.order}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: colors.surface,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    gap: spacing.sm,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
                      {ex.garminName}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {ex.doneSets}/{ex.plannedSets} series · {num(ex.volumeKg)} kg
                    </Text>
                  </View>
                  {hasExHr ? (
                    <Text testID={`exercise-hr-${ex.order}`} style={{ color: colors.textMuted, fontSize: 11 }}>
                      FC {ex.avgHr ?? "—"}/{ex.maxHr ?? "—"}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Curva de FC de toda la sesión (descansos incluidos); solo si hay >= 2 puntos */}
      {hrCurve ? (
        <View testID="summary-hr-curve" style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Frecuencia cardíaca (sesión)</Text>
          <LineChart data={hrCurve} unit="bpm" />
        </View>
      ) : null}

      {/* Mapa corporal (músculos trabajados) */}
      {summary.primaryMuscles.length > 0 || summary.secondaryMuscles.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Músculos trabajados</Text>
          <MuscleMap primary={summary.primaryMuscles} secondary={summary.secondaryMuscles} />
        </View>
      ) : null}

      {/* Tabla por serie (colapsable, cerrada por defecto) */}
      <View style={{ gap: spacing.xs }}>
        <Pressable
          testID="toggle-sets"
          onPress={() => setShowSets((v) => !v)}
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs }}
        >
          <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>Detalle por serie</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{showSets ? "▲" : "▼"}</Text>
        </Pressable>
        {showSets ? (
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, width: 28 }}>Set</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, flex: 1 }}>Ejercicio</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, width: 44, textAlign: "right" }}>Tiempo</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, width: 44, textAlign: "right" }}>Desc</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, width: 32, textAlign: "right" }}>Reps</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, width: 40, textAlign: "right" }}>Peso</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, width: 48, textAlign: "right" }}>Vol</Text>
            </View>
            {summary.perSet.map((r, i) => (
              <View key={i} testID={`set-row-${r.setNumber}`} style={{ flexDirection: "row", gap: spacing.xs }}>
                <Text style={{ color: colors.text, fontSize: 11, width: 28 }}>{r.setNumber}</Text>
                <Text style={{ color: colors.text, fontSize: 11, flex: 1 }} numberOfLines={1}>{r.exerciseName}</Text>
                <Text style={{ color: colors.text, fontSize: 11, width: 44, textAlign: "right" }}>{r.durationMs != null ? fmt(r.durationMs) : "—"}</Text>
                <Text style={{ color: colors.text, fontSize: 11, width: 44, textAlign: "right" }}>{r.restMs != null ? fmt(r.restMs) : "—"}</Text>
                <Text style={{ color: colors.text, fontSize: 11, width: 32, textAlign: "right" }}>{r.reps}</Text>
                <Text style={{ color: colors.text, fontSize: 11, width: 40, textAlign: "right" }}>{r.weightKg != null ? num(r.weightKg) : "—"}</Text>
                <Text style={{ color: colors.text, fontSize: 11, width: 48, textAlign: "right" }}>{r.volumeKg != null ? num(r.volumeKg) : "—"}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
