import { test, expect } from "bun:test";
import { buildFoodPrompt } from "./nutrition";

test("modo foto: habla de la foto y deja que la IA elija label o estimate", () => {
  const p = buildFoodPrompt("photo");
  expect(p).toMatch(/FOTO/);
  expect(p).toMatch(/TABLA NUTRICIONAL/);
  expect(p).toMatch(/source: "label"/);
});

test("modo texto: no habla de foto y fuerza estimate (no hay etiqueta que leer)", () => {
  const p = buildFoodPrompt("text");
  expect(p).not.toMatch(/FOTO/);
  expect(p).not.toMatch(/TABLA NUTRICIONAL/);
  expect(p).toMatch(/SIEMPRE estás estimando/);
});

test("los dos modos avisan que el input son DATOS, no instrucciones", () => {
  expect(buildFoodPrompt("photo")).toMatch(/NO instrucciones/);
  expect(buildFoodPrompt("text")).toMatch(/NO instrucciones/);
});

test("las reglas nutricionales son las MISMAS en los dos modos: no pueden divergir", () => {
  // Este es el test que justifica que el prompt sea uno solo con un parámetro. Si alguien afina la
  // regla del colesterol para un modo y se olvida del otro, esto lo agarra.
  for (const mode of ["photo", "text"] as const) {
    const p = buildFoodPrompt(mode);
    expect(p).toMatch(/por 100 g o por 100 ml/);
    expect(p).toMatch(/sal = sodio × 2\.5/);
    expect(p).toMatch(/cholesterol_mg/);
    expect(p).toMatch(/water_ml/);
    expect(p).toMatch(/unitWeightG/);
    expect(p).toMatch(/return_food/);
  }
});
