import { test, expect } from "bun:test";
import { buildFoodPrompt } from "./nutrition";

test("modo foto: habla de la foto y deja que la IA elija label o estimate", () => {
  const p = buildFoodPrompt("photo");
  expect(p).toMatch(/FOTO/);
  expect(p).toMatch(/TABLA NUTRICIONAL/);
  // Anclado a la regla 1: `source: "label"` suelto también aparece en la regla 5 (naming).
  expect(p).toMatch(/TABLA NUTRICIONAL visible.*source: "label"/);
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
  // Este es el test que justifica que el prompt sea uno solo con un parámetro. Si alguien afina
  // una regla para un modo y se olvida del otro, esto lo agarra.
  //
  // OJO con su alcance: estas aserciones fijan que cada regla SIGA PRESENTE en los dos modos, no
  // su contenido completo (asertar el texto entero volvería el test frágil a cualquier reescritura
  // del prompt, que es un cambio legítimo y frecuente). O sea: si alguien bifurca una regla por
  // modo — como ya lo está `rule1` — y cambia el criterio en una sola rama dejando el nombre del
  // campo en las dos, este test NO lo va a agarrar. Si bifurcás una regla, reforzá el test acá.
  for (const mode of ["photo", "text"] as const) {
    const p = buildFoodPrompt(mode);
    expect(p).toMatch(/por 100 g o por 100 ml/);
    // Micros de etiqueta, con la conversión sal-vs-sodio.
    expect(p).toMatch(/saturated_fat_g/);
    expect(p).toMatch(/sugars_g/);
    expect(p).toMatch(/fiber_g/);
    expect(p).toMatch(/salt_g/);
    expect(p).toMatch(/sal = sodio × 2\.5/);
    // Colesterol en mg y agua, que siempre se estima.
    expect(p).toMatch(/cholesterol_mg/);
    expect(p).toMatch(/MILIGRAMOS/);
    expect(p).toMatch(/water_ml/);
    expect(p).toMatch(/agua/i);
    expect(p).toMatch(/unitWeightG/);
    // Naming condicional: los productos envasados NO se traducen (la IA lo hacía y se arregló).
    expect(p).toMatch(/tal como está impreso/);
    expect(p).toMatch(/en ESPAÑOL/);
    expect(p).toMatch(/return_food/);
  }
});
