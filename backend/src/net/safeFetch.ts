// Fetch server-side de una URL ARBITRARIA del usuario, endurecido contra SSRF (NUT-17).
//
// El usuario pega la URL de una ficha de producto y el backend la baja para extraerle los datos
// nutricionales. Bajar una URL cualquiera desde el servidor es peligroso: un atacante (o un enlace
// engañoso) podría apuntar a `http://169.254.169.254/…` (metadata de la nube), a `127.0.0.1` o a la
// LAN del self-host y hacernos hablar con servicios internos. La defensa: ANTES de conectar,
// resolvemos el hostname y verificamos que NINGUNA de sus IPs cae en un rango privado/reservado; y
// repetimos la verificación en CADA hop de redirect (un 302 puede saltar de un host público a uno
// interno).
//
// CAVEAT (DNS rebinding): validamos las IPs que `dns.lookup` resuelve, pero `fetch` vuelve a
// resolver por su cuenta al conectar, así que en teoría un DNS que responde distinto entre las dos
// resoluciones (TOCTOU) podría evadir el chequeo. Cerrarlo del todo exige conectar por IP con el
// Host header a mano (o un agente custom). Para esta app SELF-HOSTED, de un solo usuario y sin
// multi-tenancy, el riesgo es aceptable y lo dejamos documentado en vez de sobre-ingenierizar.

import { lookup as dnsLookup } from "node:dns/promises";

/** Alguna IP resuelta cae en un rango bloqueado → no fetcheamos. */
export class SsrfBlockedError extends Error {}
/** No se pudo leer la página por un motivo genérico: timeout, status !=2xx, protocolo inválido,
 *  demasiados redirects, body vacío o URL malformada. */
export class PageFetchError extends Error {}

type LookupAll = (hostname: string) => Promise<{ address: string }[]>;

// Lookup por default: TODAS las IPs (A + AAAA) del hostname. Inyectable para tests.
const defaultLookup: LookupAll = async (hostname) => {
  const res = await dnsLookup(hostname, { all: true });
  return res.map((r) => ({ address: r.address }));
};

// ---------------------------------------------------------------------------
// Parseo/clasificación de IPs — PURO y 100% testeable
// ---------------------------------------------------------------------------

// Parsea una IPv4 "a.b.c.d" a sus 4 octetos, o null si no es una v4 válida.
function parseV4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null; // sólo dígitos, 1-3 de ellos
    const n = Number(p);
    if (n > 255) return null; // octeto fuera de rango
    octets.push(n);
  }
  return octets;
}

// ¿La IPv4 (ya parseada) cae en un rango privado/reservado?
function isBlockedV4(o: number[]): boolean {
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this network" (incluye 0.0.0.0)
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 privada RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 privada RFC1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 privada RFC1918
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT (RFC6598)
  return false;
}

// ¿La IPv6 cae en un rango bloqueado? Trabajamos por prefijos de string (en minúsculas), que para
// estos rangos alcanza y evita un parser v6 completo.
function isBlockedV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1") return true; // ::1/128 loopback
  if (s === "::") return true; // ::/128 unspecified
  // fc00::/7 → ULA (direcciones privadas v6): los primeros 7 bits son 1111110, o sea el primer byte
  // es 0xfc o 0xfd → el address arranca con "fc" o "fd".
  if (/^f[cd]/.test(s)) return true;
  // fe80::/10 → link-local v6: primeros 10 bits 1111111010 → primer byte 0xfe y el nibble siguiente
  // en 0x8..0xb → arranca con "fe8", "fe9", "fea" o "feb".
  if (/^fe[89ab]/.test(s)) return true;
  return false;
}

/**
 * `true` si `ip` (string, v4 o v6) es una dirección privada, loopback, link-local, metadata o
 * reservada que NO debemos alcanzar desde el servidor. Una IPv4-mapeada en v6 (`::ffff:a.b.c.d`)
 * se evalúa por su v4 embebida. Una IP que no parsea se trata como bloqueada (conservador).
 */
export function isBlockedAddress(ip: string): boolean {
  const raw = ip.trim().toLowerCase();

  // IPv4-mapped IPv6 (::ffff:a.b.c.d): la dirección REAL es la v4 embebida; evaluá esa.
  const mapped = raw.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    const o = parseV4(mapped[1]);
    return o ? isBlockedV4(o) : true; // no parsea la embebida → bloquear
  }

  const v4 = parseV4(raw);
  if (v4) return isBlockedV4(v4);

  if (raw.includes(":")) return isBlockedV6(raw); // tiene ":" → es v6

  // No es una IP reconocible: conservador, bloquear.
  return true;
}

