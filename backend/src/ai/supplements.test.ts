import { test, expect } from "bun:test";
import { buildSupplementExtractPrompt, buildSupplementExplainPrompt } from "./supplements";

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
