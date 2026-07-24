import { Profile } from "@garmin/fitsdk";
import { EXERCISE_CATALOG } from "@pulsia/shared";

// Índices del catálogo curado, para saber si un ejercicio del .FIT tiene equivalente nuestro.
const CATALOG_IDS = new Set(EXERCISE_CATALOG.map((e) => e.id));

// Profile.types["<category>ExerciseName"][index] → camelName del SDK. Es la MISMA fuente de la que
// se genera nuestro catálogo (shared/scripts/generate-catalog.ts), así que el slug coincide por
// construcción — no es una heurística de nombres.
const types = Profile.types as Record<string, Record<string, string>>;

// Mismo slug que el generador del catálogo (generate-catalog.ts): camelCase → snake_case.
function slug(camel: string): string {
  return camel.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

// Mapea un ejercicio del .FIT (su `category` + el índice numérico de `exerciseName` del SDK de
// Garmin) al `catalogId` de nuestro catálogo. Devuelve null si el ejercicio no está en el catálogo
// curado (273 de los ~cientos del SDK): el llamador lo guarda con el displayName del .FIT y
// catalogId nulo, no lo pierde. Un catalogId NO nulo es lo que permite reconocer "este es un
// ejercicio que la IA pudo haber dado".
export function mapFitExercise(category: string, exerciseNameIndex: number | null): string | null {
  if (exerciseNameIndex == null) return null;
  const camel = types[`${category}ExerciseName`]?.[String(exerciseNameIndex)];
  if (camel == null) return null;
  const id = slug(camel);
  return CATALOG_IDS.has(id) ? id : null;
}
