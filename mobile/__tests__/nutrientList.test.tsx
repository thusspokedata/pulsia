import { render, screen, fireEvent } from "@testing-library/react-native";
import { NutrientList } from "../src/nutrition/NutrientList";
import type { NutrientSection, NutrientRow } from "../src/nutrition/nutrientRows";

const fila = (over: Partial<NutrientRow> & Pick<NutrientRow, "key">): NutrientRow => ({
  label: "X",
  unit: "mg",
  value: null,
  ref: null,
  pct: null,
  kind: null,
  partial: false,
  ...over,
});

// Secciones a mano en vez de pasar por buildNutrientRows: el componente no sabe de dónde salen
// las filas, y así el test controla qué grupo trae qué.
const secciones = (over: Partial<Record<string, NutrientRow[]>> = {}): NutrientSection[] => [
  { group: "grasas", label: "Grasas", rows: over.grasas ?? [] },
  { group: "carbohidratos", label: "Carbohidratos", rows: over.carbohidratos ?? [] },
  { group: "vitaminas", label: "Vitaminas", rows: over.vitaminas ?? [] },
  { group: "minerales", label: "Minerales", rows: over.minerales ?? [] },
];

test("renderiza los cuatro encabezados de grupo", async () => {
  await render(<NutrientList sections={secciones()} />);
  for (const g of ["Grasas", "Carbohidratos", "Vitaminas", "Minerales"]) {
    expect(screen.getByText(g)).toBeTruthy();
  }
});

test("una fila con dato muestra 'X / Y unidad', su porcentaje y su barra", async () => {
  const rows = [fila({ key: "fiber_g", label: "Fibra", unit: "g", value: 15, ref: 30, pct: 50, kind: "min" })];
  await render(<NutrientList sections={secciones({ carbohidratos: rows })} />);
  expect(screen.getByTestId("nutr-fiber_g-amount")).toHaveTextContent(/^15 \/ 30 g$/);
  expect(screen.getByTestId("nutr-fiber_g-pct")).toHaveTextContent(/^50 %$/);
  expect(screen.getByTestId("nutr-fiber_g-bar")).toBeTruthy();
});

test("una fila sin dato dice 'sin dato' y NO renderiza barra ni porcentaje", async () => {
  const rows = [fila({ key: "omega3_g", label: "Omega-3", unit: "g", ref: 2 })];
  await render(<NutrientList sections={secciones({ grasas: rows })} />);
  expect(screen.getByTestId("nutr-omega3_g-amount")).toHaveTextContent(/^sin dato$/);
  expect(screen.queryByTestId("nutr-omega3_g-bar")).toBeNull();
  expect(screen.queryByTestId("nutr-omega3_g-pct")).toBeNull();
});

test("un cero medido NO es 'sin dato': muestra 0 y su barra", async () => {
  const rows = [fila({ key: "sugars_g", label: "Azúcares", unit: "g", value: 0, ref: 50, pct: 0, kind: "max" })];
  await render(<NutrientList sections={secciones({ carbohidratos: rows })} />);
  expect(screen.getByTestId("nutr-sugars_g-amount")).toHaveTextContent(/^0 \/ 50 g$/);
  expect(screen.getByTestId("nutr-sugars_g-bar")).toBeTruthy();
});

test("en modo catálogo (sin referencia) muestra el valor sin '/ Y' y sin porcentaje", async () => {
  const rows = [fila({ key: "iron_mg", label: "Hierro", unit: "mg", value: 5.5 })];
  await render(<NutrientList sections={secciones({ grasas: rows })} />);
  expect(screen.getByTestId("nutr-iron_mg-amount")).toHaveTextContent(/^5\.5 mg$/);
  expect(screen.queryByTestId("nutr-iron_mg-pct")).toBeNull();
  expect(screen.queryByTestId("nutr-iron_mg-bar")).toBeNull();
});

test("un valor sin referencia igual se muestra aunque el grupo tenga otras filas con referencia", async () => {
  const rows = [
    fila({ key: "omega3_g", label: "Omega-3", unit: "g", value: 1.25 }),
    fila({ key: "cholesterol_mg", label: "Colesterol", unit: "mg", value: 120, ref: 300, pct: 40, kind: "max" }),
  ];
  await render(<NutrientList sections={secciones({ grasas: rows })} />);
  expect(screen.getByTestId("nutr-omega3_g-amount")).toHaveTextContent(/^1\.25 g$/);
  expect(screen.getByTestId("nutr-cholesterol_mg-amount")).toHaveTextContent(/^120 \/ 300 mg$/);
});

test("vitaminas y minerales arrancan colapsados; grasas y carbohidratos, abiertos", async () => {
  const vit = [fila({ key: "vitamin_c_mg", label: "Vitamina C", unit: "mg", value: 30, ref: 110, pct: 27, kind: "min" })];
  const gra = [fila({ key: "omega3_g", label: "Omega-3", unit: "g", value: 1 })];
  await render(<NutrientList sections={secciones({ grasas: gra, vitaminas: vit })} />);
  expect(screen.getByTestId("nutr-omega3_g-amount")).toBeTruthy();
  expect(screen.queryByTestId("nutr-vitamin_c_mg-amount")).toBeNull();
});

test("tocar el encabezado de un grupo colapsado despliega sus filas", async () => {
  const vit = [fila({ key: "vitamin_c_mg", label: "Vitamina C", unit: "mg", value: 30, ref: 110, pct: 27, kind: "min" })];
  await render(<NutrientList sections={secciones({ vitaminas: vit })} />);
  await fireEvent.press(screen.getByTestId("nutr-grupo-vitaminas"));
  expect(screen.getByTestId("nutr-vitamin_c_mg-amount")).toHaveTextContent(/^30 \/ 110 mg$/);
});

