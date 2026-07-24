import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import AgregarAlimentoScreen from "../app/nutricion/agregar-alimento";
import { createFood, describeFood, extractFood } from "../src/api/nutrition";

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
  saturated_fat_g: 3.8, sugars_g: 4.4, fiber_g: 12.5, sodium_mg: 0, cholesterol_mg: 0, water_ml: 4,
  unitWeightG: 1.2, sourceMacros: "ai", sourceMicros: "usda", usdaFdcId: 170567,
  // Un micro de USDA que el formulario NO edita: sirve para probar que sobrevive al guardado.
  vitamin_e_mg: 25.6,
};

beforeEach(() => {
  jest.clearAllMocks();
  (describeFood as jest.Mock).mockResolvedValue(ALMENDRA);
  // `clearAllMocks` limpia las llamadas pero NO las implementaciones: sin esto, el mock que pone el
  // test de la foto se filtraría a los que corren después.
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true });
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
  // "ai" (lo estimó la IA), NO el "manual" con el que arranca el formulario vacío.
  await waitFor(() => expect(screen.getByTestId("source-chip-ai")).toBeTruthy());
  expect(screen.queryByTestId("source-chip-manual")).toBeNull();
  // Y los micros vinieron de USDA: es otra procedencia y se dice aparte.
  expect(screen.getByTestId("source-chip-micros-usda")).toBeTruthy();
});

test("la foto de una etiqueta precarga el formulario y lo marca como dato de etiqueta", async () => {
  // Cubre dos cosas: que prefillFrom propaga el `sourceMacros` del dato, y el camino de la foto,
  // que no tenía ningún test.
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ base64: "ZmFrZQ==", mimeType: "image/jpeg" }],
  });
  (extractFood as jest.Mock).mockResolvedValue({ ...ALMENDRA, name: "Muesli Lidl", sourceMacros: "label" });

  await render(<AgregarAlimentoScreen />);
  await fireEvent.press(screen.getByText(/galer/i));
  await waitFor(() => expect(screen.getByDisplayValue("Muesli Lidl")).toBeTruthy());
  expect(screen.getByTestId("source-chip-label")).toBeTruthy();
});

test("el alta guarda SODIO aunque el campo se cargue en sal", async () => {
  // El usuario ve "Sal (g)" —es lo que dice el envase— pero lo que se persiste es sodio.
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText("Nombre"), "Fiambre");
  for (const [ph, v] of [["Calorías (por 100g)", "100"], ["Proteína (g)", "10"], ["Carbohidratos (g)", "0"], ["Grasa (g)", "5"]] as const) {
    await fireEvent.changeText(screen.getByPlaceholderText(ph), v);
  }
  await fireEvent.changeText(screen.getByPlaceholderText("Sal (g, opcional)"), "2");
  expect(screen.getByText(/Sodio ≈ 800 mg/)).toBeTruthy();

  await fireEvent.press(screen.getByText("Guardar en el catálogo"));
  await waitFor(() => expect(createFood).toHaveBeenCalled());
  const input = (createFood as jest.Mock).mock.calls[0][1];
  expect(input.sodium_mg).toBe(800); // 2 g de sal / 2,5
  expect(input).not.toHaveProperty("salt_g");
  // Alta a mano: no la estimó nadie, y no hay micros de USDA que anunciar.
  expect(input.sourceMacros).toBe("manual");
  expect(input.sourceMicros).toBeNull();
});

test("si la IA falla, lo dice y no rompe el formulario", async () => {
  (describeFood as jest.Mock).mockRejectedValue(new Error("No se pudo analizar el alimento."));
  await render(<AgregarAlimentoScreen />);
  await fireEvent.changeText(screen.getByTestId("food-text-input"), "almendra");
  await fireEvent.press(screen.getByTestId("food-text-submit"));
  await waitFor(() => expect(screen.getByText("No se pudo analizar el alimento.")).toBeTruthy());
  expect(screen.getByTestId("food-text-input")).toBeTruthy();
});
