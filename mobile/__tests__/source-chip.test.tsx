import { render, screen } from "@testing-library/react-native";
import { SourceChip } from "../src/nutrition/SourceChip";
import { colors } from "../src/theme/tokens";

test("source label → dice 'etiqueta'", async () => {
  await render(<SourceChip source="label" />);
  expect(screen.getByText("etiqueta")).toBeTruthy();
});

test("source estimate → dice 'estimado'", async () => {
  await render(<SourceChip source="estimate" />);
  expect(screen.getByText("estimado")).toBeTruthy();
});

test("el estimado NO usa el ámbar de 'te pasaste': no es un error, es información", async () => {
  await render(<SourceChip source="estimate" />);
  expect(screen.getByTestId("source-chip-estimate").props.style.backgroundColor).not.toBe(colors.warning);
});
