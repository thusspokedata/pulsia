import { test, expect } from "bun:test";
import { hashPassword, verifyPassword } from "./passwords";

test("hash + verify round-trip", async () => {
  const hash = await hashPassword("secret123");
  expect(hash).not.toBe("secret123");
  expect(await verifyPassword("secret123", hash)).toBe(true);
});

test("verify rechaza password incorrecta", async () => {
  const hash = await hashPassword("secret123");
  expect(await verifyPassword("otra", hash)).toBe(false);
});
