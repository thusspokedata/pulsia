#!/usr/bin/env bun
/*
 * Pulsia — compañero de salud y entrenamiento self-hosted.
 * Copyright (C) 2026 thusspokedata
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Construye el artefacto local de USDA FoodData Central.
//
// Lo corre UNA PERSONA A MANO, muy de vez en cuando (SR Legacy está congelado desde 2018). NO
// corre en el deploy ni en CI: el deploy consume el .json.gz ya versionado, así que un deploy no
// depende de que los servidores de USDA estén arriba.
//
//   bun run backend/scripts/build-usda-dataset.ts <carpeta-con-los-csv> <version>
//
// <carpeta-con-los-csv> es la carpeta donde se descomprimieron los ZIP de USDA. Se busca de forma
// recursiva, así que sirve tanto la carpeta de UN dataset como una carpeta madre con los tres
// adentro (que es el caso normal: los tres ZIP descomprimidos al lado).
//
// Los CSV crudos NO van al repo (son ~500 MB): se bajan a una carpeta temporal fuera del árbol de
// git. El artefacto resultante (~1-2 MB) SÍ se versiona. Los datos de USDA son obra del gobierno
// de EE.UU. y por lo tanto de dominio público, así que un repo público puede incluir el derivado.
//
// URLs de los datasets (verificadas 2026-07):
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { NUTRIENTS } from "@pulsia/shared";

// --------------------------------------------------------------------------------------------
// Tipos
// --------------------------------------------------------------------------------------------

export type DataTypeUsda = "foundation" | "sr_legacy" | "survey";

/** Una fila del artefacto. Claves en snake_case = las del registro de nutrientes + los 4 macros. */
export interface FilaUsda {
  fdc_id: number;
  description: string;
  data_type: DataTypeUsda;
  [nutriente: string]: number | string | undefined;
}

// --------------------------------------------------------------------------------------------
// CSV
// --------------------------------------------------------------------------------------------

/**
 * Parsea UNA línea de CSV de USDA. Hace falta un parser de verdad y no un `split(",")`: las
 * descripciones traen comas adentro de comillas ("Egg, whole, raw, fresh") y a veces comillas
 * escapadas duplicadas. Un split ingenuo corre todas las columnas de lugar y mete la unidad en la
 * columna del nombre — que es exactamente el tipo de error que después nadie ve.
 */
export function parsearLineaCsv(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (enComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"'; // comilla escapada ("")
          i++;
        } else {
          enComillas = false;
        }
      } else {
        actual += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ",") {
      campos.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

/** Corta un CSV completo en filas ya parseadas, sin el encabezado. Tolera CRLF y línea final vacía. */
export function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  for (const linea of texto.split("\n").slice(1)) {
    const limpia = linea.endsWith("\r") ? linea.slice(0, -1) : linea;
    if (limpia.trim() === "") continue;
    filas.push(parsearLineaCsv(limpia));
  }
  return filas;
}

// --------------------------------------------------------------------------------------------
// data_type
// --------------------------------------------------------------------------------------------

/**
 * Normaliza el `data_type` crudo de USDA al que guarda nuestra tabla.
 *
 * Devuelve null para todo lo que NO es un alimento consumible. Esto importa mucho más de lo que
 * parece: el food.csv de Foundation tiene 87.991 filas, pero sólo 469 son `foundation_food`. El
 * resto son muestras de laboratorio (`sub_sample_food`), compras de mercado (`market_acquisition`)
 * y muestras agrícolas. Sin este filtro el artefacto se llena de basura que después el matcher
 * ofrece como si fuera comida.
 */
export function normalizarDataType(crudo: string): DataTypeUsda | null {
  switch (crudo.trim()) {
    case "foundation_food":
      return "foundation";
    case "sr_legacy_food":
      return "sr_legacy";
    case "survey_fndds_food":
      return "survey";
    default:
      return null;
  }
}

// --------------------------------------------------------------------------------------------
// Mapeo de nutrientes
// --------------------------------------------------------------------------------------------

/**
 * `nutrient_id` de USDA -> clave nuestra, con la unidad que USDA declara para ese id.
 *
 * La unidad NO es decorativa: `verificarUnidades()` la contrasta contra el `nutrient.csv` real y
 * revienta si no coincide. Sin esa verificación, que USDA diera un nutriente en mg donde nuestra
 * clave dice `_mcg` metería un valor 1000x mal que se ve como un número perfectamente normal.
 *
 * Todos estos ids fueron verificados uno por uno contra el nutrient.csv de los tres datasets.
 */
