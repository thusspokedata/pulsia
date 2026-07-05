import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import EntrenoPuntualScreen from "../app/entreno-puntual";
import { generateOneOff } from "../src/api/programs";
import { router } from "expo-router";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/storage/profile", () => ({
  getProfile: async () => ({
    experience: "intermediate",
    goal: "hypertrophy",
    daysPerWeek: 4,
    sessionMinutes: 60,
    gymEquipment: ["dumbbell"],
    homeEquipment: ["dumbbell"],
    limitations: [],
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

test("elegir músculo + lugar y generar → llama generateOneOff y navega a la sesión one-off", async () => {
  await render(<EntrenoPuntualScreen />);
  await fireEvent.press(screen.getByTestId("focus-chest"));
  await fireEvent.press(screen.getByTestId("loc-home"));
  await fireEvent.press(screen.getByTestId("generar-puntual"));
  await waitFor(() =>
    expect(generateOneOff).toHaveBeenCalledWith(
      "http://b.test",
      expect.objectContaining({ location: "home", focus: "chest" }),
    ),
  );
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/sesion",
        params: expect.objectContaining({
          oneOff: "true",
          dayLabel: "Puntual: Pecho",
          location: "home",
          week: "1",
        }),
      }),
    ),
  );
});