// Un hostname nunca lleva ":"; si lo tiene (o parsea como v4) es una IP literal.
function isIpLiteral(host: string): boolean {
  return parseV4(host) !== null || host.includes(":");
}

/**
 * Resuelve `hostname` a TODAS sus IPs y tira `SsrfBlockedError` si CUALQUIERA está bloqueada. Si el
 * hostname ya es una IP literal, la valida directo sin tocar DNS. Devuelve las IPs (la literal, o
 * las resueltas). `lookupImpl` es inyectable para tests.
 */
export async function assertPublicHostname(
  hostname: string,
  lookupImpl: LookupAll = defaultLookup,
): Promise<string[]> {
  // Un URL con host v6 llega bracketeado ("[::1]"): sacá los corchetes antes de evaluar.
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "").trim();

  if (isIpLiteral(host)) {
    if (isBlockedAddress(host)) {
      throw new SsrfBlockedError(`IP literal bloqueada: ${host}`);
    }
    return [host];
  }

  const resolved = await lookupImpl(host);
  const ips = resolved.map((r) => r.address);
  if (ips.length === 0) {
    throw new SsrfBlockedError(`el hostname no resolvió a ninguna IP: ${host}`);
  }
  for (const ip of ips) {
    if (isBlockedAddress(ip)) {
      throw new SsrfBlockedError(`${host} resuelve a una IP bloqueada: ${ip}`);
    }
  }
  return ips;
}

export interface SafeFetchOpts {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  lookupImpl?: LookupAll;
}

// Lee el body de una Response con un tope DURO de `maxBytes` bytes: preferimos el reader del stream
// para NO bajar gigas si el servidor miente en Content-Length. Si no hay stream, caemos a text().
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) {
    const t = await res.text();
    return t.slice(0, maxBytes);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      chunks.push(value);
      total += value.length;
    }
  }
  try {
    await reader.cancel(); // no seguimos bajando el resto
  } catch {
    // el stream ya podría estar cerrado; da igual
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  // subarray a maxBytes: el último chunk pudo pasarnos del tope; cortamos exacto.
  return new TextDecoder().decode(merged.subarray(0, maxBytes));
}

/**
 * Baja el HTML/texto de `rawUrl` de forma SSRF-safe. Valida el protocolo (sólo http/https), verifica
 * en cada hop que el host resuelve a IPs públicas (con `assertPublicHostname`), sigue los redirects
 * a mano (hasta `maxRedirects`), corta el body a `maxBytes` y aborta a los `timeoutMs`. Tira
 * `SsrfBlockedError` si un host apunta a una IP bloqueada, o `PageFetchError` para el resto de los
 * fallos (protocolo inválido, status !=2xx, demasiados redirects, body vacío, URL malformada).
 */
export async function safeFetchPage(rawUrl: string, opts: SafeFetchOpts = {}): Promise<string> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxRedirects = opts.maxRedirects ?? 4;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const lookupImpl = opts.lookupImpl ?? defaultLookup;

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new PageFetchError(`URL inválida: ${rawUrl}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // hop 0 = fetch inicial; hops 1..maxRedirects = redirects seguidos.
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new PageFetchError(`protocolo no soportado: ${current.protocol}`);
      }

      // ANTES de conectar: el host de ESTE hop debe resolver a IPs públicas.
      await assertPublicHostname(current.hostname, lookupImpl);

      const res = await fetchImpl(current.toString(), {
        redirect: "manual", // seguimos los redirects a mano para re-validar cada host
        signal: controller.signal,
      });
      const status = res.status;

      if (status >= 300 && status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new PageFetchError(`redirect ${status} sin Location`);
        if (hop === maxRedirects) throw new PageFetchError("demasiados redirects");
        let next: URL;
        try {
          next = new URL(loc, current); // Location puede ser absoluta o relativa
        } catch {
          throw new PageFetchError(`Location inválida en el redirect: ${loc}`);
        }
        current = next;
        continue;
      }

      if (status < 200 || status >= 300) {
        throw new PageFetchError(`status no exitoso: ${status}`);
      }

      const text = await readCapped(res, maxBytes);
      if (text.length === 0) throw new PageFetchError("body vacío");
      return text;
    }
    throw new PageFetchError("demasiados redirects");
  } finally {
    clearTimeout(timer);
  }
}
