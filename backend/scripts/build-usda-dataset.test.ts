import { describe, expect, test } from "bun:test";
import {
  ACIDOS_OMEGA3,
  ACIDOS_OMEGA6,
  MAPEO_NUTRIENTES,
  agregarOmega,
  construirFila,
  detectarEspacioDeIds,
  elegirPorPreferencia,
  medirAcido,
  normalizarDataType,
  parsearCsv,
  parsearLineaCsv,
  redondear,
  verificarUnidades,
} from "./build-usda-dataset";

describe("parsearLineaCsv", () => {
  test("separa campos simples", () => {
    expect(parsearLineaCsv('"1087","Calcium","MG"')).toEqual(["1087", "Calcium", "MG"]);
  });

  // El caso que rompe un split(","): si la coma de adentro de las comillas cortara, la unidad
  // terminaría en la columna del nombre y todo el mapeo quedaría corrido una posición.
  test("respeta las comas que están adentro de comillas", () => {
    expect(parsearLineaCsv('"1087","Calcium, Ca","MG","301"')).toEqual([
      "1087",
      "Calcium, Ca",
      "MG",
      "301",
    ]);
    expect(parsearLineaCsv('"171287","sr_legacy_food","Egg, whole, raw, fresh","100"')).toEqual([
      "171287",
      "sr_legacy_food",
      "Egg, whole, raw, fresh",
      "100",
    ]);
  });

  test("desescapa las comillas duplicadas", () => {
    expect(parsearLineaCsv('"1","Cheese ""Brie"" style","G"')).toEqual([
      "1",
      'Cheese "Brie" style',
      "G",
    ]);
  });

  test("conserva los campos vacíos, incluido el último", () => {
    expect(parsearLineaCsv('"1","","3",""')).toEqual(["1", "", "3", ""]);
  });
});

describe("parsearCsv", () => {
  test("descarta el encabezado y las líneas vacías", () => {
    expect(parsearCsv('"id","name"\n"1","a"\n\n"2","b"\n')).toEqual([
      ["1", "a"],
      ["2", "b"],
    ]);
  });

  test("tolera finales de línea CRLF", () => {
    expect(parsearCsv('"id","name"\r\n"1","a"\r\n')).toEqual([["1", "a"]]);
  });
});

describe("normalizarDataType", () => {
  test("traduce los tres tipos que nos interesan", () => {
    expect(normalizarDataType("foundation_food")).toBe("foundation");
    expect(normalizarDataType("sr_legacy_food")).toBe("sr_legacy");
    expect(normalizarDataType("survey_fndds_food")).toBe("survey");
  });

  // El food.csv de Foundation trae 87.991 filas y sólo 469 son alimentos: el resto son muestras de
  // laboratorio y compras de mercado. Si estas colaran, el matcher las ofrecería como comida.
  test("descarta lo que no es un alimento consumible", () => {
    expect(normalizarDataType("sub_sample_food")).toBeNull();
    expect(normalizarDataType("market_acquisition")).toBeNull();
    expect(normalizarDataType("sample_food")).toBeNull();
    expect(normalizarDataType("agricultural_acquisition")).toBeNull();
    expect(normalizarDataType("branded_food")).toBeNull();
    expect(normalizarDataType("")).toBeNull();
  });
});

describe("elegirPorPreferencia", () => {
  test("toma el primero que exista, no el de mayor valor", () => {
    expect(elegirPorPreferencia(new Map([[2048, 50], [2047, 900]]), [1008, 2048, 2047])).toBe(50);
  });

  test("sigue bajando por la cadena cuando falta el preferido", () => {
    expect(elegirPorPreferencia(new Map([[2047, 90]]), [1008, 2048, 2047])).toBe(90);
  });

  test("devuelve undefined si no hay ninguno", () => {
    expect(elegirPorPreferencia(new Map([[999, 1]]), [1008, 2048])).toBeUndefined();
  });

  // 0 es un valor legítimo ("medimos y da cero"), no la ausencia de dato.
  test("un 0 corta la cadena igual que cualquier otro valor", () => {
    expect(elegirPorPreferencia(new Map([[1008, 0], [2047, 90]]), [1008, 2047])).toBe(0);
  });
});

