import {
  NUTRIENT_KEYS,
  NUTRIENT_REFERENCE_KIND,
  nutrientsByGroup,
  referencesFor,
  saltGFromSodiumMg,
  type NutrientKey,
  type NutrientGroup,
  type NutrientReference,
  type NutrientSum,
  type ReferenceKind,
  type ReferencePerson,
} from "@pulsia/shared";

// La clave de una fila es la del registro MÁS `salt_g`: la sal no es un nutriente que se
// persista (se guarda sodio), pero es la unidad que el usuario lee, y la pestaña del día
// sustituye la fila de sodio por la de sal (ver dayNutrientRows.ts). Tiparlo como unión y no
// como `string` mantiene los testID y la navegación verificables por el compilador.
export type NutrientRowKey = NutrientKey | "salt_g";

export interface NutrientRow {
  key: NutrientRowKey;
  label: string;
  unit: string;
  value: number | null; // null = SIN DATO (distinto de 0)
  // Aporte del mismo nutriente que viene de suplementos (no de comida). null = esta superficie no
  // trackea suplementos (detalle de comida, alimento del catálogo); 0 = trackea pero no hay toma.
  supplement: number | null;
  ref: number | null; // null = EFSA no lo cubre, o modo "por 100 g"
  pct: number | null; // null si no hay valor o no hay referencia
  kind: ReferenceKind | null;
  // true = algunos de los ítems que suman este total NO declaraban el nutriente. El total es un
  // piso, no el número exacto. Solo tiene sentido en un total de varios ítems (el día); en un
  // alimento suelto siempre es false.
  partial: boolean;
}

export interface NutrientRowsOptions {
  /**
   * Referencias que MANDAN sobre las de EFSA, por clave. Que la clave ESTÉ presente ya es el
   * override, aunque valga `null`: `null` significa "esta fila no tiene referencia que mostrar"
   * (saturadas sin meta de kcal), no "usá la de EFSA".
   *
   * Existe porque 5 nutrientes (azúcares, fibra, saturadas, colesterol y sodio/sal) se comparan
   * contra la OMS y están en `null` en la tabla EFSA justamente para no mostrar dos referencias
   * distintas del mismo nutriente. Si mañana EFSA sumara un valor para alguno, la precedencia
   * explícita evita que la fila cambie de referencia sola.
   */
  refs?: Partial<Record<NutrientKey, NutrientReference | null>>;
  /** Nutrientes cuyo total viene de una suma con agujeros. */
  partial?: Partial<Record<NutrientKey, boolean>>;
  /** Aporte de suplementos por nutriente, del mismo día/rango que `values`. */
  supplement?: Partial<Record<NutrientKey, number>>;
}

/**
 * Parte los totales (`NutrientSum`) en los dos mapas que pide `buildNutrientRows`.
 *
 * Existe para que ninguna pantalla vuelva a quedarse con el `.value` y tirar el `partial`: eso es
 * exactamente lo que hacía el detalle de comida, y por eso una comida con un ítem cargado a mano
 * se mostraba como total exacto ahí y como piso ("≥") en la pestaña del día. Mismo dato, dos
 * lecturas distintas.
 */
export function separarValoresYParciales(sumas: Record<NutrientKey, NutrientSum>): {
  values: Partial<Record<NutrientKey, number | null>>;
  partial: Partial<Record<NutrientKey, boolean>>;
} {
  const values: Partial<Record<NutrientKey, number | null>> = {};
  const partial: Partial<Record<NutrientKey, boolean>> = {};
  for (const key of NUTRIENT_KEYS) {
    values[key] = sumas[key].value;
    partial[key] = sumas[key].partial;
  }
  return { values, partial };
}

export interface NutrientSection {
  group: NutrientGroup;
  label: string;
  rows: NutrientRow[];
}

// Encabezados de las secciones. Vive acá y no en el registro de `@pulsia/shared` porque es texto
// de esta UI: el backend agrupa por `group` pero nunca lo escribe en pantalla. Al estar tipado
// como `Record<NutrientGroup, string>`, agregar un grupo al registro rompe la compilación acá en
// vez de mostrar un encabezado vacío.
const GROUP_LABELS: Record<NutrientGroup, string> = {
  grasas: "Grasas",
  carbohidratos: "Carbohidratos",
  vitaminas: "Vitaminas",
  minerales: "Minerales",
};

// El perfil llega con `sex` como string libre (viene de la API). Solo las categorías que EFSA
// distingue se pasan tal cual; cualquier otra cosa se manda como desconocida para que
// `referencesFor` aplique su fallback conservador, en vez de asumir la tabla masculina.
const SEXOS: readonly string[] = ["male", "female", "other", "prefer_not_to_say"];

function aPersona(persona: { sex?: string; age?: number }): ReferencePerson {
  const sex = persona.sex != null && SEXOS.includes(persona.sex) ? (persona.sex as ReferencePerson["sex"]) : undefined;
  return { sex, age: persona.age };
}

