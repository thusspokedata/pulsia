import { expect, test } from "bun:test";
import {
  assertPublicHostname,
  isBlockedAddress,
  makeValidatingLookup,
  PageFetchError,
  safeFetchPage,
  SsrfBlockedError,
} from "./safeFetch";

// Promisifica el lookup validador (callback-style de node) para poder assertear cómodo.
function runLookup(
  fn: ReturnType<typeof makeValidatingLookup>,
  hostname: string,
  options: unknown,
): Promise<{ address?: string | { address: string; family: number }[]; family?: number }> {
  return new Promise((resolve, reject) => {
    fn(hostname, options, (err, address, family) => {
      if (err) reject(err);
      else resolve({ address, family });
    });
  });
}

// ---------------------------------------------------------------------------
// isBlockedAddress — chequeo PURO de rangos
// ---------------------------------------------------------------------------
test("isBlockedAddress: bloquea rangos privados/loopback/metadata (v4 y v6)", () => {
  const blocked = [
    "127.0.0.1", // loopback
    "10.1.2.3", // 10/8 privada
    "172.16.0.1", // 172.16/12 borde inferior
    "172.31.255.255", // 172.16/12 borde superior
    "192.168.1.1", // 192.168/16 privada
    "169.254.169.254", // link-local + metadata cloud
    "0.0.0.0", // "this host"
    "100.64.0.1", // CGNAT 100.64/10
    "::1", // loopback v6
    "::", // unspecified v6
    "fc00::1", // ULA v6
    "fe80::1", // link-local v6
    "::ffff:127.0.0.1", // IPv4-mapped a loopback
  ];
  for (const ip of blocked) {
    expect(isBlockedAddress(ip)).toBe(true);
  }
});

test("isBlockedAddress: deja pasar IPs públicas", () => {
  const ok = [
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1", // justo fuera de 172.16/12 por abajo
    "172.32.0.1", // justo fuera de 172.16/12 por arriba
    "11.0.0.1", // fuera de 10/8
    "2606:4700::1", // v6 pública (Cloudflare)
    "::ffff:808:808", // IPv4-mapped hex de 8.8.8.8 → pública
  ];
  for (const ip of ok) {
    expect(isBlockedAddress(ip)).toBe(false);
  }
});

// IPv4-mapped IPv6 en forma HEX: `new URL("http://[::ffff:127.0.0.1]/")` canonicaliza el host a
// `::ffff:7f00:1`, así que esa es la forma que realmente llega — y sin el fix se colaba a loopback.
test("isBlockedAddress: bloquea IPv4-mapped IPv6 en forma hex (embebida privada)", () => {
  const blocked = [
    "::ffff:7f00:1", // 127.0.0.1
    "::ffff:127.0.0.1", // misma, forma dotted
    "::ffff:a00:1", // 10.0.0.1
    "::ffff:c0a8:1", // 192.168.0.1
    "::ffff:a9fe:a9fe", // 169.254.169.254 metadata
    "::ffff:1", // 0.0.0.1 (0/8)
    "::ffff:zz", // tail no-hex → conservador, bloquear
  ];
  for (const ip of blocked) {
    expect(isBlockedAddress(ip)).toBe(true);
  }
});

