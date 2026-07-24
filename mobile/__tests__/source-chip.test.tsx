import { render, screen } from "@testing-library/react-native";
import { SourceChip } from "../src/nutrition/SourceChip";
import { colors } from "../src/theme/tokens";

test("macros de etiqueta → dice 'etiqueta'", async () => {
  await render(<SourceChip sourceMacros="label" />);
  expect(screen.getByText("etiqueta")).toBeTruthy();
});

test("macros estimados por la IA → dice 'estimado'", async () => {
  await render(<SourceChip sourceMacros="ai" />);
  expect(screen.getByText("estimado")).toBeTruthy();
});

test("macros cargados a mano → dice 'a mano', no 'estimado'", async () => {
  // Antes los dos casos caían en "estimado" porque el dato no los distinguía. Ahora sí.
  await render(<SourceChip sourceMacros="manual" />);
  expect(screen.getByText("a mano")).toBeTruthy();
  expect(screen.queryByText("estimado")).toBeNull();
});

test("el estimado NO usa el ámbar de 'te pasaste': no es un error, es información", async () => {
  await render(<SourceChip sourceMacros="ai" />);
  expect(screen.getByTestId("source-chip-ai").props.style.backgroundColor).not.toBe(colors.warning);
});

test("con micros de USDA aparece un SEGUNDO chip, sin pisar el de los macros", async () => {
  await render(<SourceChip sourceMacros="label" sourceMicros="usda" />);
  expect(screen.getByText("etiqueta")).toBeTruthy();
  expect(screen.getByTestId("source-chip-micros-usda")).toBeTruthy();
  expect(screen.getByText("USDA")).toBeTruthy();
});

test("sin micros (null) no hay chip de micros: no se afirma una procedencia que no hubo", async () => {
  await render(<SourceChip sourceMacros="label" sourceMicros={null} />);
  expect(screen.queryByTestId("source-chip-micros-usda")).toBeNull();
  expect(screen.queryByText("USDA")).toBeNull();
});

test("micros estimados por la IA no se anuncian como USDA", async () => {
  await render(<SourceChip sourceMacros="ai" sourceMicros="ai" />);
  expect(screen.queryByText("USDA")).toBeNull();
});
