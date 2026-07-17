import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AgregarAlimentoScreen from "../app/nutricion/agregar-alimento";
import { describeFood } from "../src/api/nutrition";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({
  extractFood: jest.fn(),
  describeFood: jest.fn(),
  createFood: jest.fn(),
  getFood: jest.fn(),
  updateFood: jest.fn(),
}));

const ALMENDRA = {
  name: "Almendra", basis: "per_100g", kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50,
  saturated_fat_g: 3.8, sugars_g: 4.4, fiber_g: 12.5, salt_g: 0, cholesterol_mg: 0, water_ml: 4,
  unitWeightG: 1.2, source: "estimate",
};

beforeEach(() => {
  jest.clearAllMocks();
  (describeFood as jest.Mock).mockResolvedValue(ALMENDRA);
});

test("escribir el alimento precarga el formulario, sin foto", async () => {
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "almendra");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  await waitFor(() => expect(screen.getByDisplayValue("Almendra")).toBeTruthy());
  expect(screen.getByDisplayValue("579")).toBeTruthy(); // kcal
  expect(describeFood).toHaveBeenCalledWith("http://x", "almendra");
});

test("el botón no hace nada con menos de 2 caracteres", async () => {
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "a");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  expect(describeFood).not.toHaveBeenCalled();
});

test("el formulario precargado muestra de dónde salió el dato", async () => {
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "almendra");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  await waitFor(() => expect(screen.getByTestId("source-chip-estimate")).toBeTruthy());
});

test("si la IA falla, lo dice y no rompe el formulario", async () => {
  (describeFood as jest.Mock).mockRejectedValue(new Error("No se pudo analizar el alimento."));
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "almendra");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  await waitFor(() => expect(screen.getByText("No se pudo analizar el alimento.")).toBeTruthy());
  expect(screen.getByTestId("food-text-input")).toBeTruthy();
});
