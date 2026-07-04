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

import { SessionIndicator } from "../src/components/SessionIndicator";

beforeEach(() => { mockActive = null; jest.clearAllMocks(); });

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
  await fireEvent.press(screen.getByTestId("session-indicator"));
  expect(mockPush).toHaveBeenCalledWith("/sesion");
});
