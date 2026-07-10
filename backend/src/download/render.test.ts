import { test, expect } from "bun:test";
import { renderDownloadPage } from "./render";

test("con release: incluye la versión, el label, el link al APK y el QR svg", () => {
  const html = renderDownloadPage(
    { versionCode: 8, apkUrl: "https://x.test/pulsia-vc8.apk", label: "vc8 con login" },
    "<svg id='qr'></svg>",
  );
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("vc8");
  expect(html).toContain("vc8 con login");
  expect(html).toContain("https://x.test/pulsia-vc8.apk");
  expect(html).toContain("<svg id='qr'>");
  expect(html).toContain("Descargar");
});

test("sin release (null): mensaje amable, sin link ni QR", () => {
  const html = renderDownloadPage(null, "");
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("Aún no hay");
  expect(html).not.toContain("<a ");
});
