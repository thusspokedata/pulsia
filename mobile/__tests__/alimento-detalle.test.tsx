import { render, screen, waitFor, fireEvent, within } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ foodId: "11111111-1111-4111-8111-111111111111" })),
}));

// El alimento guarda SODIO (320 mg = 0,8 g de sal). La pantalla lo muestra en sal.
const mockQuesoCrema = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Queso crema", basis: "per_100g", sourceMacros: "ai", sourceMicros: "usda", usdaFdcId: 170857,
  kcal: 350, protein_g: 6, carbs_g: 4, fat_g: 34,
  saturated_fat_g: 20, sugars_g: 3.2, fiber_g: 0, sodium_mg: 320,
  cholesterol_mg: 101, water_ml: null, unitWeightG: null,
  // Micros de USDA que el formulario no edita.
  calcium_mg: 98, vitamin_a_mcg: 308,
};

jest.mock("../src/api/nutrition", () => ({
  getFood: jest.fn(async () => mockQuesoCrema),
  updateFood: jest.fn(), createFood: jest.fn(), describeFood: jest.fn(), extractFood: jest.fn(),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));

import AgregarAlimentoScreen from "../app/nutricion/agregar-alimento";
import { updateFood } from "../src/api/nutrition";

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

test("el campo de sal muestra los gramos que corresponden al sodio guardado", async () => {
  // El alimento guarda 320 mg de sodio; el campo que el usuario ve dice 0,8 g de SAL.
  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByDisplayValue("Queso crema")).toBeTruthy());
  expect(screen.getByPlaceholderText("Sal (g, opcional)").props.value).toBe("0.8");
});

test("editar un alimento NO le borra los micros de USDA que el formulario no muestra", async () => {
  // El PATCH del backend reemplaza la fila entera: si la pantalla mandara solo lo que edita,
  // corregirle el nombre a un alimento le vaciaría las vitaminas y minerales que trajo de USDA.
  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByDisplayValue("Queso crema")).toBeTruthy());

  await fireEvent.changeText(screen.getByPlaceholderText("Nombre"), "Queso crema light");
  await fireEvent.press(screen.getByText("Guardar cambios"));

  await waitFor(() => expect(updateFood).toHaveBeenCalled());
  const input = (updateFood as jest.Mock).mock.calls[0][2];
  expect(input.name).toBe("Queso crema light");
  expect(input.calcium_mg).toBe(98);
  expect(input.vitamin_a_mcg).toBe(308);
  expect(input.sourceMicros).toBe("usda");
  expect(input.usdaFdcId).toBe(170857);
  // Y la sal del campo vuelve a viajar como sodio, sin perderse en la ida y vuelta.
  expect(input.sodium_mg).toBe(320);
  expect(input).not.toHaveProperty("salt_g");
});
