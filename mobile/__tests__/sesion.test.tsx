import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import { summarize } from "../src/session/summary";

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
jest.mock("../src/storage/pauseState", () => {
  const actual = jest.requireActual("../src/storage/pauseState");
  return {
    ...actual,
    getPauseState: async () => mockPauseState,
    setPauseState: async (s: any) => { mockPauseState = s; mockSetPause(s); },
    clearPauseState: async () => { mockPauseState = null; mockClearPause(); },
  };
});

const mockSetRest = jest.fn();
const mockClearRest = jest.fn();
let mockRestState: any = null;
jest.mock("../src/storage/restState", () => ({
  getRestState: async () => mockRestState,
  setRestState: async (s: any) => { mockRestState = s; mockSetRest(s); },
  clearRestState: async () => { mockRestState = null; mockClearRest(); },
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

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));

const mockSchedule = jest.fn(async (..._a: any[]) => "notif-1");
const mockCancel = jest.fn(async (..._a: any[]) => undefined);
jest.mock("../src/session/restNotification", () => {
  const actual = jest.requireActual("../src/session/restNotification");
  return {
    ...actual,
    scheduleRestBell: (...a: any[]) => mockSchedule(...a),
    cancelRestBell: (...a: any[]) => mockCancel(...a),
  };
});

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
let mockHrFullLog: { t: number; bpm: number }[] = [];
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
    getFullLog: () => mockHrFullLog,
    resetFullLog: jest.fn(),
  }),
}));

import SesionScreen from "../app/sesion";

const RESUME_ID = "11111111-1111-4111-8111-111111111111";
const makeResumeActive = (startedAt: number, sets: any[]) => ({
  id: RESUME_ID,
  programId: "22222222-2222-4222-8222-222222222222",
  weekNumber: 1, dayLabel: "Día 1", location: "gym",
  startedAt, endedAt: null, totalDurationMs: null, notes: "",
  exercises: [{
    catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", order: 0,
    planned: { sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90 },
    skipped: false, sets, note: "", substitutedFromId: null,
  }],
});
const finishedSet = (startedAt: number, endedAt: number) => ({
  setNumber: 1, reps: 8, weightKg: null, rpe: null,
  startedAt, endedAt, durationMs: endedAt - startedAt,
  repTimestamps: [], hrAvg: null, hrMax: null, skipped: false,
});

