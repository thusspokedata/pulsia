import { NUTRIENT_KEYS, type NutrientKey } from "./nutrients";

export type ReferenceKind = "min" | "max";
export interface NutrientReference {
  value: number;
  kind: ReferenceKind;
}
export interface ReferencePerson {
  sex?: "male" | "female" | "other" | "prefer_not_to_say";
  age?: number;
}

// Valores de referencia poblacional de EFSA (Dietary Reference Values, PRI/AI). NO son metas
// personales calculadas del perfil: son referencias públicas, y la UI las muestra como "ref". Se
// personalizan por sexo y edad porque la referencia PÚBLICA misma depende de eso.
//
// FUENTE ÚNICA, transcrita a mano (nunca de memoria):
//   EFSA (2017). "Summary of Dietary Reference Values – version 4 (September 2017)".
//   "Overview on Dietary Reference Values for the EU population as derived by the EFSA Panel on
//   Dietetic Products, Nutrition and Allergies (NDA)".
//   PDF: https://www.efsa.europa.eu/sites/default/files/assets/DRV_Summary_tables_jan_17.pdf
//   Tablas usadas (adulto ≥18):
//     - Tabla 3:  fibra / grasas / agua (RI y AI)
//     - Tabla 5:  minerales PRI/AI — VARONES
//     - Tabla 7:  minerales PRI/AI — MUJERES
//     - Tabla 9:  vitaminas PRI/AI — VARONES
//     - Tabla 11: vitaminas PRI/AI — MUJERES
//   PRI = Population Reference Intake; AI = Adequate Intake. Ambas son "pisos" (kind "min").
//
// `other`/`prefer_not_to_say` caen al fallback igual que un perfil vacío: no hay referencia EFSA
// para esas categorías y elegir una del binario sería inventar. El fallback neutro es el valor más
// conservador: el MÁS ALTO para los pisos (así una mujer sin perfil no ve "ya llegaste" al hierro).

type Sex = "male" | "female";

interface EfsaEntry {
  kind: ReferenceKind;
  // Devuelve el valor EFSA en la MISMA unidad que la clave del registro, para un sexo binario y
  // (opcional) edad. `age` undefined => devolver el valor más conservador del tramo (el más alto,
  // porque todas nuestras entradas son pisos). Devuelve null si EFSA no lo cubre para ese sexo.
  valueFor: (sex: Sex, age?: number) => number | null;
}

const flat = (v: number): EfsaEntry["valueFor"] => () => v;

