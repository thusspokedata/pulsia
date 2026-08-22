import { z } from "zod";
import type { Program, TrainingProfile } from "@pulsia/shared";
import Anthropic from "@anthropic-ai/sdk";
import {
  ProgramSchema,
  EcgAnalysisSchema,
  FoodIdentificationSchema,
  FoodMicrosEstimateSchema,
  CookingYieldEstimateSchema,
  ReportOutputSchema,
  SupplementExtractionSchema,
  AiPlanOutputSchema,
  NutrientKeySchema,
} from "@pulsia/shared";
import { buildGenerationPrompt } from "./prompt";
import { buildOneOffPrompt, type OneOffArgs } from "./oneoff";
import { buildMemoryUpdatePrompt } from "./memory";
import { buildWorkObjectiveDraftPrompt } from "./objective";
import { buildEcgPrompt } from "./ecg";
import { buildFoodPrompt, buildPickCandidatePrompt, buildSearchQueryPrompt, buildFoodMicrosPrompt, buildCookingYieldPrompt } from "./nutrition";
import { buildReportPrompt } from "./report";
import {
  buildSupplementExtractPrompt,
  buildSupplementExplainPrompt,
  buildSupplementPlanPrompt,
  buildSupplementMapPrompt,
} from "./supplements";
import type { ReportData } from "../reports/collect";

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
  draftWorkObjective?(input: {
    profile: TrainingProfile;
    memory: string;
    nutritionObjective: string;
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
  }): Promise<import("@pulsia/shared").FoodIdentification>;
  describeFood?(input: { text: string; apiKey: string }): Promise<import("@pulsia/shared").FoodIdentification>;
  // 2ª llamada del alta: elige el fdcId del candidato de USDA que mejor representa al alimento, o
  // null si ninguno sirve (forzar un match malo es peor que no matchear).
  pickUsdaCandidate?(input: {
    foodName: string;
    candidates: { fdcId: number; description: string }[];
    apiKey: string;
  }): Promise<number | null>;
  // Refresh de un alimento YA guardado: reconstruye la frase de búsqueda a partir del nombre. En el
  // alta esa frase viene dentro de la identificación; acá no hay identificación que pedir.
  usdaSearchQuery?(input: { foodName: string; apiKey: string }): Promise<string>;
  // Estima el bloque de micros de un alimento cuando USDA no sirve. Usa conocimiento + web_search.
  estimateFoodMicros?(input: {
    name: string;
    basis: import("@pulsia/shared").FoodBasis;
    apiKey: string;
  }): Promise<import("@pulsia/shared").FoodMicrosEstimate>;
  // Estima el factor de rendimiento (cocido ÷ seco) de un alimento seco. null si no aplica.
  estimateCookingYield?(input: { name: string; apiKey: string }): Promise<import("@pulsia/shared").CookingYieldEstimate>;
  extractSupplement?(input: {
    imageBase64: string;
    mediaType: string;
    apiKey: string;
  }): Promise<import("@pulsia/shared").SupplementExtraction>;
  mapSupplementComponents?(input: {
    name: string;
    servingLabel: string;
    components: { name: string; amount: number; unit: string }[];
    apiKey: string;
  }): Promise<{ unitLabel: string | null; components: { nutrientKey: string | null; amountPerUnit: number | null }[] }>;
  explainSupplement?(input: {
    supplement: { name: string; servingLabel: string; components: import("@pulsia/shared").SupplementComponent[] };
    apiKey: string;
  }): Promise<string>;
  generateReport?(input: {
    kind: import("@pulsia/shared").ReportKind;
    data: ReportData;
    apiKey: string;
  }): Promise<import("@pulsia/shared").ReportOutput>;
  generateSupplementPlan?(input: {
    catalog: Pick<import("@pulsia/shared").Supplement, "id" | "name" | "servingLabel" | "components" | "labelMaxPerDay">[];
    athleteContext: import("@pulsia/shared").AthleteContext;
    userNote?: string | null;
    apiKey: string;
  }): Promise<import("@pulsia/shared").AiPlanItem[]>;
}

const SupplementMapSchema = z.object({
  unitLabel: z.string().trim().min(1).nullable(),
  components: z.array(z.object({
    nutrientKey: NutrientKeySchema.nullable(),
    amountPerUnit: z.number().nonnegative().nullable(),
  })),
});

