// Detección simple: un PDF cifrado tiene un diccionario /Encrypt en el trailer.
export function isEncryptedPdf(pdf: Buffer): boolean {
  return pdf.toString("latin1").includes("/Encrypt");
}

// Si el PDF está cifrado, lo desbloquea con qpdf usando `password`. Si no, lo devuelve tal cual.
// Throw con mensaje claro si está cifrado y no hay password / es incorrecta.
export async function maybeDecryptPdf(pdf: Buffer, password?: string | null): Promise<Buffer> {
  if (!isEncryptedPdf(pdf)) return pdf;
  if (!password) {
    throw new Error("El PDF está protegido con contraseña. Guardá tu contraseña de Kardia en Configuración.");
  }
  const proc = Bun.spawn(["qpdf", `--password=${password}`, "--decrypt", "-", "-"], {
    stdin: pdf, stdout: "pipe", stderr: "pipe",
  });
  const killer = setTimeout(() => { try { proc.kill(); } catch {} }, 30_000);
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(killer);
  if (code !== 0) {
    throw new Error("No se pudo descifrar el PDF (¿contraseña incorrecta?): " + err.slice(0, 200));
  }
  return Buffer.from(out);
}
