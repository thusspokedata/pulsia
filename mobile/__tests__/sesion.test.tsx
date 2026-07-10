import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockReplace = jest.fn();
let mockParams: any = { week: "1", dayLabel: "Día 1", location: "gym" };
jest.mock("expo-router", () => ({
  router: { replace: (...a: any[]) => mockReplace(...a) },
  useLocalSearchParams: () => mockParams,
}));

const mockSetActive = jest.fn();
let mockActive: any = null;
jest.mock("../src/storage/activeSession", () => ({
  getActiveSession: async () => mockActive,
  setActiveSession: async (s: any) => { mockActive = s; mockSetActive(s); },
  clearActiveSession: async () => { mockActive = null; },
}));

const mockSetPause = jest.fn();
const mockClearPause = jest.fn();
let mockPauseState: any = null;
jest.mock("../src/storage/pauseState", () => ({
  getPauseState: async () => mockPauseState,
  setPauseState: async (s: any) => { mockPauseState = s; mockSetPause(s); },
  clearPauseState: async () => { mockPauseState = null; mockClearPause(); },
}));

const mockEnqueue = jest.fn();
jest.mock("../src/storage/pendingSessions", () => ({
  enqueueSession: async (s: any) => mockEnqueue(s),
}));

const mockSync = jest.fn(async (..._a: any[]) => 0);
jest.mock("../src/sync/syncSessions", () => ({ syncPending: (...a: any[]) => mockSync(...a) }));

const mockBellPlay = jest.fn();
const mockSetAudioModeAsync = jest.fn(async (..._a: any[]) => undefined);
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => ({ seekTo: jest.fn(), play: (...a: any[]) => mockBellPlay(...a) }),
  setAudioModeAsync: (...a: any[]) => mockSetAudioModeAsync(...a),
}));

jest.mock("../src/session/id", () => ({ newSessionId: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://backend.test" }));
jest.mock("../src/api/sessions", () => ({ getLastWeights: async () => ({ barbell_bench_press: 42 }) }));
let mockProgramId: string | null = "22222222-2222-4222-8222-222222222222";
jest.mock("../src/storage/programId", () => ({ getStoredProgramId: async () => mockProgramId }));

const baseProgram = {
  name: "Plan",
  weeks: [{ weekNumber: 1, workouts: [{
    dayLabel: "Día 1", location: "gym", focus: "chest",
    exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" }],
  }] }],
};
// Variante con 2 ejercicios para poder cambiar de ejercicio activo en un test.
const twoExerciseProgram = {
  name: "Plan",
  weeks: [{ weekNumber: 1, workouts: [{
    dayLabel: "Día 1", location: "gym", focus: "chest",
    exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" },
      { catalogId: "barbell_back_squat", garminName: "Barbell Back Squat", sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" },
    ],
  }] }],
};
let mockProgram = baseProgram;
const mockSetProgram = jest.fn();
const mockGetStoredProgram = jest.fn(async () => mockProgram);
jest.mock("../src/storage/program", () => ({
  getStoredProgram: () => mockGetStoredProgram(),
  setStoredProgram: async (p: any) => mockSetProgram(p),
}));

const oneOffProgram = {
  name: "Puntual",
  weeks: [{ weekNumber: 1, workouts: [{
    dayLabel: "Puntual: Pecho", location: "gym", focus: "chest",
    exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" }],
  }] }],
};
let mockOneOffProgramId: string | null = "33333333-3333-4333-8333-333333333333";
const mockClearOneOff = jest.fn();
jest.mock("../src/storage/oneOffProgram", () => ({
  getStoredOneOffProgram: async () => oneOffProgram,
  getStoredOneOffProgramId: async () => mockOneOffProgramId,
  clearOneOff: async (...a: any[]) => mockClearOneOff(...a),
}));

jest.mock("../src/storage/profile", () => ({
  getProfile: async () => ({ gymEquipment: ["dumbbell"], homeEquipment: ["dumbbell"] }),
}));

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

beforeEach(() => {
  mockActive = null;
  mockPauseState = null;
  mockProgramId = "22222222-2222-4222-8222-222222222222";
  mockOneOffProgramId = "33333333-3333-4333-8333-333333333333";
  mockHrSamples = [];
  mockBpm = null;
  mockProgram = baseProgram;
  mockParams = { week: "1", dayLabel: "Día 1", location: "gym" };
  jest.clearAllMocks();
});

test("arma la sesión del día y muestra el ejercicio actual", async () => {
  await render(<SesionScreen />);
  // Aparece en la lista de ejercicios y como título del activo.
  await waitFor(() => expect(screen.getAllByText("Barbell Bench Press").length).toBeGreaterThan(0));
});

test("tap incrementa las reps de la serie (arrancando desde las reps planificadas)", async () => {
  // baseProgram planea reps "8-10" → la burbuja arranca pre-llenada en 8 y cada tap suma 1.
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(10));
});

test("la burbuja de reps arranca pre-llenada con las reps planificadas, antes de tocar nada", async () => {
  await render(<SesionScreen />);
  // baseProgram planea reps "8-10" → parsePlannedReps da 8, sin necesidad de ningún tap.
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(8));
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

test("los botones ±reps ajustan la serie abierta (desde el seed de reps planificadas)", async () => {
  // baseProgram planea reps "8-10" → arranca en 8; +5 → 13; -1 → 12.
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("reps-5"));
  await fireEvent.press(screen.getByTestId("reps-5"));
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(13));
  await fireEvent.press(screen.getByTestId("reps--1"));
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(12));
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

test("tap/±reps en un ejercicio ya completo no crean serie nueva (no-op)", async () => {
  // El programa mock tiene 2 series. Completamos ambas.
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set")); // serie 1
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set")); // serie 2 (última) → ejercicio completo
  await waitFor(() => screen.getByTestId("edit-reps-2"));
  // Con el ejercicio completo y sin serie abierta, tap y ±reps son no-op.
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("reps-5"));
  const last = mockSetActive.mock.calls.at(-1)?.[0];
  expect(last.exercises[0].sets.length).toBe(2);
  expect(last.exercises[0].sets.every((s: any) => s.endedAt != null)).toBe(true);
});

test("terminar con una serie abierta no deja endedAt=null en el payload", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  // Abrimos una serie (tap) pero NO la terminamos.
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  const done = mockEnqueue.mock.calls.at(-1)?.[0];
  const allSets = done.exercises.flatMap((e: any) => e.sets);
  expect(allSets.length).toBeGreaterThan(0);
  expect(allSets.every((s: any) => s.endedAt != null)).toBe(true);
});

