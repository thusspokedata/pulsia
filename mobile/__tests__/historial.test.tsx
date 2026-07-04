import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import HistorialScreen from "../app/(tabs)/historial";
import { getSessionById } from "../src/api/sessions";
import type { WorkoutSession } from "@pulsia/shared";

const mockSessionA: WorkoutSession = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1,
  dayLabel: "Día 1: Pecho",
  location: "gym",
  startedAt: 1782900000000,
  endedAt: 1782903600000,
  totalDurationMs: 3600000,
  notes: "",
  exercises: [
    {
      catalogId: "barbell_bench_press",
      garminName: "Barbell Bench Press",
      order: 0,
      planned: { sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 },
      skipped: false,
      sets: [
        { setNumber: 1, startedAt: 2000, endedAt: 5000, durationMs: 3000, reps: 10, weightKg: 40, rpe: 8, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false },
        { setNumber: 2, startedAt: 6000, endedAt: 10000, durationMs: 4000, reps: 8, weightKg: 42, rpe: 9, repTimestamps: [], hrAvg: null, hrMax: null, skipped: false },
      ],
    },
  ],
} as WorkoutSession;

const mockSessionB: WorkoutSession = {
  ...mockSessionA,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  dayLabel: "Día 2: Espalda",
  startedAt: 1783000000000,
  endedAt: 1783003600000,
} as WorkoutSession;

// getSessions devuelve la lista liviana (el backend NO manda los ejercicios); getSessionById
// trae la sesión completa al tocar. Los mockSession* tienen los campos livianos, así sirven para la lista.
jest.mock("../src/api/sessions", () => ({
  getSessions: jest.fn(async () => [
    { id: mockSessionA.id, programId: mockSessionA.programId, dayLabel: mockSessionA.dayLabel, location: "gym", startedAt: mockSessionA.startedAt, totalDurationMs: mockSessionA.totalDurationMs },
    { id: mockSessionB.id, programId: mockSessionB.programId, dayLabel: mockSessionB.dayLabel, location: "gym", startedAt: mockSessionB.startedAt, totalDurationMs: mockSessionB.totalDurationMs },
  ]),
  getSessionById: jest.fn(async (_url: string, id: string) => (id === mockSessionA.id ? mockSessionA : mockSessionB)),
}));
jest.mock("../src/storage/config", () => ({
  getBackendUrl: jest.fn(async () => "http://backend.test"),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => cb(),
}));

test("lista ambas sesiones ordenadas por fecha desc", async () => {
  await render(<HistorialScreen />);
  await waitFor(() => {
    expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy();
    expect(screen.getByTestId(`hist-item-${mockSessionB.id}`)).toBeTruthy();
  });
});

test("al tocar una sesión muestra su SessionSummary y hist-back vuelve a la lista", async () => {
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());

  await fireEvent.press(screen.getByTestId(`hist-item-${mockSessionA.id}`));
  await waitFor(() => expect(screen.getByTestId("summary")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("hist-back"));
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());
});

test("si falla abrir una sesión muestra un error de detalle SIN ocultar la lista", async () => {
  (getSessionById as jest.Mock).mockRejectedValueOnce(new Error("boom"));
  await render(<HistorialScreen />);
  await waitFor(() => expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`hist-item-${mockSessionA.id}`));
  await waitFor(() => expect(screen.getByTestId("hist-detail-error")).toBeTruthy());
  // La lista sigue visible (no la reemplazó el error).
  expect(screen.getByTestId(`hist-item-${mockSessionA.id}`)).toBeTruthy();
});
