import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import NutrienteScreen from "../app/nutricion/nutriente";
import { listMeals } from "../src/api/nutrition";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ key: "cholesterol_mg", offset: "0" }),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({ listMeals: jest.fn(async () => []) }));

const meal = (items: any[]) => ({ id: "m", eatenAt: 1, mealType: null, note: null, items });
const item = (foodName: string, grams: number, cholesterol_mg: number | null) => ({
  id: "i", foodId: null, foodName, quantity: grams, quantityUnit: "g", grams,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  saturated_fat_g: null, sugars_g: null, fiber_g: null, salt_g: null, cholesterol_mg, water_ml: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Huevo", 120, 440), item("Queso", 60, 110)])]);
});

test("rankea los alimentos por aporte, con la cantidad comida y el %", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Huevo")).toBeTruthy());
  expect(screen.getByText("440 mg · 80%")).toBeTruthy();
  expect(screen.getByText("120 g")).toBeTruthy(); // la cantidad: sin esto no se puede decidir la porción
  expect(screen.getByText("110 mg · 20%")).toBeTruthy();
});

test("arranca en Día: pide un rango de 1 solo día", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(listMeals).toHaveBeenCalled());
  const [, from, to] = (listMeals as jest.Mock).mock.calls[0];
  expect(to - from).toBeLessThan(24 * 3600_000); // un día, no más
});

test("cambiar a 30 días refetchea con el rango largo", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(listMeals).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByText("30 días"));
  await waitFor(() => expect(listMeals).toHaveBeenCalledTimes(2));
  const [, from, to] = (listMeals as jest.Mock).mock.calls[1];
  expect(Math.round((to - from) / (24 * 3600_000))).toBe(30);
});

test("sin datos del nutriente en el rango: lo dice, no muestra una lista vacía", async () => {
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Lechuga", 50, null)])]);
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText(/Ningún alimento registrado aporta/)).toBeTruthy());
});

test("si falla la carga, muestra el error", async () => {
  (listMeals as jest.Mock).mockRejectedValue(new Error("sin red"));
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("sin red")).toBeTruthy());
});

test("cambiar de rango rápido: la respuesta vieja que llega tarde no pisa la nueva", async () => {
  // A (Día) queda colgada y resuelve DESPUÉS de B (30 días).
  let resolveA!: (v: unknown) => void;
  (listMeals as jest.Mock)
    .mockImplementationOnce(() => new Promise((r) => { resolveA = r; }))
    .mockResolvedValueOnce([meal([item("Manteca", 10, 30)])]);

  await render(<NutrienteScreen />);
  await fireEvent.press(screen.getByText("30 días"));
  await waitFor(() => expect(screen.getByText("Manteca")).toBeTruthy());

  // Llega la vieja, tarde: hay que forzar el drenado de la cadena de microtasks de `load()`
  // (await listMeals → setMeals → setLoading) dentro de act() antes de afirmar nada, si no
  // la aserción corre antes de que el estado equivocado llegue a aplicarse y el test no reproduce la race.
  await act(async () => {
    resolveA([meal([item("Huevo", 120, 440)])]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByText("Manteca")).toBeTruthy();
  expect(screen.queryByText("Huevo")).toBeNull(); // no pisó a la nueva
});

test("el ancho de la barra refleja el aporte relativo, no siempre está llena", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Huevo")).toBeTruthy());
  expect(screen.getByTestId("rank-Huevo-bar").props.style.width).toBe("100%");
  expect(screen.getByTestId("rank-Queso-bar").props.style.width).toBe("25%");
});

test("alimentos con aporte ínfimo: la barra no queda en NaN%", async () => {
  // 0.04 mg redondea a 0 en foodsHighestIn → el divisor de la barra sería 0.
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Galletita", 10, 0.04)])]);
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Galletita")).toBeTruthy());
  expect(screen.getByTestId("rank-Galletita-bar").props.style.width).toBe("0%");
});
