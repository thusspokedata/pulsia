// Normaliza una cadena para busquedas insensibles a acentos y mayusculas: baja a minusculas y
// descompone los diacriticos (NFD) para removerlos, de modo que "platano" y "PLATANO" colapsen a
// la misma clave. Aplicandolo a AMBOS lados de una comparacion se cubren las dos direcciones:
// query sin acento contra nombre acentuado y viceversa.
//
// Nota: NFD tambien descompone la enie (n) -> n, asi que "nino" matchea "ni" + tilde + "no". Es
// intencional (comodidad de busqueda); para preservar la enie habria que excluirla del reemplazo.
//
// El rango de diacriticos va ESCAPADO como \u0300-\u036f y NO como caracteres literales: un
// editor que re-normalice el archivo a NFC romperia un rango literal en silencio.
export function foldAccents(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
