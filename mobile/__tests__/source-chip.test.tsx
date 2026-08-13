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

test("macros de USDA → dice 'USDA' y se destaca como fuente real", async () => {
  // El seed del catálogo base arma los macros desde USDA: es una fuente real, así que el chip se
  // destaca (accentSoft) igual que "etiqueta", no como una estimación.
  await render(<SourceChip sourceMacros="usda" />);
  const chip = screen.getByTestId("source-chip-usda");
  expect(screen.getByText("USDA")).toBeTruthy();
  expect(chip.props.style.backgroundColor).toBe(colors.accentSoft);
  expect(chip.props.style.backgroundColor).not.toBe(colors.surfaceMuted);
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

test("micros estimados por la IA muestran su propio chip, no destacado", async () => {
  await render(<SourceChip sourceMacros="ai" sourceMicros="ai" />);
  const chip = screen.getByTestId("source-chip-micros-ai");
  expect(chip).toBeTruthy();
  expect(screen.getByText("micros IA")).toBeTruthy();
  // NO destacado: el fondo es `surfaceMuted` (el de una estimación), no el `accentSoft` de un dato
  // de fuente real (etiqueta/USDA). Sin esto, `strong={true}` pasaría el test igual.
  expect(chip.props.style.backgroundColor).toBe(colors.surfaceMuted);
  expect(chip.props.style.backgroundColor).not.toBe(colors.accentSoft);
});

test("macros compuestos desde una receta → dice 'receta' y se destaca como fuente real", async () => {
  // Una receta no es una estimación: son los macros de los ingredientes que el usuario compuso.
  await render(<SourceChip sourceMacros="recipe" sourceMicros={null} />);
  const chip = screen.getByTestId("source-chip-recipe");
  expect(chip).toBeTruthy();
  expect(screen.getByText("receta")).toBeTruthy();
  expect(chip.props.style.backgroundColor).toBe(colors.accentSoft);
  expect(chip.props.style.backgroundColor).not.toBe(colors.surfaceMuted);
});

