import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import type { Meal, MealItem, NutritionGoalInput, TrainingProfile } from "@pulsia/shared";

const MEAL_ID = "aaaaaaaa-1111-4111-8111-111111111111";

// useFocusEffect: dispara el callback una vez vía React.useEffect (mismo criterio que
// use-nutrition-day.test.tsx). Con `(cb) => cb()` el reload se dispararía en CADA render.
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useFocusEffect: (cb: React.EffectCallback) => React.useEffect(cb, [cb]),
    useLocalSearchParams: jest.fn(() => ({ id: MEAL_ID })),
  };
});

jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));

const mockGoalInput: NutritionGoalInput = { objective: "maintain", rateKgPerWeek: 0, manualKcal: 2200 };
jest.mock("../src/api/nutrition", () => ({
  getMeal: jest.fn(),
  getNutritionGoal: jest.fn(async () => mockGoalInput),
  // Los usa la pestaña de nutrición, que este archivo también renderiza para probar la navegación.
  deleteMeal: jest.fn(), logWater: jest.fn(), deleteWater: jest.fn(),
}));
jest.mock("../src/api/metrics", () => ({ getLatestMetrics: jest.fn(async () => ({})) }));
jest.mock("../src/api/supplements", () => ({
  getDayChecklist: jest.fn(async () => ({ hasPlan: false, entries: [] })),
  putTake: jest.fn(),
}));
jest.mock("../src/nutrition/useNutritionDay", () => ({ useNutritionDay: jest.fn() }));

// Perfil con sexo y edad: las referencias EFSA salen personalizadas (hierro varón = 11 mg).
const perfilCompleto: TrainingProfile = {
  experience: "intermediate", goal: "hypertrophy",
  sex: "male", age: 35, weightKg: 70, heightCm: 178, activityLevel: "moderate",
  daysPerWeek: 4, sessionMinutes: 60, gymEquipment: [], homeEquipment: [], limitations: [],
};
jest.mock("../src/storage/profile", () => ({ getProfile: jest.fn(async () => null) }));

import ComidaDetalleScreen from "../app/nutricion/comida";
import NutricionScreen from "../app/(tabs)/nutricion";
import { getMeal } from "../src/api/nutrition";
import { getProfile } from "../src/storage/profile";
import { useNutritionDay } from "../src/nutrition/useNutritionDay";

const item = (over: Partial<MealItem> & Pick<MealItem, "foodName">): MealItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  foodId: "22222222-2222-4222-8222-222222222222",
  quantity: 100, quantityUnit: "g", grams: 100,
  kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5,
  ...over,
});

const comida = (items: MealItem[]): Meal => ({
  id: MEAL_ID, eatenAt: new Date(2026, 6, 24, 13, 45).getTime(), mealType: "almuerzo", note: null, items,
});

function mockComida(m: Meal) {
  (getMeal as jest.Mock).mockResolvedValue(m);
}

beforeEach(() => {
  jest.clearAllMocks();
  (getProfile as jest.Mock).mockResolvedValue(perfilCompleto);
  mockComida(comida([item({ foodName: "Pechuga de pollo" })]));
});

