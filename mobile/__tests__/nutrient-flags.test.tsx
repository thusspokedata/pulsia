import { render } from "@testing-library/react-native";
import { flagText, unknownLabel, NUTRIENT_LABELS } from "../src/nutrition/nutrientText";
import { FLAGGED_NUTRIENTS, foodFlags } from "@pulsia/shared";
import { NutrientFlags } from "../src/nutrition/NutrientFlags";

test("cada flag destacable tiene una frase, ninguna queda vacía", () => {
  // Un alimento que dispara bad en los cinco techos y good en la fibra
  const todoAlto = {
    basis: "per_100g" as const,
    fat_g: 99, saturated_fat_g: 99, sugars_g: 99,
    salt_g: 99, cholesterol_mg: 999, fiber_g: 99,
  };
  for (const f of foodFlags(todoAlto).notable) {
    expect(flagText(f.nutrient, f.sentiment)).toBeTruthy();
  }
  // Y lo mismo para el escalón intermedio
  const todoMedio = {
    basis: "per_100g" as const,
    fat_g: 10, saturated_fat_g: 3, sugars_g: 10,
    salt_g: 1, cholesterol_mg: 40, fiber_g: 0,
  };
  for (const f of foodFlags(todoMedio).notable) {
    expect(flagText(f.nutrient, f.sentiment)).toBeTruthy();
  }
});

test("las frases concuerdan en género y número", () => {
  expect(flagText("fat_g", "bad")).toBe("grasa alta");
  expect(flagText("saturated_fat_g", "bad")).toBe("saturadas altas");
  expect(flagText("sugars_g", "bad")).toBe("azúcar alto");
  expect(flagText("salt_g", "bad")).toBe("sal alta");
  expect(flagText("cholesterol_mg", "bad")).toBe("colesterol alto");
  expect(flagText("fiber_g", "good")).toBe("buena fibra");
});

test("el nivel va ESCRITO, no solo en el color", () => {
  // Un daltónico tiene que poder distinguir alto de medio sin ver el color
  for (const n of ["fat_g", "sugars_g", "salt_g", "cholesterol_mg"] as const) {
    expect(flagText(n, "bad")).not.toBe(flagText(n, "warn"));
  }
});

test("el aviso de faltantes nombra hasta dos y después resume", () => {
  expect(unknownLabel([])).toBeNull();
  expect(unknownLabel(["sugars_g"])).toBe("sin datos de azúcar");
  expect(unknownLabel(["sugars_g", "salt_g"])).toBe("sin datos de azúcar y sal");
  expect(unknownLabel(["sugars_g", "salt_g", "fiber_g"])).toBe("sin datos de 3 nutrientes");
});

test("hay etiqueta para los seis nutrientes", () => {
  for (const n of FLAGGED_NUTRIENTS) expect(NUTRIENT_LABELS[n]).toBeTruthy();
});

const quesoCrema = {
  basis: "per_100g" as const,
  fat_g: 34, saturated_fat_g: 20, sugars_g: 3.2,
  salt_g: 0.8, cholesterol_mg: 101, fiber_g: 0,
};

test("compact capa en 3 chips y avisa cuántos quedaron afuera", async () => {
  // NOTA sobre el plan: acá el plan trae `render(...)` sin await y destructura el resultado
  // directo. En este repo (RNTL v14 vía jest-expo) render() devuelve una Promise: sin el await,
  // getByText/queryByText salen undefined y la llamada explota con "is not a function". El resto
  // de los tests de la suite que ya existían en mobile/__tests__/ usan `await render(...)` +
  // `screen.*`, así que sigo esa misma convención acá.
  const { getByText, queryByText } = await render(<NutrientFlags food={quesoCrema} />);
  getByText("grasa alta");
  getByText("saturadas altas");
  getByText("colesterol alto");
  expect(queryByText("sal media")).toBeNull(); // el cuarto no entra
  getByText("+1");
});

test("un alimento sin dato de azúcar NO dice que es bajo ni lo pinta verde", async () => {
  const almendra = {
    basis: "per_100g" as const,
    fat_g: 50, saturated_fat_g: 3.8, sugars_g: null,
    salt_g: null, cholesterol_mg: 0, fiber_g: 12.5,
  };
  const { getByText, queryByText } = await render(<NutrientFlags food={almendra} />);
  // Ancla al INICIO: sin esto, /azúcar/ también matchea "sin datos de azúcar y sal" (la línea
  // de abajo), que sí tiene que estar. Lo que no puede existir es un chip propio de azúcar
  // ("azúcar alto"/"azúcar medio"/etc.), que siempre arranca con la palabra.
  expect(queryByText(/^azúcar/)).toBeNull();
  getByText("sin datos de azúcar y sal");
});