// Solo se listan los nutrientes que EFSA cubre con un valor numérico transcribible en la unidad
// del registro. El resto del registro queda en `null` explícito (ver comentarios al final).
const EFSA: Partial<Record<NutrientKey, EfsaEntry>> = {
  // ---------------- Vitaminas ----------------
  // Vitamina A — PRI, µg RE/d. Tabla 9 (M, ≥18)=750; Tabla 11 (F, ≥18)=650.
  // Unidad EFSA = µg RE, coincide con la clave (µg de vitamina A). (RE: 1 µg retinol = 1 µg RE.)
  vitamin_a_mcg: { kind: "min", valueFor: (sex) => (sex === "male" ? 750 : 650) },
  // Vitamina B2 (riboflavina) — PRI, mg/d. Tabla 9/11 (≥18) = 1.6 ambos sexos.
  vitamin_b2_mg: { kind: "min", valueFor: flat(1.6) },
  // Vitamina B5 (ác. pantoténico) — AI, mg/d. Tabla 9/11 (≥18) = 5 ambos sexos.
  vitamin_b5_mg: { kind: "min", valueFor: flat(5) },
  // Vitamina B6 — PRI, mg/d. Tabla 9 (M)=1.7; Tabla 11 (F)=1.6.
  vitamin_b6_mg: { kind: "min", valueFor: (sex) => (sex === "male" ? 1.7 : 1.6) },
  // Vitamina B7 (biotina) — AI, µg/d. Tabla 9/11 (≥18) = 40 ambos sexos.
  vitamin_b7_mcg: { kind: "min", valueFor: flat(40) },
  // Vitamina B9 (folato) — PRI, µg DFE/d. Tabla 9/11 (≥18) = 330 ambos sexos.
  // El registro usa `vitamin_b9_mcg` y el dataset USDA (Task 8) tomó "Folate, total" en µg. En
  // alimentos sin fortificar con ácido fólico, µg DFE ≈ µg folato total (la conversión DFE solo
  // difiere por el ácido fólico añadido: DFE = folato_alimento + 1.7·ácido_fólico). Se usa 330 µg
  // como referencia en µg totales; correspondencia anotada.
  vitamin_b9_mcg: { kind: "min", valueFor: flat(330) },
  // Vitamina B12 (cobalamina) — AI, µg/d. Tabla 9/11 (≥18) = 4.0 ambos sexos.
  vitamin_b12_mcg: { kind: "min", valueFor: flat(4.0) },
  // Vitamina C — PRI, mg/d. Tabla 9 (M)=110; Tabla 11 (F)=95.
  vitamin_c_mg: { kind: "min", valueFor: (sex) => (sex === "male" ? 110 : 95) },
  // Vitamina D — AI, µg/d. Tabla 9/11 (≥18) = 15 ambos sexos.
  // EFSA: bajo síntesis cutánea mínima asumida; con exposición solar el requerimiento es menor.
  vitamin_d_mcg: { kind: "min", valueFor: flat(15) },
  // Vitamina E (α-tocoferol) — AI, mg/d. Tabla 9 (M)=13; Tabla 11 (F)=11.
  // Unidad EFSA = mg α-tocoferol, coincide con la clave.
  vitamin_e_mg: { kind: "min", valueFor: (sex) => (sex === "male" ? 13 : 11) },
  // Vitamina K — AI, µg/d. Tabla 9/11 (≥18) = 70 ambos sexos (basado solo en filoquinona).
  vitamin_k_mcg: { kind: "min", valueFor: flat(70) },
  // Colina — AI, mg/d. Tabla 9/11 (≥18) = 400 ambos sexos.
  choline_mg: { kind: "min", valueFor: flat(400) },

  // ---------------- Minerales ----------------
  // Calcio — PRI, mg/d. Tabla 5/7: 18–24 años = 1000; ≥25 años = 950 (ambos sexos).
  // Edad undefined => 1000 (el más alto = conservador para un piso).
  calcium_mg: {
    kind: "min",
    valueFor: (_sex, age) => (age == null ? 1000 : age >= 25 ? 950 : 1000),
  },
  // Hierro — PRI, mg/d. Tabla 5 (M, ≥18)=11. Tabla 7 (F, ≥18): premenopáusica=16,
  // postmenopáusica=11. EFSA no fija una edad de menopausia; se usa el corte convencional 51 años
  // (mujer <51 => premenopáusica=16; ≥51 => postmenopáusica=11). Edad undefined => 16 (conservador).
  // El PRI de 16 cubre ~95 % de las mujeres premenopáusicas (nota (d) de la Tabla 7).
  iron_mg: {
    kind: "min",
    valueFor: (sex, age) => {
      if (sex === "male") return 11;
      if (age == null) return 16;
      return age >= 51 ? 11 : 16;
    },
  },
  // Magnesio — AI, mg/d. Tabla 5 (M, ≥18)=350; Tabla 7 (F, ≥18)=300.
  magnesium_mg: { kind: "min", valueFor: (sex) => (sex === "male" ? 350 : 300) },
  // Yodo — AI, µg/d. Tabla 5/7 (≥18) = 150 ambos sexos.
  iodine_mcg: { kind: "min", valueFor: flat(150) },
  // Fósforo — AI, mg/d. Tabla 5/7 (≥18) = 550 ambos sexos.
  phosphorus_mg: { kind: "min", valueFor: flat(550) },
  // Potasio — AI, mg/d. Tabla 5/7 (≥18) = 3500 ambos sexos.
  potassium_mg: { kind: "min", valueFor: flat(3500) },
  // Selenio — AI, µg/d. Tabla 5/7 (≥18) = 70 ambos sexos.
  selenium_mcg: { kind: "min", valueFor: flat(70) },
  // Zinc — PRI, mg/d. Depende de la ingesta de fitatos (LPI). Tabla 5 (M, ≥18) y 7 (F, ≥18):
  //   fitatos 300/600/900/1200 mg/d => M 9.4/11.7/14.0/16.3 ; F 7.5/9.3/11.0/12.7.
  // DECISIÓN: se fija el nivel de fitatos en 600 mg/d (dieta mixta moderada) => M 11.7 ; F 9.3.
  // El registro no lleva el fitato, así que hay que elegir un punto; se documenta la elección y
  // el rango completo (ver "Concern zinc" en el reporte).
  zinc_mg: { kind: "min", valueFor: (sex) => (sex === "male" ? 11.7 : 9.3) },

  // ---------------- Agua ----------------
  // Agua — AI de agua TOTAL (bebidas + humedad de los alimentos), Tabla 3 (≥18): M 2.5 L/d,
  // F 2.0 L/d => 2500 / 2000 ml. Es agua total, no solo la bebida; anotado por si la UI mide otra
  // cosa.
  water_ml: { kind: "min", valueFor: (sex) => (sex === "male" ? 2500 : 2000) },
};

