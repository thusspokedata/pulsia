import { FAT_TYPE_PERCENT_KCAL, fatTypeRefG } from "./references";
import { NUTRIENTS } from "./nutrients";

export const FAT_BAR_ORDER = [
  "monounsaturated_fat_g",
  "omega6_g",
  "omega3_g",
  "saturated_fat_g",
  "trans_fat_g",
] as const;
export type FatType = (typeof FAT_BAR_ORDER)[number];

export interface FatBar {
  type: FatType;
  label: string;
  grams: number;
  kind: "max" | "recommended";
  thresholdG: number | null;
  withinG: number;
  overG: number;
  exceeded: boolean;
}
export type FatGrams = Partial<Record<FatType, number | null>>;
const LABELS = new Map(NUTRIENTS.map((n) => [n.key as string, n.label]));

export function fatBreakdown(fats: FatGrams, goalKcal: number | null): FatBar[] {
  const kcalOk = typeof goalKcal === "number" && Number.isFinite(goalKcal) && goalKcal > 0;
  return FAT_BAR_ORDER.map((type) => {
    const raw = fats[type];
    const grams = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    const spec = FAT_TYPE_PERCENT_KCAL[type];
    const thresholdG = spec.pct != null && kcalOk ? fatTypeRefG(spec.pct, goalKcal as number) : null;
    if (spec.kind === "recommended" || thresholdG == null) {
      return {
        type,
        label: LABELS.get(type)!,
        grams,
        kind: spec.kind,
        thresholdG,
        withinG: grams,
        overG: 0,
        exceeded: false,
      };
    }
    const overG = Math.max(0, grams - thresholdG);
    return {
      type,
      label: LABELS.get(type)!,
      grams,
      kind: spec.kind,
      thresholdG,
      withinG: Math.min(grams, thresholdG),
      overG,
      exceeded: overG > 0,
    };
  });
}