test("el aviso de faltantes NO compite por el cap de 3 chips", async () => {
  // tres alarmas + datos faltantes: el aviso tiene que sobrevivir igual
  const conTodo = { ...quesoCrema, sugars_g: null, salt_g: null };
  const { getByText } = await render(<NutrientFlags food={conTodo} />);
  getByText("grasa alta");
  getByText("saturadas altas");
  getByText("colesterol alto");
  getByText("sin datos de azúcar y sal");
});

test("un alimento sin nada destacable no renderiza chips", async () => {
  const lechuga = {
    basis: "per_100g" as const,
    fat_g: 0.2, saturated_fat_g: 0, sugars_g: 0.8,
    salt_g: 0.01, cholesterol_mg: 0, fiber_g: 1.3,
  };
  const { queryByTestId } = await render(<NutrientFlags food={lechuga} />);
  expect(queryByTestId("nutrient-flags")).toBeNull();
});

test("full muestra los seis nutrientes, con su etiqueta, su valor y el chip correcto en cada estado", async () => {
  // quesoCrema pasa por los cuatro sentiments que puede tener una fila en "full": bad (grasa,
  // saturadas, colesterol), warn (sal), y neutral (azúcar, fibra — bajo pero sin chip de texto
  // propio, cae al fallback "ok"). El quinto estado, unknown, lo cubre el test de abajo.
  const { getByText, getAllByText } = await render(<NutrientFlags food={quesoCrema} variant="full" />);
  for (const n of FLAGGED_NUTRIENTS) getByText(NUTRIENT_LABELS[n]);
  getByText("34 g"); // grasa
  getByText("20 g"); // saturadas
  getByText("3.2 g"); // azúcar
  getByText("0.8 g"); // sal
  getByText("101 mg"); // colesterol
  getByText("0 g"); // fibra
  getByText("grasa alta");
  getByText("saturadas altas");
  getByText("sal media");
  getByText("colesterol alto");
  // Los dos que quedaron "bajo" (azúcar 3.2 g, fibra 0 g) no tienen frase propia en FLAG_TEXT
  // (sentiment neutral): NutrientFlags.tsx cae al fallback "ok" para las dos. Sin este test, ese
  // fallback no lo ejercía ningún test de la suite.
  expect(getAllByText("ok").length).toBe(2);
});

test("full: el fallback de un valor sin dato es 'sin dato', tanto en el chip como en el número", async () => {
  const conFaltantes = {
    basis: "per_100g" as const,
    fat_g: 34, saturated_fat_g: null, sugars_g: 3.2,
    salt_g: 0.8, cholesterol_mg: null, fiber_g: 0,
  };
  const { getAllByText, getAllByTestId } = await render(<NutrientFlags food={conFaltantes} variant="full" />);
  // saturadas y colesterol están sin dato: dos filas, cada una con "sin dato" en el valor Y en
  // el chip (cuatro apariciones en total).
  expect(getAllByText("sin dato").length).toBe(4);
  expect(getAllByTestId("nutrient-chip-unknown").length).toBe(2);
});

test("full: un valor NaN se muestra como 'sin dato', nunca como 'NaN g'", async () => {
  // Alcanzable desde agregar-alimento.tsx cuando el campo de grasa está vacío en modo edición
  // (fat_g no es nullable en el schema, así que la pantalla manda NaN en vez de null). Este test
  // ejercita el componente directo, sin pasar por la pantalla, para blindar el fallback de
  // Number.isFinite en NutrientFlags.tsx aunque cambie quién produce el NaN.
  const conNaN = {
    basis: "per_100g" as const,
    fat_g: NaN, saturated_fat_g: 3.8, sugars_g: 4.4,
    salt_g: 0.001, cholesterol_mg: 0, fiber_g: 12.5,
  };
  const { getAllByText, queryByText } = await render(<NutrientFlags food={conNaN} variant="full" />);
  expect(queryByText(/NaN/)).toBeNull();
  // "sin dato" en el valor Y en el chip de esa fila.
  expect(getAllByText("sin dato").length).toBe(2);
});
