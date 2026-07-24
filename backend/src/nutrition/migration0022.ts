// Inversa exacta de saltGFromSodiumMg (shared/src/nutrition/derived.ts). Vive acá y no en
// shared porque solo la usa la migración: la app nunca convierte en este sentido.
export function sodiumMgFromSaltG(saltG: number | null | undefined): number | null {
  if (saltG == null) return null;
  return Math.round((saltG * 1000) / 2.5);
}