beforeEach(() => {
  mockActive = null;
  mockRestState = null;
  mockPauseState = null;
  mockProgramId = "22222222-2222-4222-8222-222222222222";
  mockOneOffProgramId = "33333333-3333-4333-8333-333333333333";
  mockHrSamples = [];
  mockHrFullLog = [];
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

test("el ejercicio activo muestra el nombre en español + el inglés como secundario", async () => {
  await render(<SesionScreen />);
  // Scopeado al header del ejercicio ACTIVO (por testID), no a la fila de la lista:
  // así el test falla si el título del activo regresa al inglés.
  await waitFor(() => expect(screen.getByTestId("active-exercise-name").props.children).toBe("Press de banca con barra"));
  expect(screen.getByTestId("active-exercise-name-en").props.children).toBe("Barbell Bench Press");
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

test("'Terminar serie' guarda directo con las reps del plan sin tocar +1/−1", async () => {
  // baseProgram planea reps "8-10" → parsePlannedReps da 8. Sin tocar nada, "Terminar serie"
  // debe materializar y cerrar la serie con reps 8 (antes no guardaba nada).
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const last = mockSetActive.mock.calls.at(-1)?.[0];
    const sets = last.exercises[0].sets;
    expect(sets.length).toBe(1);
    expect(sets[0].endedAt).not.toBeNull();
    expect(sets[0].reps).toBe(8);
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

test("al pausar se persiste el estado (intervalo abierto); al reanudar el intervalo se cierra", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("pause-toggle"));
  await fireEvent.press(screen.getByTestId("pause-toggle")); // pausa
  await waitFor(() => expect(mockSetPause).toHaveBeenCalled());
  const paused = mockSetPause.mock.calls.at(-1)?.[0];
  expect(paused.sessionId).toBe("11111111-1111-4111-8111-111111111111");
  expect(paused.intervals.length).toBe(1);
  expect(paused.intervals.at(-1).endedAt).toBeNull();
  // Reanudar: el último intervalo queda cerrado (endedAt numérico).
  await fireEvent.press(screen.getByTestId("pause-toggle"));
  await waitFor(() => {
    const resumed = mockSetPause.mock.calls.at(-1)?.[0];
    expect(typeof resumed.intervals.at(-1).endedAt).toBe("number");
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

test("al remontar con pausa persistida (intervalo abierto) el total al terminar excluye ese tiempo", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  // El remontaje ocurre en t0+8s: la sesión arrancó en t0, ya tuvo una pausa cerrada de 2s
  // (t0+1s a t0+3s) y quedó pausada de nuevo desde t0+5s (intervalo abierto al remontar).
  spy.mockReturnValue(t0 + 8_000);
  mockActive = {
    id: "11111111-1111-4111-8111-111111111111",
    programId: "22222222-2222-4222-8222-222222222222",
    weekNumber: 1, dayLabel: "Día 1", location: "gym",
    startedAt: t0, endedAt: null, totalDurationMs: null, notes: "", exercises: [],
  };
  mockPauseState = {
    sessionId: "11111111-1111-4111-8111-111111111111",
    intervals: [{ startedAt: t0 + 1_000, endedAt: t0 + 3_000 }, { startedAt: t0 + 5_000, endedAt: null }],
  };
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  // Reanudar en t0 + 10s → la pausa en curso (desde t0+5s) duró 5s → total pausado 2s + 5s = 7s.
  spy.mockReturnValue(t0 + 10_000);
  await fireEvent.press(screen.getByTestId("pause-toggle")); // reanuda
  // Terminar en t0 + 30s → bruto 30s, menos 7s pausados = 23s.
  spy.mockReturnValue(t0 + 30_000);
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  const done = mockEnqueue.mock.calls.at(-1)?.[0];
  expect(done.totalDurationMs).toBe(23_000);
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

test("terminar entrenamiento adjunta hrSeries cuando hay log completo de FC", async () => {
  // Los samples deben caer DESPUÉS del startedAt de la sesión (Date.now() al arrancar), como en
  // producción; buildHrSeries descarta los previos. Timestamps futuros con margen holgado.
  const base = Date.now() + 60_000;
  mockHrFullLog = [{ t: base, bpm: 100 }, { t: base + 5_000, bpm: 110 }];
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => {
    const enqueued = mockEnqueue.mock.calls.at(-1)?.[0];
    expect(enqueued.hrSeries).toBeDefined();
    expect(enqueued.hrSeries.length).toBeGreaterThan(0);
  });
});

test("terminar entrenamiento no adjunta hrSeries cuando no hay log de FC", async () => {
  mockHrFullLog = [];
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => {
    const enqueued = mockEnqueue.mock.calls.at(-1)?.[0];
    expect(enqueued.hrSeries).toBeUndefined();
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

test("interactuar con las reps mientras está pausado auto-reanuda la sesión", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("pause-toggle"));
  await fireEvent.press(screen.getByTestId("pause-toggle")); // pausa
  await waitFor(() => expect(screen.getByText("Reanudar")).toBeTruthy());
  // Tocar la burbuja de reps mientras está pausado: auto-reanuda (sin usar el botón "Reanudar")...
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await waitFor(() => expect(screen.getByText("Pausar")).toBeTruthy());
  // ...y la interacción se aplica igual (arranca en 8 planificado + el tap = 9).
  await waitFor(() => expect(screen.getByTestId("rep-count").props.children).toBe(9));
});

test("ajustar reps mientras está pausado también auto-reanuda", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("pause-toggle"));
  await fireEvent.press(screen.getByTestId("pause-toggle")); // pausa
  await waitFor(() => expect(screen.getByText("Reanudar")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("reps-1"));
  await waitFor(() => expect(screen.getByText("Pausar")).toBeTruthy());
});

test("terminar serie mientras está pausado también auto-reanuda", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("pause-toggle")); // pausa
  await waitFor(() => expect(screen.getByText("Reanudar")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => expect(screen.getByText("Pausar")).toBeTruthy());
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

test("al terminar una serie se programa la campana nativa de fin de descanso", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set")); // arranca el descanso → programa la notif
  await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
});

test("saltar el descanso cancela la campana nativa programada", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
  await fireEvent.press(screen.getByTestId("skip-rest")); // limpia restUntil → cleanup cancela la notif
  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("notif-1"));
});

test("terminar la sesión cancela la campana nativa programada (el resumen no desmonta)", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set")); // arranca el descanso → programa la notif
  await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
  await fireEvent.press(screen.getByTestId("finish")); // el resumen se muestra en el mismo componente (sin unmount)
  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("notif-1"));
});

// --- Tiempo de trabajo por serie -------------------------------------------------------------
// Regresión del bug "Trabajo 0:14 / Descanso 42:52": desde que la burbuja de reps arranca
// pre-llenada, el usuario ya no tapea y casi toda serie pasa por el camino "instantáneo" de
// onEndSet, que creaba y cerraba la serie en el mismo instante → durationMs ≈ 0 y, como el
// descanso se deriva restando (total − trabajo), el descanso se comía la sesión entera.
// Modelo correcto: la serie empieza cuando TERMINA el descanso anterior (o al arrancar la sesión).

test("regresión: 'Terminar serie' sin tapear reps registra el trabajo real, no ~0", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0); // la sesión arranca en t0 → la primera serie también
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));
  // El usuario entrena 45s y toca "Terminar serie" SIN tocar la burbuja de reps (camino real).
  spy.mockReturnValue(t0 + 45_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const set = mockSetActive.mock.calls.at(-1)?.[0].exercises[0].sets[0];
    expect(set.endedAt).toBe(t0 + 45_000);
    expect(set.startedAt).toBe(t0); // no el instante del press
    expect(set.durationMs).toBe(45_000); // con el bug: 0
  });
  spy.mockRestore();
});

