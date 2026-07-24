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
