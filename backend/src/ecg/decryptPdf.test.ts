import { test, expect } from "bun:test";
import { isEncryptedPdf, maybeDecryptPdf } from "./decryptPdf";

// PDF de 1 página cifrado con AES-256, contraseña "test123" (generado con qpdf --encrypt).
// Sirve para verificar el descifrado real: qpdf NO lee de stdin, así que maybeDecryptPdf debe
// escribir a un archivo temporal. Con la invocación vieja (`qpdf ... - -`) este test falla con
// `open -: No such file or directory`.
const ENCRYPTED_PDF_B64 =
  "JVBERi0xLjcKJb/3ov4KMSAwIG9iago8PCAvRXh0ZW5zaW9ucyA8PCAvQURCRSA8PCAvQmFzZVZlcnNpb24gLzEuNyAvRXh0ZW5zaW9uTGV2ZWwgOCA+PiA+PiAvUGFnZXMgMiAwIFIgL1R5cGUgL0NhdGFsb2cgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcyA+PgplbmRvYmoKMyAwIG9iago8PCAvTWVkaWFCb3ggWyAwIDAgMzAwIDE0NCBdIC9QYXJlbnQgMiAwIFIgL1R5cGUgL1BhZ2UgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0NGIDw8IC9TdGRDRiA8PCAvQXV0aEV2ZW50IC9Eb2NPcGVuIC9DRk0gL0FFU1YzIC9MZW5ndGggMzIgPj4gPj4gL0ZpbHRlciAvU3RhbmRhcmQgL0xlbmd0aCAyNTYgL08gPDZmMzZiMWRkYjcxNWY2ODE2MDk2OGFmYjI0Y2ZiZTU5MGIwZDgxZDBhZWQ5ZjYyZGQ1MDRjNWVjZGRjOTk0OTk1NWE4ZTJkZTA2OTYxM2Y4NDE1ZmQxYzdmNDI1YjEyOD4gL09FIDw1Y2FiMDQ1YTZiYTkxNTJiMGU4NDMwNWMwZTkxMjA4ZDk2MGM5NjUwZmQ1Y2QyNzRlMzZiOTc0NzA5MTk3MGM4PiAvUCAtNCAvUGVybXMgPDUyNWU0ZTNhNTMxYzFjMjNlOTllZjExYTkyNWQxMGU1PiAvUiA2IC9TdG1GIC9TdGRDRiAvU3RyRiAvU3RkQ0YgL1UgPGU5ZmQ5ZTM0NGJmZWMzMDY0OGYwYmEyMzRkZGRhNTcyMjAwMTNjYmNjY2I0N2Y4OTA3ZmExZTQ3Mzg1ZmVhOTlkZGZmMzA2NzIwNzQ5YzdhNzQwZDQ2ZTk5YzA1OWYzNj4gL1VFIDw2OWJmODY0YTRhNmNjZmQ3ODdmNGEzODc3NzI2ODdkM2YzYWE1YmU0YTYzYzljZDlkNTIyY2FiNDEyN2M1OGRkPiAvViA1ID4+CmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDEzMCAwMDAwMCBuIAowMDAwMDAwMTg5IDAwMDAwIG4gCjAwMDAwMDAyNjIgMDAwMDAgbiAKdHJhaWxlciA8PCAvUm9vdCAxIDAgUiAvU2l6ZSA1IC9JRCBbPDk4YmNkMjgxM2VjMGZlNDMxZDE2ZmMwZjYzMmExYTQ1Pjw1YThiNDQ1ODg4ZGJmZTlkNTE1N2Q1Mjk1NzFlYThhOD5dIC9FbmNyeXB0IDQgMCBSID4+CnN0YXJ0eHJlZgo4MDkKJSVFT0YK";

const hasQpdf = Bun.which("qpdf") != null;

test("isEncryptedPdf: PDF sin cifrar → false", () => {
  const plain = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
  expect(isEncryptedPdf(plain)).toBe(false);
});
test("maybeDecryptPdf: sin cifrar → devuelve el mismo buffer", async () => {
  const plain = Buffer.from("%PDF-1.4\nno-encrypt-here\n");
  const out = await maybeDecryptPdf(plain, undefined);
  expect(out.equals(plain)).toBe(true);
});
test("maybeDecryptPdf: cifrado sin password → throw con mensaje claro", async () => {
  const enc = Buffer.from("%PDF-1.4\n/Encrypt 5 0 R\ntrailer\n");
  await expect(maybeDecryptPdf(enc, undefined)).rejects.toThrow(/contraseña/i);
});

// Regresión: qpdf no lee de stdin. Estos tests ejercitan el descifrado real (necesitan qpdf).
test.skipIf(!hasQpdf)("maybeDecryptPdf: cifrado + password correcta → devuelve el PDF descifrado", async () => {
  const enc = Buffer.from(ENCRYPTED_PDF_B64, "base64");
  expect(isEncryptedPdf(enc)).toBe(true);
  const out = await maybeDecryptPdf(enc, "test123");
  expect(out.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(isEncryptedPdf(out)).toBe(false); // ya no está cifrado
});
test.skipIf(!hasQpdf)("maybeDecryptPdf: cifrado + password incorrecta → throw", async () => {
  const enc = Buffer.from(ENCRYPTED_PDF_B64, "base64");
  await expect(maybeDecryptPdf(enc, "no-es-la-password")).rejects.toThrow(/contraseña|descifrar/i);
});
