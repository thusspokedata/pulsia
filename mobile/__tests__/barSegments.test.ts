import { barSegments } from "../src/nutrition/tabs/ui";

test("bajo la meta: solo turquesa, proporcional", () => {
  expect(barSegments(50, 200)).toEqual({ fillPct: 25, overPct: 0 });
});

test("justo en la meta: lleno y sin naranja", () => {
  expect(barSegments(200, 200)).toEqual({ fillPct: 100, overPct: 0 });
});

test("pasado: dos segmentos que suman 100", () => {
  // grasa 119 contra una meta de 63 → 63/119 = 52.9% turquesa, 47.1% naranja
  const s = barSegments(119, 63);
  expect(s.fillPct).toBe(53);
  expect(s.overPct).toBe(47);
  expect(s.fillPct + s.overPct).toBe(100);
});

test("al doble de la meta queda mitad y mitad", () => {
  expect(barSegments(120, 60)).toEqual({ fillPct: 50, overPct: 50 });
});

test("kind floor: pasarse del piso NO pinta naranja", () => {
  // la fibra es un piso: 45 g contra 30 es bueno, no una alerta
  expect(barSegments(45, 30, "floor")).toEqual({ fillPct: 100, overPct: 0 });
  // con los MISMOS números como límite sí hay dos segmentos (fija que el prop hace algo)
  expect(barSegments(45, 30, "limit").overPct).toBeGreaterThan(0);
});

test("un excedente mínimo igual se ve: nunca 100% turquesa si te pasaste", () => {
  const s = barSegments(5.02, 5); // 0.4% de exceso
  expect(s.fillPct).toBe(99);
  expect(s.overPct).toBe(1);
});

test("target inválido no divide por cero", () => {
  for (const bad of [0, -10, NaN]) {
    expect(barSegments(50, bad)).toEqual({ fillPct: 0, overPct: 0 });
  }
});

test("un value negativo no dibuja una barra negativa", () => {
  expect(barSegments(-5, 200)).toEqual({ fillPct: 0, overPct: 0 });
});

test("un excedente extremo igual deja ver el turquesa", () => {
  // 13000 contra una meta de 63 (>200x): sin el clamp el turquesa redondea a 0%
  const s = barSegments(13000, 63);
  expect(s.fillPct).toBe(1);
  expect(s.overPct).toBe(99);
});
