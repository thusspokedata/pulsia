import { test, expect } from "bun:test";
import {
  nutrientLevel,
  nutrientSentiment,
  nutrientValue,
  foodFlags,
  FLAGGED_NUTRIENTS,
  type FoodFlagsInput,
} from "./nutrientLevel";

test("FSA sólidos: los bordes exactos caen del lado documentado", () => {
  // bajo usa <=, alto usa > → 5,0 es bajo y 22,5 es medio, no alto
  expect(nutrientLevel("sugars_g", 5.0, "per_100g")).toBe("low");
  expect(nutrientLevel("sugars_g", 5.01, "per_100g")).toBe("medium");
  expect(nutrientLevel("sugars_g", 22.5, "per_100g")).toBe("medium");
  expect(nutrientLevel("sugars_g", 22.6, "per_100g")).toBe("high");

  expect(nutrientLevel("fat_g", 3.0, "per_100g")).toBe("low");
  expect(nutrientLevel("fat_g", 17.5, "per_100g")).toBe("medium");
  expect(nutrientLevel("fat_g", 17.6, "per_100g")).toBe("high");

  expect(nutrientLevel("saturated_fat_g", 1.5, "per_100g")).toBe("low");
  expect(nutrientLevel("saturated_fat_g", 5.1, "per_100g")).toBe("high");

  expect(nutrientLevel("salt_g", 0.3, "per_100g")).toBe("low");
  expect(nutrientLevel("salt_g", 1.6, "per_100g")).toBe("high");
});

test("bebidas usan la escala reducida: el MISMO número da otro nivel", () => {
  // 15 g de azúcar por 100: medio en un sólido, alto en una bebida
  // (10 daría "medium" en ambos: 10 está entre 2,5 y 11,25 también para bebidas, así que no
  // demuestra el cambio de escala; el umbral alto de bebida es 11,25, no 10)
  expect(nutrientLevel("sugars_g", 15, "per_100g")).toBe("medium");
  expect(nutrientLevel("sugars_g", 15, "per_100ml")).toBe("high");
  expect(nutrientLevel("sugars_g", 11.3, "per_100ml")).toBe("high");
  expect(nutrientLevel("sugars_g", 2.5, "per_100ml")).toBe("low");

  expect(nutrientLevel("fat_g", 8.8, "per_100ml")).toBe("high");
  expect(nutrientLevel("fat_g", 8.8, "per_100g")).toBe("medium");
  expect(nutrientLevel("salt_g", 0.8, "per_100ml")).toBe("high");
  expect(nutrientLevel("salt_g", 0.8, "per_100g")).toBe("medium");

  // FSA_DRINK.saturated_fat_g no tenía ningún test: un umbral mal tipeado ahí podía pasar
  // desapercibido para siempre.
  expect(nutrientLevel("saturated_fat_g", 0.75, "per_100ml")).toBe("low");
  expect(nutrientLevel("saturated_fat_g", 2.5, "per_100ml")).toBe("medium");
  expect(nutrientLevel("saturated_fat_g", 2.55, "per_100ml")).toBe("high");
});

test("los umbrales altos son estrictos (>): el valor exacto del borde todavía es medio", () => {
  // Sin esto, mover el número del umbral por error (22,5 → 22,55, digamos) no rompía nada:
  // los tests de "alto" usaban valores lejos del borde y los de "medio" nunca tocaban el
  // número exacto del umbral.
  expect(nutrientLevel("sugars_g", 11.25, "per_100ml")).toBe("medium");
  expect(nutrientLevel("fat_g", 8.75, "per_100ml")).toBe("medium");
  expect(nutrientLevel("salt_g", 0.75, "per_100ml")).toBe("medium");
  expect(nutrientLevel("saturated_fat_g", 5.0, "per_100g")).toBe("medium");

  // El "medio en el borde" de arriba solo agarra el umbral corrido hacia ABAJO: si el número
  // se corre hacia ARRIBA (11,25 → 11,26), 11,25 sigue dando "medium" con cualquiera de los
  // dos, así que hace falta además un valor justo por encima del borde real dando "high".
  expect(nutrientLevel("sugars_g", 11.26, "per_100ml")).toBe("high");
  expect(nutrientLevel("fat_g", 8.76, "per_100ml")).toBe("high");
  expect(nutrientLevel("salt_g", 0.76, "per_100ml")).toBe("high");
  expect(nutrientLevel("saturated_fat_g", 5.01, "per_100g")).toBe("high");
});

test("colesterol (FDA): el umbral alto es INCLUSIVO, al revés que el FSA", () => {
  expect(nutrientLevel("cholesterol_mg", 20, "per_100g")).toBe("low");
  expect(nutrientLevel("cholesterol_mg", 21, "per_100g")).toBe("medium");
  expect(nutrientLevel("cholesterol_mg", 60, "per_100g")).toBe("high");
  expect(nutrientLevel("cholesterol_mg", 59.9, "per_100g")).toBe("medium");
});

test("colesterol y fibra NO cambian con el basis (la FDA no tiene escala de bebidas)", () => {
  expect(nutrientLevel("cholesterol_mg", 60, "per_100ml")).toBe("high");
  expect(nutrientLevel("fiber_g", 5.6, "per_100ml")).toBe("high");
});

