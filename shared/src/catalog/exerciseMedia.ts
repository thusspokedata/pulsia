import { EXERCISE_MEDIA_DATA } from "./exerciseMedia.data";

export interface ExerciseMedia {
  /** Claves de asset de los dos cuadros: [inicio, tensión]. */
  frames: [string, string];
  /** Cues de técnica en español, en orden. */
  cues: string[];
}

/**
 * Media de un ejercicio, o undefined si no tiene ilustración.
 *
 * ESTA ES LA COSTURA de la que cuelga toda la feature: si algún día se cambia de fuente
 * (p. ej. un pack pago), se reemplaza `exerciseMedia.data.ts` y ningún consumidor se entera.
 */
export function exerciseMediaFor(catalogId: string): ExerciseMedia | undefined {
  // Own-property check: evita devolver miembros heredados del prototipo (p.ej. "toString"),
  // mismo guard que exerciseNameEs.
  return Object.prototype.hasOwnProperty.call(EXERCISE_MEDIA_DATA, catalogId)
    ? EXERCISE_MEDIA_DATA[catalogId]
    : undefined;
}

/** Atajo para decidir si mostrar el acceso a "ver cómo se hace". */
export function hasExerciseMedia(catalogId: string): boolean {
  return exerciseMediaFor(catalogId) !== undefined;
}
