import { render, screen, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import DetalleDiaScreen from "../app/nutricion/detalle";
import { buildNutritionDaySummary } from "../src/nutrition/daySummary";
import { useNutritionDay } from "../src/nutrition/useNutritionDay";
import { colors } from "../src/theme/tokens";

let mockOffset = "0";
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ offset: mockOffset }),
}));
jest.mock("../src/nutrition/useNutritionDay", () => ({ useNutritionDay: jest.fn() }));

// El summary se arma con el MISMO builder que usa la app, a partir de ítems, en vez de escribirse
// a mano: es la costura donde el total del día (con su marca de parcial y su sodio→sal) se
// encuentra con la pantalla. Un fixture inventado la saltearía justamente en la pestaña que este
// test cubre.
const item = (o: any = {}) => ({
  id: "i", foodId: null, foodName: "Comida", quantity: 100, quantityUnit: "g", grams: 100,
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...o,
});
const dia = (items: any[] = [diaBase()], drankMl = 1800) =>
  buildNutritionDaySummary(
    [{ id: "m", eatenAt: 1, mealType: null, note: null, items } as any],
    [{ id: "w", ml: drankMl, loggedAt: 1 }],
  );
// El día de referencia del resto de los tests: 1800 kcal, 4 g de sal (1600 mg de sodio), etc.
function diaBase(over: any = {}) {
  return item({
    kcal: 1800, protein_g: 120, carbs_g: 180, fat_g: 60,
    sugars_g: 40, fiber_g: 22, saturated_fat_g: 18, sodium_mg: 1600, cholesterol_mg: 210, water_ml: 300,
    ...over,
  });
}
const summary = dia();
const goalView = {
  status: "ok",
  kcal: { meta: 2200, comido: 1800, exercise: 300, restante: 700, over: false },
  macros: [
    { key: "protein", label: "Proteína", comido: 120, meta: 150, bonus: 0, metaTotal: 150, restante: 30, over: false },
    { key: "carbs", label: "Carbohidratos", comido: 180, meta: 220, bonus: 0, metaTotal: 220, restante: 40, over: false },
    { key: "fat", label: "Grasa", comido: 60, meta: 70, bonus: 0, metaTotal: 70, restante: 10, over: false },
  ],
};

function mockDay(over: Partial<any> = {}) {
  (useNutritionDay as jest.Mock).mockReturnValue({ error: null, meals: [], summary, goalView, ...over });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOffset = "0";
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

test("calorías justo en la meta: dice 'meta cumplida', igual que los macros (no 'te quedan 0')", async () => {
  mockDay({ goalView: { ...goalView, kcal: { ...goalView.kcal, comido: 2500, restante: 0, over: false } } });
  await render(<DetalleDiaScreen />);
  expect(screen.getByText("meta cumplida")).toBeTruthy();
  expect(screen.queryByText(/te quedan/)).toBeNull();
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

test("un micro sin dato dice 'sin dato' en vez de desaparecer de la tabla", async () => {
  mockDay({ summary: dia([diaBase({ sugars_g: null })]) });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("Azúcares")).toBeTruthy(); // la fila sigue estando
  expect(screen.getByTestId("nutr-sugars_g-amount")).toHaveTextContent(/^sin dato$/);
});

test("día sin ningún micro cargado: empty state en vez de una tabla de guiones", async () => {
  // Sin micros Y sin líquido registrado: el agua bebida también es un dato de esta pestaña, así
  // que un día con 1,8 L tomados no estaría "sin datos".
  mockDay({ summary: dia([item({ kcal: 1800, protein_g: 120, carbs_g: 180, fat_g: 60 })], 0) });
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
  expect(screen.queryByTestId("nutr-fiber_g-bar-over")).toBeNull();
});

test("fibra por encima del piso: llena de turquesa, sin segmento ámbar", async () => {
  mockDay({ summary: dia([diaBase({ fiber_g: 45 })]) }); // piso = 30
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.width).toBe("100%");
  expect(screen.queryByTestId("nutr-fiber_g-bar-over")).toBeNull();
});

test("sal por encima del límite: turquesa hasta la meta + ámbar el excedente", async () => {
  mockDay({ summary: dia([diaBase({ sodium_mg: 3600 })]) }); // 9 g de sal, ref = 5
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales")); // la sal vive en Minerales
  const fill = screen.getByTestId("nutr-salt_g-bar");
  const over = screen.getByTestId("nutr-salt_g-bar-over");
  expect(fill.props.style.backgroundColor).toBe(colors.accent);
  expect(over.props.style.backgroundColor).toBe(colors.warning);
  // 5/9 = 56% turquesa, 44% ámbar. Asertar los DOS anchos no es redundante: si el turquesa
  // ocupara el 100%, el ámbar quedaría invisible detrás y un test que solo lo busque pasaría igual.
  expect(fill.props.style.width).toBe("56%");
  expect(over.props.style.width).toBe("44%");
});

test("valor exactamente igual al límite NO avisa (tocar el límite no es pasarse)", async () => {
  mockDay({ summary: dia([diaBase({ sodium_mg: 2000 })]) }); // 5 g de sal = la referencia exacta
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.queryByTestId("nutr-salt_g-bar-over")).toBeNull();
});

test("un valor por encima de la referencia no desborda la barra (clamp al 100%)", async () => {
  mockDay({ summary: dia([diaBase({ fiber_g: 45 })]) }); // 150% del piso
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.width).toBe("100%");
});

