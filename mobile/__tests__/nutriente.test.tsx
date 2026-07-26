import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import NutrienteScreen from "../app/nutricion/nutriente";
import { listMeals } from "../src/api/nutrition";
import { getRangeNutrients } from "../src/api/supplements";

let mockKey = "cholesterol_mg";
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ key: mockKey, offset: "0" }),
}));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({ listMeals: jest.fn(async () => []) }));
// Por defecto sin suplementos: los tests de Task 14 pisan esto con un mockResolvedValue propio.
jest.mock("../src/api/supplements", () => ({
  getRangeNutrients: jest.fn(async () => ({ totals: {}, byNutrient: {} })),
}));

const meal = (items: any[], eatenAt = 1) => ({ id: "m", eatenAt, mealType: null, note: null, items });
const item = (foodName: string, grams: number, cholesterol_mg: number | null, extra: any = {}) => ({
  id: "i", foodId: null, foodName, quantity: grams, quantityUnit: "g", grams,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  saturated_fat_g: null, sugars_g: null, fiber_g: null, sodium_mg: null, cholesterol_mg, water_ml: null,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockKey = "cholesterol_mg";
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Huevo", 120, 440), item("Queso", 60, 110)])]);
  (getRangeNutrients as jest.Mock).mockResolvedValue({ totals: {}, byNutrient: {} });
});

test("rankea los alimentos por aporte, con la cantidad comida y el %", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Huevo")).toBeTruthy());
  expect(screen.getByText("440 mg · 80%")).toBeTruthy();
  expect(screen.getByText("120 g")).toBeTruthy(); // la cantidad: sin esto no se puede decidir la porción
  expect(screen.getByText("110 mg · 20%")).toBeTruthy();
});

test("un nutriente del registro nuevo (zinc) también se desglosa, con su nombre y su unidad", async () => {
  // La pestaña del día pasó de 5 nutrientes a 30 y todos navegan acá. Con la lista de etiquetas
  // escrita a mano, esta pantalla decía "Alimentos con más undefined" y "5 undefined".
  mockKey = "zinc_mg";
  (listMeals as jest.Mock).mockResolvedValue([
    meal([item("Ostras", 100, null, { zinc_mg: 60 }), item("Carne", 150, null, { zinc_mg: 20 })]),
  ]);
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Ostras")).toBeTruthy());
  expect(screen.getByText("Alimentos con más zinc")).toBeTruthy();
  expect(screen.getByText("60 mg · 75%")).toBeTruthy();
});

test("el nombre del nutriente mantiene las mayúsculas internas del registro", async () => {
  mockKey = "vitamin_b12_mcg";
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Hígado", 100, null, { vitamin_b12_mcg: 70 })])]);
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Hígado")).toBeTruthy());
  expect(screen.getByText("Alimentos con más vitamina B12 (cobalamina)")).toBeTruthy();
  expect(screen.getByText("70 mcg · 100%")).toBeTruthy();
});

test("la sal se sigue desglosando en gramos, derivada del sodio del ítem", async () => {
  mockKey = "salt_g";
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Jamón", 100, null, { sodium_mg: 1200 })])]);
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Jamón")).toBeTruthy());
  expect(screen.getByText("Alimentos con más sal")).toBeTruthy();
  expect(screen.getByText("3 g · 100%")).toBeTruthy(); // 1200 mg de sodio = 3 g de sal
});

