import type { Program, TrainingProfile } from "@pulsia/shared";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ProgramSchema } from "@pulsia/shared";
import { buildGenerationPrompt } from "./prompt";

export interface AiClient {
  generateProgram(input: {
    profile: TrainingProfile;
    apiKey: string;
    model: string;
  }): Promise<Program>;
}

export class AnthropicAiClient implements AiClient {
  async generateProgram({ profile, apiKey, model }: {
    profile: TrainingProfile;
    apiKey: string;
    model: string;
  }): Promise<Program> {
    const client = new Anthropic({ apiKey });
    const tool = {
      name: "return_program",
      description: "Devuelve el programa de entrenamiento generado.",
      input_schema: zodToJsonSchema(ProgramSchema, { target: "openApi3" }) as any,
    };
    const res = await client.messages.create({
      model,
      max_tokens: 16000,
      tools: [tool],
      tool_choice: { type: "tool", name: "return_program" },
      messages: [{ role: "user", content: buildGenerationPrompt(profile) }],
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
}
