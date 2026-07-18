// Helpers compartidos por los parsers de CSV de Garmin (peso, pasos, ...).

// Split de una línea CSV respetando comillas: el export de Garmin trae la fecha como
// `" Jul 18, 2026"`, un campo entrecomillado CON una coma adentro.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// "73.2 kg" → 73.2 ; "22.1 %" → 22.1 ; "23.4" → 23.4 ; null si no arranca con número.
export function parseUnitNumber(cell: string): number | null {
  const m = cell.trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// "1:05 PM" → {h:13,mi:5}. Ojo con el 12: 12 AM = 0h, 12 PM = 12h.
export function parse12hTime(raw: string): { h: number; mi: number } | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 1 || h > 12 || mi > 59) return null;
  const pm = m[3].toUpperCase() === "PM";
  h = h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h;
  return { h, mi };
}

// offMin = Date#getTimezoneOffset() del cliente (minutos a SUMAR al local para llegar a UTC).
export function localEpoch(y: number, mo: number, d: number, h: number, mi: number, offMin: number): number {
  return Date.UTC(y, mo - 1, d, h, mi, 0) + offMin * 60000;
}
export function localNoonEpoch(y: number, mo: number, d: number, offMin: number): number {
  return localEpoch(y, mo, d, 12, 0, offMin);
}
