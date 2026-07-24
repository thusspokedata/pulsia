// Detalle (solo lectura) de un alimento del catálogo: `app/nutricion/alimento.tsx`.
//
// OJO con el vecino: `alimento-detalle.test.tsx` NO cubre esta pantalla. A pesar del nombre,
// cubre el FORMULARIO de alta/edición (`agregar-alimento.tsx`) en modo edición — el semáforo, el
// campo de sal y el bug de los micros que se borraban al guardar. Son dos pantallas distintas.
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import type { Food } from "@pulsia/shared";

const FOOD_ID = "11111111-1111-4111-8111-111111111111";

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useFocusEffect: (cb: React.EffectCallback) => React.useEffect(cb, [cb]),
    useLocalSearchParams: jest.fn(() => ({ id: FOOD_ID })),
  };
});
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/api/nutrition", () => ({
  getFood: jest.fn(),
  getUsdaEntry: jest.fn(),
  listFoods: jest.fn(async () => []),
  deleteFood: jest.fn(),
}));

import AlimentoDetalleScreen from "../app/nutricion/alimento";
import CatalogoScreen from "../app/nutricion/catalogo";
import { getFood, getUsdaEntry, listFoods } from "../src/api/nutrition";

const alimento = (over: Partial<Food> = {}): Food => ({
  id: FOOD_ID, name: "Lentejas cocidas", basis: "per_100g", createdAt: 0,
  kcal: 116, protein_g: 9, carbs_g: 20, fat_g: 0.4,
  saturated_fat_g: 0.1, sugars_g: 1.8, fiber_g: 7.9, sodium_mg: 238, cholesterol_mg: 0, water_ml: 69.6,
  iron_mg: 3.3, zinc_mg: 1.27, vitamin_c_mg: 1.5,
  unitWeightG: null, sourceMacros: "ai", sourceMicros: "usda", usdaFdcId: 175249,
  ...over,
});

const ENTRADA_USDA = { fdcId: 175249, description: "Lentils, mature seeds, cooked, boiled", dataType: "sr_legacy" };

beforeEach(() => {
  jest.clearAllMocks();
  (getFood as jest.Mock).mockResolvedValue(alimento());
  (getUsdaEntry as jest.Mock).mockResolvedValue(ENTRADA_USDA);
});

test("desde el catálogo se llega al detalle del alimento", async () => {
  (listFoods as jest.Mock).mockResolvedValue([alimento()]);
  await render(<CatalogoScreen />);
  await waitFor(() => expect(screen.getByText("Lentejas cocidas")).toBeTruthy());

  await fireEvent.press(screen.getByText("Lentejas cocidas"));
  expect(router.push).toHaveBeenCalledWith(`/nutricion/alimento?id=${FOOD_ID}`);
});

test("los valores son por 100 g y NO se comparan contra ninguna referencia diaria", async () => {
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("alimento-base")).toHaveTextContent(/^Valores por 100 g$/));

  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales")); // arrancan colapsados
  // Sin "/ Y" y sin porcentaje: una referencia DIARIA sobre un valor por 100 g sería una mentira.
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^3\.3 mg$/);
  expect(screen.queryByTestId("nutr-iron_mg-pct")).toBeNull();
  expect(screen.queryByTestId("nutr-iron_mg-bar")).toBeNull();
  expect(screen.getByTestId("nutr-fiber_g-amount")).toHaveTextContent(/^7\.9 g$/);
  expect(screen.queryByTestId("nutr-fiber_g-pct")).toBeNull();
});

test("un líquido dice por 100 ml, no por 100 g", async () => {
  (getFood as jest.Mock).mockResolvedValue(alimento({ basis: "per_100ml" }));
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("alimento-base")).toHaveTextContent(/^Valores por 100 ml$/));
});

test("un nutriente que el alimento no tiene dice 'sin dato'", async () => {
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-calcium_mg-amount")).toHaveTextContent(/^sin dato$/);
});

test("dice que los micros salieron de USDA y NOMBRA la entrada, no su número", async () => {
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("source-chip-micros-usda")).toBeTruthy());
  // El alimento guarda solo el fdcId; la descripción se resuelve contra `GET /nutrition/usda/:id`.
  await waitFor(() => expect(screen.getByTestId("alimento-usda")).toHaveTextContent(/Lentils, mature seeds, cooked, boiled/));
  expect(getUsdaEntry).toHaveBeenCalledWith("http://x", 175249);
  // Un fdcId crudo no le dice nada a nadie: si el nombre se resolvió, el número sobra.
  expect(screen.getByTestId("alimento-usda")).not.toHaveTextContent(/175249/);
});

test("si no se puede resolver la entrada de USDA, cae al número y NO rompe la pantalla", async () => {
  (getUsdaEntry as jest.Mock).mockRejectedValue(new Error("500"));
  await render(<AlimentoDetalleScreen />);
  // El alimento se sigue viendo entero: la descripción es un adorno, no un requisito.
  await waitFor(() => expect(screen.getByTestId("alimento-macros")).toBeTruthy());
  expect(screen.getByTestId("alimento-usda")).toHaveTextContent(/175249/);
  expect(screen.queryByText("500")).toBeNull(); // el error no se muestra como si el alimento fallara
});

test("sin match contra USDA no hay chip, ni referencia de entrada, ni pedido al backend", async () => {
  (getFood as jest.Mock).mockResolvedValue(alimento({ sourceMicros: null, usdaFdcId: null }));
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByText("Lentejas cocidas")).toBeTruthy());
  expect(screen.queryByTestId("source-chip-micros-usda")).toBeNull();
  expect(screen.queryByTestId("alimento-usda")).toBeNull();
  expect(getUsdaEntry).not.toHaveBeenCalled();
});

test("muestra los macros por 100 g y desde acá se edita el alimento", async () => {
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("alimento-macros")).toHaveTextContent(/^116 kcal · P9 C20 G0\.4$/));

  await fireEvent.press(screen.getByText("Editar"));
  expect(router.push).toHaveBeenCalledWith(`/nutricion/agregar-alimento?foodId=${FOOD_ID}`);
});
