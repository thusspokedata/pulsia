// Nutrientes que NO se persisten: se calculan de otros. Guardarlos como columna sería duplicar
// un dato que puede quedar inconsistente.

const round1 = (n: number) => Math.round(n * 10) / 10;

// Piso en 0: con datos reales la fibra puede superar a los carbos totales (verduras de hoja),
// y "-3 g de carbos netos" no significa nada.
export function netCarbsG(carbsG: number | null | undefined, fiberG: number | null | undefined): number | null {
  if (carbsG == null) return null;
  return round1(Math.max(0, carbsG - (fiberG ?? 0)));
}

// La app muestra SAL (referencia OMS de 5 g/día, que es la que el usuario reconoce) pero
// persiste SODIO, que es lo que entrega USDA. Factor 2.5 = peso molecular NaCl / Na.
export function saltGFromSodiumMg(sodiumMg: number | null | undefined): number | null {
  if (sodiumMg == null) return null;
  return round1((sodiumMg * 2.5) / 1000);
}