test("el botón pausar/reanudar existe y alterna su rótulo", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("pause-toggle"));
  // Rótulo inicial: "Pausar".
  expect(screen.getByText("Pausar")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("pause-toggle"));
  // Al pausar: aparece "⏸ Pausado" y el botón pasa a "Reanudar".
  await waitFor(() => expect(screen.getByText("Reanudar")).toBeTruthy());
  expect(screen.getByText("⏸ Pausado")).toBeTruthy();
  // Reanudar vuelve al rótulo original.
  await fireEvent.press(screen.getByTestId("pause-toggle"));
  await waitFor(() => expect(screen.getByText("Pausar")).toBeTruthy());
});

test("al pausar se persiste el estado (setPauseState con pausedAt); al reanudar pausedAt es null", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("pause-toggle"));
  await fireEvent.press(screen.getByTestId("pause-toggle")); // pausa
  await waitFor(() => expect(mockSetPause).toHaveBeenCalled());
  const paused = mockSetPause.mock.calls.at(-1)?.[0];
  expect(paused.sessionId).toBe("11111111-1111-4111-8111-111111111111");
  expect(typeof paused.pausedAt).toBe("number");
  // Reanudar: pausedAt vuelve a null.
  await fireEvent.press(screen.getByTestId("pause-toggle"));
  await waitFor(() => {
    const resumed = mockSetPause.mock.calls.at(-1)?.[0];
    expect(resumed.pausedAt).toBeNull();
  });
});

test("terminar limpia el estado de pausa persistido", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockClearPause).toHaveBeenCalled());
});

test("cancelar limpia el estado de pausa persistido", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    const confirm = buttons?.find((b) => b.text === "Sí, cancelar");
    void confirm?.onPress?.();
  });
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("cancel"));
  await fireEvent.press(screen.getByTestId("cancel"));
  await waitFor(() => expect(mockClearPause).toHaveBeenCalled());
  spy.mockRestore();
});