// Nutrientes del registro dejados en `null` explícito (EFSA no da un valor transcribible en la
// unidad de la clave, o ya están cubiertos por references.ts para no mostrar dos referencias):
//   - saturated_fat_g : EFSA = "ALAP" (as low as possible), sin número. Cubierto por
//                       saturatedFatRefG() en references.ts (10 % de la energía).
//   - omega3_g        : EFSA da ALA como % de energía (0.5 E%) y EPA+DHA 250 mg/d; no hay un único
//                       gramaje de omega-3 total. → null.
//   - omega6_g        : EFSA da LA (linoleico) como % de energía (4 E%); sin gramaje fijo. → null.
//   - cholesterol_mg  : EFSA no fija PRI (no se ingiere para "alcanzar" nada). Cubierto en
//                       references.ts como techo (300 mg). → null aquí.
//   - sugars_g        : EFSA no pudo fijar un umbral numérico. Cubierto en references.ts. → null.
//   - fiber_g         : EFSA AI = 25 g/d (Tabla 3), PERO references.ts ya lo cubre con 30 g. Para
//                       no mostrar DOS referencias distintas del mismo nutriente, se deja null y
//                       manda references.ts. → null.
//   - vitamin_b1_mg   : EFSA PRI = 0.1 mg/MJ (proporcional a la energía), no un absoluto. Sin la
//                       meta de kcal no se puede dar un valor honesto. → null.
//   - vitamin_b3_mg   : EFSA AI = 1.6 mg NE/MJ (proporcional a la energía). Mismo motivo. → null.
//   - sodium_mg       : el summary v4 marca la evaluación de sodio como "ongoing" (no hay valor).
//                       Además la sal ya se trata como techo en references.ts (OMS <5 g sal ≈
//                       <2000 mg sodio); dar un piso EFSA acá contradiría ese techo. → null.

function pickValue(entry: EfsaEntry, person: ReferencePerson): number | null {
  if (person.sex === "male" || person.sex === "female") {
    return entry.valueFor(person.sex, person.age);
  }
  // Sexo desconocido (undefined, "other", "prefer_not_to_say"): fallback conservador = combinar
  // ambos sexos y quedarse con el valor más exigente (el más alto para un piso, el más bajo para
  // un techo).
  const male = entry.valueFor("male", person.age);
  const female = entry.valueFor("female", person.age);
  if (male == null) return female;
  if (female == null) return male;
  return entry.kind === "min" ? Math.max(male, female) : Math.min(male, female);
}

export function referenceFor(key: NutrientKey, person: ReferencePerson): NutrientReference | null {
  const entry = EFSA[key];
  if (!entry) return null;
  const value = pickValue(entry, person);
  return value == null ? null : { value, kind: entry.kind };
}

export function referencesFor(person: ReferencePerson): Record<NutrientKey, NutrientReference | null> {
  const out = {} as Record<NutrientKey, NutrientReference | null>;
  for (const k of NUTRIENT_KEYS) out[k] = referenceFor(k, person);
  return out;
}
