import { render, screen } from "@testing-library/react-native";
import { LineChart } from "../src/components/LineChart";

// react-native-svg envuelve el string de <Text> en un <TSpan>, así que el texto real
// queda en children.props.children del elemento con el testID.
function labelText(testID: string): string {
  return (screen.getByTestId(testID).props.children as any).props.children;
}

test("muestra etiquetas de mín/máx del eje Y con la unidad", async () => {
  await render(<LineChart data={[{ x: 0, y: 60 }, { x: 1, y: 120 }]} unit="bpm" />);
  expect(labelText("linechart-max")).toBe("120 bpm");
  expect(labelText("linechart-min")).toBe("60 bpm");
});

test("sin variación (mín == máx) solo muestra el máx", async () => {
  await render(<LineChart data={[{ x: 0, y: 80 }, { x: 1, y: 80 }]} unit="kg" />);
  expect(labelText("linechart-max")).toBe("80 kg");
  expect(screen.queryByTestId("linechart-min")).toBeNull();
});

test("sin datos muestra el placeholder", async () => {
  await render(<LineChart data={[]} />);
  expect(screen.getByText("Sin datos todavía.")).toBeTruthy();
});
