import "dotenv/config";
import { z } from "zod";

const BooleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const ConfigSchema = z.object({
  modelBaseUrl: z
    .string()
    .url()
    .default("https://openrouter.ai/api/v1/chat/completions"),
  modelApiKey: z.string().min(1).optional(),
  modelName: z.string().min(1).default("deepseek/deepseek-v4-flash"),
  modelTimeoutMs: z.coerce.number().int().positive().default(60_000),
  modelStream: BooleanFromEnv.default(true),
  openRouterSiteUrl: z.string().url().optional(),
  openRouterAppName: z.string().min(1).optional()
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  return ConfigSchema.parse({
    modelBaseUrl:
      emptyToUndefined(process.env.OPENROUTER_BASE_URL) ??
      emptyToUndefined(process.env.MODEL_BASE_URL),
    modelApiKey:
      emptyToUndefined(process.env.OPENROUTER_API_KEY) ??
      emptyToUndefined(process.env.MODEL_API_KEY),
    modelName:
      emptyToUndefined(process.env.OPENROUTER_MODEL) ??
      emptyToUndefined(process.env.MODEL_NAME),
    modelTimeoutMs: emptyToUndefined(process.env.MODEL_TIMEOUT_MS),
    modelStream: emptyToUndefined(process.env.OPENROUTER_STREAM),
    openRouterSiteUrl: emptyToUndefined(process.env.OPENROUTER_SITE_URL),
    openRouterAppName: emptyToUndefined(process.env.OPENROUTER_APP_NAME)
  });
}

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
