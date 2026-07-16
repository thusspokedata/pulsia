import { render, screen, fireEvent } from "@testing-library/react-native";
import DetalleDiaScreen from "../app/nutricion/detalle";
import { useNutritionDay } from "../src/nutrition/useNutritionDay";
import { colors } from "../src/theme/tokens";

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
  // Sin aserción sobre el texto "Calorías": desde la Task 7 lo llevan tanto el label del segmento
  // como el título de la card, así que verificarlo no distingue una pestaña de la otra. El
  // "te quedan 700" de acá abajo sí: ese dato solo puede venir de la card del Resumen.
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
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.backgroundColor).not.toBe(colors.warning);
});

test("fibra POR ENCIMA del piso: sigue sin avisar (pasarse de fibra es bueno)", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, fiber_g: 45 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.backgroundColor).not.toBe(colors.warning);
});

test("sal por encima del límite: la barra pinta ámbar", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, salt_g: 9 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-salt_g-bar").props.style.backgroundColor).toBe(colors.warning);
});

test("valor exactamente igual al límite NO avisa (tocar el límite no es pasarse)", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, salt_g: 5 } } }); // ref de sal = 5
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-salt_g-bar").props.style.backgroundColor).not.toBe(colors.warning);
});

test("un valor por encima de la referencia no desborda la barra (clamp al 100%)", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, fiber_g: 45 } } }); // 150% del piso
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.width).toBe("100%");
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

const mealsFixture = [
  { id: "m1", eatenAt: 1, mealType: "desayuno", note: null, items: [{ kcal: 500, protein_g: 0, carbs_g: 0, fat_g: 0 }] },
  { id: "m2", eatenAt: 2, mealType: "cena", note: null, items: [{ kcal: 1500, protein_g: 0, carbs_g: 0, fat_g: 0 }] },
];

test("pestaña Calorías: torta con una porción por comida + leyenda con kcal y %", async () => {
  mockDay({ meals: mealsFixture });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-calorias"));
  expect(screen.getByTestId("pie-arc-0")).toBeTruthy();
  expect(screen.getByTestId("pie-arc-1")).toBeTruthy();
  expect(screen.getByText("Desayuno")).toBeTruthy();
  expect(screen.getByText("500 kcal · 25%")).toBeTruthy();
  expect(screen.getByText("1500 kcal · 75%")).toBeTruthy();
});

test("el arco de cada comida es proporcional a sus kcal, no a la cantidad de comidas", async () => {
  mockDay({ meals: mealsFixture });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-calorias"));
  // Cena = 1500/2000 = 75% = 270° → arco largo. Si la torta ignorara las kcal y repartiera en
  // partes iguales (180° cada una), este flag sería 0.
  const d = screen.getByTestId("pie-arc-1").props.d as string;
  expect(d).toMatch(/A 90 90 0 1 1 /); // large-arc-flag = 1
});

test("pestaña Calorías sin comidas: empty state, sin torta", async () => {
  mockDay({ meals: [] });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-calorias"));
  expect(screen.getByText(/Todavía no registraste comidas/)).toBeTruthy();
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
});

test("pestaña Macros: dona con las 3 porciones, kcal al centro y % real vs meta", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-macros"));
  expect(screen.getByTestId("pie-arc-2")).toBeTruthy(); // 3 porciones
  expect(screen.getByTestId("macros-center-kcal").props.children).toBe(1740);
  // OJO: la leyenda es UN solo <Text>, así que getByText matchea la línea ENTERA.
  expect(screen.getByText("120 g · 28% · meta 28%")).toBeTruthy();
  expect(screen.getByText("180 g · 41% · meta 42%")).toBeTruthy();
  expect(screen.getByText("60 g · 31% · meta 30%")).toBeTruthy();
});

test("pestaña Macros sin meta: muestra el % real sin la comparación", async () => {
  mockDay({ goalView: { status: "incomplete", missing: ["peso"] } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-macros"));
  expect(screen.getByText("120 g · 28%")).toBeTruthy(); // sin el sufijo de meta
  expect(screen.queryByText(/meta/)).toBeNull();
});

test("pestaña Macros sin comidas: empty state, sin dona", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, protein_g: 0, carbs_g: 0, fat_g: 0 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-macros"));
  expect(screen.getByText(/Todavía no registraste comidas/)).toBeTruthy();
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
});
