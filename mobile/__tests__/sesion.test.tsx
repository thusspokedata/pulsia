import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...a: any[]) => mockReplace(...a) },
  useLocalSearchParams: () => ({ week: "1", dayLabel: "Día 1", location: "gym" }),
}));

const mockSetActive = jest.fn();
let mockActive: any = null;
jest.mock("../src/storage/activeSession", () => ({
  getActiveSession: async () => mockActive,
  setActiveSession: async (s: any) => { mockActive = s; mockSetActive(s); },
  clearActiveSession: async () => { mockActive = null; },
}));

const mockEnqueue = jest.fn();
jest.mock("../src/storage/pendingSessions", () => ({
  enqueueSession: async (s: any) => mockEnqueue(s),
}));

const mockSync = jest.fn(async (..._a: any[]) => 0);
jest.mock("../src/sync/syncSessions", () => ({ syncPending: (...a: any[]) => mockSync(...a) }));

jest.mock("../src/session/id", () => ({ newSessionId: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://backend.test" }));
jest.mock("../src/storage/programId", () => ({ getStoredProgramId: async () => "22222222-2222-4222-8222-222222222222" }));

const program = {
  name: "Plan",
  weeks: [{ weekNumber: 1, workouts: [{
    dayLabel: "Día 1", location: "gym", focus: "chest",
    exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" }],
  }] }],
};
jest.mock("../src/storage/program", () => ({ getStoredProgram: async () => program }));

import SesionScreen from "../app/sesion";

beforeEach(() => { mockActive = null; jest.clearAllMocks(); });

test("arma la sesión del día y muestra el ejercicio actual", async () => {
  await render(<SesionScreen />);
  await waitFor(() => expect(screen.getByText("Barbell Bench Press")).toBeTruthy());
});

test("tap incrementa las reps de la serie", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(2));
});

test("terminar entrenamiento persiste a la cola y navega a home", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  expect(mockReplace).toHaveBeenCalledWith("/");
});

test("permite corregir las reps de una serie ya terminada", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => screen.getByTestId("edit-reps-1"));
  await fireEvent(screen.getByTestId("edit-reps-1"), "endEditing", { nativeEvent: { text: "9" } });
  await waitFor(() =>
    expect(mockSetActive).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: expect.arrayContaining([
          expect.objectContaining({ sets: expect.arrayContaining([expect.objectContaining({ setNumber: 1, reps: 9 })]) }),
        ]),
      }),
    ),
  );
});
