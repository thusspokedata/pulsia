import type { MuscleGroup } from "@pulsia/shared";

// Mapeo de músculos del catálogo (@pulsia/shared) a slugs de react-native-body-highlighter.
// PURO y testeable. full_body → null: no localizable, se muestra como chip "Cuerpo completo".
// Tipado como Record exhaustivo sobre MuscleGroup: TS obliga a cubrir TODOS los grupos del enum
// (12), así no se escapa ninguno (como pasó con `forearms`).
export const MUSCLE_MAP: Record<MuscleGroup, string[] | null> = {
  abs: ["abs"],
  back: ["upper-back", "lower-back", "trapezius"],
  glutes: ["gluteal"],
  shoulders: ["deltoids"],
  chest: ["chest"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  triceps: ["triceps"],
  biceps: ["biceps"],
  forearms: ["forearm"],
  calves: ["calves"],
  full_body: null,
};

export interface BodyDatum {
  slug: string;
  intensity: number;
}

// primary → intensity 1 (colors[0]); secondary → intensity 2 (colors[1]).
// Si un slug aparece en ambos, gana la menor intensity (primary=1).
// full_body no entra a data, pero marca hasFullBody.
export function buildBodyData(
  primary: string[],
  secondary: string[],
): { data: BodyDatum[]; hasFullBody: boolean } {
  const bySlug = new Map<string, number>();
  const order: string[] = [];

  const add = (muscles: string[], intensity: number) => {
    for (const m of muscles) {
      const slugs = MUSCLE_MAP[m as MuscleGroup];
      if (slugs == null) continue; // sin match o full_body
      for (const slug of slugs) {
        const prev = bySlug.get(slug);
        if (prev == null) {
          order.push(slug);
          bySlug.set(slug, intensity);
        } else {
          bySlug.set(slug, Math.min(prev, intensity));
        }
      }
    }
  };

  add(primary, 1);
  add(secondary, 2);

  const hasFullBody = primary.includes("full_body") || secondary.includes("full_body");
  const data = order.map((slug) => ({ slug, intensity: bySlug.get(slug) as number }));
  return { data, hasFullBody };
}
