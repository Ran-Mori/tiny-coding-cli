import "dotenv/config";
import { z } from "zod";

const ConfigSchema = z.object({
  modelBaseUrl: z
    .string()
    .url()
    .default("https://openrouter.ai/api/v1/chat/completions"),
  modelApiKey: z.string().min(1).optional(),
  modelName: z.string().min(1).default("deepseek/deepseek-v4-flash"),
  modelTimeoutMs: z.coerce.number().int().positive().default(60_000),
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