describe("medirAcido", () => {
  test("prefiere el id específico sobre el indiferenciado", () => {
    expect(medirAcido(new Map([[1316, 1.531], [1269, 1.555]]), ACIDOS_OMEGA6[0]!)).toBe(1.531);
  });

  test("cae al indiferenciado si falta el específico", () => {
    expect(medirAcido(new Map([[1269, 1.555]]), ACIDOS_OMEGA6[0]!)).toBe(1.555);
  });

  test("le resta el GLA al 18:3 indiferenciado", () => {
    // 1270 (18:3 total) = 0.5, de los cuales 0.2 son GLA (n-6) -> quedan 0.3 de ALA (n-3).
    expect(medirAcido(new Map([[1270, 0.5], [1321, 0.2]]), ACIDOS_OMEGA3[0]!)).toBeCloseTo(0.3, 6);
  });

  test("no resta nada cuando se usa el id específico", () => {
    expect(medirAcido(new Map([[1404, 0.5], [1321, 0.2]]), ACIDOS_OMEGA3[0]!)).toBe(0.5);
  });

  test("la resta nunca devuelve un valor negativo", () => {
    expect(medirAcido(new Map([[1270, 0.1], [1321, 0.4]]), ACIDOS_OMEGA3[0]!)).toBe(0);
  });

  test("devuelve undefined si no hay ningún candidato", () => {
    expect(medirAcido(new Map([[1321, 0.2]]), ACIDOS_OMEGA3[0]!)).toBeUndefined();
  });
});

describe("agregarOmega", () => {
  // El bug que este diseño evita: 1269 y 1316 son EL MISMO ácido (18:2) a distinto nivel de
  // detalle. Sumarlos duplica el linoleico y da un número que igual parece razonable.
  test("no cuenta dos veces el 18:2 cuando vienen el específico y el indiferenciado", () => {
    const valores = new Map([[1269, 1.555], [1316, 1.531], [1271, 0.188], [1321, 0.012]]);
    // 1.531 (18:2 n-6) + 0.188 (20:4) + 0.012 (GLA) = 1.731, NO 3.286.
    expect(agregarOmega(valores, ACIDOS_OMEGA6)).toBeCloseTo(1.731, 6);
  });

  test("suma los ácidos distintos entre sí", () => {
    const valores = new Map([[1404, 0.036], [1278, 0], [1280, 0.007], [1272, 0.058]]);
    expect(agregarOmega(valores, ACIDOS_OMEGA3)).toBeCloseTo(0.101, 6);
  });

  test("devuelve undefined si no hay ningún ácido de la serie", () => {
    expect(agregarOmega(new Map([[1087, 56]]), ACIDOS_OMEGA3)).toBeUndefined();
  });

  // "No sabemos" y "es cero" no son lo mismo: sólo el segundo debe dar 0.
  test("distingue el cero medido de la ausencia de dato", () => {
    expect(agregarOmega(new Map([[1278, 0]]), ACIDOS_OMEGA3)).toBe(0);
  });
});

describe("redondear", () => {
  test("corta el ruido de coma flotante", () => {
    expect(redondear(0.1 + 0.2)).toBe(0.3);
  });

  test("conserva tres decimales", () => {
    expect(redondear(3.126)).toBe(3.126);
    expect(redondear(1.23456)).toBe(1.235);
  });
});

describe("detectarEspacioDeIds", () => {
  const ids = new Set([1087, 1089, 1008]);
  const nbrs = new Set([301, 303, 208]);

  test("reconoce el id moderno de FDC", () => {
    expect(detectarEspacioDeIds([1087, 1089, 1008], ids, nbrs)).toBe("id");
  });

  // Survey/FNDDS usa nutrient_nbr. Sin esta detección sus 5432 alimentos quedarían con TODOS los
  // micronutrientes en null, y el build igual terminaría bien y con un tamaño creíble.
  test("reconoce el nutrient_nbr viejo del SR", () => {
    expect(detectarEspacioDeIds([301, 303, 208], ids, nbrs)).toBe("nutrient_nbr");
  });

  test("ante la duda se queda con el id", () => {
    expect(detectarEspacioDeIds([], ids, nbrs)).toBe("id");
  });
});

