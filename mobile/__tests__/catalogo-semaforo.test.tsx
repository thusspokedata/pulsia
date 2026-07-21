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

const QUESO_CREMA = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Queso crema", basis: "per_100g" as const, source: "estimate" as const,
  kcal: 350, protein_g: 6, carbs_g: 4, fat_g: 34,
  sugars_g: 3.2, fiber_g: 0, saturated_fat_g: 20, salt_g: 0.8,
  cholesterol_mg: 101, water_ml: null, unitWeightG: null, createdAt: 0,
};

const ALMENDRA = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Almendra", basis: "per_100g" as const, source: "estimate" as const,
  kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50,
  sugars_g: 4.4, fiber_g: 12.5, saturated_fat_g: 3.8, salt_g: 0.001,
  cholesterol_mg: null, water_ml: null, unitWeightG: null, createdAt: 0,
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

test("filtrar por colesterol deja los altos y los sin-dato aparte", async () => {
  (listFoods as jest.Mock).mockResolvedValue([PASAS, QUESO_CREMA, ALMENDRA]);
  await render(<CatalogoScreen />);
  await waitFor(() => expect(screen.getByText("Pasas de uva")).toBeTruthy());

  await fireEvent.press(screen.getByText("colesterol"));

  expect(screen.getByText("Queso crema")).toBeTruthy(); // alto → queda
  expect(screen.queryByText("Pasas de uva")).toBeNull(); // 0 mg → fuera
  expect(screen.getByText(/Sin datos de colesterol/)).toBeTruthy(); // encabezado del grupo
  expect(screen.getByText("Almendra")).toBeTruthy(); // sin dato → visible, pero aparte
});

test("el filtro se combina con el buscador de texto", async () => {
  (listFoods as jest.Mock).mockResolvedValue([PASAS, QUESO_CREMA, ALMENDRA]);
  await render(<CatalogoScreen />);
  await waitFor(() => expect(screen.getByText("Pasas de uva")).toBeTruthy());
  await fireEvent.press(screen.getByText("colesterol"));
  await fireEvent.changeText(screen.getByPlaceholderText("Buscar…"), "queso");
  expect(screen.getByText("Queso crema")).toBeTruthy();
  expect(screen.queryByText("Almendra")).toBeNull();
});
