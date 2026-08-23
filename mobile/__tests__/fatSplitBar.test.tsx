import { render, screen } from "@testing-library/react-native";
import { FatSplitBar } from "../src/nutrition/tabs/ui";
import { colors } from "../src/theme/tokens";

test("sin excedente (overPct 0) no renderiza el segmento -over", async () => {
  await render(<FatSplitBar fillPct={40} overPct={0} baseColor={colors.success} testID="fat-bar-x" />);
  expect(screen.getByTestId("fat-bar-x")).toBeTruthy();
  expect(screen.queryByTestId("fat-bar-x-over")).toBeNull();
});

test("con excedente (overPct > 0) renderiza el segmento -over en rojo (danger)", async () => {
  await render(<FatSplitBar fillPct={60} overPct={40} baseColor={colors.warning} testID="fat-bar-y" />);
  const over = screen.getByTestId("fat-bar-y-over");
  expect(over).toBeTruthy();
  expect(over.props.style.backgroundColor).toBe(colors.danger);
  expect(over.props.style.width).toBe("40%");
});

test("la base usa el baseColor pasado y el ancho de fillPct", async () => {
  await render(<FatSplitBar fillPct={55} overPct={0} baseColor={colors.success} testID="fat-bar-z" />);
  const base = screen.getByTestId("fat-bar-z");
  expect(base.props.style.backgroundColor).toBe(colors.success);
  expect(base.props.style.width).toBe("55%");
});
