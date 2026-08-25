// Clasificador PURO del azúcar de un alimento para el límite OMS de azúcares LIBRES (NUT-10).
//
// Decide, por el NOMBRE (+ la descripción USDA si la hay), si el azúcar del alimento es:
//   · "free"      → jugo, fruta seca, puré/compota, miel, jarabe, azúcar, dulce, POSTRE inequívoco
//                   (torta, brownie, muffin, cheesecake…) y batido/licuado de fruta: TODO su azúcar
//                   es libre. Los términos AMBIGUOS savory (tarta, pastel, budín, galleta) se dejan
//                   AFUERA a propósito: tienen versiones saladas comunes (ver FREE_PALABRAS).
//   · "intrinsic" → fruta o verdura ENTERA: su azúcar es natural y NO cuenta como libre.
//   · null        → no sabemos (conservador; el motor tratará el total como libre salvo added_sugars_g).
//
// FREE se chequea PRIMERO a propósito y con patrones AMPLIOS: una fruta que además es jugo o está
// seca ("jugo de naranja", "pasas de uva") es free, no intrinsic. La lista de PRODUCE, en cambio,
// es ACOTADA (solo frutas/verduras genuinas): marcar intrinsic de más = sub-avisar azúcar libre.

import type { SugarClass } from "@pulsia/shared";

// Minúsculas + sin acentos, para que los patrones (todos sin tilde) matcheen "Plátano"/"platano".
function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// FREE, patrones de PREFIJO: matchean al comienzo de una palabra y admiten sufijos/plurales
// ("deshidrat" → "deshidratado"; "pasa" → "pasas"; "orejon" → "orejones"). El \b de arranque evita
// pescar el patrón en medio de otra palabra.
const FREE_PREFIJOS = [
  "jugo", "zumo", "juice",
  "deshidrat", "pasa", "raisin", "orejon", "dried",
  "miel", "honey", "jarabe", "syrup", "sirope",
  "mermelada", "jalea", "confitura",
  "azucar", "sugar", "caramelo", "candy",
  "compota", "membrillo",
  "helado", "refresco", "gaseosa",
  "seco", "seca",
  // Postres/dulces INEQUÍVOCOS (todo su azúcar es agregada). Van de prefijo porque no hay palabra
  // savory que arranque con ellos, y así admiten plurales/variantes:
  //   · "bizcoch" (recortado) pesca "bizcocho" Y "bizcochuelo" (torta esponjosa dulce); "bizcocho"
  //     entero NO alcanzaría "bizcochuelo" (diverge en la 8ª letra: bizcoch-o vs bizcoch-uelo).
  //   · "muffin"/"cupcake"/"brownie"/"cheesecake"/"streusel"/"tiramisu" no tienen homónimo salado.
  "streusel", "bizcoch", "brownie", "muffin", "cheesecake", "cupcake", "tiramisu",
  // Batidos/licuados de fruta: la OMS los cuenta como azúcar LIBRE, igual que el jugo (la fibra se
  // rompe al licuar). "smoothie"/"milkshake" van de prefijo (inequívocos en español). En cambio
  // "batido"/"licuado" son AMBIGUOS: "batido" también describe textura láctea ("Queso fresco batido
  // light" = cottage cheese, cuyo azúcar es LACTOSA intrínseca, NO libre). Por eso van como FRASES
  // que exigen " de " (ver FREE_FRASES), no de prefijo suelto.
  "smoothie", "milkshake",
  // El PURÉ/compota de FRUTA es free (todo su azúcar es libre): sin esto "Puré de manzana"
  // caería en produce ("manzana") y se marcaría intrinsic, sub-avisando el azúcar libre. Un
  // "puré de papa" también daría free, pero su azúcar es ~0 así que es inocuo (conservador);
  // lo que importa es que el puré de fruta NO quede intrinsic. Normalizado sin tilde: "puré"→"pure".
  "pure", "puree",
];

// FREE, palabra EXACTA (admite plural con -s): "jam" (inglés). Como prefijo pescaría "jamón"
// ("jamon"), que NO es dulce; exacto lo evita. "nectar" está acá y NO en los prefijos: como
// palabra exacta pesca el néctar SUELTO (bebida azucarada, "Néctar de durazno" → free) pero no el
// prefijo de "nectarina", que es una fruta ENTERA (intrinsic, listada en PRODUCE).
// "torta" (= pastel dulce) va acá como palabra EXACTA (con plural: "torta"/"tortas"), NO de
// prefijo. La palabra exacta evita pescar cualquier token savory más largo que ARRANQUE con
// "torta" (p.ej. "tortazo"), que un prefijo sí atraparía. ("tortilla" no arranca con "torta"
// —diverge en la 5ª letra, tort-i vs tort-a— así que ni exacto ni prefijo la pescan; queda
// intrinsic por "papa".) Caso real del backfill: "Torta de manzana con streusel" quedaba
// intrinsic por la fruta y escondía la azúcar agregada; ahora torta gana (free).
const FREE_PALABRAS = ["jam", "nectar", "torta"];

