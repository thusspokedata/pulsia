import { render, screen, fireEvent } from "@testing-library/react-native";
import { SupplementChecklist } from "../src/components/SupplementChecklist";

const entry = {
  planItemId: "33333333-3333-4333-8333-333333333333", supplementId: "s1",
  supplementName: "Magnesio", slot: "antes_de_dormir" as const,
  dose: "2 cápsulas", plannedDose: "2 cápsulas", reason: "ayuda al descanso",
  adjusted: null, status: null, actualDose: null, note: null,
};

test("agrupa por franja con label en español y muestra dosis", async () => {
  await render(<SupplementChecklist entries={[entry]} onMark={jest.fn()} />);
  expect(screen.getByText("Antes de dormir")).toBeTruthy();
  expect(screen.getByText(/Magnesio/)).toBeTruthy();
  expect(screen.getByText(/2 cápsulas/)).toBeTruthy();
});

test("tap marca tomado; los botones desvío/salteado disparan onMark con el estado", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[entry]} onMark={onMark} />);
  await fireEvent.press(screen.getByText(/Magnesio/));
  expect(onMark).toHaveBeenCalledWith(entry, "taken", undefined, undefined);
  await fireEvent.press(screen.getByTestId(`skip-${entry.planItemId}`));
  expect(onMark).toHaveBeenCalledWith(entry, "skipped", undefined, undefined);
});

test("desvío: expande input de dosis real y confirma con onMark(deviated, dosis)", async () => {
  const onMark = jest.fn();
  await render(<SupplementChecklist entries={[entry]} onMark={onMark} />);
  await fireEvent.press(screen.getByTestId(`deviate-${entry.planItemId}`));
  const input = screen.getByPlaceholderText(/Dosis real/i);
  await fireEvent.changeText(input, "10 g");
  await fireEvent.press(screen.getByText(/Confirmar/i));
  expect(onMark).toHaveBeenCalledWith(entry, "deviated", "10 g", undefined);
});

test("estado tomado muestra ✓; ajuste de la IA se muestra atenuado con motivo", async () => {
  const taken = { ...entry, status: "taken" as const };
  const adjusted = { ...entry, planItemId: "x2", supplementName: "Zink", adjusted: { action: "skip" as const, reason: "ayer comiste rico en zinc" } };
  await render(<SupplementChecklist entries={[taken, adjusted]} onMark={jest.fn()} />);
  expect(screen.getByText(/✓/)).toBeTruthy();
  expect(screen.getByText(/ayer comiste rico en zinc/)).toBeTruthy();
});
