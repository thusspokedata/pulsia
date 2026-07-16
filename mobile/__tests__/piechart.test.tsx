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

test("dona con una sola porción: el anillo degenerado conserva los radios interno y externo", async () => {
  await render(<PieChart data={[{ label: "A", value: 10, color: "#111" }]} size={160} innerRadius={30} />);
  const arc = screen.getByTestId("pie-arc-0");
  // r del trazo = punto medio del anillo, y el ancho del trazo lo extiende hasta r=80 por fuera y 30 por dentro.
  expect(arc.props.r).toBe(55);
  expect(arc.props.strokeWidth).toBe(50);
});

test("el primer arco arranca a las 12 en punto y usa el arco corto si la porción es menor a 180°", async () => {
  await render(<PieChart data={three} size={160} />);
  // three[0] = 300/1000 = 108° → arco corto (large-arc-flag 0). El path arranca en el centro (torta).
  const d = screen.getByTestId("pie-arc-0").props.d as string;
  expect(d.startsWith("M 80 80 L 80 0")).toBe(true); // centro → borde superior = las 12 en punto
  const [, large, sweep] = d.match(/A 80 80 0 (\d) (\d)/)!;
  expect(large).toBe("0"); // 108° < 180°
  expect(sweep).toBe("1"); // sentido horario
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
