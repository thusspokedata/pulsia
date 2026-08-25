import { expect, test } from "bun:test";
import { classifySugar } from "./classifySugar";

test("fruta entera → intrinsic", () => {
  expect(classifySugar("Manzana")).toBe("intrinsic");
  expect(classifySugar("Plátano")).toBe("intrinsic"); // acentos normalizados
  expect(classifySugar("Manzanas rojas")).toBe("intrinsic"); // plural
});

test("verdura entera → intrinsic", () => {
  expect(classifySugar("Tomate")).toBe("intrinsic");
  expect(classifySugar("Diente de ajo")).toBe("intrinsic");
});

test("FREE gana sobre fruta: un jugo de fruta es free, no intrinsic", () => {
  expect(classifySugar("Jugo de naranja")).toBe("free");
});

test("fruta seca / pasas → free", () => {
  expect(classifySugar("Pasas de uva")).toBe("free");
  expect(classifySugar("Orejones de durazno")).toBe("free");
  expect(classifySugar("Manzana deshidratada")).toBe("free");
});

test("miel, jarabe, azúcar, dulces → free", () => {
  expect(classifySugar("Miel")).toBe("free");
  expect(classifySugar("Dulce de membrillo")).toBe("free"); // frase "dulce de"
  expect(classifySugar("Mermelada de frutilla")).toBe("free");
});

test("alimento sin azúcar relevante → null (conservador)", () => {
  expect(classifySugar("Pollo")).toBeNull();
});

test("'fruta' genérico sin nombre de fruta puntual → null (conservador)", () => {
  // Tiene la palabra "fruta" pero no un nombre concreto de fruta/verdura: no lo marcamos intrinsic.
  expect(classifySugar("Yogur con fruta")).toBeNull();
});

test("usa la descripción USDA cuando el nombre no da pistas", () => {
  // name en español sin pistas; la descripción USDA revela que es un jugo → free.
  expect(classifySugar("Bebida", "Orange juice, raw")).toBe("free");
});

test("'jam' (inglés) es free por palabra exacta, pero 'jamón' NO", () => {
  expect(classifySugar("Strawberry jam")).toBe("free");
  expect(classifySugar("Jamón serrano")).toBeNull(); // "jam" no debe pescar "jamon"
});

test("'col' no pesca 'colacao' ni 'coliflor' por accidente", () => {
  expect(classifySugar("Col")).toBe("intrinsic");
  expect(classifySugar("Coliflor")).toBe("intrinsic"); // listada aparte, intrinsic igual
  expect(classifySugar("Colacao")).toBeNull(); // NO es produce
});

test("la nectarina ENTERA es fruta → intrinsic, no free por 'nectar'", () => {
  // "nectar" salió de los prefijos FREE justo para no pescar el PREFIJO de "nectarina": la
  // nectarina entera es fruta y su azúcar es intrínseco. Si "nectar" siguiera de prefijo, esto
  // daría "free" y sub-avisaría el azúcar libre al revés (marcaría libre lo que no lo es).
  expect(classifySugar("Nectarina")).toBe("intrinsic");
  expect(classifySugar("Nectarinas")).toBe("intrinsic"); // plural
  // El nombre no da pistas; la descripción USDA (inglés) sí: nectarine entera → intrinsic.
  expect(classifySugar("", "Nectarines, raw")).toBe("intrinsic");
});

test("'néctar' SUELTO (bebida) sigue siendo free por palabra exacta", () => {
  // El néctar de fruta (bebida azucarada) es free. Como palabra exacta pesca "néctar"/"nectar"
  // suelto pero NO el prefijo de "nectarina". Si "nectar" volviera a los prefijos, el test de
  // arriba se rompe; si sale de las palabras, este se rompe.
  expect(classifySugar("Néctar de durazno")).toBe("free");
  expect(classifySugar("nectar")).toBe("free"); // suelto, sin tilde
});

test("el PURÉ de fruta es free (todo su azúcar es libre), no intrinsic por la fruta", () => {
  // "Puré de manzana" caería en produce ("manzana") y se marcaría intrinsic, sub-avisando el
  // azúcar libre del puré. El prefijo "pure"/"puree" lo gana antes. Si el prefijo no estuviera,
  // esto daría "intrinsic".
  expect(classifySugar("Puré de manzana")).toBe("free");
  expect(classifySugar("Puree de pera")).toBe("free");
});
