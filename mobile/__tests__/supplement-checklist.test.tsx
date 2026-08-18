import { render, screen, fireEvent } from "@testing-library/react-native";
import { SupplementChecklist } from "../src/components/SupplementChecklist";

const entry = {
  origin: "plan" as const, planItemId: "33333333-3333-4333-8333-333333333333", takeId: null, supplementId: "s1",
  supplementName: "Magnesio", slot: "antes_de_dormir" as const,
  dose: "3 cápsulas", plannedDose: "3 cápsulas", reason: "ayuda al descanso",
  adjusted: null, status: null, actualDose: null, note: null,
};

const nonCountableEntry = {
  origin: "plan" as const, planItemId: "44444444-4444-4444-8444-444444444444", takeId: null, supplementId: "s3",
  supplementName: "Creatina", slot: "post_entreno" as const,
  dose: "10 g", plannedDose: "10 g", reason: "fuerza",
  adjusted: null, status: null, actualDose: null, note: null,
};

const adHocEntry = {
  origin: "adhoc" as const, planItemId: null, takeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", supplementId: "s2",
  supplementName: "Vitamina D", slot: "desayuno" as const,
  dose: "1 cápsula", plannedDose: "1 cápsula", reason: null,
  adjusted: null, status: "taken" as const, actualDose: null, note: null,
};

test("agrupa por franja con label en español y muestra dosis", async () => {
  await render(<SupplementChecklist entries={[entry]} onMark={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.getByText("Antes de dormir")).toBeTruthy();
  expect(screen.getByText(/Magnesio/)).toBeTruthy();
  expect(screen.getByText(/3 cápsulas/)).toBeTruthy();
});

test("tap marca tomado; los botones desvío/salteado disparan onMark con el estado", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[entry]} onMark={onMark} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByText(/Magnesio/));
  expect(onMark).toHaveBeenCalledWith(entry, "taken", undefined, undefined);
  await fireEvent.press(screen.getByTestId(`skip-${entry.planItemId}`));
  expect(onMark).toHaveBeenCalledWith(entry, "skipped", undefined, undefined);
});

test("desvío contable: muestra stepper +/- inicializado en el count planeado (sin texto libre)", async () => {
  await render(<SupplementChecklist entries={[entry]} onMark={jest.fn()} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByTestId(`deviate-${entry.planItemId}`));
  expect(screen.getByTestId(`step-count-${entry.planItemId}`).props.children).toBe("3 cápsulas");
  expect(screen.getByTestId(`step-minus-${entry.planItemId}`)).toBeTruthy();
  expect(screen.getByTestId(`step-plus-${entry.planItemId}`)).toBeTruthy();
  expect(screen.queryByPlaceholderText(/Dosis real/i)).toBeNull();
});

test("desvío contable: − baja y confirma con onMark(deviated, dosis reconstruida)", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[entry]} onMark={onMark} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByTestId(`deviate-${entry.planItemId}`));
  await fireEvent.press(screen.getByTestId(`step-minus-${entry.planItemId}`));
  await fireEvent.press(screen.getByTestId(`step-minus-${entry.planItemId}`));
  expect(screen.getByTestId(`step-count-${entry.planItemId}`).props.children).toBe("1 cápsula");
  await fireEvent.press(screen.getByText(/Confirmar/i));
  expect(onMark).toHaveBeenCalledWith(entry, "deviated", "1 cápsula", undefined);
});

test("desvío contable: si vuelve al count planeado el estado es 'taken'", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[entry]} onMark={onMark} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByTestId(`deviate-${entry.planItemId}`));
  await fireEvent.press(screen.getByTestId(`step-minus-${entry.planItemId}`));
  await fireEvent.press(screen.getByTestId(`step-plus-${entry.planItemId}`));
  expect(screen.getByTestId(`step-count-${entry.planItemId}`).props.children).toBe("3 cápsulas");
  await fireEvent.press(screen.getByText(/Confirmar/i));
  expect(onMark).toHaveBeenCalledWith(entry, "taken", "3 cápsulas", undefined);
});

test("desvío contable: el stepper no baja de 0", async () => {
  await render(<SupplementChecklist entries={[entry]} onMark={jest.fn()} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByTestId(`deviate-${entry.planItemId}`));
  for (let i = 0; i < 5; i++) await fireEvent.press(screen.getByTestId(`step-minus-${entry.planItemId}`));
  expect(screen.getByTestId(`step-count-${entry.planItemId}`).props.children).toBe("0 cápsulas");
});

