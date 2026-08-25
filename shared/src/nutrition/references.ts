// Referencias públicas para micronutrientes. NO son metas personales calculadas a partir del
// perfil: son referencias de organismos públicos, y la UI las muestra como "ref", no como
// objetivo del usuario.
export const NUTRIENT_REFERENCES = {
  fiber_g: 30, // OMS/EFSA: ≥25–30 g/día
  salt_g: 5, // OMS: <5 g/día de sal
  sugars_g: 50, // OMS: azúcares LIBRES <10% de la energía (~50 g en 2000 kcal). El semáforo mide
  //             azúcar LIBRE (ver freeSugars.ts): la fruta/verdura ENTERA NO cuenta contra esto.
  cholesterol_mg: 300, // referencia clásica de 300 mg/día
} as const;

// Sentido de cada referencia: "max" = límite a no pasar (pasarse pinta ámbar);
// "min" = piso a alcanzar (pasarse es BUENO, nunca pinta ámbar). La fibra es el único piso.
export const NUTRIENT_REFERENCE_KIND = {
  fiber_g: "min",
  salt_g: "max",
  sugars_g: "max",
  saturated_fat_g: "max",
  cholesterol_mg: "max",
} as const;

// Saturadas: la AHA las acota al 6% de la ENERGÍA, no a gramos fijos → depende de la meta de
// kcal, y por eso no vive en NUTRIENT_REFERENCES. 9 kcal por gramo de grasa; 1 decimal, como el
// resto de los micros (ver sumNullableMicro en macros.ts).
export function saturatedFatRefG(goalKcal: number): number {
  return fatTypeRefG(FAT_TYPE_PERCENT_KCAL.saturated_fat_g.pct, goalKcal);
}

// Umbrales AHA (American Heart Association) por tipo de grasa, como % de la energía total.
// "max" = límite a no pasar (pasarse pinta el excedente en rojo); "recommended" = piso deseable,
// nunca pinta como excedido; "avoid" = evitar por completo, cualquier cantidad se marca (sin %
// fijo, por eso pct es null). omega3_g tampoco tiene % de kcal fijado por la AHA (se recomienda
// en gramos absolutos según contexto clínico), por eso su pct es null también, pero su kind es
// "recommended": la UI muestra la barra sin umbral y nunca la marca como excedida.
export const FAT_TYPE_PERCENT_KCAL = {
  saturated_fat_g: { pct: 0.06, kind: "max" }, // AHA: <6% de la energía (antes 10% OMS)
  trans_fat_g: { pct: null, kind: "avoid" }, // AHA: evitar / lo más bajo posible; sin % fijo
  omega6_g: { pct: 0.05, kind: "recommended" }, // AHA: piso ~5-10% de energía; modelado como piso 5%
  monounsaturated_fat_g: { pct: 0.15, kind: "recommended" },
  omega3_g: { pct: null, kind: "recommended" },
} as const;

// Deriva gramos desde un % de la energía total (9 kcal por gramo de grasa), a 1 decimal.
export function fatTypeRefG(pct: number, goalKcal: number): number {
  // Number.isFinite además de <= 0: NaN <= 0 es false, así que sin el guard un NaN se colaría
  // hasta la UI (la meta de kcal puede llegar de un parseo del móvil).
  if (!Number.isFinite(goalKcal) || goalKcal <= 0) return 0;
  return Math.round(((goalKcal * pct) / 9) * 10) / 10;
}
