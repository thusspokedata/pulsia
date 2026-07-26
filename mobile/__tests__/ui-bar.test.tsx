import { barSegments3 } from "../src/nutrition/tabs/ui";

describe("barSegments3", () => {
  it("comida + suplemento por debajo de la meta (food=100, supp=150, target=350)", () => {
    const s = barSegments3(100, 150, 350, "limit"); // food, supplement, target
    expect(s.foodPct).toBe(29);        // round(100/350*100)
    expect(s.supplementPct).toBe(43);  // round(150/350*100)
    expect(s.overPct).toBe(0);
    expect(s.foodPct + s.supplementPct + s.overPct).toBeLessThanOrEqual(100);
  });
  it("ningún segmento con valor > 0 desaparece por redondeo", () => {
    const s = barSegments3(1000, 1, 350, "limit"); // supplement mínimo frente a un total enorme
    expect(s.supplementPct).toBeGreaterThanOrEqual(1);
    expect(s.foodPct).toBeGreaterThanOrEqual(1);
    expect(s.overPct).toBeGreaterThanOrEqual(1);
  });
  it("floor nunca marca excedente aunque se pase", () => {
    const s = barSegments3(20, 25, 30, "floor"); // total 45 > 30 pero es piso
    expect(s.overPct).toBe(0);
  });
  it("excedente cuando comida+suplemento > meta (limit)", () => {
    const s = barSegments3(300, 100, 350, "limit"); // total 400 > 350
    expect(s.overPct).toBeGreaterThan(0);
    expect(s.foodPct + s.supplementPct + s.overPct).toBeLessThanOrEqual(100);
  });
});
