import { expect, test } from "bun:test";
import { referenceFor, referencesFor } from "./references.efsa";
import { NUTRIENT_KEYS } from "./nutrients";

// El caso que motiva toda la personalización: no es un matiz, es el doble.
test("el hierro de una mujer en edad fertil es MAYOR que el de un varon", () => {
  const varon = referenceFor("iron_mg", { sex: "male", age: 35 });
  const mujer = referenceFor("iron_mg", { sex: "female", age: 35 });
  expect(varon).not.toBeNull();
  expect(mujer).not.toBeNull();
  expect(mujer!.value).toBeGreaterThan(varon!.value);
});

// ⚠️ Sin este test, el anterior pasa en verde con una tabla que ignora el sexo, siempre que el
// fallback coincida con el valor masculino.
test("el perfil sin sexo NO devuelve el valor masculino por casualidad", () => {
  const varon = referenceFor("iron_mg", { sex: "male", age: 35 })!;
  const sinDato = referenceFor("iron_mg", {})!;
  expect(sinDato.value).toBeGreaterThan(varon.value);
});

test("cae al fallback neutro cuando falta el sexo", () => {
  expect(referenceFor("calcium_mg", {})).not.toBeNull();
});

test("cae al fallback neutro cuando falta la edad", () => {
  expect(referenceFor("calcium_mg", { sex: "female" })).not.toBeNull();
});

test("todo nutriente del registro tiene entrada (valor o null explicito)", () => {
  const refs = referencesFor({ sex: "male", age: 35 });
  for (const k of NUTRIENT_KEYS) expect(k in refs).toBe(true);
});

test("cada referencia declara si es piso o techo", () => {
  const refs = referencesFor({ sex: "male", age: 35 });
  for (const r of Object.values(refs)) {
    if (r != null) expect(["min", "max"]).toContain(r.kind);
  }
});
