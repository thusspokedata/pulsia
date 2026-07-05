import { eq, and } from "drizzle-orm";
import type { WorkoutSession } from "@pulsia/shared";
import type { Db } from "../db/client";
import { workoutSession, sessionExercise, setLog } from "../db/schema";
import { sessionCompletionPct } from "./completion";

// --- Mapeo puro: fila anidada de Drizzle -> shape compartido WorkoutSession ---
export function rowsToSession(row: any): WorkoutSession {
  return {
    id: row.id,
    programId: row.programId,
    weekNumber: row.weekNumber,
    dayLabel: row.dayLabel,
    location: row.location,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    totalDurationMs: row.totalDurationMs,
    notes: row.notes,
    exercises: (row.exercises ?? []).map((ex: any) => ({
      catalogId: ex.catalogId,
      garminName: ex.garminName,
      order: ex.orderIndex,
      planned: ex.planned,
      skipped: ex.skipped,
      note: ex.note,
      substitutedFromId: ex.substitutedFromId,
      sets: (ex.sets ?? []).map((s: any) => ({
        setNumber: s.setNumber,
        reps: s.reps,
        weightKg: s.weightKg,
        rpe: s.rpe,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMs: s.durationMs,
        repTimestamps: s.repTimestamps,
        hrAvg: s.hrAvg,
        hrMax: s.hrMax,
        skipped: s.skipped,
      })),
    })),
  };
}

// --- Upsert idempotente: borrar (cascade) + reinsertar en una transacción ---
export async function upsertSession(db: Db, userId: string, s: WorkoutSession): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(workoutSession).where(and(eq(workoutSession.id, s.id), eq(workoutSession.userId, userId)));
    await tx.insert(workoutSession).values({
      id: s.id, userId, programId: s.programId, weekNumber: s.weekNumber,
      dayLabel: s.dayLabel, location: s.location, startedAt: s.startedAt,
      endedAt: s.endedAt, totalDurationMs: s.totalDurationMs, notes: s.notes,
    });
    for (const ex of s.exercises) {
      const [exRow] = await tx.insert(sessionExercise).values({
        sessionId: s.id, catalogId: ex.catalogId, garminName: ex.garminName,
        orderIndex: ex.order, planned: ex.planned, skipped: ex.skipped,
        note: ex.note, substitutedFromId: ex.substitutedFromId,
      }).returning();
      for (const set of ex.sets) {
        await tx.insert(setLog).values({
          sessionExerciseId: exRow.id, setNumber: set.setNumber, reps: set.reps,
          weightKg: set.weightKg, rpe: set.rpe, startedAt: set.startedAt,
          endedAt: set.endedAt, durationMs: set.durationMs, repTimestamps: set.repTimestamps,
          hrAvg: set.hrAvg, hrMax: set.hrMax, skipped: set.skipped,
        });
      }
    }
  });
}

export async function getSession(db: Db, id: string, userId: string): Promise<WorkoutSession | null> {
  const row = await db.query.workoutSession.findFirst({
    where: and(eq(workoutSession.id, id), eq(workoutSession.userId, userId)),
    with: { exercises: { orderBy: (e, { asc }) => [asc(e.orderIndex)], with: { sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] } } } },
  });
  return row ? rowsToSession(row) : null;
}

export async function getRecentSessions(db: Db, userId: string, limit = 6): Promise<WorkoutSession[]> {
  const rows = await db.query.workoutSession.findMany({
    where: eq(workoutSession.userId, userId),
    orderBy: (w, { desc }) => [desc(w.startedAt)],
    limit,
    with: { exercises: { orderBy: (e, { asc }) => [asc(e.orderIndex)], with: { sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] } } } },
  });
  return rows.map(rowsToSession);
}

export async function deleteSession(db: Db, id: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(workoutSession)
    .where(and(eq(workoutSession.id, id), eq(workoutSession.userId, userId)))
    .returning({ id: workoutSession.id });
  return rows.length > 0;
}

export async function listSessions(db: Db, userId: string) {
  const rows = await db.query.workoutSession.findMany({
    where: eq(workoutSession.userId, userId),
    with: { exercises: { with: { sets: true } } },
  });
  return rows.map((row: any) => {
    const s = rowsToSession(row);
    return {
      id: s.id, programId: s.programId, dayLabel: s.dayLabel, location: s.location,
      startedAt: s.startedAt, totalDurationMs: s.totalDurationMs,
      completionPct: sessionCompletionPct(s),
    };
  });
}
