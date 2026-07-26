import { describe, it, expect } from "bun:test";
import { supplementMicros, type TakeForMicros } from "./supplementBreakdown";

const mg = (nutrientKey: any, amountPerUnit: number) => ({ name: "c", amount: 0, unit: "mg", nutrientKey, amountPerUnit });

describe("supplementMicros", () => {
  it("taken usa el número del plannedDose", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "3 cápsulas", actualDose: null, supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    const { totals } = supplementMicros(takes);
    expect(totals.magnesium_mg).toBe(300);
  });
  it("deviated usa actualDose (el caso del owner: tomó 1, no 3)", () => {
    const takes: TakeForMicros[] = [
      { status: "deviated", plannedDose: "3 cápsulas", actualDose: "1 cápsula", supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).totals.magnesium_mg).toBe(100);
  });
  it("skipped aporta 0", () => {
    const takes: TakeForMicros[] = [
      { status: "skipped", plannedDose: "3 cápsulas", actualDose: null, supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).totals.magnesium_mg).toBeUndefined();
  });
  it("deviated sin actualDose parseable cae al plannedDose", () => {
    const takes: TakeForMicros[] = [
      { status: "deviated", plannedDose: "2 cápsulas", actualDose: "un poco", supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).totals.magnesium_mg).toBe(200);
  });
  it("dose sin número cae a 1 unidad", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "según necesidad", actualDose: null, supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).totals.magnesium_mg).toBe(100);
  });
  it("saltea componentes sin nutrientKey o sin amountPerUnit", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "1", actualDose: null, supplementName: "X",
        components: [
          { name: "Creatina", amount: 5, unit: "g", nutrientKey: null, amountPerUnit: null },
          { name: "Mg", amount: 0, unit: "mg", nutrientKey: "magnesium_mg", amountPerUnit: null },
        ] },
    ];
    expect(Object.keys(supplementMicros(takes).totals)).toHaveLength(0);
  });
  it("saltea un componente con nutrientKey null aunque amountPerUnit sea positivo", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "1", actualDose: null, supplementName: "X",
        components: [{ name: "Creatina", amount: 5, unit: "g", nutrientKey: null, amountPerUnit: 100 }] },
    ];
    const { totals } = supplementMicros(takes);
    expect(Object.keys(totals)).toHaveLength(0);
  });
  it("suma multi-slot del mismo suplemento y respeta decimales del nutriente", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "1", actualDose: null, supplementName: "Zinc",
        components: [mg("zinc_mg", 0.12)] },
      { status: "taken", plannedDose: "1", actualDose: null, supplementName: "Zinc",
        components: [mg("zinc_mg", 0.12)] },
    ];
    // zinc: 2 decimales (registro) → 0.24, no 0.2
    expect(supplementMicros(takes).totals.zinc_mg).toBe(0.24);
  });
  it("byNutrient lista el aporte por suplemento", () => {
    const takes: TakeForMicros[] = [
      { status: "taken", plannedDose: "3", actualDose: null, supplementName: "Mg",
        components: [mg("magnesium_mg", 100)] },
    ];
    expect(supplementMicros(takes).byNutrient.magnesium_mg).toEqual([{ supplementName: "Mg", amount: 300 }]);
  });
});
