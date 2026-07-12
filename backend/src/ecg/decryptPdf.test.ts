import { test, expect } from "bun:test";
import { isEncryptedPdf, maybeDecryptPdf } from "./decryptPdf";

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