test("el encabezado dice cuántas filas del grupo tienen dato, para no tener que abrirlo", async () => {
  const vit = [
    fila({ key: "vitamin_c_mg", label: "Vitamina C", unit: "mg", value: 30 }),
    fila({ key: "vitamin_d_mcg", label: "Vitamina D", unit: "mcg" }),
    fila({ key: "vitamin_e_mg", label: "Vitamina E", unit: "mg" }),
  ];
  await render(<NutrientList sections={secciones({ vitaminas: vit })} />);
  expect(screen.getByTestId("nutr-grupo-vitaminas-conteo")).toHaveTextContent(/^1 de 3 con dato$/);
});

test("un grupo entero sin dato lo dice en el encabezado", async () => {
  const vit = [fila({ key: "vitamin_c_mg", label: "Vitamina C", unit: "mg" })];
  await render(<NutrientList sections={secciones({ vitaminas: vit })} />);
  expect(screen.getByTestId("nutr-grupo-vitaminas-conteo")).toHaveTextContent(/^sin datos$/);
});

test("un total PARCIAL se muestra con '≥': es un piso, no el número exacto", async () => {
  const rows = [fila({ key: "zinc_mg", label: "Zinc", unit: "mg", value: 0.8, ref: 11.7, pct: 7, kind: "min", partial: true })];
  await render(<NutrientList sections={secciones({ grasas: rows })} />);
  expect(screen.getByTestId("nutr-zinc_mg-amount")).toHaveTextContent(/^≥ 0\.8 \/ 11\.7 mg$/);
});

test("un total completo NO lleva la marca de parcial", async () => {
  const rows = [fila({ key: "zinc_mg", label: "Zinc", unit: "mg", value: 0.8, ref: 11.7, pct: 7, kind: "min" })];
  await render(<NutrientList sections={secciones({ grasas: rows })} />);
  expect(screen.getByTestId("nutr-zinc_mg-amount")).toHaveTextContent(/^0\.8 \/ 11\.7 mg$/);
});

test("una fila parcial SIN dato sigue diciendo 'sin dato' (no hay piso de nada)", async () => {
  const rows = [fila({ key: "zinc_mg", label: "Zinc", unit: "mg", partial: true })];
  await render(<NutrientList sections={secciones({ grasas: rows })} />);
  expect(screen.getByTestId("nutr-zinc_mg-amount")).toHaveTextContent(/^sin dato$/);
});

test("un total parcial sin referencia también se marca", async () => {
  const rows = [fila({ key: "omega3_g", label: "Omega-3", unit: "g", value: 1.2, partial: true })];
  await render(<NutrientList sections={secciones({ grasas: rows })} />);
  expect(screen.getByTestId("nutr-omega3_g-amount")).toHaveTextContent(/^≥ 1\.2 g$/);
});

test("con onPressRow, tocar una fila con dato avisa con su clave", async () => {
  const onPressRow = jest.fn();
  const rows = [fila({ key: "iron_mg", label: "Hierro", unit: "mg", value: 5, ref: 11, pct: 45, kind: "min" })];
  await render(<NutrientList sections={secciones({ grasas: rows })} onPressRow={onPressRow} />);
  await fireEvent.press(screen.getByTestId("nutr-iron_mg-row"));
  expect(onPressRow).toHaveBeenCalledWith("iron_mg");
});

test("una fila SIN dato no navega: no hay nada que desglosar", async () => {
  const onPressRow = jest.fn();
  const rows = [fila({ key: "iron_mg", label: "Hierro", unit: "mg" })];
  await render(<NutrientList sections={secciones({ grasas: rows })} onPressRow={onPressRow} />);
  await fireEvent.press(screen.getByTestId("nutr-iron_mg-row"));
  expect(onPressRow).not.toHaveBeenCalled();
});

test("sin onPressRow la fila se renderiza igual y tocarla no rompe", async () => {
  const rows = [fila({ key: "iron_mg", label: "Hierro", unit: "mg", value: 5, ref: 11, pct: 45, kind: "min" })];
  await render(<NutrientList sections={secciones({ grasas: rows })} />);
  await fireEvent.press(screen.getByTestId("nutr-iron_mg-row"));
  expect(screen.getByTestId("nutr-iron_mg-amount")).toBeTruthy();
});

test("el encabezado avisa si alguna fila del grupo se pasó de su límite, aunque esté colapsado", async () => {
  // Los minerales arrancan cerrados y ahí adentro vive la sal: sin este aviso, "te pasaste de
  // sal" —que hoy se ve de una— quedaría escondido detrás de un grupo que hay que abrir.
  const min = [fila({ key: "salt_g", label: "Sal", unit: "g", value: 9, ref: 5, pct: 180, kind: "max" })];
  await render(<NutrientList sections={secciones({ minerales: min })} />);
  expect(screen.queryByTestId("nutr-salt_g-amount")).toBeNull(); // sigue colapsado
  expect(screen.getByTestId("nutr-grupo-minerales-alerta")).toBeTruthy();
});

test("pasarse de un PISO no dispara la alerta del encabezado", async () => {
  const min = [fila({ key: "iron_mg", label: "Hierro", unit: "mg", value: 20, ref: 11, pct: 182, kind: "min" })];
  await render(<NutrientList sections={secciones({ minerales: min })} />);
  expect(screen.queryByTestId("nutr-grupo-minerales-alerta")).toBeNull();
});

test("sin excedentes no hay alerta en el encabezado", async () => {
  const min = [fila({ key: "salt_g", label: "Sal", unit: "g", value: 3, ref: 5, pct: 60, kind: "max" })];
  await render(<NutrientList sections={secciones({ minerales: min })} />);
  expect(screen.queryByTestId("nutr-grupo-minerales-alerta")).toBeNull();
});