export const MAPEO_NUTRIENTES: Record<number, { clave: string; unidadUsda: string }> = {
  // --- Macros ---
  1008: { clave: "kcal", unidadUsda: "KCAL" }, // Energy
  1003: { clave: "protein_g", unidadUsda: "G" }, // Protein
  1005: { clave: "carbs_g", unidadUsda: "G" }, // Carbohydrate, by difference
  1004: { clave: "fat_g", unidadUsda: "G" }, // Total lipid (fat)
  // --- Grasas ---
  1258: { clave: "saturated_fat_g", unidadUsda: "G" }, // Fatty acids, total saturated
  1253: { clave: "cholesterol_mg", unidadUsda: "MG" }, // Cholesterol
  // --- Carbohidratos ---
  2000: { clave: "sugars_g", unidadUsda: "G" }, // Total Sugars
  1079: { clave: "fiber_g", unidadUsda: "G" }, // Fiber, total dietary
  // Water viene en G y nuestra clave es `water_ml`. NO es un error de unidad: la densidad del agua
  // es 1 g/ml, así que 1 g = 1 ml exacto. Se copia tal cual, sin factor.
  1051: { clave: "water_ml", unidadUsda: "G" }, // Water
  // --- Vitaminas ---
  1106: { clave: "vitamin_a_mcg", unidadUsda: "UG" }, // Vitamin A, RAE
  1165: { clave: "vitamin_b1_mg", unidadUsda: "MG" }, // Thiamin
  1166: { clave: "vitamin_b2_mg", unidadUsda: "MG" }, // Riboflavin
  1167: { clave: "vitamin_b3_mg", unidadUsda: "MG" }, // Niacin
  1170: { clave: "vitamin_b5_mg", unidadUsda: "MG" }, // Pantothenic acid
  1175: { clave: "vitamin_b6_mg", unidadUsda: "MG" }, // Vitamin B-6
  1176: { clave: "vitamin_b7_mcg", unidadUsda: "UG" }, // Biotin
  1177: { clave: "vitamin_b9_mcg", unidadUsda: "UG" }, // Folate, total
  1178: { clave: "vitamin_b12_mcg", unidadUsda: "UG" }, // Vitamin B-12
  1162: { clave: "vitamin_c_mg", unidadUsda: "MG" }, // Vitamin C, total ascorbic acid
  1114: { clave: "vitamin_d_mcg", unidadUsda: "UG" }, // Vitamin D (D2 + D3)
  1109: { clave: "vitamin_e_mg", unidadUsda: "MG" }, // Vitamin E (alpha-tocopherol)
  1185: { clave: "vitamin_k_mcg", unidadUsda: "UG" }, // Vitamin K (phylloquinone)
  1180: { clave: "choline_mg", unidadUsda: "MG" }, // Choline, total
  // --- Minerales ---
  1087: { clave: "calcium_mg", unidadUsda: "MG" }, // Calcium, Ca
  1089: { clave: "iron_mg", unidadUsda: "MG" }, // Iron, Fe
  1090: { clave: "magnesium_mg", unidadUsda: "MG" }, // Magnesium, Mg
  1100: { clave: "iodine_mcg", unidadUsda: "UG" }, // Iodine, I
  1091: { clave: "phosphorus_mg", unidadUsda: "MG" }, // Phosphorus, P
  1092: { clave: "potassium_mg", unidadUsda: "MG" }, // Potassium, K
  1103: { clave: "selenium_mcg", unidadUsda: "UG" }, // Selenium, Se
  1093: { clave: "sodium_mg", unidadUsda: "MG" }, // Sodium, Na
  1095: { clave: "zinc_mg", unidadUsda: "MG" }, // Zinc, Zn
};

/**
 * Cadenas de respaldo: mismo nutriente medido con otro método o con otro nombre según la época
 * del dataset. Se toma el PRIMERO que exista, nunca se suman (son el mismo nutriente).
 *
 * Hacen falta porque la cobertura varía muchísimo entre datasets. En Foundation sólo 135 de 469
 * alimentos traen `Energy` (1008), pero 347 traen Atwater General y 312 Atwater Specific: sin la
 * cadena, dos tercios de Foundation quedarían sin calorías.
 */
