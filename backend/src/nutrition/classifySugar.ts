// Clasificador PURO del azúcar de un alimento para el límite OMS de azúcares LIBRES (NUT-10).
//
// Decide, por el NOMBRE (+ la descripción USDA si la hay), si el azúcar del alimento es:
//   · "free"      → jugo, fruta seca, puré/compota, miel, jarabe, azúcar, dulce: TODO su azúcar es libre.
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
const FREE_PALABRAS = ["jam", "nectar"];

// FREE, frases literales (substring): "dulce de leche", "dulce de membrillo". "dulce" solo NO
// alcanza (sería demasiado amplio).
const FREE_FRASES = ["dulce de"];

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
