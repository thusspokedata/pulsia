import type { AppConfig } from "./app";

export interface ServerEnv {
  databaseUrl: string;
  config: AppConfig;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_SESSION_TTL_DAYS = 4;
// aes-256-gcm requiere una clave de 32 bytes, es decir 64 caracteres hex.
const ENCRYPTION_KEY_HEX_LENGTH = 64;

type Env = Record<string, string | undefined>;

function required(env: Env, name: string, problems: string[]): string {
  const value = env[name]?.trim();
  if (!value) {
    problems.push(`Falta la variable de entorno ${name}`);
    return "";
  }
  return value;
}

export function loadServerEnv(env: Env = process.env): ServerEnv {
  const problems: string[] = [];

  const databaseUrl = required(env, "DATABASE_URL", problems);
  const inviteCode = required(env, "INVITE_CODE", problems);

  const encryptionKey = required(env, "ENCRYPTION_KEY", problems);
  if (encryptionKey && !/^[0-9a-fA-F]+$/.test(encryptionKey)) {
    problems.push("ENCRYPTION_KEY debe ser una cadena hexadecimal");
  } else if (encryptionKey && encryptionKey.length !== ENCRYPTION_KEY_HEX_LENGTH) {
    problems.push(`ENCRYPTION_KEY debe tener ${ENCRYPTION_KEY_HEX_LENGTH} caracteres hex (32 bytes para aes-256-gcm)`);
  }

  let sessionTtlDays = DEFAULT_SESSION_TTL_DAYS;
  const rawTtl = env.SESSION_TTL_DAYS?.trim();
  if (rawTtl) {
    const parsed = Number(rawTtl);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      problems.push("SESSION_TTL_DAYS debe ser un número mayor que 0");
    } else {
      sessionTtlDays = parsed;
    }
  }

  if (problems.length > 0) {
    throw new Error(`Configuración de entorno inválida:\n- ${problems.join("\n- ")}`);
  }

  // Modo single-user: salta el login (usa el usuario por defecto). Para la app actual
  // sin auth; se apaga cuando entre el login multi-usuario.
  const singleUserMode = env.SINGLE_USER_MODE?.trim() === "true";

  // Token de admin/ops para PUT /app/latest (opcional; si falta, el PUT se rechaza).
  const adminToken = env.ADMIN_TOKEN?.trim() || undefined;

  return {
    databaseUrl,
    config: {
      encryptionKey,
      defaultModel: DEFAULT_MODEL,
      inviteCode,
      sessionTtlDays,
      singleUserMode,
      adminToken,
    },
  };
}
