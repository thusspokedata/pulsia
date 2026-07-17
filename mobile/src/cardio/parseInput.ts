// Parsea un número decimal escrito a mano en un input. Acepta coma o punto como
// separador decimal (es-AR escribe "3,5") y espacios alrededor. Devuelve null si el
// texto está vacío o no es un número finito; el llamador decide qué hacer con eso
// (p.ej. duración vacía = inválida, distancia vacía = null). No filtra negativos:
// eso lo valida el schema aguas abajo, para no esconder un typo como un 0 silencioso.
export function parseDecimal(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
