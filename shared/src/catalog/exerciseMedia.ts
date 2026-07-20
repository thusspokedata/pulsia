import { EXERCISE_MEDIA_DATA } from "./exerciseMedia.data";
import { EXERCISE_CUES_ES } from "./exerciseCues.es";

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
  if (!Object.prototype.hasOwnProperty.call(EXERCISE_MEDIA_DATA, catalogId)) return undefined;
  const base = EXERCISE_MEDIA_DATA[catalogId];
  const es = Object.prototype.hasOwnProperty.call(EXERCISE_CUES_ES, catalogId)
    ? EXERCISE_CUES_ES[catalogId]
    : undefined;
  // Sin traducción preferimos NO mostrar cues antes que mostrarlos en inglés.
  return { frames: base.frames, cues: es ?? [] };
}

/** Atajo para decidir si mostrar el acceso a "ver cómo se hace". */
export function hasExerciseMedia(catalogId: string): boolean {
  return exerciseMediaFor(catalogId) !== undefined;
}
