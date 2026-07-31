import { NUTRIENTS, type NutrientKey, type NutrientValues } from "./nutrients";
import { referenceFor, type ReferencePerson } from "./references.efsa";
import { NUTRIENT_REFERENCES, NUTRIENT_REFERENCE_KIND } from "./references";

// Fracción de la referencia que ya cuenta como "alcanzado": 90% (banda de tolerancia del 10%),
// para que un 98% por ruido no caiga en rojo. Ver spec §4.
export const COVERAGE_TOLERANCE = 0.9;

// Aporte diario por nutriente, indexado por día (YYYY-MM-DD LOCAL — el caller bucketiza con su
// propia función de fecha, para no meter zonas horarias en shared). `null` = "no sabemos" ese día
// (ningún ítem declaró el nutriente); NO es 0. Un 0 declarado sí es un número.
export type PerDayNutrients = Record<string, NutrientValues>;

export type CoverageState = "food" | "supplement" | "uncovered" | "few_data";

export interface NutrientCoverage {
  key: NutrientKey;
  foodAvg: number | null; // promedio sobre los días CON dato de comida para este nutriente
  suppAvg: number; // promedio sobre los días registrados (un día sin toma = 0 real)
  ref: number; // referencia personalizada (piso)
  state: CoverageState;
  daysWithData: number; // días con dato de comida para este nutriente
}

export interface CoverageResult {
  byNutrient: NutrientCoverage[];
  counts: { food: number; supplement: number; uncovered: number; fewData: number };
  onlyFoodPct: number | null; // food / (food+supplement+uncovered); null si no hay clasificables
  daysRegistered: number; // días con cualquier registro (comida o suplemento)
}

// Piso contra el cual medir "cubrir". EFSA `min` para vitaminas/minerales (personalizado por
// sexo/edad); fibra desde references.ts (EFSA la deja null a propósito). Techos → null (no aplica).
export function coverageReference(key: NutrientKey, person: ReferencePerson): number | null {
  const efsa = referenceFor(key, person);
  if (efsa && efsa.kind === "min") return efsa.value;
  const flat = (NUTRIENT_REFERENCES as Partial<Record<string, number>>)[key];
  const kind = (NUTRIENT_REFERENCE_KIND as Partial<Record<string, "min" | "max">>)[key];
  if (flat != null && kind === "min") return flat;
  return null;
}

export function coveragePeriod(
  perDayFood: PerDayNutrients,
  perDaySupp: PerDayNutrients,
  person: ReferencePerson,
  opts: { minDataDays: number },
): CoverageResult {
  const foodDays = Object.keys(perDayFood);
  const suppDays = Object.keys(perDaySupp);
  // Un día cuenta como "registrado" si hay COMIDA (una comida cargada ya es un registro) o un
  // aporte REAL de suplemento. El endpoint range-nutrients-daily devuelve una entrada por cada día
  // del rango, incluso los días SIN toma (`totals` vacío): esos placeholders NO son registros y no
  // deben inflar `daysRegistered` (ni el denominador de `suppAvg`). Se cuentan solo los días de
  // suplemento con al menos un valor real.
  const suppDaysReal = suppDays.filter((d) => Object.values(perDaySupp[d]).some((v) => v != null));
  const daysRegistered = new Set([...foodDays, ...suppDaysReal]).size;

  const byNutrient: NutrientCoverage[] = [];
  const counts = { food: 0, supplement: 0, uncovered: 0, fewData: 0 };

  for (const def of NUTRIENTS) {
    const key = def.key as NutrientKey;
    const ref = coverageReference(key, person);
    if (ref == null) continue; // techo o sin piso para este perfil → no se clasifica

    let foodSum = 0;
    let daysWithData = 0;
    for (const d of foodDays) {
      const v = perDayFood[d][key];
      if (v == null) continue;
      foodSum += v;
      daysWithData++;
    }
    const foodAvg = daysWithData > 0 ? foodSum / daysWithData : null;

    let suppSum = 0;
    let suppDaysWithData = 0;
    for (const d of suppDays) {
      const v = perDaySupp[d][key];
      if (v == null) continue;
      suppSum += v;
      suppDaysWithData++;
    }
    // Nutriente nunca declarado por ninguna fuente en ningún día: no hay evidencia para
    // clasificarlo (ni siquiera como "few_data", que implica al menos un dato parcial). Se omite
    // de byNutrient/counts en vez de inflar few_data con todo el catálogo EFSA no tocado.
    if (daysWithData === 0 && suppDaysWithData === 0) continue;

    const suppAvg = daysRegistered > 0 ? suppSum / daysRegistered : 0;

    const effFood = foodAvg ?? 0;
    const threshold = COVERAGE_TOLERANCE * ref;
    let state: CoverageState;
    if (effFood >= threshold) state = "food";
    else if (effFood + suppAvg >= threshold) state = "supplement";
    // El gate es por los días CON dato de COMIDA (`daysWithData`), NO por los del suplemento: es
    // deliberado (spec §4.1). Si la comida no declara el nutriente (foodAvg null), su aporte es
    // DESCONOCIDO, así que no podemos afirmar "sin cubrir" aunque haya mucho suplemento por debajo
    // del piso — sería confundir falta de dato con falta de ingesta. El estado honesto es
    // "few_data", y persiste hasta que haya dato de comida (o el suplemento solo cruce el piso).
    else if (daysWithData < opts.minDataDays) state = "few_data";
    else state = "uncovered";

    if (state === "food") counts.food++;
    else if (state === "supplement") counts.supplement++;
    else if (state === "uncovered") counts.uncovered++;
    else counts.fewData++;

    byNutrient.push({ key, foodAvg, suppAvg, ref, state, daysWithData });
  }

  const classifiable = counts.food + counts.supplement + counts.uncovered;
  const onlyFoodPct = classifiable > 0 ? Math.round((counts.food / classifiable) * 100) : null;
  return { byNutrient, counts, onlyFoodPct, daysRegistered };
}
