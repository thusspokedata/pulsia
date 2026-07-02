import { test, expect } from "bun:test";
import { loadServerEnv } from "./config";

const validEnv = {
  DATABASE_URL: "postgres://localhost/pulsia",
  ENCRYPTION_KEY: "a".repeat(64),
  INVITE_CODE: "INV",
  SESSION_TTL_DAYS: "7",
};

test("loadServerEnv devuelve la config a partir de un entorno válido", () => {
  const { databaseUrl, config } = loadServerEnv(validEnv);
  expect(databaseUrl).toBe("postgres://localhost/pulsia");
  expect(config.encryptionKey).toBe("a".repeat(64));
  expect(config.inviteCode).toBe("INV");
  expect(config.sessionTtlDays).toBe(7);
  expect(config.defaultModel).toBeTruthy();
});

test("SESSION_TTL_DAYS usa el default (4) si no está definido", () => {
  const { SESSION_TTL_DAYS: _omit, ...rest } = validEnv;
  const { config } = loadServerEnv(rest);
  expect(config.sessionTtlDays).toBe(4);
});

test("falla si falta DATABASE_URL", () => {
  const { DATABASE_URL: _omit, ...rest } = validEnv;
  expect(() => loadServerEnv(rest)).toThrow(/DATABASE_URL/);
});

test("falla si falta INVITE_CODE", () => {
  const { INVITE_CODE: _omit, ...rest } = validEnv;
  expect(() => loadServerEnv(rest)).toThrow(/INVITE_CODE/);
});

test("falla si falta ENCRYPTION_KEY", () => {
  const { ENCRYPTION_KEY: _omit, ...rest } = validEnv;
  expect(() => loadServerEnv(rest)).toThrow(/ENCRYPTION_KEY/);
});

test("falla si ENCRYPTION_KEY no es hexadecimal", () => {
  // 64 caracteres pero con símbolos no-hex: cubre la rama del regex.
  expect(() => loadServerEnv({ ...validEnv, ENCRYPTION_KEY: "g".repeat(64) })).toThrow(/ENCRYPTION_KEY/);
});

test("falla si ENCRYPTION_KEY es hex pero no mide 32 bytes", () => {
  // Hex válido de 20 caracteres: cubre la rama de longitud.
  expect(() => loadServerEnv({ ...validEnv, ENCRYPTION_KEY: "ab".repeat(10) })).toThrow(/ENCRYPTION_KEY/);
});

test("falla si SESSION_TTL_DAYS no es numérico", () => {
  expect(() => loadServerEnv({ ...validEnv, SESSION_TTL_DAYS: "abc" })).toThrow(/SESSION_TTL_DAYS/);
});

test("falla si SESSION_TTL_DAYS es <= 0", () => {
  expect(() => loadServerEnv({ ...validEnv, SESSION_TTL_DAYS: "0" })).toThrow(/SESSION_TTL_DAYS/);
});

test("agrega todos los problemas en un solo error", () => {
  let message = "";
  try {
    loadServerEnv({});
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toContain("DATABASE_URL");
  expect(message).toContain("ENCRYPTION_KEY");
  expect(message).toContain("INVITE_CODE");
});
