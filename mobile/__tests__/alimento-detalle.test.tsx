import { render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ foodId: "11111111-1111-4111-8111-111111111111" }),
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

test("el detalle del alimento muestra los umbrales y de dónde salen", async () => {
  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByText(/Umbrales por 100 g/)).toBeTruthy());
  expect(screen.getByText(/FSA/)).toBeTruthy();
  expect(screen.getByText(/FDA/)).toBeTruthy();
});

test("el detalle marca el colesterol alto del queso crema", async () => {
  await render(<AgregarAlimentoScreen />);
  await waitFor(() => expect(screen.getByText(/Umbrales por 100 g/)).toBeTruthy());
  expect(screen.getByText("colesterol alto")).toBeTruthy();
});