test("la serie siguiente arranca cuando termina el descanso: Trabajo + Descanso = Total", async () => {
  const t0 = 1_000_000;
  jest.useFakeTimers();
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));

  // Serie 1: 40s de trabajo, sin tapear. Arranca el descanso planificado (90s) → hasta t0+130s.
  spy.mockReturnValue(t0 + 40_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => screen.getByTestId("rest-timer"));

  // Corre el descanso completo: al cruzar 0 el tick del intervalo lo cierra y nace la serie 2.
  spy.mockReturnValue(t0 + 130_000);
  await act(async () => {
    jest.advanceTimersByTime(1_000);
  });
  await waitFor(() => expect(screen.queryByTestId("rest-timer")).toBeNull());

  // Serie 2: otros 40s de trabajo (t0+130s → t0+170s).
  spy.mockReturnValue(t0 + 170_000);
  await fireEvent.press(screen.getByTestId("end-set"));

  // Terminar en t0+180s → total 180s.
  spy.mockReturnValue(t0 + 180_000);
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());

  const done = mockEnqueue.mock.calls.at(-1)?.[0];
  const sets = done.exercises[0].sets;
  expect(sets.map((s: any) => s.durationMs)).toEqual([40_000, 40_000]);

  const sum = summarize(done);
  expect(sum.durationMs).toBe(180_000);
  expect(sum.workMs).toBe(80_000); // con el bug: ~0
  expect(sum.restMs).toBe(100_000); // 90s de descanso + los 10s finales sin serie
  expect(sum.workMs + sum.restMs).toBe(sum.durationMs);

  spy.mockRestore();
  jest.useRealTimers();
});

