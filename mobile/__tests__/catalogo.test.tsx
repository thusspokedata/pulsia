import { render, screen, waitFor } from "@testing-library/react-native";
import CatalogoScreen from "../app/nutricion/catalogo";
import { listFoods } from "../src/api/nutrition";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => cb(),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({ listFoods: jest.fn(async () => []), deleteFood: jest.fn() }));

const food = (id: string, name: string, source: "label" | "estimate") => ({
  id, name, basis: "per_100g", kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1,
  saturated_fat_g: null, sugars_g: null, fiber_g: null, salt_g: null, cholesterol_mg: null, water_ml: null,
  unitWeightG: null, source, createdAt: 0,
});

beforeEach(() => jest.clearAllMocks());

test("cada alimento muestra de dónde salió su dato", async () => {
  (listFoods as jest.Mock).mockResolvedValue([
    food("1", "Muesli Lidl", "label"),
    food("2", "Almendra", "estimate"),
  ]);
  await render(<CatalogoScreen />);
  await waitFor(() => expect(screen.getByText("Muesli Lidl")).toBeTruthy());
  expect(screen.getByTestId("source-chip-label")).toBeTruthy();
  expect(screen.getByTestId("source-chip-estimate")).toBeTruthy();
});
