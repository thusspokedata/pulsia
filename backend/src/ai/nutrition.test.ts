import { test, expect } from "bun:test";
import { buildFoodPrompt } from "./nutrition";

test("modo foto: habla de la foto y deja que la IA elija label o ai", () => {
  const p = buildFoodPrompt("photo");
  expect(p).toMatch(/FOTO/);
  expect(p).toMatch(/TABLA NUTRICIONAL/);
  // Anclado a la regla 1: `sourceMacros: "label"` suelto también aparece en la regla 5 (naming).
  expect(p).toMatch(/TABLA NUTRICIONAL visible.*sourceMacros: "label"/);
});

test("modo texto: no habla de foto y fuerza estimación (no hay etiqueta que leer)", () => {
  const p = buildFoodPrompt("text");
  expect(p).not.toMatch(/FOTO/);
  expect(p).not.toMatch(/TABLA NUTRICIONAL/);
  expect(p).toMatch(/SIEMPRE estás estimando/);
});

test("el prompt pide una frase de búsqueda en INGLÉS", () => {
  const p = buildFoodPrompt("photo");
  expect(p).toContain("searchQuery");
  expect(p).toMatch(/en ingl[eé]s/i);
});

test("el prompt ya NO pide sal: la fuente única es el sodio", () => {
  expect(buildFoodPrompt("photo")).not.toContain("salt_g");
  // Y el sodio se pide como sodium_mg en mg, con la conversión invertida (sal → sodio).
  expect(buildFoodPrompt("photo")).toContain("sodium_mg");
  expect(buildFoodPrompt("photo")).toMatch(/sal_g × 400/);
});

test("el prompt NO le pide vitaminas ni minerales al modelo", () => {
  const p = buildFoodPrompt("photo");
  for (const k of ["vitamin_b12_mcg", "selenium_mcg", "iron_mg", "calcium_mg", "vitamin_a_mcg"]) {
    expect(p).not.toContain(k);
  }
});

test("el anti-inyección sigue estando en los dos modos", () => {
  for (const mode of ["photo", "text"] as const) {
    expect(buildFoodPrompt(mode)).toMatch(/NO instrucciones/);
  }
});

test("el anti-inyección aparece por UN SOLO camino en cada modo", () => {
  // Si /NO instrucciones/ apareciera dos veces, el test de presencia pasaría aunque se borre una
  // de las defensas. Este conteo ata que haya exactamente una ocurrencia por modo.
  for (const mode of ["photo", "text"] as const) {
    const p = buildFoodPrompt(mode);
    expect((p.match(/NO instrucciones/g) ?? []).length).toBe(1);
  }
});

test("las reglas nutricionales son las MISMAS en los dos modos: no pueden divergir", () => {
  // Este es el test que justifica que el prompt sea uno solo con un parámetro. Si alguien afina
  // una regla para un modo y se olvida del otro, esto lo agarra.
  //
  // OJO con su alcance: estas aserciones fijan que cada regla SIGA PRESENTE en los dos modos, no
  // su contenido completo (asertar el texto entero volvería el test frágil a cualquier reescritura
  // del prompt, que es un cambio legítimo y frecuente). Si bifurcás una regla por modo — como ya
  // lo está `rule1` — reforzá el test acá.
  for (const mode of ["photo", "text"] as const) {
    const p = buildFoodPrompt(mode);
    expect(p).toMatch(/por 100 g o por 100 ml/);
    // Micros de etiqueta (los 6 de siempre), con el sodio en lugar de la sal.
    expect(p).toMatch(/saturated_fat_g/);
    expect(p).toMatch(/sugars_g/);
    expect(p).toMatch(/fiber_g/);
    expect(p).toMatch(/sodium_mg/);
    // Colesterol en mg y agua, que siempre se estima.
    expect(p).toMatch(/cholesterol_mg/);
    expect(p).toMatch(/MILIGRAMOS/);
    expect(p).toMatch(/water_ml/);
    expect(p).toMatch(/agua/i);
    expect(p).toMatch(/unitWeightG/);
    // Frase de búsqueda para USDA, en los dos modos.
    expect(p).toMatch(/searchQuery/);
    // Naming condicional: los productos envasados NO se traducen (la IA lo hacía y se arregló).
    expect(p).toMatch(/tal como está impreso/);
    expect(p).toMatch(/en ESPAÑOL/);
    expect(p).toMatch(/return_food/);
  }
});
