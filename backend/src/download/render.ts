import type { AppRelease } from "../appRelease/repository";

// Render puro de la página pública de descarga. El SVG del QR se genera en la ruta
// (async) y se inyecta ya listo; acá solo se arma el HTML.
export function renderDownloadPage(release: AppRelease, qrSvg: string): string {
  const shell = (body: string) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pulsia · descargar</title>
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
    return shell(`<h1>Pulsia</h1><p class="label">Aún no hay una versión publicada.</p>`);
  }
  const label = release.label ? `<p class="label">${release.label}</p>` : "";
  return shell(
    `<h1>Pulsia</h1>
     <p class="label">Última versión: <span class="ver">vc${release.versionCode}</span></p>
     ${label}
     <div class="qr">${qrSvg}</div>
     <a class="btn" href="${release.apkUrl}">Descargar APK</a>
     <p class="hint">Escaneá el QR desde el teléfono o tocá Descargar.</p>`,
  );
}
