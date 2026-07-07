import { render, screen, waitFor, fireEvent } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...a: any[]) => mockPush(...a) },
  useFocusEffect: (cb: any) => {
    const r = require("react");
    r.useEffect(() => cb(), []);
  },
}));

let mockActive: any = null;
jest.mock("../src/storage/activeSession", () => ({ getActiveSession: async () => mockActive }));

let mockPauseState: any = null;
jest.mock("../src/storage/pauseState", () => ({ getPauseState: async () => mockPauseState }));

import { SessionIndicator } from "../src/components/SessionIndicator";

beforeEach(() => { mockActive = null; mockPauseState = null; jest.clearAllMocks(); });

test("no renderiza nada si no hay sesión activa", async () => {
  await render(<SessionIndicator />);
  // Damos una vuelta al event loop para que resuelva getActiveSession.
  await waitFor(() => expect(screen.queryByTestId("session-indicator")).toBeNull());
});

test("renderiza el banner y navega a /sesion si hay sesión activa", async () => {
  mockActive = {
    id: "x", programId: "p", weekNumber: 1, dayLabel: "Día 1", location: "gym",
    startedAt: Date.now(), endedAt: null, totalDurationMs: null, notes: "", exercises: [],
  };
  await render(<SessionIndicator />);
  await waitFor(() => expect(screen.getByTestId("session-indicator")).toBeTruthy());
  expect(screen.getByText("▶ Volver al entrenamiento en curso")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("session-indicator"));
  expect(mockPush).toHaveBeenCalledWith("/sesion");
});

test("descuenta el tiempo pausado del banner si el estado de pausa corresponde a la sesión", async () => {
  const t0 = 1_000_000;
  const spy = jest.spyOn(Date, "now").mockReturnValue(t0 + 20_000);
  mockActive = {
    id: "abc", programId: "p", weekNumber: 1, dayLabel: "Día 1", location: "gym",
    startedAt: t0, endedAt: null, totalDurationMs: null, notes: "", exercises: [],
  };
  // 5s acumulados + pausa en curso desde t0+15s → a t0+20s son 5s más = 10s pausados.
  mockPauseState = { sessionId: "abc", pausedMs: 5_000, pausedAt: t0 + 15_000 };
  await render(<SessionIndicator />);
  // Bruto 20s - 10s pausados = 10s → "0:10".
  await waitFor(() => expect(screen.getByText(/0:10$/)).toBeTruthy());
  spy.mockRestore();
});
