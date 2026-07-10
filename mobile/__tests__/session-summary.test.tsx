import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { SessionSummary } from "../src/components/SessionSummary";
import type { SessionSummary as SessionSummaryData } from "../src/session/summary";

// Mock del componente nativo (SVG) para no cargar react-native-svg en jest.
jest.mock("react-native-body-highlighter", () => ({
  __esModule: true,
  default: () => null,
}));

const summary: SessionSummaryData = {
  dayLabel: "Día 1: Pecho",
  startedAt: 1782900000000,
  durationMs: 11000,
  workMs: 7000,
  restMs: 4000,
  totalPlannedSets: 4,
  totalDoneSets: 2,
  completionPct: 50,
  exercisesDone: 0,
  exercisesTotal: 2,
  totalReps: 18,
  totalVolumeKg: 736,
  avgRpe: 8.5,
  sessionLoadRpe: 152,
  avgHr: 125,
  maxHr: 145,
  perExercise: [
    {
      order: 0,
      garminName: "Barbell Bench Press",
      plannedSets: 3,
      doneSets: 2,
      completed: false,
      reps: 18,
      volumeKg: 736,
      avgHr: 125,
      maxHr: 145,
    },
  ],
  perMuscle: [{ muscle: "chest", sets: 2 }],
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps", "shoulders"],
  perSet: [
    { setNumber: 1, exerciseName: "Barbell Bench Press", durationMs: 3000, restMs: 1000, reps: 10, weightKg: 40, volumeKg: 400 },
  ],
  hrSeries: null,
};

test("muestra % cumplimiento, volumen y avg HR", async () => {
  await render(<SessionSummary summary={summary} />);
  expect(screen.getByTestId("summary")).toBeTruthy();
  expect(screen.getByTestId("summary-completion")).toBeTruthy();
  expect(screen.getByTestId("summary-volume")).toBeTruthy();
  expect(screen.getByTestId("summary-avghr")).toBeTruthy();
  expect(screen.getByText("50%")).toBeTruthy();
});

test("renderiza el mapa corporal (muscle-map) en vez de la lista por músculo", async () => {
  await render(<SessionSummary summary={summary} />);
  expect(screen.getByTestId("muscle-map")).toBeTruthy();
});

test("la tabla por serie está colapsada por defecto y se abre con toggle-sets", async () => {
  await render(<SessionSummary summary={summary} />);
  // cerrada por defecto: no se ve la fila de la serie
  expect(screen.queryByTestId("set-row-1")).toBeNull();
  await fireEvent.press(screen.getByTestId("toggle-sets"));
  await waitFor(() => expect(screen.getByTestId("set-row-1")).toBeTruthy());
});

test("no renderiza avg HR cuando no hay banda", async () => {
  await render(<SessionSummary summary={{ ...summary, avgHr: null, maxHr: null }} />);
  expect(screen.queryByTestId("summary-avghr")).toBeNull();
});

test("muestra FC por ejercicio cuando el ejercicio tiene datos de FC", async () => {
  await render(<SessionSummary summary={summary} />);
  expect(screen.getByTestId("exercise-row-0")).toBeTruthy();
  expect(screen.getByTestId("exercise-hr-0")).toBeTruthy();
  expect(screen.getByText("FC 125/145")).toBeTruthy();
});

test("no renderiza FC por ejercicio cuando el ejercicio no tiene datos de FC", async () => {
  const noExHr: SessionSummaryData = {
    ...summary,
    perExercise: [{ ...summary.perExercise[0], avgHr: null, maxHr: null }],
  };
  await render(<SessionSummary summary={noExHr} />);
  expect(screen.getByTestId("exercise-row-0")).toBeTruthy();
  expect(screen.queryByTestId("exercise-hr-0")).toBeNull();
});

test("muestra la curva de FC de sesión cuando hrSeries tiene >= 2 puntos", async () => {
  const withHrSeries: SessionSummaryData = {
    ...summary,
    hrSeries: [{ t: 0, bpm: 100 }, { t: 5000, bpm: 110 }],
  };
  await render(<SessionSummary summary={withHrSeries} />);
  expect(screen.getByTestId("summary-hr-curve")).toBeTruthy();
});

test("no muestra la curva de FC de sesión cuando hrSeries es null", async () => {
  await render(<SessionSummary summary={{ ...summary, hrSeries: null }} />);
  expect(screen.queryByTestId("summary-hr-curve")).toBeNull();
});

test("no muestra la curva de FC de sesión cuando hrSeries tiene menos de 2 puntos", async () => {
  await render(<SessionSummary summary={{ ...summary, hrSeries: [{ t: 0, bpm: 100 }] }} />);
  expect(screen.queryByTestId("summary-hr-curve")).toBeNull();
});
