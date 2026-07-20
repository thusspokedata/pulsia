import { EXERCISE_MEDIA_DATA } from "@pulsia/shared/src/catalog/exerciseMedia.data";
import { EXERCISE_ASSETS } from "../src/components/exerciseAssets";

// exerciseAssets.ts se regenera A MANO tras correr la ingesta de media. Si alguien corre la
// ingesta y se olvida de regenerarlo, EXERCISE_ASSETS[frame] devuelve undefined y la app hace
// <Image source={undefined}> — que falla EN EL TELÉFONO, no en CI. Este test lo vuelve ruidoso.
test("todos los frames de los datos existen en el mapa de assets", () => {
  const faltantes: string[] = [];
  for (const [id, media] of Object.entries(EXERCISE_MEDIA_DATA)) {
    for (const frame of media.frames) {
      if (!(frame in EXERCISE_ASSETS)) faltantes.push(`${id} → ${frame}`);
    }
  }
  expect(faltantes).toEqual([]);
});

test("el mapa de assets no tiene entradas que nadie use", () => {
  const usados = new Set(Object.values(EXERCISE_MEDIA_DATA).flatMap((m) => m.frames));
  const huerfanos = Object.keys(EXERCISE_ASSETS).filter((k) => !usados.has(k));
  expect(huerfanos).toEqual([]);
});
