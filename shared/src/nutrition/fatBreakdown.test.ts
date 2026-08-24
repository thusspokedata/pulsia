import { test, expect } from "bun:test";
import { fatBreakdown, FAT_BAR_ORDER } from "./fatBreakdown";

const fats = { monounsaturated_fat_g: 40, omega6_g: 30, omega3_g: 2, saturated_fat_g: 30, trans_fat_g: 1 };

test("FAT_BAR_ORDER es el orden del owner", () => {
  expect(FAT_BAR_ORDER).toEqual([
    "monounsaturated_fat_g",
    "omega6_g",
    "omega3_g",
    "saturated_fat_g",
    "trans_fat_g",
  ]);
});

test("grasa max que se pasa", () => {
  const sat = fatBreakdown(fats, 2000).find((b) => b.type === "saturated_fat_g")!;
  expect(sat.kind).toBe("max");
  expect(sat.thresholdG).toBe(13.3);
  expect(sat.exceeded).toBe(true);
  expect(sat.overG).toBeCloseTo(16.7, 5);
  expect(sat.withinG).toBe(13.3);
});

test("grasa avoid: cualquier cantidad > 0 se marca como excedida, sin umbral", () => {
  const trans = fatBreakdown(fats, 2000).find((b) => b.type === "trans_fat_g")!;
  expect(trans.kind).toBe("avoid");
  expect(trans.thresholdG).toBeNull();
  expect(trans.exceeded).toBe(true);
  expect(trans.overG).toBe(1);
  expect(trans.withinG).toBe(0);
});

test("grasa avoid: 0 gramos no excede", () => {
  const trans = fatBreakdown({ ...fats, trans_fat_g: 0 }, 2000).find((b) => b.type === "trans_fat_g")!;
  expect(trans.exceeded).toBe(false);
  expect(trans.overG).toBe(0);
  expect(trans.withinG).toBe(0);
});

test("recommended nunca excede; omega-3 sin umbral", () => {
  const bars = fatBreakdown(fats, 2000);
  const mono = bars.find((b) => b.type === "monounsaturated_fat_g")!;
  expect(mono.kind).toBe("recommended");
  expect(mono.exceeded).toBe(false);
  expect(mono.overG).toBe(0);
  expect(mono.withinG).toBe(40);
  expect(mono.thresholdG).toBe(33.3);
  expect(bars.find((b) => b.type === "omega3_g")!.thresholdG).toBeNull();
});

test("sin meta: thresholdG null, nada excede salvo avoid (independiente de la meta)", () => {
  for (const b of fatBreakdown(fats, null)) {
    expect(b.thresholdG).toBeNull();
    if (b.kind === "avoid") {
      expect(b.exceeded).toBe(b.grams > 0);
    } else {
      expect(b.exceeded).toBe(false);
      expect(b.overG).toBe(0);
    }
  }
});

test("null → 0 gramos", () => {
  expect(
    fatBreakdown({ ...fats, trans_fat_g: null } as any, 2000).find((b) => b.type === "trans_fat_g")!.grams,
  ).toBe(0);
});
