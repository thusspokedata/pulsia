import { z } from "zod";
import type { Program, TrainingProfile } from "@pulsia/shared";
import Anthropic from "@anthropic-ai/sdk";
import { ProgramSchema, EcgAnalysisSchema, FoodExtractionSchema } from "@pulsia/shared";
import { buildGenerationPrompt } from "./prompt";
import { buildOneOffPrompt, type OneOffArgs } from "./oneoff";
import { buildMemoryUpdatePrompt } from "./memory";
import { buildEcgPrompt } from "./ecg";
import { buildFoodPrompt } from "./nutrition";

export interface AiClient {
  generateProgram(input: {
    profile: TrainingProfile;
    apiKey: string;
    model: string;
    historySummary?: string;
    memory?: string;
    progressSummary?: string;
    ecgSummary?: string;
    oneOff?: OneOffArgs;
  }): Promise<Program>;
  updateMemory?(input: {
    current: string;
    historySummary: string;
    progressSummary?: string;
    apiKey: string;
    model: string;
  }): Promise<string>;
  interpretEcg?(input: {
    pdfBase64: string;
    apiKey: string;
    historySummary?: string;
  }): Promise<import("@pulsia/shared").EcgAnalysis>;
  extractFood?(input: {
    imageBase64: string;
    mediaType: string;
    apiKey: string;
  }): Promise<import("@pulsia/shared").FoodExtraction>;
}

export class AnthropicAiClient implements AiClient {
  async generateProgram({ profile, apiKey, model, historySummary, memory, progressSummary, ecgSummary, oneOff }: {
    profile: TrainingProfile;
    apiKey: string;
    model: string;
    historySummary?: string;
    memory?: string;
    progressSummary?: string;
    ecgSummary?: string;
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
      : buildGenerationPrompt(profile, historySummary, memory, progressSummary, ecgSummary);
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

  async updateMemory({ current, historySummary, progressSummary, apiKey, model }: {
    current: string;
    historySummary: string;
    progressSummary?: string;
    apiKey: string;
    model: string;
  }): Promise<string> {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: buildMemoryUpdatePrompt(current, historySummary, progressSummary) }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    return text || current;
  }

  async interpretEcg({ pdfBase64, apiKey, historySummary }: {
    pdfBase64: string;
    apiKey: string;
    historySummary?: string;
  }) {
    const client = new Anthropic({ apiKey });
    const { $schema, ...inputSchema } = z.toJSONSchema(EcgAnalysisSchema) as Record<string, unknown>;
    const tool = {
      name: "return_ecg_analysis",
      description: "Devuelve la extracción + interpretación del ECG.",
      input_schema: inputSchema as any,
    };
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      tools: [tool],
      tool_choice: { type: "tool", name: "return_ecg_analysis" },
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: buildEcgPrompt(historySummary) },
          ],
        },
      ],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("La IA no devolvió el análisis del ECG.");
    }
    const analysis = EcgAnalysisSchema.parse(block.input);
    const DISCLAIMER = "Esto no reemplaza la evaluación de un médico. Ante cualquier hallazgo preocupante, consultá a un profesional de la salud.";
    const interpretation = /m[ée]dico|profesional de la salud/i.test(analysis.interpretation)
      ? analysis.interpretation
      : `${analysis.interpretation}\n\n⚠️ ${DISCLAIMER}`;
    return { ...analysis, interpretation };
  }

  async extractFood({ imageBase64, mediaType, apiKey }: {
    imageBase64: string;
    mediaType: string;
    apiKey: string;
  }) {
    const client = new Anthropic({ apiKey });
    const { $schema, ...inputSchema } = z.toJSONSchema(FoodExtractionSchema) as Record<string, unknown>;
    const tool = {
      name: "return_food",
      description: "Devuelve los datos nutricionales del alimento de la foto.",
      input_schema: inputSchema as any,
    };
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      tools: [tool],
      tool_choice: { type: "tool", name: "return_food" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as any, data: imageBase64 } },
            { type: "text", text: buildFoodPrompt() },
          ],
        },
      ],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("La IA no devolvió los datos del alimento.");
    }
    return FoodExtractionSchema.parse(block.input);
  }
}
