import {
  nutrientsByGroup,
  referencesFor,
  type NutrientKey,
  type NutrientGroup,
  type NutrientReference,
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
        ref,
        pct: value == null || ref == null ? null : porcentaje(value, ref),
        kind: referencia?.kind ?? null,
        partial: opciones?.partial?.[key] ?? false,
      };
    }),
  }));
}
