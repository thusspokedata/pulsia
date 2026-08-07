import { expect, test } from "bun:test";
import { SEED_FOODS } from "./seed-food-catalog.data";

test("nombres únicos (case-insensitive)", () => {
  const seen = new Set<string>();
  for (const f of SEED_FOODS) {
    const key = f.name.trim().toLowerCase();
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
});

test("cada ítem tiene un fdcId entero positivo y un basis válido", () => {
  for (const f of SEED_FOODS) {
    expect(Number.isInteger(f.fdcId)).toBe(true);
    expect(f.fdcId).toBeGreaterThan(0);
    expect(["per_100g", "per_100ml"]).toContain(f.basis);
    expect(f.name.trim().length).toBeGreaterThan(0);
  }
});

test("no cuela ningún combo (líneas con '+') ni lácteos combinados", () => {
  for (const f of SEED_FOODS) {
    expect(f.name).not.toContain("+");
  }
});

test("no incluye ingredientes ya presentes en el catálogo con otro nombre", () => {
  const excluidos = [
    "almendra", "nueces", "coliflor", "sandía", "hummus", "miel", "zanahoria",
    "banana", "plátano", "clara de huevos", "huevo", "aceitunas", "manteca",
  ];
  const names = SEED_FOODS.map((f) => f.name.trim().toLowerCase());
  for (const ex of excluidos) expect(names).not.toContain(ex);
});
