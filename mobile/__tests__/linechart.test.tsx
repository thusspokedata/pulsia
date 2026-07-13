import { render, screen } from "@testing-library/react-native";
import { LineChart } from "../src/components/LineChart";
import { shortDate } from "../src/session/chartAxis";

// react-native-svg envuelve el string de <Text> en un <TSpan>, así que el texto real
// queda en children.props.children del elemento con el testID.
function labelText(testID: string): string {
  return (screen.getByTestId(testID).props.children as any).props.children;
}

test("muestra los valores mín/máx del eje Y", async () => {
  await render(<LineChart data={[{ x: 0, y: 60 }, { x: 1, y: 120 }]} unit="bpm" />);
  expect(labelText("linechart-max")).toBe("120");
  expect(labelText("linechart-min")).toBe("60");
});

test("sin variación (mín == máx) solo muestra el máx", async () => {
  await render(<LineChart data={[{ x: 0, y: 80 }, { x: 1, y: 80 }]} unit="kg" />);
  expect(labelText("linechart-max")).toBe("80");
  expect(screen.queryByTestId("linechart-min")).toBeNull();
});

test("con fechas irregulares, la etiqueta X del medio usa el punto medio TEMPORAL, no el índice medio", async () => {
  const d1 = new Date(2026, 0, 1).getTime();
  const d2 = new Date(2026, 0, 2).getTime(); // índice medio (data[1]), pegado al inicio
  const d31 = new Date(2026, 0, 31).getTime();
  await render(<LineChart data={[{ x: d1, y: 1 }, { x: d2, y: 2 }, { x: d31, y: 3 }]} unit="kg" />);
  const temporalMid = d1 + (d31 - d1) / 2; // ~16 ene
  expect(labelText("linechart-xmid")).toBe(shortDate(temporalMid));
  expect(labelText("linechart-xmid")).not.toBe(shortDate(d2)); // no es "2 ene"
});

test("sin datos muestra el placeholder", async () => {
  await render(<LineChart data={[]} />);
  expect(screen.getByText("Sin datos todavía.")).toBeTruthy();
});