test("al remontar con pausa persistida (pausedAt no nulo) el total al terminar excluye ese tiempo", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  // Sesión activa ya en curso (arrancó en t0) con pausa persistida: 2s acumulados + pausa en
  // curso desde t0 (pausedAt = t0). Simula un remontaje mientras estaba pausada.
  mockActive = {
    id: "11111111-1111-4111-8111-111111111111",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1, dayLabel: "Día 1", location: "gym",
    startedAt: t0, endedAt: null, totalDurationMs: null, notes: "", exercises: [],
  };
  mockPauseState = { sessionId: "11111111-1111-4111-8111-111111111111", pausedMs: 2_000, pausedAt: t0 };
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  // Reanudar en t0 + 10s → la pausa en curso duró 10s → total pausado 2s + 10s = 12s.
  spy.mockReturnValue(t0 + 10_000);
  await fireEvent.press(screen.getByTestId("pause-toggle")); // reanuda
  // Terminar en t0 + 30s → bruto 30s, menos 12s pausados = 18s.
  spy.mockReturnValue(t0 + 30_000);
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  const done = mockEnqueue.mock.calls.at(-1)?.[0];
  expect(done.totalDurationMs).toBe(18_000);
  spy.mockRestore();
});

test("pausar durante el descanso lo congela y no dispara la campana; al reanudar retoma", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  // Terminar una serie arranca el descanso (restSeconds = 90 → 90s).
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => screen.getByTestId("rest-timer"));
  // Pausar a los 10s: quedan 80s de descanso, el contador se congela.
  spy.mockReturnValue(t0 + 10_000);
  await fireEvent.press(screen.getByTestId("pause-toggle"));
  // El rest-timer desaparece mientras está pausado (restUntil = null).
  await waitFor(() => expect(screen.queryByTestId("rest-timer")).toBeNull());
  // Avanza el reloj MUCHO más allá del descanso original mientras está pausado: la campana NO suena.
  spy.mockReturnValue(t0 + 200_000);
  expect(mockBellPlay).not.toHaveBeenCalled();
  // Reanudar: el descanso retoma con los 80s que le quedaban (nuevo restUntil ~ ahora + 80s).
  await fireEvent.press(screen.getByTestId("pause-toggle"));
  await waitFor(() => screen.getByTestId("rest-timer"));
  // La campana sigue sin haber sonado (aún queda descanso).
  expect(mockBellPlay).not.toHaveBeenCalled();
  spy.mockRestore();
});

test("el total al terminar excluye el tiempo pausado", async () => {
  // Controlamos el reloj para medir la pausa determinísticamente.
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("pause-toggle"));
  // Pausar en t0 + 5s.
  spy.mockReturnValue(t0 + 5_000);
  await fireEvent.press(screen.getByTestId("pause-toggle")); // pausa arranca
  // Reanudar en t0 + 8s → 3s pausados.
  spy.mockReturnValue(t0 + 8_000);
  await fireEvent.press(screen.getByTestId("pause-toggle")); // pausa termina (3s acumulados)
  // Terminar en t0 + 20s → total bruto 20s, menos 3s pausados = 17s.
  spy.mockReturnValue(t0 + 20_000);
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  const done = mockEnqueue.mock.calls.at(-1)?.[0];
  // La sesión arrancó en el primer Date.now() (t0), total = 20s - 3s pausados.
  expect(done.totalDurationMs).toBe(17_000);
  spy.mockRestore();
});

test("muestra el bpm en vivo en el box de HR", async () => {
  mockBpm = 80;
  await render(<SesionScreen />);
  await waitFor(() => expect(screen.getByTestId("hr-value").props.children).toBe(80));
});

test("editar la nota durante la sesión persiste en sesión activa", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  const input = await screen.findByTestId("notes-input");
  await fireEvent.changeText(input, "hombro molesto");
  await waitFor(() =>
    expect(mockSetActive).toHaveBeenCalledWith(expect.objectContaining({ notes: "hombro molesto" })),
  );
});

test("editar la nota en el resumen re-encola la sesión con la nota", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(screen.getByTestId("summary")).toBeTruthy());
  const input = await screen.findByTestId("notes-input");
  await fireEvent.changeText(input, "buen día de espalda");
  await fireEvent(input, "blur");
  await waitFor(() =>
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ notes: "buen día de espalda" })),
  );
});

test("cambiar ejercicio: elige alternativa + nota y aplica a sesión y programa", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("cambiar-ejercicio"));
  const alts = await screen.findAllByTestId(/^alt-/); // alternativas por músculo+equipo
  await fireEvent.press(alts[0]); // elegimos la primera alternativa
  await fireEvent.changeText(screen.getByTestId("cambio-nota"), "no tengo barra");
  await fireEvent.press(screen.getByTestId("confirmar-cambio"));
  await waitFor(() => {
    const last = mockSetActive.mock.calls.at(-1)?.[0];
    expect(last.exercises[0].note).toBe("no tengo barra");
    expect(last.exercises[0].catalogId).not.toBe("barbell_bench_press");
  });
  await waitFor(() => expect(mockSetProgram).toHaveBeenCalled());
});

