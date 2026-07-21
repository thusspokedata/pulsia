import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import CatalogoScreen from "../app/nutricion/catalogo";
import NuevaComidaScreen from "../app/nutricion/nueva-comida";
import { listFoods } from "../src/api/nutrition";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void) => cb(),
  useLocalSearchParams: () => ({}),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({
  listFoods: jest.fn(async () => []),
  deleteFood: jest.fn(),
  createMeal: jest.fn(),
  getMeal: jest.fn(),
  updateMeal: jest.fn(),
  deleteMeal: jest.fn(),
}));

const PASAS = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Pasas de uva", basis: "per_100g" as const, source: "estimate" as const,
  kcal: 299, protein_g: 3, carbs_g: 79, fat_g: 0.5,
  sugars_g: 59, fiber_g: 3.7, saturated_fat_g: 0.06, salt_g: 0.03,
  cholesterol_mg: 0, water_ml: null, unitWeightG: null, createdAt: 0,
};

beforeEach(() => jest.clearAllMocks());

test("el catálogo marca el azúcar alto de las pasas", async () => {
  (listFoods as jest.Mock).mockResolvedValue([PASAS]);
  await render(<CatalogoScreen />);
  await waitFor(() => expect(screen.getByText("Pasas de uva")).toBeTruthy());
  expect(screen.getByText("azúcar alto")).toBeTruthy();
});

test("el buscador de nueva comida marca el azúcar alto de las pasas", async () => {
  (listFoods as jest.Mock).mockResolvedValue([PASAS]);
  await render(<NuevaComidaScreen />);
  fireEvent.changeText(screen.getByPlaceholderText("Buscar alimento del catálogo…"), "pasas");
  await waitFor(() => expect(screen.getByText("+ Pasas de uva")).toBeTruthy());
  expect(screen.getByText("azúcar alto")).toBeTruthy();
});
