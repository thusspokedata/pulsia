import { test, expect } from "bun:test";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { callStructuredTool } from "./client";

const EsquemaTest = z.object({ nombre: z.string(), series: z.number() });

function fakeClient(respuesta: unknown, capture?: { req?: unknown }) {
  return {
    messages: {
      create: async (req: unknown) => {
        if (capture) capture.req = req;
        return respuesta;
      },
    },
  } as unknown as Anthropic;
}

const baseArgs = {
  model: "claude-opus-4-8",
  maxTokens: 4000,
  schema: EsquemaTest,
  toolName: "return_test",
  description: "Devuelve el objeto de prueba.",
  content: "hola",
  truncatedMsg: "La respuesta se truncó (prueba).",
  missingMsg: "La IA no devolvió el objeto de prueba.",
};

test("con un bloque tool_use válido devuelve el objeto parseado por el schema", async () => {
  const client = fakeClient({
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "pensando..." },
      { type: "tool_use", id: "tu_1", name: "return_test", input: { nombre: "sentadilla", series: 4 } },
    ],
  });
  const out = await callStructuredTool({ client, ...baseArgs });
  expect(out).toEqual({ nombre: "sentadilla", series: 4 });
});

test("con stop_reason max_tokens lanza truncatedMsg aunque haya bloque tool_use", async () => {
  const client = fakeClient({
    stop_reason: "max_tokens",
    content: [
      { type: "tool_use", id: "tu_1", name: "return_test", input: { nombre: "sentadilla", series: 4 } },
    ],
  });
  await expect(callStructuredTool({ client, ...baseArgs })).rejects.toThrow(
    "La respuesta se truncó (prueba).",
  );
});

test("sin bloque tool_use lanza missingMsg", async () => {
  const client = fakeClient({
    stop_reason: "end_turn",
    content: [{ type: "text", text: "no puedo" }],
  });
  await expect(callStructuredTool({ client, ...baseArgs })).rejects.toThrow(
    "La IA no devolvió el objeto de prueba.",
  );
});

test("arma el request con tool_choice forzado, input_schema sin $schema, model, max_tokens y content", async () => {
  const capture: { req?: any } = {};
  const client = fakeClient(
    {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tu_1", name: "return_test", input: { nombre: "x", series: 1 } }],
    },
    capture,
  );
  await callStructuredTool({ client, ...baseArgs });
  const req = capture.req;
  expect(req.model).toBe("claude-opus-4-8");
  expect(req.max_tokens).toBe(4000);
  expect(req.tool_choice).toEqual({ type: "tool", name: "return_test" });
  expect(req.tools).toHaveLength(1);
  expect(req.tools[0].name).toBe("return_test");
  expect(req.tools[0].description).toBe("Devuelve el objeto de prueba.");
  expect(req.tools[0].input_schema).not.toHaveProperty("$schema");
  expect(req.tools[0].input_schema.type).toBe("object");
  expect(req.messages).toEqual([{ role: "user", content: "hola" }]);
});

test("con un input de tool_use que no cumple el schema lanza ZodError", async () => {
  const client = fakeClient({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "tu_1", name: "return_test", input: { nombre: "sentadilla" } }],
  });
  await expect(callStructuredTool({ client, ...baseArgs })).rejects.toThrow(z.ZodError);
});