test("una clave que no existe no rompe la pantalla: cae al colesterol", async () => {
  mockKey = "no_existe_mg";
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Alimentos con más colesterol")).toBeTruthy());
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

// Julio 2026, hora local.
const at = (day: number) => new Date(2026, 6, day, 10).getTime();

test("con 'Día' no hay gráfico, aunque haya puntos de sobra: un día no es una tendencia", async () => {
  // 2 días de datos a propósito: si apareciera el gráfico sería por el gate de rango, no por
  // falta de puntos. Con el mock de un solo día, este test pasaba incluso con el gate roto.
  (listMeals as jest.Mock).mockResolvedValue([
    meal([item("Huevo", 120, 200)], at(10)),
    meal([item("Queso", 60, 100)], at(11)),
  ]);
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Huevo")).toBeTruthy());
  expect(screen.queryByTestId("linechart-refline")).toBeNull();
});

test("con 7 días aparece la curva, con la referencia y la cobertura de registro", async () => {
  (listMeals as jest.Mock).mockResolvedValue([
    meal([item("Huevo", 120, 200)], at(10)),
    meal([item("Queso", 60, 100)], at(11)),
  ]);
  await render(<NutrienteScreen />);
  await fireEvent.press(screen.getByText("7 días"));
  await waitFor(() => expect(screen.getByTestId("linechart-refline")).toBeTruthy());
  // Promedio sobre los días CON registro (2), no sobre 7: (200+100)/2 = 150.
  expect(screen.getByText("Promedio 150 mg · 2 de 7 días con registro")).toBeTruthy();
});

test("un solo día con registro: no dibuja curva, lo dice", async () => {
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Huevo", 120, 200)], at(10))]);
  await render(<NutrienteScreen />);
  await fireEvent.press(screen.getByText("7 días"));
  await waitFor(() => expect(screen.getByText(/al menos dos días/)).toBeTruthy());
  expect(screen.queryByTestId("linechart-refline")).toBeNull();
});

test("rango sin ningún dato: solo el empty state que ya existía, sin nota de evolución duplicada", async () => {
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Lechuga", 50, null)], at(10))]);
  await render(<NutrienteScreen />);
  await fireEvent.press(screen.getByText("7 días"));
  await waitFor(() => expect(screen.getByText(/Ningún alimento registrado aporta/)).toBeTruthy());
  expect(screen.queryByText(/al menos dos días/)).toBeNull();
});

test("varios días con el nutriente en 0 declarado: muestra la curva, no 'no hay datos'", async () => {
  // Un 0 declarado es un dato real (dieta basada en plantas → colesterol 0). El ranking lo filtra
  // porque no tiene sentido rankear un aporte de 0, pero la curva sí lo cuenta: un plano en 0
  // contra la referencia de 300 es justamente la mejor noticia posible.
  (listMeals as jest.Mock).mockResolvedValue([
    meal([item("Lentejas", 200, 0)], at(10)),
    meal([item("Arroz", 150, 0)], at(11)),
  ]);
  await render(<NutrienteScreen />);
  await fireEvent.press(screen.getByText("7 días"));
  await waitFor(() => expect(screen.getByTestId("linechart-refline")).toBeTruthy());
  expect(screen.getByText(/2 de 7 días con registro/)).toBeTruthy();
});

// --- Task 14: ranking combinado con el aporte de suplementos del rango ---

test("un suplemento que aporta el nutriente se suma al ranking, con el chip y sin gramos", async () => {
  mockKey = "magnesium_mg";
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Espinaca", 100, null, { magnesium_mg: 30 })])]);
  (getRangeNutrients as jest.Mock).mockResolvedValue({
    totals: {},
    byNutrient: { magnesium_mg: [{ supplementName: "Magnesio Citrato", amount: 90 }] },
  });
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Magnesio Citrato")).toBeTruthy());
  expect(screen.getByText("Espinaca")).toBeTruthy();
  expect(screen.getByText("suplemento")).toBeTruthy();
  // Total combinado 120 mg: el suplemento (90) es 75%, la espinaca (30) es 25%.
  expect(screen.getByText("90 mg · 75%")).toBeTruthy();
  expect(screen.getByText("30 mg · 25%")).toBeTruthy();
  expect(screen.getByText("100 g")).toBeTruthy(); // la fila de comida sigue mostrando gramos
  expect(screen.queryByText("0 g")).toBeNull(); // el suplemento NO muestra gramos (no "0 g")
});

test("el ranking combinado ordena por aporte, sin importar si es comida o suplemento", async () => {
  mockKey = "magnesium_mg";
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Espinaca", 100, null, { magnesium_mg: 200 })])]);
  (getRangeNutrients as jest.Mock).mockResolvedValue({
    totals: {},
    byNutrient: { magnesium_mg: [{ supplementName: "Magnesio Citrato", amount: 50 }] },
  });
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Espinaca")).toBeTruthy());
  const texts = screen.getAllByText(/mg ·/).map((n) => n.props.children.join(""));
  expect(texts[0]).toContain("200"); // Espinaca primero: aporta más
  expect(texts[1]).toContain("50");
});

test("sal: el aporte de suplementos llega como sodio y se convierte a gramos de sal", async () => {
  mockKey = "salt_g";
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Jamón", 100, null, { sodium_mg: 800 })])]); // 2 g sal
  (getRangeNutrients as jest.Mock).mockResolvedValue({
    totals: {},
    byNutrient: { sodium_mg: [{ supplementName: "Sal Rosa", amount: 400 }] }, // 1 g sal
  });
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Sal Rosa")).toBeTruthy());
  expect(screen.getByText("1 g · 33%")).toBeTruthy();
  expect(screen.getByText("2 g · 67%")).toBeTruthy();
});

test("si falla la carga de suplementos, degrada limpio: muestra solo la comida", async () => {
  mockKey = "magnesium_mg";
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Espinaca", 100, null, { magnesium_mg: 30 })])]);
  (getRangeNutrients as jest.Mock).mockRejectedValue(new Error("sin red"));
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Espinaca")).toBeTruthy());
  expect(screen.getByText("30 mg · 100%")).toBeTruthy();
  expect(screen.queryByText("suplemento")).toBeNull();
});
