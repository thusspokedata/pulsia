// Detalle (solo lectura) de un alimento del catálogo: `app/nutricion/alimento.tsx`.
//
// OJO con el vecino: `alimento-detalle.test.tsx` NO cubre esta pantalla. A pesar del nombre,
// cubre el FORMULARIO de alta/edición (`agregar-alimento.tsx`) en modo edición — el semáforo, el
// campo de sal y el bug de los micros que se borraban al guardar. Son dos pantallas distintas.
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import type { Food, FoodIdentification } from "@pulsia/shared";

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
  proposeUsdaRefresh: jest.fn(),
  applyUsdaRefresh: jest.fn(),
  assembleUsdaFood: jest.fn(),
  searchUsdaFoods: jest.fn(async () => []),
}));

import AlimentoDetalleScreen from "../app/nutricion/alimento";
import CatalogoScreen from "../app/nutricion/catalogo";
import {
  getFood, getUsdaEntry, listFoods,
  proposeUsdaRefresh, applyUsdaRefresh, assembleUsdaFood,
} from "../src/api/nutrition";

const alimento = (over: Partial<Food> = {}): Food => ({
  id: FOOD_ID, name: "Lentejas cocidas", basis: "per_100g", createdAt: 0,
  kcal: 116, protein_g: 9, carbs_g: 20, fat_g: 0.4,
  saturated_fat_g: 0.1, sugars_g: 1.8, fiber_g: 7.9, sodium_mg: 238, cholesterol_mg: 0, water_ml: 69.6,
  iron_mg: 3.3, zinc_mg: 1.27, vitamin_c_mg: 1.5,
  unitWeightG: null, sourceMacros: "ai", sourceMicros: "usda", usdaFdcId: 175249,
  ...over,
});

const ENTRADA_USDA = { fdcId: 175249, description: "Lentils, mature seeds, cooked, boiled", dataType: "sr_legacy" };
const OTRA_ENTRADA = { fdcId: 172421, description: "Lentils, sprouted, raw", dataType: "sr_legacy" };

// La identificación que arma el backend desde el alimento guardado. Viaja de vuelta en el apply.
const IDENTIFICACION: FoodIdentification = {
  name: "Lentejas cocidas", basis: "per_100g", kcal: 116, protein_g: 9, carbs_g: 20, fat_g: 0.4,
  saturated_fat_g: 0.1, sugars_g: 1.8, fiber_g: 7.9, sodium_mg: 238, cholesterol_mg: 0, water_ml: 69.6,
  unitWeightG: null, sourceMacros: "ai", searchQuery: "lentils cooked boiled",
};

const propuesta = (over: Record<string, unknown> = {}) => ({
  identification: IDENTIFICACION,
  candidates: [ENTRADA_USDA, OTRA_ENTRADA],
  chosen: 175249,
  // Un alimento estimado por IA deja que USDA gane: las kcal pueden cambiar, y con ellas los días
  // que el usuario ya miró.
  proposal: { ...IDENTIFICACION, kcal: 120, sourceMicros: "usda", usdaFdcId: 175249, iron_mg: 3.7 },
  mealsAffected: 2,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getFood as jest.Mock).mockResolvedValue(alimento());
  (getUsdaEntry as jest.Mock).mockResolvedValue(ENTRADA_USDA);
  (proposeUsdaRefresh as jest.Mock).mockResolvedValue(propuesta());
  (applyUsdaRefresh as jest.Mock).mockResolvedValue({ mealsUpdated: 2, itemsUpdated: 3 });
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

test("el mineral se muestra como SAL, la misma unidad que la comida y el día", async () => {
  // 238 mg de sodio por 100 g = 0,6 g de sal. Por 100 g no hay referencia diaria que valga, pero
  // la UNIDAD tiene que ser la misma en las tres pantallas: el alta ya pide "Sal (g)" y el
  // semáforo del catálogo ya evalúa sal por 100 g.
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));

  expect(screen.getByText("Sal")).toBeTruthy();
  expect(screen.getByTestId("nutr-salt_g-amount")).toHaveTextContent(/^0\.6 g$/);
  // Por 100 g no se compara contra nada (ni la OMS ni EFSA hablan de 100 g de comida).
  expect(screen.queryByTestId("nutr-salt_g-pct")).toBeNull();
  expect(screen.queryByTestId("nutr-salt_g-bar")).toBeNull();
  expect(screen.queryByTestId("nutr-sodium_mg-row")).toBeNull();
});

