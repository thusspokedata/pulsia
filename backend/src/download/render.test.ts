import { test, expect } from "bun:test";
import { renderDownloadPage } from "./render";

test("con release: incluye la versión, el label, el link al APK y el QR svg", () => {
  const html = renderDownloadPage(
    { versionCode: 8, apkUrl: "https://x.test/pulsia-vc8.apk", label: "vc8 con login" },
    "<svg id='qr'></svg>",
  );
  expect(html).toContain("<!DOCTYPE html>");
  // Anclado al span de la versión: "vc8" suelto ya viene en el apkUrl, el label y el <title>.
  expect(html).toContain('Última versión: <span class="ver">vc8</span>');
  expect(html).toContain("vc8 con login");
  expect(html).toContain("https://x.test/pulsia-vc8.apk");
  expect(html).toContain("<svg id='qr'>");
  // El botón entero: "Descargar" suelto lo ecoa el hint de abajo ("...o tocá Descargar.").
  expect(html).toContain('<a class="btn" href="https://x.test/pulsia-vc8.apk">Descargar APK</a>');
});

test("sin release (null): mensaje amable, sin link ni QR", () => {
  const html = renderDownloadPage(null, "");
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("Aún no hay");
  expect(html).not.toContain("<a ");
});

test("escapa markup en el label (no inyecta HTML)", () => {
  const html = renderDownloadPage(
    { versionCode: 8, apkUrl: "https://x.test/a.apk", label: "<script>alert(1)</script>" },
    "<svg></svg>",
  );
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("&lt;script&gt;");
});

test("apkUrl con esquema no-http (javascript:) → sin anchor, mensaje de URL inválida", () => {
  const html = renderDownloadPage(
    { versionCode: 8, apkUrl: "javascript:alert(1)", label: "" },
    "<svg></svg>",
  );
  expect(html).not.toContain("href=\"javascript:");
  expect(html).not.toContain("<a ");
  expect(html).toContain("no es válida");
});

test("con release: el <title> incluye la versión", () => {
  const html = renderDownloadPage(
    { versionCode: 8, apkUrl: "https://x.test/a.apk", label: "" },
    "<svg></svg>",
  );
  expect(html).toContain("<title>Pulsia · última versión vc8</title>");
});