describe("verificarUnidades", () => {
  // nutrient.csv de mentira, con la unidad correcta para cada id del mapeo.
  function nutrientesOk(): Map<number, { nombre: string; unidad: string }> {
    const m = new Map<number, { nombre: string; unidad: string }>();
    for (const [id, { clave, unidadUsda }] of Object.entries(MAPEO_NUTRIENTES)) {
      m.set(Number(id), { nombre: clave, unidad: unidadUsda });
    }
    return m;
  }

  test("no reporta nada cuando todo coincide", () => {
    expect(verificarUnidades(nutrientesOk())).toEqual([]);
  });

  // La red de seguridad principal: mg donde esperamos mcg es un valor 1000x mal que parece normal.
  test("detecta que USDA cambió la unidad de un nutriente", () => {
    const m = nutrientesOk();
    m.set(1103, { nombre: "Selenium, Se", unidad: "MG" }); // debería ser UG
    const problemas = verificarUnidades(m);
    expect(problemas.length).toBeGreaterThan(0);
    expect(problemas.join("\n")).toContain("1103");
  });

  test("detecta un id que ya no existe en nutrient.csv", () => {
    const m = nutrientesOk();
    m.delete(1089);
    expect(verificarUnidades(m).join("\n")).toContain("1089");
  });

  // La comparación contra la unidad que declara el mapeo tiene que valer por sí sola, sin apoyarse
  // en la que se deduce del registro: para una clave que el registro no conoce, es la única red.
  test("compara contra la unidad declarada en el mapeo aunque el registro no conozca la clave", () => {
    const m = new Map([[9999, { nombre: "Nutriente raro", unidad: "MG" }]]);
    const problemas = verificarUnidades(m, { 9999: { clave: "cosa_rara", unidadUsda: "G" } });
    expect(problemas.join("\n")).toContain("el mapeo dice unidad G pero USDA declara MG");
  });

  test("el mapeo real cubre todas las claves del registro salvo los omega derivados", () => {
    // Si alguien agrega un nutriente a NUTRIENTS y se olvida de mapearlo, esto lo caza.
    expect(verificarUnidades(nutrientesOk())).toEqual([]);
  });
});

describe("construirFila", () => {
  test("mapea los ids a las claves nuestras", () => {
    const fila = construirFila(1, "Test", "sr_legacy", new Map([[1089, 1.75], [1087, 56]]));
    expect(fila).toMatchObject({
      fdc_id: 1,
      description: "Test",
      data_type: "sr_legacy",
      iron_mg: 1.75,
      calcium_mg: 56,
    });
  });

  // Escribir null por cada nutriente ausente casi cuadruplica el JSON.
  test("omite las claves sin valor en vez de escribirlas en null", () => {
    const fila = construirFila(1, "Test", "sr_legacy", new Map([[1089, 1.75]]));
    expect("calcium_mg" in fila).toBe(false);
    expect("zinc_mg" in fila).toBe(false);
  });

  test("resuelve la energía por la cadena de respaldo", () => {
    const soloAtwater = construirFila(1, "T", "foundation", new Map([[2047, 90]]));
    expect(soloAtwater.kcal).toBe(90);
    const conEnergy = construirFila(1, "T", "foundation", new Map([[1008, 143], [2047, 90]]));
    expect(conEnergy.kcal).toBe(143);
  });

  test("acepta los dos nombres del azúcar total", () => {
    expect(construirFila(1, "T", "foundation", new Map([[1063, 5.05]])).sugars_g).toBe(5.05);
    expect(construirFila(1, "T", "sr_legacy", new Map([[2000, 0.37]])).sugars_g).toBe(0.37);
  });

  test("calcula los omega a partir de los ácidos grasos", () => {
    const fila = construirFila(
      171287,
      "Egg, whole, raw, fresh",
      "sr_legacy",
      new Map([
        [1404, 0.036],
        [1278, 0],
        [1280, 0.007],
        [1272, 0.058],
        [1269, 1.555],
        [1316, 1.531],
        [1271, 0.188],
        [1321, 0.012],
      ]),
    );
    expect(fila.omega3_g).toBeCloseTo(0.101, 6);
    expect(fila.omega6_g).toBeCloseTo(1.731, 6);
  });

  test("un alimento sin ningún nutriente sale con los tres campos de identidad y nada más", () => {
    expect(construirFila(7, "Vacío", "survey", new Map())).toEqual({
      fdc_id: 7,
      description: "Vacío",
      data_type: "survey",
    });
  });

  // El agua viene en gramos y la guardamos en ml: densidad 1 g/ml, se copia sin factor.
  test("copia el agua de gramos a mililitros sin factor", () => {
    expect(construirFila(1, "T", "sr_legacy", new Map([[1051, 76.15]])).water_ml).toBe(76.15);
  });
});