test("un alimento sin sodio muestra la sal 'sin dato', no 0 g", async () => {
  (getFood as jest.Mock).mockResolvedValue(alimento({ sodium_mg: null }));
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-salt_g-amount")).toHaveTextContent(/^sin dato$/);
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

// ---- "Actualizar": traer las vitaminas y minerales de USDA ----
// Los 80 alimentos cargados antes de la copia local de USDA no tienen micros. El botón los trae, y
// de paso RE-SNAPSHOTEA las comidas que usan el alimento: por eso hay una confirmación en el medio.

async function abrirPropuesta() {
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("alimento-macros")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("alimento-actualizar"));
  await waitFor(() => expect(screen.getByTestId("refresh-panel")).toBeTruthy());
}

test("el botón Actualizar pide la propuesta y muestra qué entrada de USDA encontró", async () => {
  await abrirPropuesta();
  expect(proposeUsdaRefresh).toHaveBeenCalledWith("http://x", FOOD_ID);
  // La descripción en inglés es lo único que le permite al usuario desconfiar del match.
  expect(screen.getByTestId("refresh-entrada")).toHaveTextContent(/Lentils, mature seeds, cooked, boiled/);
});

test("avisa cuántas comidas se van a tocar ANTES de aplicar", async () => {
  // La condición que el owner puso para aceptar el diseño: el re-snapshot cambia kcal y macros de
  // días que el usuario ya vio, así que el número va antes del botón, no después.
  await abrirPropuesta();
  expect(screen.getByTestId("refresh-comidas")).toHaveTextContent(/2 comidas/);
  expect(applyUsdaRefresh).not.toHaveBeenCalled();
});

test("el aviso habla de UNA comida cuando es una sola", async () => {
  (proposeUsdaRefresh as jest.Mock).mockResolvedValue(propuesta({ mealsAffected: 1 }));
  await abrirPropuesta();
  expect(screen.getByTestId("refresh-comidas")).toHaveTextContent(/\b1 comida\b/);
});

test("si ninguna comida usa el alimento, lo dice en vez de prometer un recálculo", async () => {
  (proposeUsdaRefresh as jest.Mock).mockResolvedValue(propuesta({ mealsAffected: 0 }));
  await abrirPropuesta();
  expect(screen.getByTestId("refresh-comidas")).toHaveTextContent(/Ninguna comida/);
});

test("muestra las kcal que quedarían: es el número que va a cambiar los días pasados", async () => {
  await abrirPropuesta();
  expect(screen.getByTestId("refresh-cambios")).toHaveTextContent(/116 → 120/);
});

test("sin match avisa y no ofrece aplicar", async () => {
  // El backend degrada solo (nunca 500): `chosen: null` es "no encontré nada". Ofrecer "Aplicar"
  // acá escribiría el alimento tal cual y re-snapshotearía las comidas sin ganar nada.
  (proposeUsdaRefresh as jest.Mock).mockResolvedValue(
    propuesta({ chosen: null, candidates: [], proposal: { ...IDENTIFICACION, sourceMicros: null, usdaFdcId: null } }),
  );
  await abrirPropuesta();
  expect(screen.getByTestId("refresh-sin-match")).toBeTruthy();
  expect(screen.queryByTestId("refresh-aplicar")).toBeNull();
});

test("aplicar manda el fdcId elegido y recarga el alimento con los micros nuevos", async () => {
  await abrirPropuesta();
  (getFood as jest.Mock).mockResolvedValue(alimento({ iron_mg: 3.7, kcal: 120 }));

  await fireEvent.press(screen.getByTestId("refresh-aplicar"));
  await waitFor(() => expect(applyUsdaRefresh).toHaveBeenCalledWith("http://x", FOOD_ID, IDENTIFICACION, 175249));

  // Recargado: la pantalla muestra lo que quedó en la base, no la propuesta.
  await waitFor(() => expect(screen.getByTestId("alimento-macros")).toHaveTextContent(/^120 kcal/));
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales")); // arrancan colapsados
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^3\.7 mg$/);
  // Y el panel se cierra: dejarlo abierto invitaría a aplicar dos veces lo mismo.
  expect(screen.queryByTestId("refresh-panel")).toBeNull();
});