test("saltar el descanso también hace nacer la serie siguiente en ese instante", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));

  // Serie 1: 30s de trabajo → descanso hasta t0+120s.
  spy.mockReturnValue(t0 + 30_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => screen.getByTestId("rest-timer"));

  // El usuario salta el descanso a los 20s (t0+50s): ahí empieza la serie 2.
  spy.mockReturnValue(t0 + 50_000);
  await fireEvent.press(screen.getByTestId("skip-rest"));

  // Serie 2: 25s de trabajo (t0+50s → t0+75s).
  spy.mockReturnValue(t0 + 75_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const sets = mockSetActive.mock.calls.at(-1)?.[0].exercises[0].sets;
    expect(sets[1].startedAt).toBe(t0 + 50_000); // el instante del skip, no el del press
    expect(sets[1].durationMs).toBe(25_000);
  });
  spy.mockRestore();
});

test("terminar una serie MIENTRAS corre el descanso no re-cuenta la serie anterior", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));

  // Serie 1: 40s → descanso hasta t0+130s.
  spy.mockReturnValue(t0 + 40_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => screen.getByTestId("rest-timer"));

  // El usuario no espera la campana: termina la serie 2 en t0+70s, con el descanso corriendo.
  // La serie 2 no puede empezar antes de que termine la 1 → arranca en t0+40s, dura 30s.
  spy.mockReturnValue(t0 + 70_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const sets = mockSetActive.mock.calls.at(-1)?.[0].exercises[0].sets;
    expect(sets[1].startedAt).toBe(t0 + 40_000);
    expect(sets[1].durationMs).toBe(30_000); // NO 70_000 (re-contaría la serie 1 y el descanso)
  });
  spy.mockRestore();
});

test("regresión cross-exercise: cambiar de ejercicio con una serie abierta no la deja solapar (workMs ≤ total)", async () => {
  // El usuario abre una serie en A (tapea reps), cambia de ejercicio activo a B SIN terminarla y
  // trabaja en B. Con el bug, la serie de A quedaba abierta y closeOpenSets (al finalizar) le ponía
  // endedAt=finishTime → su durationMs abarcaba toda la sesión y se solapaba con las series de B:
  // workMs (suma de durationMs) SUPERABA totalDurationMs y restMs clampeaba a 0.
  mockProgram = twoExerciseProgram;
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));

  // El usuario tapea una rep en A (order 0): abre una serie (endedAt=null).
  await fireEvent.press(screen.getByTestId("tap-rep"));

  // A los 30s cambia el ejercicio activo a B (order 1) SIN terminar la serie de A.
  spy.mockReturnValue(t0 + 30_000);
  await fireEvent.press(screen.getByTestId("ex-item-1"));

  // Trabaja en B: una serie de 30s (t0+30s → t0+60s).
  await fireEvent.press(screen.getByTestId("tap-rep"));
  spy.mockReturnValue(t0 + 60_000);
  await fireEvent.press(screen.getByTestId("end-set"));

  // Termina la sesión en t0+90s → total 90s.
  spy.mockReturnValue(t0 + 90_000);
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());

  const done = mockEnqueue.mock.calls.at(-1)?.[0];
  const a = done.exercises[0].sets;
  const b = done.exercises[1].sets;
  // La serie de A se cerró al cambiar de ejercicio (no quedó abierta hasta el final).
  expect(a).toHaveLength(1);
  expect(a[0].endedAt).toBe(t0 + 30_000);
  expect(a[0].durationMs).toBe(30_000); // con el bug: 90_000 (hasta el finish)
  // La serie de B arranca cuando se dejó A y dura lo suyo, sin solaparse con A.
  expect(b[0].startedAt).toBe(t0 + 30_000);
  expect(b[0].durationMs).toBe(30_000);
  expect(a[0].endedAt).toBeLessThanOrEqual(b[0].startedAt); // no se solapan

  const sum = summarize(done);
  expect(sum.durationMs).toBe(90_000);
  expect(sum.workMs).toBe(60_000);
  // Invariante clave: las series no se solapan → el trabajo nunca supera el total (con el bug: 150k > 90k).
  expect(sum.workMs).toBeLessThanOrEqual(sum.durationMs);
  expect(sum.restMs).toBe(30_000);
  expect(sum.workMs + sum.restMs).toBe(sum.durationMs);

  spy.mockRestore();
});