export async function callStructuredTool<S extends z.ZodType>({
  client, model, maxTokens, schema, toolName, description, content, truncatedMsg, missingMsg,
}: {
  client: Anthropic;
  model: string;
  maxTokens: number;
  schema: S;
  toolName: string;
  description: string;
  content: string | Anthropic.MessageParam["content"];
  truncatedMsg: string;
  missingMsg: string;
}): Promise<z.output<S>> {
  // z.toJSONSchema agrega una key "$schema" (meta) que no necesita el tool de Anthropic.
  const { $schema, ...inputSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    tools: [{ name: toolName, description, input_schema: inputSchema as any }],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "max_tokens") throw new Error(truncatedMsg);
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error(missingMsg);
  return schema.parse(block.input);
}

// Variante de callStructuredTool que HABILITA la herramienta server-side web_search. No se puede
// forzar `tool_choice` al tool custom (forzarlo bloquea la búsqueda), así que se deja en auto y se
// instruye en el prompt "buscá y DESPUÉS llamá al tool". Del content final se toma el bloque
// tool_use del tool custom por NOMBRE (el web_search deja bloques server_tool_use/web_search_tool_result
// que no son ese tool). max_tokens más alto porque los resultados de búsqueda ocupan tokens.
export async function callStructuredToolWithSearch<S extends z.ZodType>({
  client, model, maxTokens, schema, toolName, description, content, truncatedMsg, missingMsg, maxSearches = 3,
}: {
  client: Anthropic;
  model: string;
  maxTokens: number;
  schema: S;
  toolName: string;
  description: string;
  content: string | Anthropic.MessageParam["content"];
  truncatedMsg: string;
  missingMsg: string;
  maxSearches?: number;
}): Promise<z.output<S>> {
  const { $schema, ...inputSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: maxSearches } as any,
      { name: toolName, description, input_schema: inputSchema as any },
    ],
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "max_tokens") throw new Error(truncatedMsg);
  const block = res.content.find((b: any) => b.type === "tool_use" && b.name === toolName);
  if (!block || block.type !== "tool_use") throw new Error(missingMsg);
  return schema.parse(block.input);
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
    const content = oneOff
      ? buildOneOffPrompt(profile, oneOff)
      : buildGenerationPrompt(profile, historySummary, memory, progressSummary, ecgSummary);
    return callStructuredTool({
      client,
      model,
      maxTokens: 16000,
      schema: ProgramSchema,
      toolName: "return_program",
      description: "Devuelve el programa de entrenamiento generado.",
      content,
      truncatedMsg: "La respuesta de la IA se truncó por max_tokens. Reducí el alcance del programa o subí max_tokens.",
      missingMsg: "La IA no devolvió un programa estructurado",
    });
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

  async draftWorkObjective({ profile, memory, nutritionObjective, apiKey, model }: {
    profile: TrainingProfile;
    memory: string;
    nutritionObjective: string;
    apiKey: string;
    model: string;
  }): Promise<string> {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: buildWorkObjectiveDraftPrompt({ profile, memory, nutritionObjective }) }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : "";
  }

  async interpretEcg({ pdfBase64, apiKey, historySummary }: {
    pdfBase64: string;
    apiKey: string;
    historySummary?: string;
  }) {
    const client = new Anthropic({ apiKey });
    const analysis = await callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 4000,
      schema: EcgAnalysisSchema,
      toolName: "return_ecg_analysis",
      description: "Devuelve la extracción + interpretación del ECG.",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: buildEcgPrompt(historySummary) },
      ],
      truncatedMsg: "La respuesta se truncó (informe de ECG demasiado largo).",
      missingMsg: "La IA no devolvió el análisis del ECG.",
    });
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
    return callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 1024,
      schema: FoodIdentificationSchema,
      toolName: "return_food",
      description: "Identifica el alimento de la foto: macros, micros de etiqueta y frase de búsqueda.",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType as any, data: imageBase64 } },
        { type: "text", text: buildFoodPrompt("photo") },
      ],
      truncatedMsg: "La respuesta se truncó (etiqueta demasiado compleja).",
      missingMsg: "La IA no devolvió los datos del alimento.",
    });
  }

  // Camino de texto: el usuario escribe "almendra" y la IA estima. Sin bloque de imagen — que es
  // exactamente de dónde sale el ahorro frente a extractFood.
  async describeFood({ text, apiKey }: { text: string; apiKey: string }) {
    const client = new Anthropic({ apiKey });
    return callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 1024,
      schema: FoodIdentificationSchema,
      toolName: "return_food",
      description: "Identifica el alimento nombrado: macros estimados, micros de etiqueta y frase de búsqueda.",
      content: [{ type: "text", text: `${buildFoodPrompt("text")}\n\nAlimento: ${text}` }],
      truncatedMsg: "La respuesta se truncó.",
      missingMsg: "La IA no devolvió los datos del alimento.",
    });
  }

  // 2ª llamada del alta: elegir el candidato de USDA. Devuelve el fdcId elegido o null. Valida el
  // índice contra el rango de candidatos: un index alucinado (fuera de rango) se trata como "ninguno".
  async pickUsdaCandidate({ foodName, candidates, apiKey }: {
    foodName: string;
    candidates: { fdcId: number; description: string }[];
    apiKey: string;
  }): Promise<number | null> {
    if (candidates.length === 0) return null;
    const client = new Anthropic({ apiKey });
    const { index } = await callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 256,
      schema: z.object({ index: z.number().int().nullable() }),
      toolName: "pick_candidate",
      description: "Elige el candidato de USDA que mejor representa el alimento, o null si ninguno sirve.",
      content: buildPickCandidatePrompt(foodName, candidates),
      truncatedMsg: "La respuesta se truncó al elegir el candidato de USDA.",
      missingMsg: "La IA no eligió un candidato de USDA.",
    });
    if (index === null || !Number.isInteger(index) || index < 1 || index > candidates.length) return null;
    return candidates[index - 1].fdcId;
  }

  // Refresh de un alimento ya guardado: solo la frase de búsqueda, sin macros ni micros (esos ya
  // están en la base). Usa la MISMA regla que el alta (REGLA_SEARCH_QUERY).
  async usdaSearchQuery({ foodName, apiKey }: { foodName: string; apiKey: string }): Promise<string> {
    const client = new Anthropic({ apiKey });
    const out = await callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 256,
      schema: z.object({ searchQuery: z.string().trim().min(1) }),
      toolName: "return_search_query",
      description: "Devuelve la frase en inglés para buscar el alimento en las tablas de USDA.",
      content: [{ type: "text", text: `${buildSearchQueryPrompt()}\n\nAlimento: ${foodName}` }],
      truncatedMsg: "La respuesta se truncó.",
      missingMsg: "La IA no devolvió la frase de búsqueda.",
    });
    return out.searchQuery;
  }

  // Estima los micronutrientes de un alimento que USDA no cubre. Usa web_search + conocimiento; los
  // resultados de búsqueda se tratan como datos no confiables (ver buildFoodMicrosPrompt). No estima
  // macros (ya existen).
  async estimateFoodMicros({ name, basis, apiKey }: {
    name: string;
    basis: import("@pulsia/shared").FoodBasis;
    apiKey: string;
  }) {
    const client = new Anthropic({ apiKey });
    return callStructuredToolWithSearch({
      client,
      model: "claude-opus-4-8",
      maxTokens: 2048,
      schema: FoodMicrosEstimateSchema,
      toolName: "return_food_micros",
      description: "Devuelve las vitaminas, minerales y micros de etiqueta estimados del alimento.",
      content: [{ type: "text", text: buildFoodMicrosPrompt(name, basis) }],
      truncatedMsg: "La respuesta se truncó al estimar los micronutrientes.",
      missingMsg: "La IA no devolvió los micronutrientes.",
    });
  }

  // Estima el factor de rendimiento (cocido ÷ seco) de un alimento seco. null si no aplica.
  async estimateCookingYield({ name, apiKey }: { name: string; apiKey: string }) {
    const client = new Anthropic({ apiKey });
    return callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 256,
      schema: CookingYieldEstimateSchema,
      toolName: "return_cooking_yield",
      description: "Devuelve el factor de rendimiento cocido÷seco del alimento, o null si no aplica.",
      content: [{ type: "text", text: buildCookingYieldPrompt(name) }],
      truncatedMsg: "La respuesta se truncó al estimar el factor de cocción.",
      missingMsg: "La IA no devolvió el factor de cocción.",
    });
  }

  async extractSupplement({ imageBase64, mediaType, apiKey }: {
    imageBase64: string;
    mediaType: string;
    apiKey: string;
  }) {
    const client = new Anthropic({ apiKey });
    return callStructuredTool({
      client,
      // 8000 (no 2048): el response ahora trae, además del `info` (explicación libre de cada
      // componente), el mapeo por componente (nutrientKey + amountPerUnit) y el unitLabel. En una
      // etiqueta multi-componente eso supera 2048 → stop_reason max_tokens → truncado. Verificado
      // en los logs de prod ("La respuesta se truncó (etiqueta demasiado compleja)").
      model: "claude-opus-4-8",
      maxTokens: 8000,
      schema: SupplementExtractionSchema,
      toolName: "return_supplement",
      description: "Devuelve los datos del suplemento de la foto.",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType as any, data: imageBase64 } },
        { type: "text", text: buildSupplementExtractPrompt() },
      ],
      truncatedMsg: "La respuesta se truncó (etiqueta demasiado compleja).",
      missingMsg: "La IA no devolvió los datos del suplemento.",
    });
  }

  async mapSupplementComponents({ name, servingLabel, components, apiKey }: {
    name: string; servingLabel: string; components: { name: string; amount: number; unit: string }[]; apiKey: string;
  }) {
    const client = new Anthropic({ apiKey });
    const out = await callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 2048,
      schema: SupplementMapSchema,
      toolName: "return_supplement_map",
      description: "Devuelve el mapeo canónico de cada componente del suplemento.",
      content: [{ type: "text", text: buildSupplementMapPrompt({ name, servingLabel, components }) }],
      truncatedMsg: "La respuesta se truncó al mapear los componentes.",
      missingMsg: "La IA no devolvió el mapeo de componentes.",
    });
    return out;
  }

  async explainSupplement({ supplement, apiKey }: {
    supplement: { name: string; servingLabel: string; components: import("@pulsia/shared").SupplementComponent[] };
    apiKey: string;
  }) {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      messages: [{ role: "user", content: [{ type: "text", text: buildSupplementExplainPrompt(supplement) }] }],
    });
    if (res.stop_reason === "max_tokens") {
      throw new Error("La respuesta se truncó (etiqueta demasiado compleja).");
    }
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    if (!text) {
      throw new Error("La IA no devolvió la explicación.");
    }
    return text;
  }

  async generateReport({ kind, data, apiKey }: {
    kind: import("@pulsia/shared").ReportKind;
    data: ReportData;
    apiKey: string;
  }) {
    const client = new Anthropic({ apiKey });
    return callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 4000,
      schema: ReportOutputSchema,
      toolName: "return_report",
      description: "Devuelve el informe + notas para la memoria.",
      content: [{ type: "text", text: buildReportPrompt(kind, data) }],
      truncatedMsg: "La respuesta se truncó (período con demasiados datos).",
      missingMsg: "La IA no devolvió el informe.",
    });
  }

  async generateSupplementPlan({ catalog, athleteContext, userNote, apiKey }: {
    catalog: Pick<import("@pulsia/shared").Supplement, "id" | "name" | "servingLabel" | "components" | "labelMaxPerDay">[];
    athleteContext: import("@pulsia/shared").AthleteContext;
    userNote?: string | null;
    apiKey: string;
  }) {
    const client = new Anthropic({ apiKey });
    const plan = await callStructuredTool({
      client,
      model: "claude-opus-4-8",
      maxTokens: 4000,
      schema: AiPlanOutputSchema,
      toolName: "return_supplement_plan",
      description: "Devuelve el plan de tomas.",
      content: [{ type: "text", text: buildSupplementPlanPrompt({ catalog, athleteContext, userNote }) }],
      truncatedMsg: "La respuesta se truncó (demasiados suplementos).",
      missingMsg: "La IA no devolvió el plan.",
    });
    return plan.items;
  }
}
