import { expect, test } from "bun:test";
import { sodiumMgFromSaltG } from "./migration0022";
import { saltGFromSodiumMg } from "@pulsia/shared";

test("2.5 g de sal son 1000 mg de sodio", () => {
  expect(sodiumMgFromSaltG(2.5)).toBe(1000);
});

test("ida y vuelta: sodio -> sal -> sodio", () => {
  expect(sodiumMgFromSaltG(saltGFromSodiumMg(400) as number)).toBe(400);
});

test("sal null queda sodio null, NO 0", () => {
  expect(sodiumMgFromSaltG(null)).toBe(null);
});

// El SQL de la migración usa ROUND(): si el helper no redondeara, el test de TS pasaría igual y
// la migración haría otra cosa que el helper. 1.2345 g -> 493.8 mg, que sólo da 494 si redondea.
test("redondea a mg entero, como el ROUND() del SQL", () => {
  expect(sodiumMgFromSaltG(1.2345)).toBe(494);
});
