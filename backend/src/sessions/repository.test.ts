import { test, expect } from "bun:test";
import { rowsToSession, getRecentSessions, getSessionsSince, listSessions, upsertSession } from "./repository";
import type { WorkoutSession } from "@pulsia/shared";

// Fila anidada tal como la devuelve db.query.workoutSession.findFirst({ with: ... }).
const nestedRow = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "00000000-0000-0000-0000-000000000001",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1,
  dayLabel: "Día 1 - Pecho",
  location: "gym",
  startedAt: 1782900000000,
  endedAt: 1782903600000,
  totalDurationMs: 3600000,
  notes: "",
  createdAt: new Date(),
  updatedAt: new Date(),
  exercises: [
    {
      id: "ex-1", sessionId: "11111111-1111-4111-8111-111111111111",
      catalogId: "barbell_bench_press", garminName: "Barbell Bench Press",
      orderIndex: 0, planned: { sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 }, skipped: false,
      note: "no tengo barra", substitutedFromId: "band_assisted_pull_up",
      sets: [
        {
          id: "s-1", sessionExerciseId: "ex-1", setNumber: 1, reps: 10, weightKg: 40, rpe: 7,
          startedAt: 1782900000000, endedAt: 1782900045000, durationMs: 45000,
          repTimestamps: [0, 4000], hrAvg: null, hrMax: null, skipped: false,
        },
      ],
    },
  ],
};

test("rowsToSession convierte filas anidadas a WorkoutSession", () => {
  const s = rowsToSession(nestedRow as any);
  expect(s.id).toBe("11111111-1111-4111-8111-111111111111");
  expect(s.exercises[0].order).toBe(0); // orderIndex -> order
  expect(s.exercises[0].garminName).toBe("Barbell Bench Press");
  expect(s.exercises[0].sets[0].reps).toBe(10);
  // No filtra campos de DB al shape compartido:
  expect((s as any).createdAt).toBeUndefined();
  expect((s.exercises[0] as any).sessionId).toBeUndefined();
  // Filas viejas sin hrSeries: se mapea a undefined (no null), como espera el schema .optional().
  expect(s.hrSeries).toBeUndefined();
  // Ídem pauseIntervals: filas viejas sin la columna se mapean a undefined.
  expect(s.pauseIntervals).toBeUndefined();
});

test("rowsToSession mapea hrSeries cuando la fila lo trae", () => {
  const row = { ...nestedRow, hrSeries: [{ t: 0, bpm: 120 }, { t: 5000, bpm: 130 }] };
  const s = rowsToSession(row as any);
  expect(s.hrSeries).toEqual([{ t: 0, bpm: 120 }, { t: 5000, bpm: 130 }]);
});

test("rowsToSession mapea pauseIntervals cuando la fila lo trae", () => {
  const row = { ...nestedRow, pauseIntervals: [{ startedAt: 100, endedAt: 200 }] };
  const s = rowsToSession(row as any);
  expect(s.pauseIntervals).toEqual([{ startedAt: 100, endedAt: 200 }]);
});

test("rowsToSession sin pauseIntervals lo mapea a undefined", () => {
  const s = rowsToSession(nestedRow as any);
  expect(s.pauseIntervals).toBeUndefined();
});

test("rowsToSession mapea note y substitutedFromId", () => {
  const s = rowsToSession(nestedRow as any);
  expect(s.exercises[0].note).toBe("no tengo barra");
  expect(s.exercises[0].substitutedFromId).toBe("band_assisted_pull_up");
});

test("getRecentSessions mapea filas a WorkoutSession[] (limit)", async () => {
  const db: any = { query: { workoutSession: { findMany: async (_args: any) => [nestedRow] } } };
  const out = await getRecentSessions(db, "u", 6);
  expect(out).toHaveLength(1);
  expect(out[0].exercises[0].order).toBe(0);
});

test("getSessionsSince mapea filas a WorkoutSession[] (sin límite de cantidad)", async () => {
  let seenArgs: any = null;
  const db: any = { query: { workoutSession: { findMany: async (args: any) => { seenArgs = args; return [nestedRow]; } } } };
  const out = await getSessionsSince(db, "u", 1782900000000 - 1);
  expect(out).toHaveLength(1);
  expect(out[0].exercises[0].order).toBe(0);
  // A diferencia de getRecentSessions, no cappea por cantidad: la ventana de fecha ya acota el resultado.
  expect(seenArgs.limit).toBeUndefined();
});

test("upsertSession pasa hrSeries al insert de workoutSession", async () => {
  let insertedValues: any = null;
  const tx: any = {
    delete: () => ({ where: async () => {} }),
    insert: () => ({
      values: (v: any) => {
        insertedValues = v;
        return { returning: async () => [{ id: "ex-1" }] };
      },
    }),
  };
  const db: any = { transaction: async (fn: any) => fn(tx) };
  const s: WorkoutSession = {
    id: "11111111-1111-4111-8111-111111111111",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1,
    dayLabel: "Día 1",
    location: "gym",
    startedAt: 1782900000000,
    endedAt: null,
    totalDurationMs: null,
    notes: "",
    exercises: [],
    hrSeries: [{ t: 0, bpm: 120 }, { t: 5000, bpm: 130 }],
  };
  await upsertSession(db, "u", s);
  expect(insertedValues.hrSeries).toEqual([{ t: 0, bpm: 120 }, { t: 5000, bpm: 130 }]);
});

