import { render, fireEvent } from "@testing-library/react-native";
import { YearHeatmap } from "../src/components/YearHeatmap";
import type { DayBurn } from "../src/session/dailyBurn";

function burnMap(entries: Record<string, Partial<DayBurn>>): Map<string, DayBurn> {
  const m = new Map<string, DayBurn>();
  for (const [date, v] of Object.entries(entries)) {
    m.set(date, { kcal: 0, strengthKcal: 0, cardioKcal: 0, minutes: 0, ...v });
  }
  return m;
}

const T: [number, number, number] = [200, 400, 600];
const SESSIONS = [{ startedAt: new Date("2026-03-15T10:00:00").getTime() }];

test("tocar una celda con actividad muestra el desglose del día", async () => {
  const map = burnMap({
    "2026-03-15": { kcal: 700, strengthKcal: 400, cardioKcal: 300, minutes: 105 },
  });
  const r = await render(
    <YearHeatmap burnByDate={map} thresholds={T} sessions={SESSIONS} activities={[]}
      year={2026} onSelectYear={() => {}} />
  );
  await fireEvent.press(r.getByTestId("heatmap-cell-2026-03-15"));
  expect(r.getByText(/700 kcal/)).toBeTruthy();
  // Las etiquetas van en la aserción a propósito: `/400/` suelto no distingue fuerza de cardio,
  // así que un componente que intercambiara las dos líneas seguiría pasando.
  expect(r.getByText(/Fuerza 400/)).toBeTruthy();
  expect(r.getByText(/Cardio 300/)).toBeTruthy();
  expect(r.getByText(/105 min/)).toBeTruthy();
});

test("el desglose distingue fuerza de cardio con valores distintos", async () => {
  // Valores asimétricos a propósito: con 350/350 el test pasaría aunque el componente mostrara
  // dos veces la misma fuente.
  const map = burnMap({
    "2026-03-15": { kcal: 700, strengthKcal: 400, cardioKcal: 300, minutes: 105 },
  });
  const r = await render(
    <YearHeatmap burnByDate={map} thresholds={T} sessions={SESSIONS} activities={[]}
      year={2026} onSelectYear={() => {}} />
  );
  await fireEvent.press(r.getByTestId("heatmap-cell-2026-03-15"));
  // Regex, no string: `toHaveTextContent("400")` acá exige texto EXACTO, no substring.
  expect(r.getByTestId("heatmap-detail-strength")).toHaveTextContent(/400/);
  expect(r.getByTestId("heatmap-detail-cardio")).toHaveTextContent(/300/);
});

test("tocar la misma celda de nuevo deselecciona", async () => {
  const map = burnMap({ "2026-03-15": { kcal: 700, strengthKcal: 700, minutes: 60 } });
  const r = await render(
    <YearHeatmap burnByDate={map} thresholds={T} sessions={SESSIONS} activities={[]}
      year={2026} onSelectYear={() => {}} />
  );
  const cell = r.getByTestId("heatmap-cell-2026-03-15");
  await fireEvent.press(cell);
  expect(r.queryByTestId("heatmap-detail")).toBeTruthy();
  await fireEvent.press(cell);
  expect(r.queryByTestId("heatmap-detail")).toBeNull();
});

test("sin ninguna selección no se muestra desglose", async () => {
  const map = burnMap({ "2026-03-15": { kcal: 700, strengthKcal: 700, minutes: 60 } });
  const r = await render(
    <YearHeatmap burnByDate={map} thresholds={T} sessions={SESSIONS} activities={[]}
      year={2026} onSelectYear={() => {}} />
  );
  expect(r.queryByTestId("heatmap-detail")).toBeNull();
});
