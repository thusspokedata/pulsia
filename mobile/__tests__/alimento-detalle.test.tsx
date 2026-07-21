import { render, screen, waitFor, fireEvent, within } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ foodId: "11111111-1111-4111-8111-111111111111" })),
}));

jest.mock("../src/api/nutrition", () => ({
  getFood: jest.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Queso crema", basis: "per_100g", source: "estimate",
    kcal: 350, protein_g: 6, carbs_g: 4, fat_g: 34,
    saturated_fat_g: 20, sugars_g: 3.2, fiber_g: 0, salt_g: 0.8,
    cholesterol_mg: 101, water_ml: null, unitWeightG: null,
  })),
  updateFood: jest.fn(), createFood: jest.fn(), describeFood: jest.fn(), extractFood: jest.fn(),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));

import AgregarAlimentoScreen from "../app/nutricion/agregar-alimento";

beforeEach(() => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ foodId: "11111111-1111-4111-8111-111111111111" });
});

test("el detalle del alimento muestra los umbrales y de dónde salen", async () => {
  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByText(/Umbrales por 100 g/)).toBeTruthy());
  // FSA y FDA aparecen en el mismo <Text> (el pie de umbrales), así que un solo getByText ya
  // prueba las dos: /FSA/ y /FDA/ por separado matchearían el mismo nodo dos veces.
  expect(screen.getByText(/FSA.*FDA/s)).toBeTruthy();
});

test("el detalle marca el colesterol alto del queso crema", async () => {
  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByText(/Umbrales por 100 g/)).toBeTruthy());
  expect(screen.getByText("colesterol alto")).toBeTruthy();
});

test("agregar un alimento nuevo (sin foodId) no muestra el semáforo: fat_g vacío no puede leerse como 0 g · ok", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ foodId: undefined });
  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByText("Agregar alimento")).toBeTruthy());
  expect(screen.queryByText("Semáforo nutricional")).toBeNull();
  expect(screen.queryByTestId("nutrient-flags-full")).toBeNull();
});

test("en modo edición, borrar grasa a mano vuelve a 'sin dato', no reaparece 'grasa 0 g · ok'", async () => {
  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByText(/Umbrales por 100 g/)).toBeTruthy());
  // Antes de tocar nada: el queso crema tiene grasa cargada (34 g, alta). Nota: la fibra del
  // mock es 0 g de verdad (dato cargado, no ausente), así que no se puede usar "queryByText('0 g')
  // toBeNull()" acá como señal — esa fila es una "0 g" legítima. Por eso el chequeo de abajo va
  // por el testID del chip, no por buscar "0 g" en toda la pantalla.
  expect(screen.getByText("grasa alta")).toBeTruthy();
  expect(screen.queryByTestId("nutrient-chip-unknown")).toBeNull();

  fireEvent.changeText(screen.getByPlaceholderText("Grasa (g)"), "");

  await waitFor(() => expect(screen.queryByText("grasa alta")).toBeNull());
  // El chip de grasa vuelve a "sin dato", igual que los cinco micros opcionales cuando están
  // vacíos — nunca "0 g · ok", que sería afirmar un valor que ya no está.
  const chip = screen.getByTestId("nutrient-chip-unknown");
  expect(within(chip).getByText("sin dato")).toBeTruthy();
});
