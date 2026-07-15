import { render, screen, fireEvent, waitFor, within } from "@testing-library/react-native";
import PlanSuplementosScreen from "../app/nutricion/plan-suplementos";
import { getPlan, generatePlan, updatePlanItem } from "../src/api/supplements";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: jest.fn(async () => "http://x") }));
jest.mock("../src/nutrition/athleteContext", () => ({ buildAthleteContext: jest.fn(async () => ({ goal: { status: "incomplete" } })) }));
jest.mock("../src/api/supplements", () => ({
  getPlan: jest.fn(async () => null),
  generatePlan: jest.fn(async () => ({ plan: {}, warnings: [] })),
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
  (generatePlan as jest.Mock).mockResolvedValue({ plan: {}, warnings: [] });
  (updatePlanItem as jest.Mock).mockResolvedValue({});
});

test("sin plan: CTA de generar; generar manda athleteContext + date y muestra el plan", async () => {
  (generatePlan as jest.Mock).mockResolvedValueOnce({ plan, warnings: [] });
  await render(<PlanSuplementosScreen />);
  await waitFor(() => expect(screen.getByText(/Todavía no hay plan/i)).toBeTruthy());
  await fireEvent.press(screen.getByText(/Generar plan con IA/i));
  await waitFor(() => expect(screen.getAllByText(/Magnesio/).length).toBeGreaterThan(0)); // ítem + vista semanal
  const input = (generatePlan as jest.Mock).mock.calls[0][1];
  expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(input.athleteContext).toBeDefined();
  expect(screen.getByText(/todos los días/i)).toBeTruthy(); // label de frecuencia
  expect(screen.getByText(/ayuda al descanso/)).toBeTruthy(); // motivo de la IA
});

test("generar con warnings: se muestran arriba del plan en una nota ámbar", async () => {
  (generatePlan as jest.Mock).mockResolvedValueOnce({
    plan, warnings: ["Varios productos activos aportan \"magnesio\" el mismo día: A, B. Revisá si hay solapamiento."],
  });
  await render(<PlanSuplementosScreen />);
  await waitFor(() => expect(screen.getByText(/Todavía no hay plan/i)).toBeTruthy());
  await fireEvent.press(screen.getByText(/Generar plan con IA/i));
  await waitFor(() => expect(screen.getByText(/⚠️.*magnesio/)).toBeTruthy());
  expect(screen.getByText(/Revisá el plan o regenerá con una nota/i)).toBeTruthy();
});

test("generar sin warnings: no se muestra la nota ámbar", async () => {
  (generatePlan as jest.Mock).mockResolvedValueOnce({ plan, warnings: [] });
  await render(<PlanSuplementosScreen />);
  await waitFor(() => expect(screen.getByText(/Todavía no hay plan/i)).toBeTruthy());
  await fireEvent.press(screen.getByText(/Generar plan con IA/i));
  await waitFor(() => expect(screen.getAllByText(/Magnesio/).length).toBeGreaterThan(0));
  expect(screen.queryByText(/Revisá el plan o regenerá con una nota/i)).toBeNull();
});

test("con plan: regenerar con nota la manda como userNote", async () => {
  (getPlan as jest.Mock).mockResolvedValueOnce(plan);
  (generatePlan as jest.Mock).mockResolvedValueOnce({ plan, warnings: [] });
  await render(<PlanSuplementosScreen />);
  await waitFor(() => expect(screen.getAllByText(/Magnesio/).length).toBeGreaterThan(0)); // ítem + vista semanal
  await fireEvent.changeText(screen.getByPlaceholderText(/Nota para la IA/i), "el zinc a la mañana no");
  await fireEvent.press(screen.getByText(/Regenerar plan/i));
  await waitFor(() => expect(generatePlan).toHaveBeenCalled());
  expect((generatePlan as jest.Mock).mock.calls[0][1].userNote).toBe("el zinc a la mañana no");
});

test("editar un ítem: cambiar la dosis dispara PATCH", async () => {
  (getPlan as jest.Mock).mockResolvedValueOnce(plan);
  (updatePlanItem as jest.Mock).mockResolvedValueOnce({ ...plan.items[0], dose: "1 cápsula" });
  await render(<PlanSuplementosScreen />);
  await fireEvent.press((await screen.findAllByText(/Magnesio/))[0]); // expande edición (1º = ítem, el resto es la vista semanal)
  const dose = screen.getByDisplayValue("2 cápsulas");
  await fireEvent.changeText(dose, "1 cápsula");
  await fireEvent.press(screen.getByText(/Guardar cambios/i));
  await waitFor(() => expect(updatePlanItem).toHaveBeenCalledWith("http://x", plan.items[0].id, expect.objectContaining({ dose: "1 cápsula" })));
});

test("editar solo la dosis de un ítem día-por-medio preserva el anchorDate original", async () => {
  const eodItem = {
    id: "44444444-4444-4444-8444-444444444444", supplementId: "s2", supplementName: "Zink",
    slot: "desayuno", frequency: { type: "every_other_day", anchorDate: "2026-07-10" }, dose: "1 tableta", reason: null,
  };
  (getPlan as jest.Mock).mockResolvedValueOnce({ ...plan, items: [eodItem] });
  (updatePlanItem as jest.Mock).mockResolvedValueOnce({ ...eodItem, dose: "2 tabletas" });
  await render(<PlanSuplementosScreen />);
  await fireEvent.press((await screen.findAllByText(/Zink/))[0]); // expande edición (1º = ítem, el resto es la vista semanal)
  await fireEvent.changeText(screen.getByDisplayValue("1 tableta"), "2 tabletas");
  await fireEvent.press(screen.getByText(/Guardar cambios/i));
  await waitFor(() => expect(updatePlanItem).toHaveBeenCalled());
  const patch = (updatePlanItem as jest.Mock).mock.calls[0][2];
  expect(patch.dose).toBe("2 tabletas");
  expect(patch.frequency).toEqual({ type: "every_other_day", anchorDate: "2026-07-10" }); // NO re-anclado a hoy
});

test("si falla el guardado, la edición no se pierde y se ve el error", async () => {
  (getPlan as jest.Mock).mockResolvedValueOnce(plan);
  // Rechazo asíncrono real (tick de red): fuerza el render intermedio de "guardando".
  (updatePlanItem as jest.Mock).mockImplementationOnce(
    () => new Promise((_, reject) => setTimeout(() => reject(new Error("No se pudo actualizar el ítem del plan.")), 0)),
  );
  await render(<PlanSuplementosScreen />);
  await fireEvent.press((await screen.findAllByText(/Magnesio/))[0]); // expande edición (1º = ítem, el resto es la vista semanal)
  await fireEvent.changeText(screen.getByDisplayValue("2 cápsulas"), "1 cápsula");
  await fireEvent.press(screen.getByText(/Guardar cambios/i));
  await waitFor(() => expect(screen.getByText(/No se pudo actualizar/)).toBeTruthy());
  expect(screen.getByDisplayValue("1 cápsula")).toBeTruthy(); // la dosis editada sigue en el input
});

test("días fijos: los días elegidos se mandan ordenados sin importar el orden de tap", async () => {
  (getPlan as jest.Mock).mockResolvedValueOnce(plan);
  (updatePlanItem as jest.Mock).mockResolvedValueOnce({
    ...plan.items[0], frequency: { type: "weekdays", days: [1, 6] },
  });
  await render(<PlanSuplementosScreen />);
  await fireEvent.press((await screen.findAllByText(/Magnesio/))[0]); // expande edición (1º = ítem, el resto es la vista semanal)
  await fireEvent.press(screen.getByText(/días fijos/i));
  await fireEvent.press(screen.getByTestId("chip-6")); // primero el sábado…
  await fireEvent.press(screen.getByTestId("chip-1")); // …después el lunes
  await fireEvent.press(screen.getByText(/Guardar cambios/i));
  await waitFor(() => expect(updatePlanItem).toHaveBeenCalled());
  const patch = (updatePlanItem as jest.Mock).mock.calls[0][2];
  expect(patch.frequency).toEqual({ type: "weekdays", days: [1, 6] }); // ordenados
});

test("muestra el disclaimer no-médico", async () => {
  await render(<PlanSuplementosScreen />);
  await waitFor(() => expect(screen.getByText(/no reemplaza.*(médico|profesional)/i)).toBeTruthy());
});

test("vista semanal: 7 días desde hoy, ítem daily todos los días y weekdays solo en sus días", async () => {
  // 2026-07-16T12:00:00 (hora local) es jueves (getDay()===4); VERIFICADO con node.
  const nowSpy = jest.spyOn(Date, "now").mockReturnValue(new Date("2026-07-16T12:00:00").getTime());
  const weekPlan = {
    id: "66666666-6666-4666-8666-666666666666", userNote: null, createdAt: 0,
    items: [
      {
        id: "77777777-7777-4777-8777-777777777777", supplementId: "s1", supplementName: "Magnesio",
        slot: "antes_de_dormir", frequency: { type: "daily" }, dose: "1 cápsula", reason: null,
      },
      {
        id: "88888888-8888-4888-8888-888888888888", supplementId: "s2", supplementName: "Zink",
        slot: "desayuno", frequency: { type: "weekdays", days: [1, 3, 5] }, dose: "1 tableta", reason: null,
      },
    ],
  };
  try {
    (getPlan as jest.Mock).mockResolvedValueOnce(weekPlan);
    await render(<PlanSuplementosScreen />);
    await waitFor(() => expect(screen.getAllByText(/Magnesio/).length).toBeGreaterThan(0));

    // i=0 → hoy (jueves 16/07, dow=4): Magnesio sí, Zink no (4 no está en [1,3,5]).
    const day0 = screen.getByTestId("week-day-0");
    expect(within(day0).getByText(/Hoy/)).toBeTruthy();
    expect(within(day0).getByText(/Magnesio/)).toBeTruthy();
    expect(within(day0).queryByText(/Zink/)).toBeNull();

    // Magnesio (daily) aparece los 7 días.
    for (let i = 0; i < 7; i++) {
      expect(within(screen.getByTestId(`week-day-${i}`)).getByText(/Magnesio/)).toBeTruthy();
    }

    // i=1 → viernes 17/07 (dow=5, en [1,3,5]): Zink sí.
    expect(within(screen.getByTestId("week-day-1")).getByText(/Zink/)).toBeTruthy();
    // i=2 → sábado 18/07 (dow=6, no está en [1,3,5]): Zink no.
    expect(within(screen.getByTestId("week-day-2")).queryByText(/Zink/)).toBeNull();
    // i=4 → lunes 20/07 (dow=1, en [1,3,5]): Zink sí.
    expect(within(screen.getByTestId("week-day-4")).getByText(/Zink/)).toBeTruthy();
    // i=6 → miércoles 22/07 (dow=3, en [1,3,5]): Zink sí.
    expect(within(screen.getByTestId("week-day-6")).getByText(/Zink/)).toBeTruthy();
  } finally {
    nowSpy.mockRestore();
  }
});
