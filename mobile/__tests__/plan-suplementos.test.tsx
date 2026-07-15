import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import PlanSuplementosScreen from "../app/nutricion/plan-suplementos";
import { getPlan, generatePlan, updatePlanItem } from "../src/api/supplements";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/nutrition/athleteContext", () => ({ buildAthleteContext: jest.fn(async () => ({ goal: { status: "incomplete" } })) }));
jest.mock("../src/api/supplements", () => ({
  getPlan: jest.fn(async () => null),
  generatePlan: jest.fn(async () => ({})),
  updatePlanItem: jest.fn(async () => ({})),
}));

const plan = {
  id: "55555555-5555-4555-8555-555555555555", userNote: null, createdAt: 0,
  items: [{
    id: "33333333-3333-4333-8333-333333333333", supplementId: "s1", supplementName: "Magnesio",
    slot: "antes_de_dormir", frequency: { type: "daily" }, dose: "2 cápsulas", reason: "ayuda al descanso",
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (getPlan as jest.Mock).mockResolvedValue(null);
  (generatePlan as jest.Mock).mockResolvedValue({});
  (updatePlanItem as jest.Mock).mockResolvedValue({});
});

test("sin plan: CTA de generar; generar manda athleteContext + date y muestra el plan", async () => {
  (generatePlan as jest.Mock).mockResolvedValueOnce(plan);
  await render(<PlanSuplementosScreen />);
  await waitFor(() => expect(screen.getByText(/Todavía no hay plan/i)).toBeTruthy());
  await fireEvent.press(screen.getByText(/Generar plan con IA/i));
  await waitFor(() => expect(screen.getByText(/Magnesio/)).toBeTruthy());
  const input = (generatePlan as jest.Mock).mock.calls[0][1];
  expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(input.athleteContext).toBeDefined();
  expect(screen.getByText(/todos los días/i)).toBeTruthy(); // label de frecuencia
  expect(screen.getByText(/ayuda al descanso/)).toBeTruthy(); // motivo de la IA
});

test("con plan: regenerar con nota la manda como userNote", async () => {
  (getPlan as jest.Mock).mockResolvedValueOnce(plan);
  (generatePlan as jest.Mock).mockResolvedValueOnce(plan);
  await render(<PlanSuplementosScreen />);
  await waitFor(() => expect(screen.getByText(/Magnesio/)).toBeTruthy());
  await fireEvent.changeText(screen.getByPlaceholderText(/Nota para la IA/i), "el zinc a la mañana no");
  await fireEvent.press(screen.getByText(/Regenerar plan/i));
  await waitFor(() => expect(generatePlan).toHaveBeenCalled());
  expect((generatePlan as jest.Mock).mock.calls[0][1].userNote).toBe("el zinc a la mañana no");
});

test("editar un ítem: cambiar la dosis dispara PATCH", async () => {
  (getPlan as jest.Mock).mockResolvedValueOnce(plan);
  (updatePlanItem as jest.Mock).mockResolvedValueOnce({ ...plan.items[0], dose: "1 cápsula" });
  await render(<PlanSuplementosScreen />);
  await fireEvent.press(await screen.findByText(/Magnesio/)); // expande edición
  const dose = screen.getByDisplayValue("2 cápsulas");
  await fireEvent.changeText(dose, "1 cápsula");
  await fireEvent.press(screen.getByText(/Guardar cambios/i));
  await waitFor(() => expect(updatePlanItem).toHaveBeenCalledWith("http://x", plan.items[0].id, expect.objectContaining({ dose: "1 cápsula" })));
});

test("muestra el disclaimer no-médico", async () => {
  await render(<PlanSuplementosScreen />);
  await waitFor(() => expect(screen.getByText(/no reemplaza.*(médico|profesional)/i)).toBeTruthy());
});
