import { z } from "zod";
import type { Program, TrainingProfile } from "@pulsia/shared";
import Anthropic from "@anthropic-ai/sdk";
import { ProgramSchema } from "@pulsia/shared";
import { buildGenerationPrompt } from "./prompt";
import { buildOneOffPrompt, type OneOffArgs } from "./oneoff";
import { buildMemoryUpdatePrompt } from "./memory";

export interface AiClient {
  generateProgram(input: {
    profile: TrainingProfile;
    apiKey: string;
    model: string;
    historySummary?: string;
    memory?: string;
    oneOff?: OneOffArgs;
  }): Promise<Program>;
  updateMemory?(input: {
    current: string;
    historySummary: string;
    apiKey: string;
    model: string;
  }): Promise<string>;
}

export class AnthropicAiClient implements AiClient {
  async generateProgram({ profile, apiKey, model, historySummary, memory, oneOff }: {
    profile: TrainingProfile;
    apiKey: string;
    model: string;
    historySummary?: string;
    memory?: string;
    oneOff?: OneOffArgs;
  }): Promise<Program> {
    const client = new Anthropic({ apiKey });
    // z.toJSONSchema agrega una key "$schema" (meta) que no necesita el tool de Anthropic.
    const { $schema, ...inputSchema } = z.toJSONSchema(ProgramSchema) as Record<string, unknown>;
    const tool = {
      name: "return_program",
      description: "Devuelve el programa de entrenamiento generado.",
      input_schema: inputSchema as any,
    };
    const content = oneOff
      ? buildOneOffPrompt(profile, oneOff)
      : buildGenerationPrompt(profile, historySummary, memory);
    const res = await client.messages.create({
      model,
      max_tokens: 16000,
      tools: [tool],
      tool_choice: { type: "tool", name: "return_program" },
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "max_tokens") {
      throw new Error(
        "La respuesta de la IA se truncó por max_tokens. Reducí el alcance del programa o subí max_tokens.",
      );
    }
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("La IA no devolvió un programa estructurado");
    }
    return ProgramSchema.parse(block.input);
  }

  async updateMemory({ current, historySummary, apiKey, model }: {
    current: string;
    historySummary: string;
    apiKey: string;
    model: string;
  }): Promise<string> {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: buildMemoryUpdatePrompt(current, historySummary) }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    return text || current;
  }
}