test("muestra los ingredientes con su gramaje", async () => {
  mockComida(comida([
    item({ foodName: "Pechuga de pollo", quantity: 150, grams: 150, kcal: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Arroz integral", quantity: 80, grams: 80, kcal: 296, protein_g: 6, carbs_g: 62, fat_g: 2 }),
  ]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByText("Pechuga de pollo")).toBeTruthy());
  expect(screen.getByText("Arroz integral")).toBeTruthy();
  expect(screen.getByTestId("ingrediente-0-cantidad")).toHaveTextContent(/^150 g$/);
  expect(screen.getByTestId("ingrediente-1-cantidad")).toHaveTextContent(/^80 g$/);
  // Y sus macros, que es lo que distingue "lista de nombres" de "detalle del ingrediente".
  expect(screen.getByTestId("ingrediente-0-macros")).toHaveTextContent(/^248 kcal · P46\.5 C0 G5\.4$/);
});

test("los nutrientes de la comida se comparan contra la referencia diaria personal", async () => {
  // 2,5 + 3 = 5,5 mg de hierro. Referencia EFSA de un varón adulto: 11 mg → 50 %.
  mockComida(comida([
    item({ foodName: "Lentejas", iron_mg: 2.5 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Espinaca", iron_mg: 3 }),
  ]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales")); // los minerales arrancan colapsados
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^5\.5 \/ 11 mg$/);
  expect(screen.getByTestId("nutr-iron_mg-pct")).toHaveTextContent(/^50 %$/);
});

// La marca de PARCIAL ("≥"): algunos ítems de la comida declaraban el nutriente y otros no, así
// que el total es un piso. Sin estos casos, la pantalla mostraba el mismo total que la pestaña del
// día pero SIN el "≥": la misma comida se leía como exacta acá y como piso allá.
test("con un ítem sin el nutriente, el total de la comida se marca como piso", async () => {
  // Lentejas con hierro de USDA + un alimento cargado a mano que no lo declara: son 2,5 mg DE LOS
  // QUE SABEMOS, no 2,5 mg.
  mockComida(comida([
    item({ foodName: "Lentejas", iron_mg: 2.5 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Salsa casera" }),
  ]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^≥ 2\.5 \/ 11 mg$/);
});

test("si TODOS los ítems declaran el nutriente, el total NO lleva la marca de piso", async () => {
  // El caso espejo: sin él, un `partial: true` fijo también pasaría verde.
  mockComida(comida([
    item({ foodName: "Lentejas", iron_mg: 2.5 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Espinaca", iron_mg: 3 }),
  ]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^5\.5 \/ 11 mg$/);
});

test("la sal hereda la marca de piso del sodio", async () => {
  // La sal es el sodio en otra unidad: si el sodio de la comida tenía agujeros, la sal también.
  // 1000 mg de sodio = 2,5 g de sal, y el otro ítem no declara sodio.
  mockComida(comida([
    item({ foodName: "Jamón", sodium_mg: 1000 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Pan casero" }),
  ]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-salt_g-amount")).toHaveTextContent(/^≥ 2\.5 \/ 5 g$/);
});

test("la referencia es la de ESE perfil: la misma comida da otro porcentaje para una mujer", async () => {
  // Sin este caso, una pantalla que ignore el perfil y use siempre la tabla masculina pasa verde.
  (getProfile as jest.Mock).mockResolvedValue({ ...perfilCompleto, sex: "female" });
  mockComida(comida([item({ foodName: "Lentejas", iron_mg: 5.5 })]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^5\.5 \/ 16 mg$/);
});

test("una comida sin micros muestra 'sin dato', no ceros", async () => {
  mockComida(comida([item({ foodName: "Pechuga de pollo" })]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-zinc_mg-amount")).toHaveTextContent(/^sin dato$/);
  expect(screen.queryByTestId("nutr-zinc_mg-bar")).toBeNull();
});

test("el agua de la comida NO se compara contra la referencia diaria de agua total", async () => {
  // La AI de EFSA (2500 ml para un varón) es de agua TOTAL del día: bebida + la de los alimentos.
  // Comparar contra ella los 300 ml que aportó UNA comida diría "tomaste el 12 % de lo que
  // necesitás" el día que tomó 2,1 L. Sin referencia honesta, la fila muestra el valor y nada más.
  mockComida(comida([item({ foodName: "Sopa", water_ml: 300 })]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-water_ml-amount")).toBeTruthy());
  expect(screen.getByTestId("nutr-water_ml-amount")).toHaveTextContent(/^300 ml$/);
  expect(screen.queryByTestId("nutr-water_ml-pct")).toBeNull();
  expect(screen.queryByTestId("nutr-water_ml-bar")).toBeNull();
});

test("la fila del sodio es SAL en gramos, igual que en la pestaña del día", async () => {
  // 1000 + 600 = 1600 mg de sodio = 4 g de sal. La app habla de sal en todas partes (el campo del
  // alta, el semáforo, la curva) y es lo único con referencia pública (OMS, 5 g/día).
  mockComida(comida([
    item({ foodName: "Jamón", sodium_mg: 1000 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Queso", sodium_mg: 600 }),
  ]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByText("Sal")).toBeTruthy();
  expect(screen.getByTestId("nutr-salt_g-amount")).toHaveTextContent(/^4 \/ 5 g$/);
  expect(screen.getByTestId("nutr-salt_g-pct")).toHaveTextContent(/^80 %$/);
  // Sustituye a la de sodio, no se suma: dos filas del MISMO hecho en dos unidades, y una sola
  // con referencia, es peor que una.
  expect(screen.queryByTestId("nutr-sodium_mg-row")).toBeNull();
});

test("una comida sin sodio muestra la sal 'sin dato', no 0 g", async () => {
  mockComida(comida([item({ foodName: "Pechuga de pollo" })]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-grupo-minerales")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("nutr-grupo-minerales"));
  expect(screen.getByTestId("nutr-salt_g-amount")).toHaveTextContent(/^sin dato$/);
  expect(screen.queryByTestId("nutr-salt_g-bar")).toBeNull();
});

// Las 5 referencias de la OMS (azúcares, fibra, colesterol, saturadas y sal) también valen acá:
// el título de la sección dice "sobre la referencia diaria" y son diarias. Sin ellas, la misma
// pantalla mostraba referencia para las vitaminas y la sal y ninguna para estas cuatro.
test("los azúcares de la comida se comparan contra la referencia de la OMS", async () => {
  mockComida(comida([item({ foodName: "Gaseosa", sugars_g: 25 })]));
  await render(<ComidaDetalleScreen />);

  // OMS: 50 g/día de azúcares libres → 25 g es el 50 %.
  await waitFor(() => expect(screen.getByTestId("nutr-sugars_g-amount")).toHaveTextContent(/^25 \/ 50 g$/));
  expect(screen.getByTestId("nutr-sugars_g-pct")).toHaveTextContent(/^50 %$/);
});

test("la fibra de la comida se compara contra la referencia de la OMS, y es un PISO", async () => {
  mockComida(comida([item({ foodName: "Lentejas", fiber_g: 45 })]));
  await render(<ComidaDetalleScreen />);

  // OMS: ≥30 g/día. Pasarse de un piso es bueno: no puede aparecer el aviso de "te pasaste".
  await waitFor(() => expect(screen.getByTestId("nutr-fiber_g-amount")).toHaveTextContent(/^45 \/ 30 g$/));
  expect(screen.queryByTestId("nutr-grupo-carbohidratos-alerta")).toBeNull();
});

test("el colesterol de la comida se compara contra la referencia de la OMS", async () => {
  mockComida(comida([item({ foodName: "Huevo", cholesterol_mg: 150 })]));
  await render(<ComidaDetalleScreen />);

  // Referencia clásica: 300 mg/día → 150 mg es el 50 %.
  await waitFor(() => expect(screen.getByTestId("nutr-cholesterol_mg-amount")).toHaveTextContent(/^150 \/ 300 mg$/));
  expect(screen.getByTestId("nutr-cholesterol_mg-pct")).toHaveTextContent(/^50 %$/);
});

test("las saturadas de la comida se comparan contra el 6 % de la meta de kcal (AHA)", async () => {
  // La AHA acota las saturadas al 6 % de la ENERGÍA: la referencia depende de la meta diaria,
  // que esta pantalla ya tiene (2200 kcal del objetivo mockeado) → 2200 × 0,06 / 9 = 14,7 g.
  mockComida(comida([item({ foodName: "Manteca", saturated_fat_g: 12.2 })]));
  await render(<ComidaDetalleScreen />);

  await waitFor(() => expect(screen.getByTestId("nutr-saturated_fat_g-amount")).toHaveTextContent(/^12\.2 \/ 14\.7 g$/));
  expect(screen.getByTestId("nutr-saturated_fat_g-pct")).toHaveTextContent(/^83 %$/);
});

test("el aporte de la comida se muestra contra la meta del día", async () => {
  mockComida(comida([
    item({ foodName: "Pechuga de pollo", kcal: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 }),
    item({ id: "33333333-3333-4333-8333-333333333333", foodName: "Arroz integral", kcal: 296, protein_g: 6, carbs_g: 62, fat_g: 2 }),
  ]));
  await render(<ComidaDetalleScreen />);

  // 248 + 296 = 544 kcal de una meta de 2200 (manualKcal del objetivo mockeado).
  await waitFor(() => expect(screen.getByTestId("comida-goal-kcal")).toHaveTextContent(/^544 \/ 2200 kcal$/));
  // Proteína: 46,5 + 6 = 52,5 → 53. Meta = 70 kg × 1.8 (maintain) = 126 g.
  expect(screen.getByTestId("comida-goal-protein")).toHaveTextContent(/^53 \/ 126 g$/);
});

test("el título dice qué comida es y a qué hora", async () => {
  await render(<ComidaDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("comida-titulo")).toHaveTextContent(/^Almuerzo · 13:45$/));
});

test("sin sexo ni edad en el perfil avisa que las referencias son conservadoras", async () => {
  (getProfile as jest.Mock).mockResolvedValue({ ...perfilCompleto, sex: undefined, age: undefined });
  await render(<ComidaDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("comida-aviso-perfil")).toBeTruthy());
});

test("con el perfil completo no aparece el aviso", async () => {
  await render(<ComidaDetalleScreen />);
  await waitFor(() => expect(screen.getByTestId("comida-titulo")).toBeTruthy());
  expect(screen.queryByTestId("comida-aviso-perfil")).toBeNull();
});

test("tocar una comida del día abre SU detalle, no el formulario de edición", async () => {
  // La costura: sin esto la pantalla nueva existe y nadie puede llegar a ella.
  (useNutritionDay as jest.Mock).mockReturnValue({
    error: null, setError: jest.fn(), water: [], goalView: null, baseUrl: "http://x", reload: jest.fn(),
    meals: [comida([item({ foodName: "Pechuga de pollo" })])],
    summary: {
      dayTotals: { kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5, sugars_g: null, fiber_g: null, saturated_fat_g: null, salt_g: null },
      cholesterolMg: null,
      liquid: { total: 0, drank: 0, fromFood: 0 },
    },
  });
  await render(<NutricionScreen />);
  await fireEvent.press(screen.getByText(/13:45/));
  expect(router.push).toHaveBeenCalledWith(`/nutricion/comida?id=${MEAL_ID}`);
});

test("desde el detalle se puede editar la comida", async () => {
  await render(<ComidaDetalleScreen />);
  await waitFor(() => expect(screen.getByText("Editar")).toBeTruthy());
  await fireEvent.press(screen.getByText("Editar"));
  expect(router.push).toHaveBeenCalledWith(`/nutricion/nueva-comida?mealId=${MEAL_ID}`);
});