export const CADENAS_RESPALDO: Record<string, number[]> = {
  // Energía: preferimos el `Energy` clásico; después Atwater específico (factores propios del
  // alimento, más preciso) y recién al final Atwater general. NO usamos 1062 (Energy en kJ):
  // su cobertura es idéntica a la de 1008, así que convertir de kJ no agregaría ni un alimento.
  kcal: [1008, 2048, 2047],
  // "Total Sugars" (2000) y "Sugars, Total" (1063) son el mismo nutriente con distinto nombre
  // según la cosecha del dataset. SR Legacy usa 2000; Foundation trae mayormente 1063.
  sugars_g: [2000, 1063],
  // Carbohidratos por diferencia; por sumatoria como respaldo (Foundation trae 47 así).
  carbs_g: [1005, 1050],
};

/**
 * Los omega NO son un nutriente de USDA: son la suma de ácidos grasos individuales.
 *
 * Cada elemento del array es UN ácido graso, expresado como cadena de preferencia. Se elige un
 * solo valor por ácido y después se suman los ácidos entre sí. Esta distinción es la que evita el
 * bug: en SR Legacy hay 1840 alimentos que traen A LA VEZ 1269 ("PUFA 18:2", indiferenciado) y
 * 1316 ("PUFA 18:2 n-6 c,c", el mismo ácido pero especificado). Sumar los dos contaría el ácido
 * linoleico DOS VECES y duplicaría el omega-6 de un tercio del dataset, con un número que sigue
 * pareciendo plausible.
 */
/** Un candidato para medir un ácido: el id, y opcionalmente ids a restarle. */
export interface CandidatoAcido {
  id: number;
  /** Ids a restar cuando `id` es un total que mezcla series (ver el caso del 18:3). */
  menos?: number[];
}

export const ACIDOS_OMEGA3: CandidatoAcido[][] = [
  // Ácido alfa-linolénico 18:3 n-3.
  //
  // Preferimos el específico (1404). Como respaldo usamos el indiferenciado 1270 ("PUFA 18:3")
  // RESTÁNDOLE el GLA (1321), que es la única otra serie que cae dentro del 18:3 y es n-6. El
  // respaldo no es opcional: en SR Legacy hay 4977 alimentos con 1270 y sin 1404, y 3770 de ellos
  // tienen 18:3 real. Sin el respaldo esos alimentos no quedaban en null sino en CERO (porque sí
  // traen EPA/DHA/DPA en 0), o sea afirmábamos "no tiene omega-3" de una espinaca que tiene 0.138 g.
  // La resta está validada contra los 1963 alimentos que traen los tres ids: 1270 - (1404 + 1321)
  // da |diferencia| < 0.005 g en el 93.6% de los casos, con mediana exactamente 0.
  [{ id: 1404 }, { id: 1270, menos: [1321] }],
  [{ id: 1278 }], // EPA 20:5 n-3
  [{ id: 1280 }], // DPA 22:5 n-3
  [{ id: 1272 }], // DHA 22:6 n-3
  [{ id: 1407 }], // 20:4 n-3
];

export const ACIDOS_OMEGA6: CandidatoAcido[][] = [
  // Ácido linoleico 18:2 n-6: preferimos el específico; el indiferenciado "PUFA 18:2" sirve de
  // respaldo porque en la práctica es casi todo n-6 (los isómeros trans y los CLA de ese mismo
  // 18:2 vienen desglosados aparte, en 1306-1311).
  [{ id: 1316 }, { id: 1269 }],
  // Ácido araquidónico 20:4 n-6, con el "PUFA 20:4" indiferenciado como respaldo por el mismo
  // motivo. Ojo: 1408 es el araquidónico de verdad; 1271 es el 20:4 sin diferenciar.
  [{ id: 1408 }, { id: 1271 }],
  [{ id: 1321 }], // GLA 18:3 n-6
];

// --------------------------------------------------------------------------------------------
// Verificación de unidades
// --------------------------------------------------------------------------------------------

/** Unidad de USDA que le corresponde a cada unidad nuestra. */
const UNIDAD_ESPERADA: Record<string, string> = {
  g: "G",
  mg: "MG",
  mcg: "UG",
  ml: "G", // sólo el agua; 1 g = 1 ml
};

