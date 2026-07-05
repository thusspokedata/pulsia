import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...a: any[]) => mockPush(...a), replace: jest.fn() },
  Link: ({ children }: any) => children,
  useFocusEffect: (cb: any) => {
    const r = require("react");
    r.useEffect(() => cb(), []);
  },
}));

let mockActive: any = null;
jest.mock("../src/storage/activeSession", () => ({ getActiveSession: async () => mockActive }));

const program = {
  name: "Plan",
  weeks: [{ weekNumber: 1, workouts: [{
    dayLabel: "Día 1", location: "gym", focus: "chest",
    exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" }],
  }] }],
};
jest.mock("../src/storage/program", () => ({ getStoredProgram: async () => program }));

import ProgramaScreen from "../app/(tabs)/index";

beforeEach(() => { mockActive = null; jest.clearAllMocks(); });

test("muestra 'Empezar entrenamiento' y navega a /sesion con los params del día", async () => {
  await render(<ProgramaScreen />);
  await waitFor(() => screen.getByTestId("start-Día 1"));
  await fireEvent.press(screen.getByTestId("start-Día 1"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/sesion", params: { week: 1, dayLabel: "Día 1", location: "gym" } });
});

// El banner de "sesión en curso" ya no vive en la home: ahora es global (SessionIndicator,
// mostrado en las tabs). El index ya no debe renderizar resume-banner aunque haya sesión activa.
test("la home ya no muestra el resume-banner (movido al indicador global)", async () => {
  mockActive = { id: "x", dayLabel: "Día 1" };
  await render(<ProgramaScreen />);
  await waitFor(() => screen.getByTestId("start-Día 1"));
  expect(screen.queryByTestId("resume-banner")).toBeNull();
});

test("el botón 'Entreno puntual' navega a /entreno-puntual", async () => {
  await render(<ProgramaScreen />);
  await waitFor(() => screen.getByTestId("entreno-puntual-link"));
  await fireEvent.press(screen.getByTestId("entreno-puntual-link"));
  expect(mockPush).toHaveBeenCalledWith("/entreno-puntual");
});