test("isBlockedAddress: bloquea multicast (224/4) y reservado (240/4)", () => {
  for (const ip of ["224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255"]) {
    expect(isBlockedAddress(ip)).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// assertPublicHostname — resuelve y valida TODAS las IPs
// ---------------------------------------------------------------------------
test("assertPublicHostname: hostname que resuelve a IP pública → ok", async () => {
  const ips = await assertPublicHostname("ejemplo.com", async () => [{ address: "8.8.8.8" }]);
  expect(ips).toEqual(["8.8.8.8"]);
});

test("assertPublicHostname: hostname que resuelve a IP privada → SsrfBlockedError", async () => {
  await expect(
    assertPublicHostname("interno.local", async () => [
      { address: "8.8.8.8" },
      { address: "10.0.0.5" }, // una privada entre varias → bloquea igual
    ]),
  ).rejects.toBeInstanceOf(SsrfBlockedError);
});

test("assertPublicHostname: IP literal privada directa → SsrfBlockedError", async () => {
  await expect(assertPublicHostname("127.0.0.1")).rejects.toBeInstanceOf(SsrfBlockedError);
});

test("assertPublicHostname: IP literal pública directa → ok sin DNS", async () => {
  let llamado = false;
  const ips = await assertPublicHostname("8.8.8.8", async () => {
    llamado = true;
    return [{ address: "10.0.0.1" }];
  });
  expect(ips).toEqual(["8.8.8.8"]);
  expect(llamado).toBe(false); // una IP literal no dispara DNS
});

// ---------------------------------------------------------------------------
// makeValidatingLookup — el lookup que PINEA la IP validada (cierra DNS-rebinding)
// ---------------------------------------------------------------------------
test("makeValidatingLookup: IP pública → devuelve la IP validada (single y all)", async () => {
  const fn = makeValidatingLookup(async () => [{ address: "8.8.8.8", family: 4 }]);
  expect(await runLookup(fn, "ejemplo.com", { all: false })).toEqual({ address: "8.8.8.8", family: 4 });
  expect(await runLookup(fn, "ejemplo.com", { all: true })).toEqual({
    address: [{ address: "8.8.8.8", family: 4 }],
    family: undefined,
  });
});

test("makeValidatingLookup: prefiere v4 cuando hay ambas", async () => {
  const fn = makeValidatingLookup(async () => [
    { address: "2606:4700::1", family: 6 },
    { address: "1.1.1.1", family: 4 },
  ]);
  expect(await runLookup(fn, "ejemplo.com", { all: false })).toEqual({ address: "1.1.1.1", family: 4 });
});

test("makeValidatingLookup: cualquier IP privada → SsrfBlockedError (no conecta)", async () => {
  const fn = makeValidatingLookup(async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 }, // rebinding: una privada entre las resueltas
  ]);
  await expect(runLookup(fn, "malo.com", { all: false })).rejects.toBeInstanceOf(SsrfBlockedError);
});

test("makeValidatingLookup: sin IPs o resolver que falla → SsrfBlockedError", async () => {
  const vacio = makeValidatingLookup(async () => []);
  await expect(runLookup(vacio, "x.com", {})).rejects.toBeInstanceOf(SsrfBlockedError);
  const roto = makeValidatingLookup(async () => {
    throw new Error("dns down");
  });
  await expect(runLookup(roto, "x.com", {})).rejects.toBeInstanceOf(SsrfBlockedError);
});

// ---------------------------------------------------------------------------
// safeFetchPage — orquestación con fetch + lookup inyectados
// ---------------------------------------------------------------------------
const pubLookup = async () => [{ address: "8.8.8.8" }];

test("safeFetchPage: protocolo no http → PageFetchError, sin fetch", async () => {
  let llamado = false;
  await expect(
    safeFetchPage("ftp://x.com/f", {
      fetchImpl: (async () => {
        llamado = true;
        return new Response("x");
      }) as unknown as typeof fetch,
      lookupImpl: pubLookup,
    }),
  ).rejects.toBeInstanceOf(PageFetchError);
  expect(llamado).toBe(false);
});

test("safeFetchPage: host que resuelve a IP privada → SsrfBlockedError y NO fetchea", async () => {
  let llamado = false;
  await expect(
    safeFetchPage("http://interno.local/f", {
      fetchImpl: (async () => {
        llamado = true;
        return new Response("x");
      }) as unknown as typeof fetch,
      lookupImpl: async () => [{ address: "192.168.1.10" }],
    }),
  ).rejects.toBeInstanceOf(SsrfBlockedError);
  expect(llamado).toBe(false);
});

test("safeFetchPage: host IPv4-mapped IPv6 a loopback → SsrfBlockedError y NO fetchea", async () => {
  let llamado = false;
  await expect(
    safeFetchPage("http://[::ffff:127.0.0.1]/f", {
      fetchImpl: (async () => {
        llamado = true;
        return new Response("x");
      }) as unknown as typeof fetch,
    }),
  ).rejects.toBeInstanceOf(SsrfBlockedError);
  expect(llamado).toBe(false);
});

test("safeFetchPage: redirect hacia un host privado → SsrfBlockedError en ese hop", async () => {
  const fetchImpl = (async (url: string) => {
    if (new URL(url).hostname === "publico.com") {
      return new Response(null, { status: 302, headers: { location: "http://interno.local/x" } });
    }
    return new Response("no debería llegar acá");
  }) as unknown as typeof fetch;
  const lookupImpl = async (h: string) =>
    h === "publico.com" ? [{ address: "8.8.8.8" }] : [{ address: "10.0.0.9" }];
  await expect(
    safeFetchPage("http://publico.com/", { fetchImpl, lookupImpl }),
  ).rejects.toBeInstanceOf(SsrfBlockedError);
});

test("safeFetchPage: 200 con body → devuelve el texto", async () => {
  const fetchImpl = (async () =>
    new Response("<html>hola</html>", { status: 200 })) as unknown as typeof fetch;
  const out = await safeFetchPage("http://publico.com/", { fetchImpl, lookupImpl: pubLookup });
  expect(out).toBe("<html>hola</html>");
});

test("safeFetchPage: status 404 → PageFetchError", async () => {
  const fetchImpl = (async () =>
    new Response("nope", { status: 404 })) as unknown as typeof fetch;
  await expect(
    safeFetchPage("http://publico.com/", { fetchImpl, lookupImpl: pubLookup }),
  ).rejects.toBeInstanceOf(PageFetchError);
});

test("safeFetchPage: body más grande que maxBytes → cortado a maxBytes", async () => {
  const big = "a".repeat(50);
  const fetchImpl = (async () => new Response(big, { status: 200 })) as unknown as typeof fetch;
  const out = await safeFetchPage("http://publico.com/", {
    fetchImpl,
    lookupImpl: pubLookup,
    maxBytes: 10,
  });
  expect(out.length).toBe(10);
});

test("safeFetchPage: demasiados redirects → PageFetchError", async () => {
  // Siempre redirige a un host público distinto → se agota maxRedirects.
  const fetchImpl = (async () =>
    new Response(null, {
      status: 301,
      headers: { location: "http://publico.com/otra" },
    })) as unknown as typeof fetch;
  await expect(
    safeFetchPage("http://publico.com/", {
      fetchImpl,
      lookupImpl: pubLookup,
      maxRedirects: 2,
    }),
  ).rejects.toBeInstanceOf(PageFetchError);
});
