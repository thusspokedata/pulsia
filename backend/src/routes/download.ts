import { Hono } from "hono";
import QRCode from "qrcode";
import { getLatestRelease } from "../appRelease/repository";
import { renderDownloadPage, isSafeApkUrl } from "../download/render";
import type { AppDeps } from "../app";

// Página pública de descarga. NO va detrás de `auth` (se registra fuera de la lista de
// prefijos con middleware en app.ts). El QR apunta al APK directo y se regenera con la
// última versión en cada carga.
export function downloadRoutes(deps: AppDeps) {
  const r = new Hono();
  r.get("/", async (c) => {
    const release = await getLatestRelease(deps.db);
    // QR best-effort: un apkUrl patológico (largo/capacidad) podría hacer throw; en ese caso
    // servimos la página sin QR en vez de un 500 (consistente con el fallback de URL inválida).
    let qrSvg = "";
    if (release && isSafeApkUrl(release.apkUrl)) {
      try {
        qrSvg = await QRCode.toString(release.apkUrl, { type: "svg", margin: 1 });
      } catch {
        qrSvg = "";
      }
    }
    return c.html(renderDownloadPage(release, qrSvg));
  });
  return r;
}
