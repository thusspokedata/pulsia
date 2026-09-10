// Detección BARATA y determinista de "esto es una URL, no el nombre de un alimento" (NUT-17).
//
// El campo de alta acepta tanto texto libre ("almendra") como una URL de una ficha de producto
// que el backend fetchea. Necesitamos decidir en el MÓVIL, sin dependencias ni sorpresas, si lo
// tipeado es UNA URL. Por eso NO alcanza con `new URL()`: `new URL("almendra:x")` parsea, y un
// parser generoso aceptaría cosas que un humano jamás pensó como URL. La regla es estricta a
// propósito: UN SOLO token (sin espacios internos) que arranca con http:// o https://. Un espacio
// interno ("mira https://x.com") significa que es una frase, no una URL sola → false.

/**
 * `true` si `text` (trimmeado) es UNA sola URL http(s): un único token sin espacios internos que
 * empieza con `http://` o `https://` (el esquema es case-insensitive). Usamos `new URL()` sólo
 * como chequeo EXTRA de que además parsea; la condición barata (esquema + sin espacios) manda.
 */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false; // vacío / sólo espacios → no es URL
  if (/\s/.test(t)) return false; // cualquier whitespace interno → es una frase, no una URL sola
  if (!/^https?:\/\//i.test(t)) return false; // debe arrancar con http:// o https:// (ftp:// afuera)

  // Chequeo extra, barato y sin efectos: que además parsee como URL. No es la validación principal
  // (ya filtramos por esquema y espacios) pero descarta basura tipo "https://" pelado.
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
