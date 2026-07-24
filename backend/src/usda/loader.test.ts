import { expect, test } from "bun:test";
import { NUTRIENT_KEYS } from "@pulsia/shared";
import { nutrientColumn } from "../nutrition/columns";
import { shouldLoad, filaAColumnas, elegirArtefacto, type FilaArtefacto } from "./loader";

// --------------------------------------------------------------------------------------------
// shouldLoad
// --------------------------------------------------------------------------------------------

test("carga si no hay dataset", () => {
  expect(shouldLoad(null, "2026-07")).toBe(true);
});

test("NO carga si la version coincide", () => {
  expect(shouldLoad({ version: "2026-07", rowCount: 16000 }, "2026-07")).toBe(false);
});

test("carga si la version cambio", () => {
  expect(shouldLoad({ version: "2025-01", rowCount: 16000 }, "2026-07")).toBe(true);
});

test("recarga si la version coincide pero la tabla quedo vacia", () => {
  expect(shouldLoad({ version: "2026-07", rowCount: 0 }, "2026-07")).toBe(true);
});

// --------------------------------------------------------------------------------------------
// filaAColumnas — el riesgo real de esta tarea: cargar 13.694 filas con todos los nutrientes en
// null porque el mapeo snake_case -> camelCase no se aplicó. El log diría "cargadas 13694 filas"
// y el dataset sería inútil. Este test verifica que CADA clave del registro llega a su columna,
// con el valor correcto (no sólo "definido").
// --------------------------------------------------------------------------------------------

test("cada nutriente del registro se traduce a su columna camelCase, con el valor correcto", () => {
  const fila: FilaArtefacto = { fdc_id: 1, description: "Alimento de prueba", data_type: "foundation" };
  // Un valor distinto (y distinguible) por clave: si el mapeo mezclara dos columnas, este test lo
  // vería como un valor equivocado en la columna, no sólo como "no está".
  NUTRIENT_KEYS.forEach((key, i) => {
    fila[key] = i + 1;
  });

  const columnas = filaAColumnas(fila) as unknown as Record<string, unknown>;

  for (const [i, key] of NUTRIENT_KEYS.entries()) {
    const columna = nutrientColumn(key);
    expect(columnas[columna], `${key} -> ${columna}`).toBe(i + 1);
  }
});

test("filaAColumnas traduce fdc_id/description/data_type y los 4 macros", () => {
  const fila: FilaArtefacto = {
    fdc_id: 170893,
    description: "Egg, whole, raw, fresh",
    data_type: "sr_legacy",
    kcal: 138,
    protein_g: 12.56,
    carbs_g: 0.72,
    fat_g: 9.51,
  };

  const columnas = filaAColumnas(fila);

  expect(columnas.fdcId).toBe(170893);
  expect(columnas.description).toBe("Egg, whole, raw, fresh");
  expect(columnas.dataType).toBe("sr_legacy");
  expect(columnas.kcal).toBe(138);
  expect(columnas.proteinG).toBe(12.56);
  expect(columnas.carbsG).toBe(0.72);
  expect(columnas.fatG).toBe(9.51);
});

test("filaAColumnas escribe null (no undefined) para lo que la fila no trae", () => {
  const fila: FilaArtefacto = { fdc_id: 2, description: "Sin nutrientes", data_type: "survey" };

  const columnas = filaAColumnas(fila) as unknown as Record<string, unknown>;

  expect(columnas.kcal).toBeNull();
  for (const key of NUTRIENT_KEYS) {
    expect(columnas[nutrientColumn(key)], key).toBeNull();
  }
});

// --------------------------------------------------------------------------------------------
// elegirArtefacto — parte pura de la búsqueda del `.json.gz` en backend/data.
//
// El caso que importa es el de DOS artefactos (agregar una versión nueva sin borrar la vieja):
// con un `.find()` se cargaría el que el filesystem devuelva primero y `usda_dataset` quedaría
// con esa versión, en silencio y sin ser reproducible entre máquinas. Preferimos no cargar nada
// y gritarlo: sin dataset el alta de alimentos degrada al camino sin USDA (spec §7), y eso se
// nota; cargar la versión equivocada, no.
// --------------------------------------------------------------------------------------------

test("con un solo artefacto, lo elige", () => {
  expect(elegirArtefacto(["usda-2026-07.json.gz"])).toEqual({ tipo: "ok", nombre: "usda-2026-07.json.gz" });
});

test("con dos artefactos NO elige ninguno: ambiguo, con los nombres para el log", () => {
  const r = elegirArtefacto(["usda-2026-07.json.gz", "usda-2025-01.json.gz"]);
  expect(r).toEqual({ tipo: "ambiguo", nombres: ["usda-2025-01.json.gz", "usda-2026-07.json.gz"] });
});

test("el listado de ambiguos NO depende del orden que devuelva el filesystem", () => {
  const a = elegirArtefacto(["usda-2026-07.json.gz", "usda-2025-01.json.gz"]);
  const b = elegirArtefacto(["usda-2025-01.json.gz", "usda-2026-07.json.gz"]);
  expect(a).toEqual(b);
});

test("sin artefactos, ninguno", () => {
  expect(elegirArtefacto([])).toEqual({ tipo: "ninguno" });
});

test("los archivos que no matchean el patron se ignoran", () => {
  const entradas = [
    "README.md",
    "usda-2026-07.json", // sin .gz: es el intermedio del build, no el artefacto
    "otro-2026-07.json.gz", // no empieza con usda-
    "usda-2026-07.json.gz",
    ".DS_Store",
  ];
  expect(elegirArtefacto(entradas)).toEqual({ tipo: "ok", nombre: "usda-2026-07.json.gz" });
});

test("solo archivos que no matchean = ninguno (no confundir con ambiguo)", () => {
  expect(elegirArtefacto(["README.md", "usda-2026-07.json"])).toEqual({ tipo: "ninguno" });
});
