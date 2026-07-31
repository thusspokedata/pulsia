import { test, expect } from "bun:test";
import { createApp } from "./app";
import { makeTestDeps } from "./test/deps";

test("una ruta desconocida devuelve el index.html de la SPA", async () => {
  const { deps } = await makeTestDeps();
  // Se pasa un root de estáticos apuntando a un dir de fixture con un index.html conocido.
  const app = createApp({ ...deps, config: { ...deps.config, webDistDir: "backend/src/test/fixtures/webdist" } });
  const res = await app.request("/dashboard");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("<!doctype html>");
});

test("el /health sigue respondiendo JSON (no lo tapa la SPA)", async () => {
  const { deps } = await makeTestDeps();
  const app = createApp({ ...deps, config: { ...deps.config, webDistDir: "backend/src/test/fixtures/webdist" } });
  const res = await app.request("/health");
  expect(await res.json()).toEqual({ status: "ok" });
});
