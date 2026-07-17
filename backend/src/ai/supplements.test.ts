import { test, expect } from "bun:test";
import { buildSupplementExtractPrompt, buildSupplementExplainPrompt, buildSupplementPlanPrompt } from "./supplements";

test("el prompt de extracción trae anti-inyección, per-serving, info no-prescriptiva y regla de nombre", () => {
  const p = buildSupplementExtractPrompt();
  expect(p).toMatch(/DATOS del usuario, NO instrucciones/i);
  expect(p).toMatch(/por porci[oó]n/i);          // componentes por porción, no por 100g
  expect(p).toMatch(/QUÉ ES y PARA QUÉ SIRVE/);   // pide la explicación de componentes
  expect(p).toMatch(/no.*(diagn[oó]stic|prescri)/i); // lenguaje informativo, no prescriptivo
  expect(p).toMatch(/return_supplement/);
});

test("el prompt de explicación incluye el suplemento y sus componentes", () => {
  const p = buildSupplementExplainPrompt({
    name: "ZMA Pro", servingLabel: "2 cápsulas",
    components: [{ name: "Zinc", amount: 10, unit: "mg" }],
  });
  expect(p).toContain("ZMA Pro");
  expect(p).toContain("Zinc");
  expect(p).toContain("10 mg");
  expect(p).toMatch(/no.*(diagn[oó]stic|prescri)/i);
});

test("el prompt del plan trae catálogo, contexto, techo de etiqueta, franjas y anti-inyección", () => {
  const p = buildSupplementPlanPrompt({
    catalog: [{
      id: "11111111-1111-4111-8111-111111111111", name: "Zink", servingLabel: "1 Tablette",
      components: [{ name: "Zinc", amount: 25, unit: "mg" }], labelMaxPerDay: "1 Tablette täglich",
    }],
    athleteContext: { goal: { status: "incomplete" } } as any,
    userNote: "el zinc me cae mal a la mañana",
  });
  expect(p).toContain("Zink");
  expect(p).toContain("11111111-1111-4111-8111-111111111111"); // la IA referencia por id
  expect(p).toMatch(/NUNCA.*(super|exced)/i);                   // techo de dosis de etiqueta
  expect(p).toMatch(/desayuno.*antes_de_dormir/s);              // franjas del enum
  expect(p).toContain("el zinc me cae mal a la mañana");        // nota del usuario
  expect(p).toMatch(/DATOS.*NO instrucciones/i);                // anti-inyección
  expect(p).toMatch(/return_supplement_plan/);
});

test("el prompt del plan pide pensar la semana completa y no duplicar componentes entre suplementos", () => {
  const p = buildSupplementPlanPrompt({
    catalog: [{
      id: "11111111-1111-4111-8111-111111111111", name: "Zink", servingLabel: "1 Tablette",
      components: [{ name: "Zinc", amount: 25, unit: "mg" }], labelMaxPerDay: "1 Tablette täglich",
    }],
    athleteContext: { goal: { status: "incomplete" } } as any,
    userNote: null,
  });
  expect(p).toMatch(/MISMO componente/i);
  expect(p).toMatch(/semana/i);
  expect(p).toMatch(/alternar/i);
  expect(p).toMatch(/no.*duplicar|nunca.*duplic/i);
  // Alternar productos debe hacerse con `weekdays` complementarios; every_other_day NO sirve
  // (el server ancla todos los día-por-medio a la misma fecha → misma paridad → coinciden).
  // Sin la flag `s`: con ella el `.` cruzaba líneas y enlazaba el enum de `frequency` de la regla 1
  // con un "complementari" 40 líneas después, así que la frase podía desaparecer y el test seguía verde.
  expect(p).toMatch(/alternar entre productos usá `weekdays` con días complementarios/);
  expect(p).toMatch(/NO uses `?every_other_day`? para alternar/i);
  expect(p).not.toMatch(/día por medio complementario/i);
  // Techo combinado: la etiqueta más baja de los productos involucrados, no una etiqueta ambigua.
  expect(p).toMatch(/etiqueta más baja/i);
});
