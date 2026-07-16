// Referencias públicas para micronutrientes. NO son metas personales calculadas a partir del
// perfil: son referencias de organismos públicos, y la UI las muestra como "ref", no como
// objetivo del usuario.
export const NUTRIENT_REFERENCES = {
  fiber_g: 30, // OMS/EFSA: ≥25–30 g/día
  salt_g: 5, // OMS: <5 g/día de sal
  sugars_g: 50, // OMS: azúcares libres <10% de la energía (~50 g en una dieta de 2000 kcal)
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

// Saturadas: la OMS las acota al 10% de la ENERGÍA, no a gramos fijos → depende de la meta de
// kcal, y por eso no vive en NUTRIENT_REFERENCES. 9 kcal por gramo de grasa; 1 decimal, como el
// resto de los micros (ver sumNullableMicro en macros.ts).
export function saturatedFatRefG(goalKcal: number): number {
  // Number.isFinite además de <= 0: NaN <= 0 es false, así que sin el guard un NaN se colaría
  // hasta la UI (la meta de kcal puede llegar de un parseo del móvil).
  if (!Number.isFinite(goalKcal) || goalKcal <= 0) return 0;
  return Math.round(((goalKcal * 0.1) / 9) * 10) / 10;
}
