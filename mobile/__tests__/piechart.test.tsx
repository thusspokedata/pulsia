import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { PieChart } from "../src/components/PieChart";

const three = [
  { label: "A", value: 300, color: "#111" },
  { label: "B", value: 500, color: "#222" },
  { label: "C", value: 200, color: "#333" },
];

test("dibuja un arco por porción", async () => {
  await render(<PieChart data={three} size={160} />);
  expect(screen.getByTestId("pie-arc-0")).toBeTruthy();
  expect(screen.getByTestId("pie-arc-1")).toBeTruthy();
  expect(screen.getByTestId("pie-arc-2")).toBeTruthy();
  expect(screen.queryByTestId("pie-arc-3")).toBeNull();
});

test("las porciones de valor 0 no se dibujan", async () => {
  await render(<PieChart data={[...three, { label: "D", value: 0, color: "#444" }]} size={160} />);
  expect(screen.queryByTestId("pie-arc-3")).toBeNull();
});

test("una sola porción se dibuja como círculo, no como arco (un arco de 360° degenera en SVG)", async () => {
  await render(<PieChart data={[{ label: "A", value: 10, color: "#111" }]} size={160} />);
  expect(screen.getByTestId("pie-arc-0").props.d).toBeUndefined(); // Circle, no Path
});

test("con varias porciones cada arco es un Path con su 'd'", async () => {
  await render(<PieChart data={three} size={160} />);
  expect(typeof screen.getByTestId("pie-arc-0").props.d).toBe("string");
});

test("sin datos (o todo en 0) no dibuja nada", async () => {
  await render(<PieChart data={[]} size={160} />);
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
  await render(<PieChart data={[{ label: "A", value: 0, color: "#111" }]} size={160} />);
  expect(screen.queryByTestId("pie-arc-0")).toBeNull();
});

test("innerRadius > 0 renderiza el contenido central", async () => {
  await render(<PieChart data={three} size={160} innerRadius={50} center={<Text>1800</Text>} />);
  expect(screen.getByText("1800")).toBeTruthy();
});
