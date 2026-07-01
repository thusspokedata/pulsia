import { render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GenerandoScreen from "../app/generando";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: any[]) => mockReplace(...a) } }));

const profile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockReplace.mockClear();
  await AsyncStorage.setItem("pulsia.backendUrl", "http://backend.test");
  await AsyncStorage.setItem("pulsia.profile", JSON.stringify(profile));
});
afterEach(() => { (global.fetch as any) = undefined; });

test("genera, guarda el programa y navega a la home", async () => {
  const program = { name: "Plan", weeks: [{ weekNumber: 1, workouts: [] }] };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "p1", program }) }) as any;
  await render(<GenerandoScreen />);
  await waitFor(async () => {
    expect(await AsyncStorage.getItem("pulsia.program")).not.toBeNull();
  });
  expect(mockReplace).toHaveBeenCalledWith("/");
});

test("muestra error de API key cuando el backend devuelve 400", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "no key" }) }) as any;
  await render(<GenerandoScreen />);
  await waitFor(() => {
    expect(screen.getByText("Cargá tu API key en Configuración")).toBeTruthy();
  });
});
