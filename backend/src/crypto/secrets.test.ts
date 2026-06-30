import { test, expect } from "bun:test";
import { encryptSecret, decryptSecret } from "./secrets";

const KEY = "a".repeat(64); // 32 bytes en hex

test("round-trip encrypt/decrypt devuelve el original", () => {
  const plain = "sk-ant-xxxxxxxxxxxxxxxx";
  const cipher = encryptSecret(plain, KEY);
  expect(cipher).not.toContain(plain);
  expect(decryptSecret(cipher, KEY)).toBe(plain);
});

test("ciphertext distinto en cada llamada (IV aleatorio)", () => {
  expect(encryptSecret("hola", KEY)).not.toBe(encryptSecret("hola", KEY));
});

test("decrypt con clave incorrecta lanza error", () => {
  const cipher = encryptSecret("hola", KEY);
  expect(() => decryptSecret(cipher, "b".repeat(64))).toThrow();
});
