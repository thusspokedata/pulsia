import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";

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
  // qpdf NO soporta leer de stdin ("outfile may be - ...; reading from stdin is not supported").
  // Antes le pasábamos "-" como input y fallaba con `open -: No such file or directory`, que se
  // reportaba como "¿contraseña incorrecta?" y despistaba. Escribimos el PDF a un archivo temporal
  // y le pasamos ese path como input; la salida sí puede ir a stdout ("-").
  const tmpPath = join(tmpdir(), `ecg-${randomUUID()}.pdf`);
  // mode 0600: es dato médico cifrado; evitamos que quede world-readable en /tmp compartido
  // durante la breve ventana antes del unlink.
  await writeFile(tmpPath, pdf, { mode: 0o600 });
  try {
    const proc = Bun.spawn(["qpdf", `--password=${password}`, "--decrypt", tmpPath, "-"], {
      stdout: "pipe", stderr: "pipe",
    });
    const killer = setTimeout(() => { try { proc.kill(); } catch {} }, 30_000);
    let out: ArrayBuffer, err: string, code: number;
    try {
      [out, err, code] = await Promise.all([
        new Response(proc.stdout).arrayBuffer(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
    } finally {
      clearTimeout(killer); // limpiar siempre, incluso si la recolección de stdout/stderr rechaza
    }
    if (code !== 0) {
      throw new Error("No se pudo descifrar el PDF (¿contraseña incorrecta?): " + err.slice(0, 200));
    }
    return Buffer.from(out);
  } finally {
    await unlink(tmpPath).catch(() => {}); // el temp (PDF cifrado) se borra siempre
  }
}