test("upsertSession inserta hrSeries null cuando la sesión no la trae", async () => {
  let insertedValues: any = null;
  const tx: any = {
    delete: () => ({ where: async () => {} }),
    insert: () => ({
      values: (v: any) => {
        insertedValues = v;
        return { returning: async () => [{ id: "ex-1" }] };
      },
    }),
  };
  const db: any = { transaction: async (fn: any) => fn(tx) };
  const s: WorkoutSession = {
    id: "11111111-1111-4111-8111-111111111111",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1,
    dayLabel: "Día 1",
    location: "gym",
    startedAt: 1782900000000,
    endedAt: null,
    totalDurationMs: null,
    notes: "",
    exercises: [],
  };
  await upsertSession(db, "u", s);
  expect(insertedValues.hrSeries).toBeNull();
});

test("upsertSession pasa pauseIntervals al insert de workoutSession", async () => {
  let insertedValues: any = null;
  const tx: any = {
    delete: () => ({ where: async () => {} }),
    insert: () => ({
      values: (v: any) => {
        insertedValues = v;
        return { returning: async () => [{ id: "ex-1" }] };
      },
    }),
  };
  const db: any = { transaction: async (fn: any) => fn(tx) };
  const s: WorkoutSession = {
    id: "11111111-1111-4111-8111-111111111111",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1,
    dayLabel: "Día 1",
    location: "gym",
    startedAt: 1782900000000,
    endedAt: null,
    totalDurationMs: null,
    notes: "",
    exercises: [],
    pauseIntervals: [{ startedAt: 100, endedAt: 200 }],
  };
  await upsertSession(db, "u", s);
  expect(insertedValues.pauseIntervals).toEqual([{ startedAt: 100, endedAt: 200 }]);
});

test("upsertSession inserta pauseIntervals null cuando la sesión no la trae", async () => {
  let insertedValues: any = null;
  const tx: any = {
    delete: () => ({ where: async () => {} }),
    insert: () => ({
      values: (v: any) => {
        insertedValues = v;
        return { returning: async () => [{ id: "ex-1" }] };
      },
    }),
  };
  const db: any = { transaction: async (fn: any) => fn(tx) };
  const s: WorkoutSession = {
    id: "11111111-1111-4111-8111-111111111111",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1,
    dayLabel: "Día 1",
    location: "gym",
    startedAt: 1782900000000,
    endedAt: null,
    totalDurationMs: null,
    notes: "",
    exercises: [],
  };
  await upsertSession(db, "u", s);
  expect(insertedValues.pauseIntervals).toBeNull();
});

test("listSessions incluye completionPct y proyecta liviano (sin exercises)", async () => {
  const db: any = { query: { workoutSession: { findMany: async () => [nestedRow] } } };
  const out = await listSessions(db, "u");
  expect(out[0]).toHaveProperty("completionPct");
  expect(typeof out[0].completionPct).toBe("number");
  expect(out[0]).not.toHaveProperty("exercises");
});

test("listSessions expone avgHr desde hrSeries (promedio redondeado)", async () => {
  const row = { ...nestedRow, hrSeries: [{ t: 0, bpm: 120 }, { t: 5000, bpm: 141 }] };
  const db: any = { query: { workoutSession: { findMany: async () => [row] } } };
  const [item] = await listSessions(db, "u");
  expect(item.avgHr).toBe(131); // (120+141)/2 = 130.5 → 131
});

test("listSessions cae al promedio de hrAvg de las series si no hay hrSeries", async () => {
  // nestedRow no tiene hrSeries; asegurate de que sus sets tengan hrAvg (si el fixture no trae, cloná y seteá)
  const withHr = {
    ...nestedRow,
    hrSeries: null,
    exercises: nestedRow.exercises.map((ex: any) => ({
      ...ex,
      sets: ex.sets.map((st: any, i: number) => ({ ...st, hrAvg: i === 0 ? 110 : null })),
    })),
  };
  const db: any = { query: { workoutSession: { findMany: async () => [withHr] } } };
  const [item] = await listSessions(db, "u");
  expect(item.avgHr).toBe(110); // solo los no-null cuentan
});

test("listSessions avgHr null si no hay FC en ningún lado", async () => {
  const noHr = {
    ...nestedRow, hrSeries: null,
    exercises: nestedRow.exercises.map((ex: any) => ({ ...ex, sets: ex.sets.map((st: any) => ({ ...st, hrAvg: null })) })),
  };
  const db: any = { query: { workoutSession: { findMany: async () => [noHr] } } };
  const [item] = await listSessions(db, "u");
  expect(item.avgHr).toBeNull();
});

test("listSessions deriva la duración de endedAt si totalDurationMs es null", async () => {
  const row = { ...nestedRow, totalDurationMs: null, startedAt: 1000, endedAt: 61000 };
  const db: any = { query: { workoutSession: { findMany: async () => [row] } } };
  const [item] = await listSessions(db, "u");
  expect(item.totalDurationMs).toBe(60000);
});

test("listSessions duración null si la sesión sigue en curso (endedAt null)", async () => {
  const row = { ...nestedRow, totalDurationMs: null, endedAt: null };
  const db: any = { query: { workoutSession: { findMany: async () => [row] } } };
  const [item] = await listSessions(db, "u");
  expect(item.totalDurationMs).toBeNull();
});
