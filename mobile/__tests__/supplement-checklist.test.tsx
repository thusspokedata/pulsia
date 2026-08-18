import { render, screen, fireEvent } from "@testing-library/react-native";
import { SupplementChecklist } from "../src/components/SupplementChecklist";

const entry = {
  origin: "plan" as const, planItemId: "33333333-3333-4333-8333-333333333333", takeId: null, supplementId: "s1",
  supplementName: "Magnesio", slot: "antes_de_dormir" as const,
  dose: "2 cápsulas", plannedDose: "2 cápsulas", reason: "ayuda al descanso",
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
  expect(screen.getByText(/2 cápsulas/)).toBeTruthy();
});

test("tap marca tomado; los botones desvío/salteado disparan onMark con el estado", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[entry]} onMark={onMark} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByText(/Magnesio/));
  expect(onMark).toHaveBeenCalledWith(entry, "taken", undefined, undefined);
  await fireEvent.press(screen.getByTestId(`skip-${entry.planItemId}`));
  expect(onMark).toHaveBeenCalledWith(entry, "skipped", undefined, undefined);
});

test("desvío: expande input de dosis real y confirma con onMark(deviated, dosis)", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[entry]} onMark={onMark} onRemove={jest.fn()} />);
  await fireEvent.press(screen.getByTestId(`deviate-${entry.planItemId}`));
  const input = screen.getByPlaceholderText(/Dosis real/i);
  await fireEvent.changeText(input, "10 g");
  await fireEvent.press(screen.getByText(/Confirmar/i));
  expect(onMark).toHaveBeenCalledWith(entry, "deviated", "10 g", undefined);
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
