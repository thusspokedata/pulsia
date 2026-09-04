// Extrae el TEXTO visible de una página HTML cruda para pasárselo a la IA (NUT-17).
//
// No queremos un parser DOM entero server-side (peso, superficie de ataque): la IA sólo necesita el
// texto legible de la ficha de producto —nombres de nutrientes y sus cantidades—, no el markup. El
// enfoque es a propósito SIMPLE y determinista: matar los bloques que nunca son texto útil
// (<script>/<style>/<noscript> y los comentarios), reemplazar el resto de los tags por un espacio
// (así "…</td><td>21 g" no se pega en "…21 g" sin separación), decodificar las entidades más
// comunes y colapsar el whitespace. Función PURA.

// Entidades HTML comunes → su carácter. La lista es ACOTADA a propósito (las que aparecen en fichas
// de producto); lo demás se deja como está para no inventar.
const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntidades(s: string): string {
  let out = s;
  for (const [ent, ch] of Object.entries(ENTIDADES)) {
    out = out.split(ent).join(ch);
  }
  return out;
}

/**
 * Devuelve el texto visible de `html`: sin <script>/<style>/<noscript>, sin comentarios, sin tags,
 * con las entidades comunes decodificadas, el whitespace colapsado a un solo espacio, trimmeado y
 * cortado a `maxChars`. Puro.
 */
export function extractPageText(html: string, maxChars = 12000): string {
  let s = html;

  // 1) Bloques que NUNCA son texto útil: los borramos ENTEROS (tag de apertura + contenido + cierre).
  //    [\s\S] para cruzar newlines; *? no-greedy para no comerse de más si hay varios.
  //    El tag de cierre usa `[^>]*>` (no `\s*>`) para tolerar basura antes del `>` — `</script foo>`,
  //    `</script\n bar>` —: un cierre con atributos igual termina el bloque en los navegadores, y si el
  //    regex no lo matcheara, el `*?` seguiría de largo y dejaría el código del script como "texto".
  s = s.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, " ");
  s = s.replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, " ");
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript\b[^>]*>/gi, " ");

  // 2) Comentarios HTML <!-- ... -->
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // 3) El resto de los tags → un espacio (así los textos de celdas contiguas quedan separados).
  s = s.replace(/<[^>]+>/g, " ");

  // 4) Entidades comunes → su carácter (después de sacar los tags, antes de colapsar).
  s = decodeEntidades(s);

  // 5) Colapsar TODO el whitespace (espacios, tabs, newlines) a un solo espacio y trimmear.
  s = s.replace(/\s+/g, " ").trim();

  // 6) Tope duro de longitud para no inundar el prompt.
  return s.slice(0, maxChars);
}
