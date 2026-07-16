import { render, screen, fireEvent } from "@testing-library/react-native";
import DetalleDiaScreen from "../app/nutricion/detalle";
import { useNutritionDay } from "../src/nutrition/useNutritionDay";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ offset: "0" }),
}));
jest.mock("../src/nutrition/useNutritionDay", () => ({ useNutritionDay: jest.fn() }));

const summary = {
  dayTotals: { kcal: 1800, protein_g: 120, carbs_g: 180, fat_g: 60, sugars_g: 40, fiber_g: 22, saturated_fat_g: 18, salt_g: 4 },
  cholesterolMg: 210,
  liquid: { total: 2100, drank: 1800, fromFood: 300 },
};
const goalView = {
  status: "ok",
  kcal: { meta: 2200, comido: 1800, exercise: 300, restante: 700, over: false },
  macros: [
    { key: "protein", label: "Proteína", comido: 120, meta: 150, restante: 30, pct: 80, over: false },
    { key: "carbs", label: "Carbohidratos", comido: 180, meta: 220, restante: 40, pct: 82, over: false },
    { key: "fat", label: "Grasa", comido: 60, meta: 70, restante: 10, pct: 86, over: false },
  ],
};

function mockDay(over: Partial<any> = {}) {
  (useNutritionDay as jest.Mock).mockReturnValue({ error: null, meals: [], summary, goalView, ...over });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDay();
});

test("arranca en Resumen: calorías, macros en barras y líquido", async () => {
  await render(<DetalleDiaScreen />);
  expect(screen.getByText("Calorías")).toBeTruthy();
  expect(screen.getByText(/te quedan 700/)).toBeTruthy();
  expect(screen.getByText("Proteína")).toBeTruthy();
  expect(screen.getByText("2100 ml")).toBeTruthy();
});

test("tocar Nutrientes cambia de pestaña y muestra los micros", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("Azúcares")).toBeTruthy();
  expect(screen.getByText("Colesterol")).toBeTruthy();
  expect(screen.queryByText("2100 ml")).toBeNull(); // el Resumen ya no está montado
});

test("meta incompleta: el Resumen ofrece el link a Objetivo en vez de la barra", async () => {
  mockDay({ goalView: { status: "incomplete", missing: ["peso"] } });
  await render(<DetalleDiaScreen />);
  expect(screen.getByText("1800 kcal")).toBeTruthy();
  expect(screen.getByText(/Definí tu objetivo/)).toBeTruthy();
});

test("el error del hook se muestra en cualquier pestaña", async () => {
  mockDay({ error: "sin red" });
  await render(<DetalleDiaScreen />);
  expect(screen.getByText("sin red")).toBeTruthy();
});

test("un micro sin dato muestra — en vez de desaparecer de la tabla", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, sugars_g: null } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("Azúcares")).toBeTruthy(); // la fila sigue estando
  expect(screen.getByText("—")).toBeTruthy();
});

test("día sin ningún micro cargado: empty state en vez de una tabla de guiones", async () => {
  mockDay({
    summary: {
      ...summary,
      dayTotals: { ...summary.dayTotals, sugars_g: null, fiber_g: null, saturated_fat_g: null, salt_g: null },
      cholesterolMg: null,
    },
  });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText(/Todavía no hay datos de nutrientes/)).toBeTruthy();
  expect(screen.queryByText("Azúcares")).toBeNull();
});

test("cada micro se compara contra su referencia; pasarse de un LÍMITE avisa", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("40 / 50 g")).toBeTruthy(); // azúcares, ref fija
  expect(screen.getByText("210 / 300 mg")).toBeTruthy(); // colesterol
  expect(screen.getByText("18 / 24.4 g")).toBeTruthy(); // saturadas: 10% de 2200 kcal / 9
});

test("la fibra es un PISO: llegar a la referencia no avisa", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("22 / 30 g")).toBeTruthy();
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.backgroundColor).not.toBe("#B45309"); // colors.warning
});

test("fibra POR ENCIMA del piso: sigue sin avisar (pasarse de fibra es bueno)", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, fiber_g: 45 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.backgroundColor).not.toBe("#B45309");
});

test("sal por encima del límite: la barra pinta ámbar", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, salt_g: 9 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-salt_g-bar").props.style.backgroundColor).toBe("#B45309"); // colors.warning
});

test("micro sin dato: muestra — y no dibuja barra", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, fiber_g: null } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.queryByTestId("nutr-fiber_g-bar")).toBeNull();
});

test("meta incompleta: saturadas se muestra sin referencia (el 10% depende de la meta de kcal)", async () => {
  mockDay({ goalView: { status: "incomplete", missing: ["peso"] } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("18 g")).toBeTruthy(); // sin "/ ref"
  expect(screen.queryByTestId("nutr-saturated_fat_g-bar")).toBeNull();
  expect(screen.getByText("40 / 50 g")).toBeTruthy(); // las fijas sí siguen
});
