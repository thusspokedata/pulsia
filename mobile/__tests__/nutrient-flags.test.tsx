import { flagText, unknownLabel, NUTRIENT_LABELS } from "../src/nutrition/nutrientText";
import { FLAGGED_NUTRIENTS, foodFlags } from "@pulsia/shared";

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

import { render } from "@testing-library/react-native";
import { NutrientFlags } from "../src/nutrition/NutrientFlags";

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

test("full muestra los seis con su valor, incluidos los que están bien", async () => {
  const { getByText } = await render(<NutrientFlags food={quesoCrema} variant="full" />);
  getByText("grasa");
  getByText("azúcar");
  getByText("fibra");
  getByText(/101/); // el valor del colesterol
});
