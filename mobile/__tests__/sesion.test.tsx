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
let mockProgramId: string | null = "22222222-2222-4222-8222-222222222222";
jest.mock("../src/storage/programId", () => ({ getStoredProgramId: async () => mockProgramId }));

const program = {
  name: "Plan",
  weeks: [{ weekNumber: 1, workouts: [{
    dayLabel: "Día 1", location: "gym", focus: "chest",
    exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" }],
  }] }],
};
jest.mock("../src/storage/program", () => ({ getStoredProgram: async () => program }));

import SesionScreen from "../app/sesion";

beforeEach(() => { mockActive = null; mockProgramId = "22222222-2222-4222-8222-222222222222"; jest.clearAllMocks(); });

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

test("sin programId guardado no arma sesión y vuelve a la home", async () => {
  mockProgramId = null;
  await render(<SesionScreen />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(screen.queryByText("Barbell Bench Press")).toBeNull();
});

test("una sesión activa de OTRO día no se resume: vuelve a la home", async () => {
  mockActive = {
    id: "99999999-9999-4999-8999-999999999999",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1, dayLabel: "Día 2", location: "gym",
    startedAt: 1, endedAt: null, totalDurationMs: null, notes: "", exercises: [],
  };
  await render(<SesionScreen />); // params piden "Día 1"
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(screen.queryByText("Barbell Bench Press")).toBeNull();
});

test("peso no numérico no guarda NaN (queda null)", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.changeText(screen.getByTestId("weight"), "abc");
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const last = mockSetActive.mock.calls.at(-1)?.[0];
    const set = last.exercises[0].sets[0];
    expect(set.endedAt).not.toBeNull();
    expect(set.weightKg).toBeNull();
  });
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
