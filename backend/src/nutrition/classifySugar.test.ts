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

test("TORTA (postre) es free aunque nombre una fruta — no la esconde como intrinsic", () => {
  // Caso real del backfill: la fruta pescaba PRODUCE ("manzana"/"frutilla") y quedaba intrinsic,
  // escondiendo el azúcar AGREGADA del postre (intrinsic → libre = 0). "torta" gana antes (free).
  // "torta" es palabra EXACTA (con plural), NO prefijo: como prefijo pescaría "tortilla" (savory).
  // Mutación: si se saca "torta" de FREE_PALABRAS, estos dan "intrinsic" y el test rompe.
  expect(classifySugar("Torta de manzana con streusel")).toBe("free");
  expect(classifySugar("Torta de chocolate con crema y frutilla")).toBe("free");
  expect(classifySugar("Tortas")).toBe("free"); // plural
});

test("'tortilla' (savory) NO es free — queda intrinsic por 'papa'", () => {
  // La tortilla de papa es salada: su azúcar es ~0 y NO debe caer en free. "tortilla" no arranca
  // con "torta" (diverge en la 5ª letra), así que ni palabra exacta ni prefijo la pescan; gana
  // "papa" (produce) → intrinsic. Guarda contra que alguien agregue "tort"/"torti" a free.
  expect(classifySugar("Tortilla de papa")).toBe("intrinsic");
});

test("'torta' es palabra EXACTA, no prefijo — no pesca tokens savory más largos ('tortazo')", () => {
  // Un token que ARRANCA con "torta" pero no ES "torta" (p.ej. "tortazo", golpe/estropicio) NO
  // debe caer en free. La palabra exacta (\btorta s?\b) lo excluye; un prefijo lo atraparía.
  // Mutación: mover "torta" de FREE_PALABRAS a FREE_PREFIJOS hace que esto dé "free" y rompe.
  expect(classifySugar("Tortazo")).toBeNull();
});

test("postres inequívocos (prefijo) → free", () => {
  expect(classifySugar("Streusel de avena")).toBe("free");
  expect(classifySugar("Brownie de chocolate")).toBe("free");
  expect(classifySugar("Muffin de arándanos")).toBe("free"); // arándano es produce, pero muffin gana
  expect(classifySugar("Cheesecake de frutilla")).toBe("free");
  expect(classifySugar("Cupcake")).toBe("free");
  expect(classifySugar("Tiramisú")).toBe("free");
  // "bizcocho" es prefijo a propósito: pesca también "bizcochuelo" (torta esponjosa, dulce).
  expect(classifySugar("Bizcocho")).toBe("free");
  expect(classifySugar("Bizcochuelo")).toBe("free");
});

test("batidos/licuados de fruta → free (la OMS los cuenta como libres, igual que el jugo)", () => {
  expect(classifySugar("Batido de mango")).toBe("free"); // mango es produce, pero batido gana
  expect(classifySugar("Smoothie de frutilla")).toBe("free");
  expect(classifySugar("Licuado de banana")).toBe("free");
  expect(classifySugar("Milkshake de vainilla")).toBe("free");
});

test("términos ambiguos savory se dejan AFUERA de free (tarta/pastel/budín/galleta)", () => {
  // "tarta de verduras", "pastel de papa", "budín de verduras", "galleta salada" son savory: NO
  // se agregan a free. Acá verificamos que NO caen en free (quedan intrinsic si nombran produce,
  // o null si no). Si alguien agregara "tarta"/"pastel"/"budin"/"galleta" a free, esto rompe.
  expect(classifySugar("Tarta de verduras")).not.toBe("free");
  expect(classifySugar("Pastel de papa")).not.toBe("free");
  expect(classifySugar("Budín de verduras")).not.toBe("free");
  expect(classifySugar("Galleta salada")).not.toBe("free");
});