/**
 * Contrasta el mapeo contra el `nutrient.csv` real y devuelve la lista de problemas.
 *
 * Es la red de seguridad central de todo este script. Un `nutrient_id` mal puesto carga selenio en
 * la columna del zinc y ningún test lo nota, porque los dos son números plausibles. Acá se compara
 * la unidad declarada por USDA contra la que exige nuestra clave, y si no coinciden el build
 * FALLA en vez de escribir un valor 1000x corrido.
 */
export function verificarUnidades(
  nutrientesUsda: Map<number, { nombre: string; unidad: string }>,
  mapeo: Record<number, { clave: string; unidadUsda: string }> = MAPEO_NUTRIENTES,
): string[] {
  const problemas: string[] = [];
  const unidadPorClave = new Map(NUTRIENTS.map((n) => [n.key as string, n.unit as string]));
  // Los macros no están en el registro de micronutrientes; su unidad va a mano.
  const unidadMacro: Record<string, string> = {
    kcal: "KCAL",
    protein_g: "G",
    carbs_g: "G",
    fat_g: "G",
  };

  for (const [id, { clave, unidadUsda }] of Object.entries(mapeo).map(
    ([k, v]) => [Number(k), v] as const,
  )) {
    const real = nutrientesUsda.get(id);
    if (!real) {
      problemas.push(`id ${id} (${clave}): no existe en nutrient.csv`);
      continue;
    }
    if (real.unidad !== unidadUsda) {
      problemas.push(
        `id ${id} (${clave}): el mapeo dice unidad ${unidadUsda} pero USDA declara ${real.unidad} ("${real.nombre}")`,
      );
    }
    const esperada = unidadMacro[clave] ?? UNIDAD_ESPERADA[unidadPorClave.get(clave) ?? ""];
    if (esperada && real.unidad !== esperada) {
      problemas.push(
        `id ${id} (${clave}): nuestra clave exige ${esperada} pero USDA da ${real.unidad} ("${real.nombre}")`,
      );
    }
  }

  // Que no falte ningún nutriente del registro: agregar uno a NUTRIENTS y olvidarse de mapearlo
  // acá lo dejaría en null para siempre, en silencio.
  const mapeadas = new Set(Object.values(mapeo).map((m) => m.clave));
  for (const n of NUTRIENTS) {
    const derivado = n.key === "omega3_g" || n.key === "omega6_g"; // se calculan por suma
    if (!derivado && !mapeadas.has(n.key)) {
      problemas.push(`la clave ${n.key} del registro no tiene ningún nutrient_id mapeado`);
    }
  }
  return problemas;
}

// --------------------------------------------------------------------------------------------
// Armado de una fila
// --------------------------------------------------------------------------------------------

