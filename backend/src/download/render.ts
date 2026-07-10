import type { AppRelease } from "../appRelease/repository";

// Escapa texto para HTML (incluye comillas → seguro también en atributos).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Solo http/https para el APK (evita javascript: u otros esquemas aunque el valor venga
// del PUT admin-gated: defensa en profundidad).
export function isSafeApkUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

// Render puro de la página pública de descarga. El SVG del QR se genera en la ruta
// (async) y se inyecta ya listo; acá solo se arma el HTML.
export function renderDownloadPage(release: AppRelease, qrSvg: string): string {
  const shell = (title: string, body: string) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #FBF7F4;
    color: #2A211C; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 380px; width: 100%;
    text-align: center; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .ver { color: #D85A30; font-weight: 700; }
  .label { color: #7A6E66; font-size: 14px; margin: 0 0 20px; }
  .qr { width: 200px; height: 200px; margin: 0 auto 20px; }
  .qr svg { width: 100%; height: 100%; }
  a.btn { display: inline-block; background: #D85A30; color: #fff; text-decoration: none;
    font-weight: 600; padding: 14px 28px; border-radius: 12px; }
  .hint { color: #7A6E66; font-size: 12px; margin-top: 16px; }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;

  if (!release) {
    return shell("Pulsia · descargar", `<h1>Pulsia</h1><p class="label">Aún no hay una versión publicada.</p>`);
  }
  const title = `Pulsia · última versión vc${release.versionCode}`;
  const label = release.label ? `<p class="label">${escapeHtml(release.label)}</p>` : "";
  const downloadBlock = isSafeApkUrl(release.apkUrl)
    ? `<div class="qr">${qrSvg}</div>
     <a class="btn" href="${escapeHtml(release.apkUrl)}">Descargar APK</a>
     <p class="hint">Escaneá el QR desde el teléfono o tocá Descargar.</p>`
    : `<p class="hint">La URL de descarga configurada no es válida.</p>`;
  return shell(
    title,
    `<h1>Pulsia</h1>
     <p class="label">Última versión: <span class="ver">vc${release.versionCode}</span></p>
     ${label}
     ${downloadBlock}`,
  );
}