test("mientras la propuesta viaja lo dice, y tocar de nuevo no dispara otra", async () => {
  // Son DOS llamadas a la IA (la frase de búsqueda y la elección): tarda, y sin señal el usuario
  // toca el botón otra vez.
  let resolver: (v: unknown) => void = () => {};
  (proposeUsdaRefresh as jest.Mock).mockReturnValue(new Promise((r) => { resolver = r; }));

  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("alimento-macros")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("alimento-actualizar"));

  expect(screen.getByTestId("refresh-cargando")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("alimento-actualizar"));
  expect(proposeUsdaRefresh).toHaveBeenCalledTimes(1);

  await act(async () => { resolver(propuesta()); });
  await waitFor(() => expect(screen.getByTestId("refresh-panel")).toBeTruthy());
  expect(screen.queryByTestId("refresh-cargando")).toBeNull();
});

test("si la propuesta falla, lo dice y no ofrece aplicar", async () => {
  (proposeUsdaRefresh as jest.Mock).mockRejectedValue(new Error("No hay API key de IA disponible."));
  await render(<AlimentoDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("alimento-macros")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("alimento-actualizar"));

  await waitFor(() => expect(screen.getByText("No hay API key de IA disponible.")).toBeTruthy());
  expect(screen.queryByTestId("refresh-aplicar")).toBeNull();
  // El alimento se sigue viendo: la propuesta falló, la pantalla no.
  expect(screen.getByTestId("alimento-macros")).toBeTruthy();
});

test("si aplicar falla, lo dice, NO recarga y el panel sigue ahí para reintentar", async () => {
  (applyUsdaRefresh as jest.Mock).mockRejectedValue(new Error("No encontrado"));
  await abrirPropuesta();

  await fireEvent.press(screen.getByTestId("refresh-aplicar"));
  await waitFor(() => expect(screen.getByText("No encontrado")).toBeTruthy());
  expect(screen.getByTestId("refresh-aplicar")).toBeTruthy();
  // Recargar acá mostraría el alimento "actualizado" cuando en la base no cambió nada.
  expect(getFood).toHaveBeenCalledTimes(1);
});

test("el '¿no es este?' corrige la fila y aplica la CORREGIDA, no la que eligió la IA", async () => {
  (assembleUsdaFood as jest.Mock).mockResolvedValue({
    ...IDENTIFICACION, kcal: 106, sourceMicros: "usda", usdaFdcId: 172421, iron_mg: 3.1,
  });
  await abrirPropuesta();

  await fireEvent.press(screen.getByTestId("refresh-no-es-este"));
  await fireEvent.press(screen.getByTestId("usda-candidato-172421"));
  await waitFor(() => expect(assembleUsdaFood).toHaveBeenCalledWith("http://x", IDENTIFICACION, 172421));

  // El panel nombra la fila nueva y muestra SUS kcal: sin esto el usuario no sabe si su corrección
  // llegó a algún lado.
  await waitFor(() => expect(screen.getByTestId("refresh-entrada")).toHaveTextContent(/Lentils, sprouted, raw/));
  expect(screen.getByTestId("refresh-cambios")).toHaveTextContent(/116 → 106/);

  await fireEvent.press(screen.getByTestId("refresh-aplicar"));
  await waitFor(() => expect(applyUsdaRefresh).toHaveBeenCalledWith("http://x", FOOD_ID, IDENTIFICACION, 172421));
});

test("sin match, el '¿no es este?' deja elegir a mano y recién ahí se puede aplicar", async () => {
  // "No encontré nada" no es "no hay nada": los candidatos pueden existir y la IA haber dicho que
  // ninguno sirve. Elegir uno a mano es una decisión del usuario, y ahí sí se puede aplicar.
  (proposeUsdaRefresh as jest.Mock).mockResolvedValue(propuesta({ chosen: null, proposal: { ...IDENTIFICACION, sourceMicros: null, usdaFdcId: null } }));
  (assembleUsdaFood as jest.Mock).mockResolvedValue({ ...IDENTIFICACION, kcal: 106, sourceMicros: "usda", usdaFdcId: 172421 });
  await abrirPropuesta();
  expect(screen.queryByTestId("refresh-aplicar")).toBeNull();

  await fireEvent.press(screen.getByTestId("refresh-no-es-este"));
  await fireEvent.press(screen.getByTestId("usda-candidato-172421"));
  await waitFor(() => expect(screen.getByTestId("refresh-aplicar")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("refresh-aplicar"));
  await waitFor(() => expect(applyUsdaRefresh).toHaveBeenCalledWith("http://x", FOOD_ID, IDENTIFICACION, 172421));
});