test("fibra: el bajo usa < porque acá pasarse es lo bueno", () => {
  expect(nutrientLevel("fiber_g", 2.79, "per_100g")).toBe("low");
  expect(nutrientLevel("fiber_g", 2.8, "per_100g")).toBe("medium");
  expect(nutrientLevel("fiber_g", 5.6, "per_100g")).toBe("high");
  // El alto de fibra es INCLUSIVO (al revés que el resto): justo antes del borde todavía es
  // medio. Pin necesario porque 5.6 solo (arriba) no distingue un umbral corrido hacia abajo.
  expect(nutrientLevel("fiber_g", 5.55, "per_100g")).toBe("medium");
});

test("sin dato → unknown, JAMÁS low", () => {
  for (const n of FLAGGED_NUTRIENTS) {
    expect(nutrientLevel(n, null, "per_100g")).toBe("unknown");
    expect(nutrientLevel(n, undefined, "per_100g")).toBe("unknown");
  }
});

test("un número basura no se cuela como nivel real", () => {
  expect(nutrientLevel("sugars_g", NaN, "per_100g")).toBe("unknown");
  expect(nutrientLevel("sugars_g", Infinity, "per_100g")).toBe("unknown");
});

test("la fibra va al REVÉS que el resto: mucha es buena", () => {
  expect(nutrientSentiment("fiber_g", "high")).toBe("good");
  expect(nutrientSentiment("fiber_g", "medium")).toBe("neutral");
  expect(nutrientSentiment("fiber_g", "low")).toBe("neutral");
  // el mismo nivel, en un nutriente techo, es lo contrario
  expect(nutrientSentiment("sugars_g", "high")).toBe("bad");
  expect(nutrientSentiment("sugars_g", "medium")).toBe("warn");
  expect(nutrientSentiment("sugars_g", "low")).toBe("neutral");
});

test("unknown se propaga como sentiment propio, no como neutral", () => {
  expect(nutrientSentiment("sugars_g", "unknown")).toBe("unknown");
  expect(nutrientSentiment("fiber_g", "unknown")).toBe("unknown");
});

const quesoCrema = {
  basis: "per_100g" as const,
  fat_g: 34, saturated_fat_g: 20, sugars_g: 3.2,
  salt_g: 0.8, cholesterol_mg: 101, fiber_g: 0,
};

test("foodFlags ordena por severidad y desempata por el orden de FLAGGED_NUTRIENTS", () => {
  const { notable } = foodFlags(quesoCrema);
  // grasa/saturadas/colesterol son bad; sal es warn; fibra 0 es neutral y no aparece
  expect(notable.map((f) => f.nutrient)).toEqual([
    "fat_g", "saturated_fat_g", "cholesterol_mg", "salt_g",
  ]);
  expect(notable.map((f) => f.sentiment)).toEqual(["bad", "bad", "bad", "warn"]);
});

test("foodFlags separa los sin-dato y NO los mete en notable", () => {
  const almendra = {
    basis: "per_100g" as const,
    fat_g: 50, saturated_fat_g: 3.8, sugars_g: null,
    salt_g: null, cholesterol_mg: 0, fiber_g: 12.5,
  };
  const { notable, unknown } = foodFlags(almendra);
  expect(unknown).toEqual(["sugars_g", "salt_g"]);
  expect(notable.some((f) => f.nutrient === "sugars_g")).toBe(false);
  expect(notable.some((f) => f.nutrient === "salt_g")).toBe(false);
  // la fibra alta sí es notable, y es lo único bueno
  expect(notable.find((f) => f.nutrient === "fiber_g")?.sentiment).toBe("good");
});

test("foodFlags.all trae siempre los seis, en orden fijo", () => {
  const { all } = foodFlags(quesoCrema);
  expect(all.map((f) => f.nutrient)).toEqual([...FLAGGED_NUTRIENTS]);
});

test("nutrientValue extrae el número o da null; un string o undefined nunca se cuelan como número", () => {
  // El schema no permite salt_g: string, pero un dato corrupto (JSON externo mal tipado)
  // puede llegar así en runtime — de ahí el cast en vez de un tipo real.
  const food = {
    basis: "per_100g" as const,
    fat_g: 34,
    saturated_fat_g: null,
    sugars_g: undefined,
    salt_g: "no-es-un-numero",
  } as unknown as FoodFlagsInput;
  expect(nutrientValue(food, "fat_g")).toBe(34);
  expect(nutrientValue(food, "saturated_fat_g")).toBeNull();
  expect(nutrientValue(food, "sugars_g")).toBeNull();
  expect(nutrientValue(food, "salt_g")).toBeNull();
});

test("un alimento sin nada destacable no genera ningún chip", () => {
  const lechuga = {
    basis: "per_100g" as const,
    fat_g: 0.2, saturated_fat_g: 0, sugars_g: 0.8,
    salt_g: 0.01, cholesterol_mg: 0, fiber_g: 1.3,
  };
  expect(foodFlags(lechuga).notable).toEqual([]);
  expect(foodFlags(lechuga).unknown).toEqual([]);
});
