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

jest.mock("../src/storage/program", () => {
  const mkWorkout = (dayLabel: string, focus: string) => ({
    dayLabel,
    location: "gym",
    focus,
    exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 2, reps: "8-10", targetLoad: "RPE 8", restSeconds: 90, notes: "" }],
  });
  const program = {
    name: "Plan",
    weeks: [{ weekNumber: 1, workouts: [mkWorkout("Día 1", "chest"), mkWorkout("Día 2", "back")] }],
  };
  return { getStoredProgram: async () => program };
});

import ProgramaScreen from "../app/(tabs)/index";

beforeEach(() => { mockActive = null; jest.clearAllMocks(); });

test("con sesión activa que matchea un día: ese botón reanuda y los otros quedan deshabilitados", async () => {
  mockActive = {
    id: "s1", programId: "p", weekNumber: 1, dayLabel: "Día 1", location: "gym",
    startedAt: Date.now(), endedAt: null, totalDurationMs: null, notes: "", exercises: [],
  };
  await render(<ProgramaScreen />);
  await waitFor(() => screen.getByTestId("start-Día 1"));

  // Día activo: label "Volver al entrenamiento", habilitado, navega con params (reanuda).
  expect(screen.getByText("▶ Volver al entrenamiento")).toBeTruthy();
  const activeBtn = screen.getByTestId("start-Día 1");
  expect(activeBtn.props.accessibilityState?.disabled).toBeFalsy();
  await fireEvent.press(activeBtn);
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/sesion", params: { week: 1, dayLabel: "Día 1", location: "gym" } });

  mockPush.mockClear();

  // Otro día: deshabilitado, label "Hay un entreno en curso", no navega.
  expect(screen.getByText("Hay un entreno en curso")).toBeTruthy();
  const otherBtn = screen.getByTestId("start-Día 2");
  expect(otherBtn.props.accessibilityState?.disabled).toBe(true);
  await fireEvent.press(otherBtn);
  expect(mockPush).not.toHaveBeenCalled();
});

test("sin sesión activa: todos los botones muestran 'Empezar entrenamiento' y navegan", async () => {
  mockActive = null;
  await render(<ProgramaScreen />);
  await waitFor(() => screen.getByTestId("start-Día 1"));

  expect(screen.getAllByText("Empezar entrenamiento").length).toBe(2);
  expect(screen.queryByText("Hay un entreno en curso")).toBeNull();

  const btn1 = screen.getByTestId("start-Día 1");
  expect(btn1.props.accessibilityState?.disabled).toBeFalsy();
  await fireEvent.press(btn1);
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/sesion", params: { week: 1, dayLabel: "Día 1", location: "gym" } });

  await fireEvent.press(screen.getByTestId("start-Día 2"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/sesion", params: { week: 1, dayLabel: "Día 2", location: "gym" } });
});
