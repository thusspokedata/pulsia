import { test, expect } from "bun:test";
import { secondWindow } from "./repository";

test("secondWindow: dos timestamps del mismo segundo comparten from", () => {
  expect(secondWindow(1784000000000).from).toBe(secondWindow(1784000000999).from);
});

test("secondWindow: un segundo de diferencia da distinto from", () => {
  expect(secondWindow(1784000000000).from).not.toBe(secondWindow(1784000001000).from);
  expect(secondWindow(1784000000999).from).not.toBe(secondWindow(1784000001000).from);
});

test("secondWindow: to es from + 999", () => {
  const w = secondWindow(1784000000123);
  expect(w.to).toBe(w.from + 999);
});
