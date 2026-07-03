import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

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

jest.mock("expo-audio", () => ({ useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn() }) }));

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

let mockHrSamples: { t: number; bpm: number }[] = [];
let mockBpm: number | null = null;
jest.mock("../src/ble/useHeartRate", () => ({
  useHeartRate: () => ({
    status: "connected",
    bpm: mockBpm,
    connect: jest.fn(),
    disconnect: jest.fn(),
    reconnect: jest.fn(),
    getSamples: () => mockHrSamples,
    resetSamples: jest.fn(),
  }),
}));

import SesionScreen from "../app/sesion";

beforeEach(() => { mockActive = null; mockProgramId = "22222222-2222-4222-8222-222222222222"; mockHrSamples = []; mockBpm = null; jest.clearAllMocks(); });

test("arma la sesión del día y muestra el ejercicio actual", async () => {
  await render(<SesionScreen />);
  // Aparece en la lista de ejercicios y como título del activo.
  await waitFor(() => expect(screen.getAllByText("Barbell Bench Press").length).toBeGreaterThan(0));
});

test("tap incrementa las reps de la serie", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(2));
});

test("terminar entrenamiento persiste a la cola y muestra el resumen (no navega hasta Listo)", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  // Aparece el resumen y NO se navega todavía.
  await waitFor(() => expect(screen.getByTestId("summary")).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
  // Recién al tocar "Listo" se navega a la home.
  await fireEvent.press(screen.getByTestId("summary-done"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
});

test("cancelar entrenamiento confirma, navega y no encola", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    // Invocamos el onPress del botón "Sí, cancelar".
    const confirm = buttons?.find((b) => b.text === "Sí, cancelar");
    void confirm?.onPress?.();
  });
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("cancel"));
  await fireEvent.press(screen.getByTestId("cancel"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(mockEnqueue).not.toHaveBeenCalled();
  spy.mockRestore();
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

test("los botones ±reps ajustan la serie abierta", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("reps-5"));
  await fireEvent.press(screen.getByTestId("reps-5"));
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(5));
  await fireEvent.press(screen.getByTestId("reps--1"));
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(4));
});

test("tras completar la última serie el ejercicio sigue editable (no auto-avanza)", async () => {
  // El programa mock tiene 2 series planificadas. Completamos ambas.
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set")); // serie 1
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set")); // serie 2 (última)
  // El ejercicio activo NO desaparece: sus filas de corrección siguen visibles y editables.
  await waitFor(() => screen.getByTestId("edit-reps-2"));
  await fireEvent(screen.getByTestId("edit-reps-2"), "endEditing", { nativeEvent: { text: "7" } });
  await waitFor(() =>
    expect(mockSetActive).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: expect.arrayContaining([
          expect.objectContaining({ sets: expect.arrayContaining([expect.objectContaining({ setNumber: 2, reps: 7 })]) }),
        ]),
      }),
    ),
  );
});

test("muestra el bpm en vivo en el box de HR", async () => {
  mockBpm = 80;
  await render(<SesionScreen />);
  await waitFor(() => expect(screen.getByTestId("hr-value").props.children).toBe(80));
});

test("al terminar la serie guarda hrAvg/hrMax agregados de los samples", async () => {
  mockHrSamples = [{ t: 1, bpm: 78 }, { t: 2, bpm: 84 }];
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const last = mockSetActive.mock.calls.at(-1)?.[0];
    const set = last.exercises[0].sets[0];
    expect(set.hrAvg).toBe(81); // round((78+84)/2)
    expect(set.hrMax).toBe(84);
  });
});