// FREE, frases literales (substring): "dulce de leche", "dulce de membrillo". "dulce" solo NO
// alcanza (sería demasiado amplio). "batido de"/"licuado de" pescan el batido/licuado DE fruta
// (free, la OMS lo cuenta como el jugo) exigiendo la preposición, para NO pescar "queso batido"
// (lactosa intrínseca) — ver la nota en FREE_PREFIJOS.
const FREE_FRASES = ["dulce de", "batido de", "licuado de"];

// DELIBERADAMENTE AFUERA de free (ambiguos savory): "tarta" (tarta de verduras), "pastel" (pastel
// de papa/carne), "budin" (budín de verduras/carne) y "galleta" (galleta salada) tienen versiones
// saladas comunes. Marcarlos free daría un falso positivo de azúcar libre en esos platos salados;
// se dejan sin clasificar por su nombre (caerán en produce si nombran una verdura, o null).

// PRODUCE ENTERA (intrinsic): frutas y verduras genuinas. Se matchea como palabra completa con
// plural opcional (-s/-es) para no pescar el patrón dentro de otra palabra ("col" no debe pescar
// "colacao" ni "coliflor" —esta última está listada aparte—).
const PRODUCE_PALABRAS = [
  // Frutas
  "manzana", "banana", "platano", "pera", "naranja", "mandarina", "clementina",
  "pomelo", "toronja", "lima", "limon", "uva", "sandia", "melon", "durazno",
  "melocoton", "damasco", "albaricoque", "ciruela", "cereza", "guinda", "kiwi",
  "mango", "pina", "anana", "papaya", "granada", "higo", "arandano", "frambuesa",
  "mora", "frutilla", "fresa", "maracuya", "guayaba", "caqui", "chirimoya",
  "physalis", "grosella",
  // La nectarina/nectarine ENTERA es fruta (intrinsic). "nectarina" (ES) y "nectarine" (EN, para
  // la descripción USDA "Nectarines, raw") como palabras completas: no las pesca el free porque
  // "nectar" ahora es palabra exacta, no prefijo.
  "nectarina", "nectarine",
  // Verduras
  "tomate", "zanahoria", "brocoli", "coliflor", "espinaca", "acelga", "lechuga",
  "rucula", "pepino", "calabacin", "zucchini", "zapallo", "calabaza", "pimiento",
  "morron", "cebolla", "ajo", "puerro", "apio", "remolacha", "betabel", "rabano",
  "nabo", "repollo", "col", "berenjena", "esparrago", "alcachofa", "chaucha",
  "ejote", "arveja", "guisante", "choclo", "maiz", "batata", "boniato", "camote",
  "papa", "patata", "yuca", "mandioca", "hinojo", "endibia", "escarola", "berro",
  "palta", "aguacate", "champinon", "hongo", "seta",
];

// PRODUCE en frases de más de una palabra (substring, ya normalizado).
const PRODUCE_FRASES = ["judia verde"];

// Escapa metacaracteres de regex de un patrón literal.
function esc(p: string): string {
  return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Un regex por categoría, construido una vez desde las listas (legible: la fuente son las listas).
const FREE_PREFIJO_RE = new RegExp("\\b(" + FREE_PREFIJOS.map(esc).join("|") + ")", "i");
const FREE_PALABRA_RE = new RegExp("\\b(" + FREE_PALABRAS.map(esc).join("|") + ")s?\\b", "i");
const PRODUCE_RE = new RegExp("\\b(" + PRODUCE_PALABRAS.map(esc).join("|") + ")(s|es)?\\b", "i");

export function classifySugar(name: string, usdaDescription?: string | null): SugarClass | null {
  const texto = normalizar(`${name} ${usdaDescription ?? ""}`);

  // FREE primero (gana sobre fruta: un jugo/seco de fruta es libre).
  if (FREE_PREFIJO_RE.test(texto)) return "free";
  if (FREE_PALABRA_RE.test(texto)) return "free";
  if (FREE_FRASES.some((f) => texto.includes(f))) return "free";

  // PRODUCE entera → intrinsic.
  if (PRODUCE_RE.test(texto)) return "intrinsic";
  if (PRODUCE_FRASES.some((f) => texto.includes(f))) return "intrinsic";

  // Sin pistas: conservador.
  return null;
}