test("cambiar ejercicio durante un entreno puntual NO persiste en el plan vigente", async () => {
  mockParams = { week: "1", dayLabel: "Puntual: Pecho", location: "gym", oneOff: "true" };
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("cambiar-ejercicio"));
  const alts = await screen.findAllByTestId(/^alt-/);
  await fireEvent.press(alts[0]);
  await fireEvent.changeText(screen.getByTestId("cambio-nota"), "en el hotel");
  await fireEvent.press(screen.getByTestId("confirmar-cambio"));
  // la sustitución se aplica a la sesión en curso...
  await waitFor(() => {
    const last = mockSetActive.mock.calls.at(-1)?.[0];
    expect(last.exercises[0].catalogId).not.toBe("barbell_bench_press");
  });
  // ...pero NO se toca el plan vigente (pulsia.program) en un entreno puntual.
  expect(mockSetProgram).not.toHaveBeenCalled();
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

test("muestra el peso sugerido del ejercicio activo y al tocarlo rellena el input", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  const hint = await screen.findByTestId("weight-suggestion");
  await fireEvent.press(hint);
  await waitFor(() => expect(screen.getByTestId("weight").props.value).toBe("42"));
});

test("con oneOff=true arma la sesión desde el programa one-off (no el plan vigente)", async () => {
  mockParams = { week: "1", dayLabel: "Puntual: Pecho", location: "gym", oneOff: "true" };
  await render(<SesionScreen />);
  await waitFor(() => expect(screen.getAllByText("Barbell Bench Press").length).toBeGreaterThan(0));
  expect(screen.getByText("Puntual: Pecho")).toBeTruthy();
  expect(mockGetStoredProgram).not.toHaveBeenCalled();
});

test("al terminar un entreno puntual se limpia el slot one-off (no el plan vigente)", async () => {
  mockParams = { week: "1", dayLabel: "Puntual: Pecho", location: "gym", oneOff: "true" };
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  await waitFor(() => expect(mockClearOneOff).toHaveBeenCalled());
  expect(mockSetProgram).not.toHaveBeenCalled();
});

test("al cancelar un entreno puntual se limpia el slot one-off (no el plan vigente)", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    const confirm = buttons?.find((b) => b.text === "Sí, cancelar");
    void confirm?.onPress?.();
  });
  mockParams = { week: "1", dayLabel: "Puntual: Pecho", location: "gym", oneOff: "true" };
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("cancel"));
  await fireEvent.press(screen.getByTestId("cancel"));
  await waitFor(() => expect(mockClearOneOff).toHaveBeenCalled());
  expect(mockSetProgram).not.toHaveBeenCalled();
  spy.mockRestore();
});

test("cambiar de ejercicio activo resetea el picker de cambio (no arrastra la elección)", async () => {
  mockProgram = twoExerciseProgram;
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  // Abrir el picker para el ejercicio activo (order 0) y elegir una alternativa.
  await fireEvent.press(screen.getByTestId("cambiar-ejercicio"));
  const alts = await screen.findAllByTestId(/^alt-/);
  await fireEvent.press(alts[0]);
  expect(screen.getByTestId("confirmar-cambio")).toBeTruthy();
  // Cambiar al segundo ejercicio (order 1) SIN confirmar → el picker se cierra/resetea.
  await fireEvent.press(screen.getByTestId("ex-item-1"));
  await waitFor(() => expect(screen.queryByTestId("confirmar-cambio")).toBeNull());
});

test("cambiar de ejercicio activo NO corta el descanso ni la campana en curso", async () => {
  mockProgram = twoExerciseProgram;
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  // Terminar una serie arranca el descanso (restSeconds = 90 → 90s) del ejercicio activo (order 0).
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => screen.getByTestId("rest-timer"));
  // Cambiar al segundo ejercicio (order 1): el descanso NO debe desaparecer.
  await fireEvent.press(screen.getByTestId("ex-item-1"));
  await waitFor(() => expect(screen.getByTestId("rest-timer")).toBeTruthy());
});

test("configura el audio en mixWithOthers al montar (la campana no pausa música/podcasts)", async () => {
  await render(<SesionScreen />);
  await waitFor(() =>
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ interruptionMode: "mixWithOthers", playsInSilentMode: true }),
    ),
  );
});
