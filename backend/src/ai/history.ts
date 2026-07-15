import type { WorkoutSession, SessionExercise } from "@pulsia/shared";
import { epochToUtcDateStr as fmtDate } from "../lib/dateUtc";

function fmtSet(s: SessionExercise["sets"][number]): string {
  const w = s.weightKg == null ? "—" : String(s.weightKg);
  const rpe = s.rpe == null ? "" : `@${s.rpe}`;
  return `${w}×${s.reps}${rpe}`;
}

function exerciseLine(ex: SessionExercise): string {
  const done = ex.sets.filter((s) => s.endedAt != null);
  const target = ex.planned.sets;
  const pct = target > 0 ? Math.round((done.length / target) * 100) : 0;
  const setsStr = done.length ? done.map(fmtSet).join(", ") : "sin series";
  const skip = ex.skipped ? " (saltado)" : "";
  const parts = [`  - ${ex.garminName}${skip} (${done.length}/${target} series, ${pct}%): ${setsStr}`];
  if (ex.substitutedFromId) parts.push(`    (cambió ${ex.substitutedFromId} por ${ex.catalogId})`);
  const note = ex.note?.trim();
  if (note) parts.push(`    nota: ${note.slice(0, 300)}`);
  return parts.join("\n");
}

// Resumen compacto de las sesiones recientes (más reciente primero) para el prompt de generación.
// Sin sesiones → "" (el prompt queda intacto).
export function buildTrainingHistorySummary(sessions: WorkoutSession[]): string {
  if (sessions.length === 0) return "";
  return sessions
    .map((s) => {
      const head = `${fmtDate(s.startedAt)} — ${s.dayLabel} (${s.location})`;
      const exLines = s.exercises.map(exerciseLine).join("\n");
      const sNote = s.notes?.trim();
      const noteLine = sNote ? `  nota de sesión: ${sNote.slice(0, 300)}` : "";
      return [head, exLines, noteLine].filter(Boolean).join("\n");
    })
    .join("\n\n");
}