/**
 * Porcentaje de la referencia, entero.
 *
 * Un aporte real pero minúsculo (0,17 %) NO baja a 0: redondearlo lo volvería indistinguible de
 * un cero medido, que es justo la distinción que este módulo existe para sostener. Es el mismo
 * criterio que ya usa `barSegments` para no perder un segmento por redondeo.
 */
export function porcentaje(value: number, ref: number): number {
  const bruto = (value / ref) * 100;
  if (bruto > 0 && bruto < 1) return 1;
  return Math.round(bruto);
}

/**
 * Arma las filas agrupadas para `NutrientList`.
 *
 * `values` puede traer un nutriente ausente o en `null`: las dos cosas son "no sabemos". Un 0
 * explícito es un dato y se conserva.
 *
 * `persona` en null = modo catálogo (valores por 100 g, sin comparar contra nada).
 *
 * Las cuatro secciones se devuelven SIEMPRE, aunque ninguna fila tenga dato: un alimento cargado
 * a mano tiene los 23 micros en null, y omitir las secciones haría parecer que la app no sigue
 * vitaminas ni minerales. "Sin dato" también es información.
 */
export function buildNutrientRows(
  values: Partial<Record<NutrientKey, number | null>>,
  persona: { sex?: string; age?: number } | null,
  opciones?: NutrientRowsOptions,
): NutrientSection[] {
  const porGrupo = nutrientsByGroup();
  const refs = persona == null ? null : referencesFor(aPersona(persona));
  const overrides = opciones?.refs;

  return (Object.keys(porGrupo) as NutrientGroup[]).map((group) => ({
    group,
    label: GROUP_LABELS[group],
    rows: porGrupo[group].map((def) => {
      const key = def.key as NutrientKey;
      const crudo = values[key];
      const value = crudo == null || !Number.isFinite(crudo) ? null : crudo;
      // `hasOwnProperty` y no `?? refs[key]`: un override en `null` tiene que BORRAR la
      // referencia de EFSA, no dejarla pasar. Con `??` las saturadas sin meta de kcal
      // heredarían silenciosamente cualquier valor que EFSA sumara mañana.
      const hayOverride = overrides != null && Object.prototype.hasOwnProperty.call(overrides, key);
      const referencia = hayOverride ? overrides![key] ?? null : refs?.[key] ?? null;
      const ref = referencia?.value ?? null;
      return {
        key,
        label: def.label,
        unit: def.unit,
        value,
        supplement: opciones?.supplement?.[key] ?? null,
        ref,
        pct: value == null || ref == null ? null : porcentaje(value, ref),
        kind: referencia?.kind ?? null,
        partial: opciones?.partial?.[key] ?? false,
      };
    }),
  }));
}

/**
 * Fila de SAL derivada del sodio. Está pensada para SUSTITUIR a la de sodio, no para sumarse:
 * 1600 mg de sodio y 4 g de sal son el MISMO hecho en dos unidades.
 *
 * DECISIÓN (unificada en las TRES superficies: día, comida y alimento del catálogo): la app habla
 * de sal en todas partes — el campo del alta pide "Sal (g)", el semáforo del catálogo evalúa sal
 * por 100 g, el ranking y la curva de evolución son de sal — y es la única de las dos unidades con
 * una referencia pública que mostrar (OMS, 5 g/día; EFSA marca el sodio como "ongoing", sin valor).
 * Se persiste sodio porque es lo que entrega USDA, pero eso es un detalle del almacenamiento.
 *
 * `ref` en null = superficie sin referencia (los valores por 100 g del catálogo): ni la OMS ni
 * EFSA hablan de 100 g de comida, hablan de un día.
 */
export function filaDeSal(
  sodiumMg: number | null,
  ref: number | null,
  partial = false,
  supplementSaltG: number | null = null,
): NutrientRow {
  const value = saltGFromSodiumMg(sodiumMg);
  return {
    key: "salt_g",
    label: "Sal",
    unit: "g",
    value,
    supplement: supplementSaltG,
    ref,
    pct: value == null || ref == null ? null : porcentaje(value, ref),
    // Sin referencia no hay techo que exceder: el `kind` solo se lee para pintar el aviso y la
    // barra, y las dos exigen `ref`.
    kind: ref == null ? null : NUTRIENT_REFERENCE_KIND.salt_g,
    partial,
  };
}

/**
 * Cambia la fila de sodio por la de sal EN SU LUGAR, para que siga en Minerales y el conteo
 * "N de M con dato" del grupo no cambie.
 *
 * Va acá y no dentro de `buildNutrientRows` porque la sal no existe en el registro de nutrientes:
 * es un derivado de la UI, y `buildNutrientRows` recorre el registro.
 */
export function sustituirSodioPorSal(secciones: NutrientSection[], sal: NutrientRow): NutrientSection[] {
  return secciones.map((s) => ({
    ...s,
    rows: s.rows.map((r) => (r.key === "sodium_mg" ? sal : r)),
  }));
}