const reducedEntry = {
  origin: "plan" as const, planItemId: "55555555-5555-4555-8555-555555555555", takeId: null, supplementId: "s4",
  supplementName: "Magnesio", slot: "antes_de_dormir" as const,
  // Día con ajuste reduce: la IA bajó de 3 a 1. La dosis EFECTIVA (baseline del stepper) es 1,
  // pero el PLAN ORIGINAL sigue siendo 3 (el diario cuenta plannedDose para un "taken").
  dose: "1 cápsula", plannedDose: "3 cápsulas", reason: "ayuda al descanso",
  adjusted: { action: "reduce" as const, reason: "ayer comiste rico en magnesio" }, status: null, actualDose: null, note: null,
};

test("desvío con reduce (dose 1, plan 3): confirmar en baseline 1 → deviated, no taken", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[reducedEntry]} onMark={onMark} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByTestId(`deviate-${reducedEntry.planItemId}`));
  // baseline = dosis efectiva (1), NO el plan original.
  expect(screen.getByTestId(`step-count-${reducedEntry.planItemId}`).props.children).toBe("1 cápsula");
  await fireEvent.press(screen.getByText(/Confirmar/i));
  // 1 ≠ plan original 3 → deviated (el diario contará actualDose "1 cápsula", no las 3 del plan).
  expect(onMark).toHaveBeenCalledWith(reducedEntry, "deviated", "1 cápsula", undefined);
});

test("desvío con reduce (dose 1, plan 3): subir a 3 (ignorar el reduce) → taken", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[reducedEntry]} onMark={onMark} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByTestId(`deviate-${reducedEntry.planItemId}`));
  await fireEvent.press(screen.getByTestId(`step-plus-${reducedEntry.planItemId}`));
  await fireEvent.press(screen.getByTestId(`step-plus-${reducedEntry.planItemId}`));
  expect(screen.getByTestId(`step-count-${reducedEntry.planItemId}`).props.children).toBe("3 cápsulas");
  await fireEvent.press(screen.getByText(/Confirmar/i));
  // 3 === plan original 3 → taken; el diario cuenta las 3 del plan, correcto.
  expect(onMark).toHaveBeenCalledWith(reducedEntry, "taken", "3 cápsulas", undefined);
});

test("desvío NO contable ('10 g'): sigue el texto libre, sin stepper", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[nonCountableEntry]} onMark={onMark} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByTestId(`deviate-${nonCountableEntry.planItemId}`));
  expect(screen.queryByTestId(`step-count-${nonCountableEntry.planItemId}`)).toBeNull();
  const input = screen.getByPlaceholderText(/Dosis real/i);
  await fireEvent.changeText(input, "5 g");
  await fireEvent.press(screen.getByText(/Confirmar/i));
  expect(onMark).toHaveBeenCalledWith(nonCountableEntry, "deviated", "5 g", undefined);
});

test("estado tomado muestra ✓; ajuste de la IA se muestra atenuado con motivo", async () => {
  const taken = { ...entry, status: "taken" as const };
  const adjusted = { ...entry, planItemId: "x2", supplementName: "Zink", adjusted: { action: "skip" as const, reason: "ayer comiste rico en zinc" } };
  await render(<SupplementChecklist entries={[taken, adjusted]} onMark={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.getByText(/✓/)).toBeTruthy();
  expect(screen.getByText(/ayer comiste rico en zinc/)).toBeTruthy();
});

test("fila ad-hoc: NO tiene Desvío/Salteado, tiene Quitar y dispara onRemove", async () => {
  const onMark = jest.fn();
  const onRemove = jest.fn();
  await render(<SupplementChecklist entries={[adHocEntry]} onMark={onMark} onRemove={onRemove} />);
  expect(screen.queryByTestId(`deviate-${adHocEntry.planItemId}`)).toBeNull();
  expect(screen.queryByText(/Desvío/)).toBeNull();
  expect(screen.queryByText(/Salteado/)).toBeNull();
  await fireEvent.press(screen.getByTestId(`remove-${adHocEntry.takeId}`));
  expect(onRemove).toHaveBeenCalledWith(adHocEntry);
  expect(onMark).not.toHaveBeenCalled();
});

test("filas origin=plan siguen con Desvío/Salteado cuando hay entries ad-hoc mezcladas", async () => {
  await render(<SupplementChecklist entries={[entry, adHocEntry]} onMark={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.getByTestId(`deviate-${entry.planItemId}`)).toBeTruthy();
  expect(screen.getByTestId(`skip-${entry.planItemId}`)).toBeTruthy();
  expect(screen.getByTestId(`remove-${adHocEntry.takeId}`)).toBeTruthy();
});
