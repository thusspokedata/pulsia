import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import EntrenoPuntualScreen from "../app/entreno-puntual";
import { generateOneOff } from "../src/api/programs";
import { router } from "expo-router";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/storage/profile", () => ({
  getProfile: async () => ({
    experience: "intermediate", goal: "hypertrophy", daysPerWeek: 4, sessionMinutes: 60,
    gymEquipment: ["barbell", "dumbbell"], homeEquipment: ["dumbbell"], limitations: [],
  }),
}));
jest.mock("../src/storage/oneOffProgram", () => ({
  setStoredOneOffProgram: jest.fn(),
  setStoredOneOffProgramId: jest.fn(),
}));
jest.mock("../src/api/programs", () => ({
  generateOneOff: jest.fn(async () => ({
    id: "oid",
    program: {
      name: "Puntual",
      weeks: [{ weekNumber: 1, workouts: [{ dayLabel: "Puntual: Pecho", location: "home", focus: "chest", exercises: [] }] }],
    },
  })),
}));

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
  (generateOneOff as jest.Mock).mockClear();
});

test("multi-músculo + lugar (siembra equipo) + tiempo → arma el payload nuevo y navega", async () => {
  await render(<EntrenoPuntualScreen />);
  // Esperar a que cargue el profile (siembra el equipo del lugar por default = gym)
  await waitFor(() => expect(screen.getByTestId("equip-dumbbell")).toBeTruthy());

  // Elegir dos músculos
  await fireEvent.press(screen.getByTestId("focus-chest"));
  await fireEvent.press(screen.getByTestId("focus-triceps"));
  // Elegir tiempo 30
  await fireEvent.press(screen.getByTestId("time-30"));
  // Generar
  await fireEvent.press(screen.getByTestId("generar-puntual"));

  await waitFor(() =>
    expect(generateOneOff).toHaveBeenCalledWith(
      "http://b.test",
      expect.objectContaining({
        location: "gym",
        focus: ["chest", "triceps"],
        sessionMinutes: 30,
        equipment: expect.arrayContaining(["barbell", "dumbbell"]),
      }),
    ),
  );
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/sesion",
        params: expect.objectContaining({ oneOff: "true", location: "gym", week: "1" }),
      }),
    ),
  );
});

test("no se puede generar sin músculo elegido", async () => {
  await render(<EntrenoPuntualScreen />);
  await waitFor(() => expect(screen.getByTestId("generar-puntual")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("generar-puntual"));
  await waitFor(() => expect(generateOneOff).not.toHaveBeenCalled());
});

test("cambiar de lugar a Casa resiembra la selección de equipo (dumbbell sí, barbell no)", async () => {
  await render(<EntrenoPuntualScreen />);
  await waitFor(() => expect(screen.getByTestId("equip-barbell")).toBeTruthy());
  // gym inicial: gymEquipment = ["barbell","dumbbell"] → ambos seleccionados
  expect(screen.getByTestId("equip-barbell").props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByTestId("loc-home"));
  // Casa: homeEquipment = ["dumbbell"] → barbell existe pero deselecto; dumbbell seleccionado
  await waitFor(() =>
    expect(screen.getByTestId("equip-barbell").props.accessibilityState.selected).toBe(false),
  );
  expect(screen.getByTestId("equip-dumbbell").props.accessibilityState.selected).toBe(true);
});

test("tiempo custom inválido no resalta 'Otro' y el preset efectivo sigue seleccionado", async () => {
  await render(<EntrenoPuntualScreen />);
  await waitFor(() => expect(screen.getByTestId("time-60")).toBeTruthy());
  // default = profile.sessionMinutes (60) → preset 60 seleccionado
  expect(screen.getByTestId("time-60").props.accessibilityState.selected).toBe(true);
  // valor no numérico en "Otro" → no debe robar el resaltado
  await fireEvent.changeText(screen.getByTestId("time-custom"), "abc");
  expect(screen.getByTestId("time-60").props.accessibilityState.selected).toBe(true);
});
