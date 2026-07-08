import { test, expect } from "bun:test";
import { resolveAiKey } from "./resolveKey";
import { encryptSecret } from "../crypto/secrets";

const KEY = "a".repeat(64);

test("usa la key del usuario cuando está seteada", () => {
  const enc = encryptSecret("sk-user", KEY);
  expect(resolveAiKey({ aiApiKeyEncrypted: enc }, { encryptionKey: KEY, defaultAiApiKey: "sk-server" })).toBe("sk-user");
});

test("cae a la key del server cuando el usuario no tiene", () => {
  expect(resolveAiKey(null, { encryptionKey: KEY, defaultAiApiKey: "sk-server" })).toBe("sk-server");
  expect(resolveAiKey({ aiApiKeyEncrypted: null }, { encryptionKey: KEY, defaultAiApiKey: "sk-server" })).toBe("sk-server");
});

test("null cuando no hay ni user ni server key", () => {
  expect(resolveAiKey(null, { encryptionKey: KEY })).toBeNull();
});