// --- Persistencia del timing por-serie (setStartRef + descanso) para sobrevivir un remontaje ---

test("terminar la serie persiste el descanso pendiente", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));
  spy.mockReturnValue(t0 + 40_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  const rs = mockSetRest.mock.calls.at(-1)?.[0];
  expect(rs).toEqual({ sessionId: RESUME_ID, setStart: t0, restUntil: t0 + 130_000 });
  spy.mockRestore();
});

test("saltar el descanso persiste el timing (skip, sin descanso)", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));
  spy.mockReturnValue(t0 + 40_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => screen.getByTestId("rest-timer"));
  spy.mockReturnValue(t0 + 50_000);
  await fireEvent.press(screen.getByTestId("skip-rest"));
  expect(mockSetRest.mock.calls.at(-1)?.[0]).toEqual({ sessionId: RESUME_ID, setStart: t0 + 50_000, restUntil: null });
  spy.mockRestore();
});

test("armar una sesión nueva persiste el timing inicial", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));
  expect(mockSetRest.mock.calls.at(-1)?.[0]).toEqual({ sessionId: RESUME_ID, setStart: t0, restUntil: null });
  spy.mockRestore();
});

test("terminar el entrenamiento limpia el timing persistido", async () => {
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("finish"));
  await fireEvent.press(screen.getByTestId("finish"));
  await waitFor(() => expect(mockClearRest).toHaveBeenCalled());
});

test("reanudar antes de la primera serie: la serie arranca en el inicio de sesión, no en el remontaje", async () => {
  const t0 = 1_000_000;
  mockActive = makeResumeActive(t0, []);
  mockRestState = { sessionId: RESUME_ID, setStart: t0, restUntil: null };
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0 + 300_000);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));
  spy.mockReturnValue(t0 + 345_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const set = mockSetActive.mock.calls.at(-1)?.[0].exercises[0].sets[0];
    expect(set.startedAt).toBe(t0);
    expect(set.durationMs).toBe(345_000);
  });
  spy.mockRestore();
});

test("reanudar tras vencer el descanso con la app cerrada: la serie siguiente arranca al fin del descanso", async () => {
  const t0 = 1_000_000;
  mockActive = makeResumeActive(t0, [finishedSet(t0, t0 + 40_000)]);
  mockRestState = { sessionId: RESUME_ID, setStart: t0, restUntil: t0 + 130_000 };
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0 + 300_000);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("end-set"));
  expect(screen.queryByTestId("rest-timer")).toBeNull();
  spy.mockReturnValue(t0 + 345_000);
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const sets = mockSetActive.mock.calls.at(-1)?.[0].exercises[0].sets;
    expect(sets[1].startedAt).toBe(t0 + 130_000);
    expect(sets[1].durationMs).toBe(215_000);
  });
  spy.mockRestore();
});

test("reanudar con un descanso en curso re-muestra el temporizador", async () => {
  const t0 = 1_000_000;
  mockActive = makeResumeActive(t0, [finishedSet(t0, t0 + 40_000)]);
  mockRestState = { sessionId: RESUME_ID, setStart: t0, restUntil: t0 + 130_000 };
  const spy = jest.spyOn(Date, "now");
  spy.mockReturnValue(t0 + 60_000);
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("rest-timer"));
  spy.mockRestore();
});