/** Primer id de la cadena que tenga valor. Nunca suma: los ids de una cadena son el mismo nutriente. */
export function elegirPorPreferencia(
  valores: Map<number, number>,
  cadena: number[],
): number | undefined {
  for (const id of cadena) {
    const v = valores.get(id);
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * Valor de UN ácido graso: primer candidato presente, restándole lo que declare `menos`. Nunca
 * baja de 0 (la resta es una estimación y el ruido de medición podría dar negativo).
 */
export function medirAcido(
  valores: Map<number, number>,
  candidatos: CandidatoAcido[],
): number | undefined {
  for (const c of candidatos) {
    const v = valores.get(c.id);
    if (v === undefined) continue;
    let resultado = v;
    for (const idMenos of c.menos ?? []) resultado -= valores.get(idMenos) ?? 0;
    return Math.max(resultado, 0);
  }
  return undefined;
}

/**
 * Suma de ácidos grasos, eligiendo un solo valor por ácido. Devuelve undefined si no hay ni uno
 * (que es "no sabemos", distinto de 0).
 */
export function agregarOmega(
  valores: Map<number, number>,
  acidos: CandidatoAcido[][],
): number | undefined {
  let total = 0;
  let hayAlguno = false;
  for (const candidatos of acidos) {
    const v = medirAcido(valores, candidatos);
    if (v !== undefined) {
      total += v;
      hayAlguno = true;
    }
  }
  return hayAlguno ? total : undefined;
}

/** Redondeo para que el JSON no arrastre ruido de coma flotante (0.30000000000000004). */
export function redondear(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Arma la fila final del artefacto. Las claves sin valor se OMITEN en vez de escribirse como null:
 * en el JSON eso es la diferencia entre 2 MB y 8 MB, y `undefined` y `null` significan lo mismo
 * acá ("no sabemos").
 */
export function construirFila(
  fdcId: number,
  description: string,
  dataType: DataTypeUsda,
  valores: Map<number, number>,
): FilaUsda {
  const fila: FilaUsda = { fdc_id: fdcId, description, data_type: dataType };

  for (const [idTexto, { clave }] of Object.entries(MAPEO_NUTRIENTES)) {
    if (CADENAS_RESPALDO[clave]) continue; // lo resuelve la cadena, más abajo
    const v = valores.get(Number(idTexto));
    if (v !== undefined) fila[clave] = redondear(v);
  }
  for (const [clave, cadena] of Object.entries(CADENAS_RESPALDO)) {
    const v = elegirPorPreferencia(valores, cadena);
    if (v !== undefined) fila[clave] = redondear(v);
  }
  const o3 = agregarOmega(valores, ACIDOS_OMEGA3);
  if (o3 !== undefined) fila.omega3_g = redondear(o3);
  const o6 = agregarOmega(valores, ACIDOS_OMEGA6);
  if (o6 !== undefined) fila.omega6_g = redondear(o6);

  return fila;
}

// --------------------------------------------------------------------------------------------
// Espacio de ids
// --------------------------------------------------------------------------------------------

/**
 * Decide si la columna `nutrient_id` de un food_nutrient.csv trae el id moderno de FDC (1087) o el
 * `nutrient_nbr` viejo del SR (301).
 *
 * NO es paranoia: el dataset Survey/FNDDS usa `nutrient_nbr`, mientras SR Legacy y Foundation usan
 * el id. Aplicarles a los tres el mismo mapeo dejaría los 5432 alimentos de Survey con TODOS los
 * micronutrientes en null, sin un solo error — el artefacto se generaría igual y con buen tamaño.
 */
export function detectarEspacioDeIds(
  muestra: number[],
  ids: Set<number>,
  nbrs: Set<number>,
): "id" | "nutrient_nbr" {
  let aciertosId = 0;
  let aciertosNbr = 0;
  for (const v of muestra) {
    if (ids.has(v)) aciertosId++;
    if (nbrs.has(v)) aciertosNbr++;
  }
  return aciertosNbr > aciertosId ? "nutrient_nbr" : "id";
}

// --------------------------------------------------------------------------------------------
// Lectura de un dataset
// --------------------------------------------------------------------------------------------

interface Dataset {
  carpeta: string;
  nutrientes: Map<number, { nombre: string; unidad: string }>;
  filas: FilaUsda[];
}

async function leerDataset(carpeta: string): Promise<Dataset> {
  // nutrient.csv: id, name, unit_name, nutrient_nbr, rank
  const nutrientes = new Map<number, { nombre: string; unidad: string }>();
  const nbrAId = new Map<number, number>();
  for (const c of parsearCsv(await Bun.file(join(carpeta, "nutrient.csv")).text())) {
    const id = Number(c[0]);
    if (!Number.isFinite(id)) continue;
    nutrientes.set(id, { nombre: c[1] ?? "", unidad: c[2] ?? "" });
    const nbr = Number(c[3]);
    if (Number.isFinite(nbr) && c[3] !== "") nbrAId.set(nbr, id);
  }

  // food.csv: fdc_id, data_type, description, ...
  const alimentos = new Map<number, { description: string; dataType: DataTypeUsda }>();
  for (const c of parsearCsv(await Bun.file(join(carpeta, "food.csv")).text())) {
    const fdcId = Number(c[0]);
    if (!Number.isFinite(fdcId)) continue;
    const dataType = normalizarDataType(c[1] ?? "");
    if (!dataType) continue; // muestras de laboratorio, compras de mercado, etc.
    alimentos.set(fdcId, { description: c[2] ?? "", dataType });
  }

  // food_nutrient.csv: id, fdc_id, nutrient_id, amount, ...
  const textoFn = await Bun.file(join(carpeta, "food_nutrient.csv")).text();
  const filasFn = parsearCsv(textoFn);
  const espacio = detectarEspacioDeIds(
    filasFn.slice(0, 5000).map((c) => Number(c[2])),
    new Set(nutrientes.keys()),
    new Set(nbrAId.keys()),
  );

  const porAlimento = new Map<number, Map<number, number>>();
  for (const c of filasFn) {
    const fdcId = Number(c[1]);
    if (!alimentos.has(fdcId)) continue;
    let nid = Number(c[2]);
    if (espacio === "nutrient_nbr") {
      const traducido = nbrAId.get(nid);
      if (traducido === undefined) continue;
      nid = traducido;
    }
    const monto = Number(c[3]);
    if (!Number.isFinite(monto)) continue;
    let m = porAlimento.get(fdcId);
    if (!m) {
      m = new Map();
      porAlimento.set(fdcId, m);
    }
    m.set(nid, monto);
  }

  const filas: FilaUsda[] = [];
  for (const [fdcId, { description, dataType }] of alimentos) {
    filas.push(construirFila(fdcId, description, dataType, porAlimento.get(fdcId) ?? new Map()));
  }

  console.log(`  ${carpeta}: ${filas.length} alimentos (espacio de ids: ${espacio})`);
  return { carpeta, nutrientes, filas };
}

/** Busca recursivamente carpetas que tengan los tres CSV que necesitamos. */
async function buscarDatasets(raiz: string): Promise<string[]> {
  const encontradas: string[] = [];
  async function recorrer(dir: string) {
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const nombres = new Set(entradas.filter((e) => e.isFile()).map((e) => e.name));
    if (nombres.has("food.csv") && nombres.has("food_nutrient.csv") && nombres.has("nutrient.csv")) {
      encontradas.push(dir);
    }
    for (const e of entradas) if (e.isDirectory()) await recorrer(join(dir, e.name));
  }
  await recorrer(raiz);
  return encontradas.sort();
}

// --------------------------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------------------------

async function main() {
  const [carpeta, version] = process.argv.slice(2);
  if (!carpeta || !version) {
    console.error("uso: bun run backend/scripts/build-usda-dataset.ts <carpeta-con-los-csv> <version>");
    process.exit(1);
  }

  const carpetas = await buscarDatasets(carpeta);
  if (carpetas.length === 0) {
    console.error(`no encontré ningún dataset (food.csv + food_nutrient.csv + nutrient.csv) bajo ${carpeta}`);
    process.exit(1);
  }
  console.log(`datasets encontrados: ${carpetas.length}`);

  const datasets: Dataset[] = [];
  for (const c of carpetas) datasets.push(await leerDataset(c));

  // La verificación de unidades corre contra el nutrient.csv de CADA dataset: si una cosecha de
  // USDA cambiara la unidad de un nutriente, queremos enterarnos acá y no en la app.
  for (const d of datasets) {
    const problemas = verificarUnidades(d.nutrientes);
    if (problemas.length > 0) {
      console.error(`\nPROBLEMAS DE MAPEO en ${d.carpeta}:`);
      for (const p of problemas) console.error(`  - ${p}`);
      console.error("\nabortado: no se escribe nada con el mapeo roto.");
      process.exit(1);
    }
  }
  console.log("verificación de unidades: OK en los tres datasets");

  // Sin deduplicar a propósito. Un mismo alimento puede estar en más de un dataset, y eso NO es un
  // problema: el matcher prefiere foundation > sr_legacy > survey, así que tener las tres versiones
  // le da de dónde elegir. Deduplicar por descripción además borraría variantes legítimas
  // ("Egg, whole, raw, fresh" vs "Egg, whole, cooked").
  const filas = datasets.flatMap((d) => d.filas);
  filas.sort((a, b) => a.fdc_id - b.fdc_id);

  const porTipo = new Map<string, number>();
  for (const f of filas) porTipo.set(f.data_type, (porTipo.get(f.data_type) ?? 0) + 1);

  const artefacto = { version, rows: filas };
  const gz = gzipSync(Buffer.from(JSON.stringify(artefacto)), { level: 9 });
  const salida = join(import.meta.dir, "..", "data", `usda-${version}.json.gz`);
  await Bun.write(salida, gz);

  console.log(`\nescrito ${salida}`);
  console.log(`filas: ${filas.length}`);
  for (const [t, n] of [...porTipo].sort()) console.log(`  ${t}: ${n}`);
  console.log(`tamaño: ${(gz.length / 1024 / 1024).toFixed(2)} MB`);
}

if (import.meta.main) await main();