test("micro sin dato: lo dice y no dibuja barra", async () => {
  mockDay({ summary: dia([diaBase({ fiber_g: null })]) });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-fiber_g-amount")).toHaveTextContent(/^sin dato$/);
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

test("la dona reparte por CALORÍAS, no por gramos (la grasa tiene 9 kcal/g)", async () => {
  // 100 g de carbos (400 kcal) y 50 g de grasa (450 kcal): por kcal la grasa es la porción MAYOR
  // (190°, arco largo); por gramos sería la menor (120°, arco corto).
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, protein_g: 0, carbs_g: 100, fat_g: 50 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-macros"));
  const d = screen.getByTestId("pie-arc-1").props.d as string; // arc 1 = grasa (la proteína en 0 no dibuja)
  expect(d).toMatch(/A 90 90 0 1 1 /); // arco EXTERNO con large-arc-flag = 1
});

test("pestaña Macros sin comidas: empty state, sin dona", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, protein_g: 0, carbs_g: 0, fat_g: 0 } } });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-macros"));
  expect(screen.getByText(/Todavía no registraste comidas/)).toBeTruthy();
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
});

test("tocar un nutriente abre el desglose de alimentos, con su key y el día que estás mirando", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-cholesterol_mg-row"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/nutriente?key=cholesterol_mg&offset=0");
});

test("el desglose se abre en el día que estás mirando, no siempre en hoy", async () => {
  mockOffset = "5"; // mirando 5 días atrás (offset positivo = pasado)
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-cholesterol_mg-row"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/nutriente?key=cholesterol_mg&offset=5");
});

test("un nutriente SIN dato no navega (no hay nada que desglosar)", async () => {
  mockDay({ summary: dia([diaBase({ fiber_g: null })]) });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-fiber_g-row"));
  expect(router.push).not.toHaveBeenCalled();
});

test("la pestaña ya no son 5 filas: hay vitaminas y minerales agrupados", async () => {
  mockDay({ summary: dia([diaBase({ zinc_mg: 5, vitamin_c_mg: 60 })]) });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByText("Vitaminas")).toBeTruthy();
  expect(screen.getByText("Minerales")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-zinc_mg-amount")).toHaveTextContent(/^5 \/ 11\.7 mg$/);
});

test("tocar un nutriente NUEVO también abre su desglose", async () => {
  mockDay({ summary: dia([diaBase({ zinc_mg: 5 })]) });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  await fireEvent.press(screen.getByTestId("nutr-zinc_mg-row"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/nutriente?key=zinc_mg&offset=0");
});

test("la sal navega con su clave, no con la del sodio que se persiste", async () => {
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  await fireEvent.press(screen.getByTestId("nutr-salt_g-row"));
  expect(router.push).toHaveBeenCalledWith("/nutricion/nutriente?key=salt_g&offset=0");
});

// La costura completa: perfil del hook → pantalla → pestaña → referencias EFSA. El hierro es el
// caso que motivó la personalización (11 mg un varón, 16 mg una mujer en edad fértil). Van como
// dos tests y no como uno con dos renders: con un perfil solo, una tabla que ignore el sexo pasa
// igual.
async function refDeHierroCon(profile: { sex: string; age: number }) {
  mockDay({ summary: dia([diaBase({ iron_mg: 8 })]), profile });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  return screen.getByTestId("nutr-iron_mg-amount");
}

test("con perfil de mujer, el hierro se compara contra 16 mg", async () => {
  expect(await refDeHierroCon({ sex: "female", age: 35 })).toHaveTextContent(/^8 \/ 16 mg$/);
});

test("con perfil de varón, el MISMO hierro se compara contra 11 mg", async () => {
  expect(await refDeHierroCon({ sex: "male", age: 35 })).toHaveTextContent(/^8 \/ 11 mg$/);
});

test("sin sexo ni edad en el perfil, ofrece completarlo", async () => {
  await render(<DetalleDiaScreen />); // el mock base no trae perfil
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutrientes-aviso-perfil")).toBeTruthy();
});

test("un total con agujeros se muestra como piso, con '≥'", async () => {
  // Un ítem declara el zinc y el otro no: el total del día es "al menos 5 mg", no "5 mg".
  mockDay({ summary: dia([diaBase({ zinc_mg: 5 }), item({})]) });
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-zinc_mg-amount")).toHaveTextContent(/^≥ 5 \/ 11\.7 mg$/);
});

test("pasarse de la sal se ve SIN abrir Minerales: el aviso sube al encabezado", async () => {
  // Antes la sal era una de 5 filas siempre visibles. Ahora vive en un grupo colapsado, así que
  // el excedente tiene que seguir viéndose de una o la feature se pierde de hecho.
  mockDay({ summary: dia([diaBase({ sodium_mg: 3600 })]) }); // 9 g de sal, ref = 5
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.queryByTestId("nutr-salt_g-amount")).toBeNull(); // el grupo sigue cerrado
  expect(screen.getByTestId("nutr-grupo-minerales-alerta")).toBeTruthy();
});

test("con ejercicio, la fila de carbos muestra el bonus etiquetado", async () => {
  mockDay({
    goalView: {
      ...goalView,
      macros: goalView.macros.map((m) =>
        m.key === "carbs" ? { ...m, bonus: 417, metaTotal: 637, restante: 457 } : m,
      ),
    },
  });
  await render(<DetalleDiaScreen />);
  expect(screen.getByText(/220 g \+417 ejercicio/)).toBeTruthy();
});

test("sin ejercicio, ninguna fila muestra el sufijo", async () => {
  await render(<DetalleDiaScreen />); // el fixture base tiene bonus 0 en los tres
  // No usamos /ejercicio/ a secas: la leyenda fija de la pantalla ("Restante = Meta − Comido +
  // Ejercicio. El gasto del ejercicio sale de tus sesiones...") también contiene la palabra, así
  // que ese regex daría un falso positivo. Acotamos a la forma que el sufijo realmente produce.
  expect(screen.queryByText(/\+\d+ ejercicio/)).toBeNull();
});
