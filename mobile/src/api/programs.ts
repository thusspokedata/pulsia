import { apiFetch } from "./client";
import { ProgramSchema, type Program, type TrainingProfile } from "@pulsia/shared";

export type GenerationErrorCode = "noApiKey" | "aiError" | "network" | "timeout" | "invalid";

// La generación es síncrona y hoy tarda ~130s (2 semanas × 6 días × gym+casa).
// El timeout tiene que superarla con margen; el backend puede tardar más según el modelo.
const GENERATION_TIMEOUT_MS = 240000;

export class GenerationError extends Error {
  code: GenerationErrorCode;
  constructor(code: GenerationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function generateProgram(
  baseUrl: string,
  profile: TrainingProfile,
): Promise<{ id: string; program: Program }> {
  let res: Response;
  try {
    res = await apiFetch(baseUrl, "/programs/generate", {
      method: "POST",
      body: JSON.stringify(profile),
      timeoutMs: GENERATION_TIMEOUT_MS,
    });
  } catch (e) {
    // apiFetch aborta con AbortError cuando se agota el timeout: el backend sí respondía,
    // solo tardó más de la cuenta. No confundir con "no hay conexión".
    if (e instanceof Error && e.name === "AbortError") {
      throw new GenerationError(
        "timeout",
        "La generación está tardando más de lo esperado. Probá reintentar en un momento.",
      );
    }
    throw new GenerationError("network", "No se pudo conectar con el backend.");
  }
  if (res.status === 400) throw new GenerationError("noApiKey", "No hay API key de IA configurada.");
  if (!res.ok) throw new GenerationError("aiError", "La IA no pudo generar el programa. Reintentá.");
  let body: { id: string; program: unknown };
  try {
    body = await res.json();
  } catch {
    throw new GenerationError("invalid", "El backend devolvió una respuesta inválida.");
  }
  const parsed = ProgramSchema.safeParse(body.program);
  if (!parsed.success) throw new GenerationError("invalid", "El programa recibido es inválido.");
  return { id: body.id, program: parsed.data };
}
