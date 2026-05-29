#!/usr/bin/env node
import { Command } from "commander";
import { ZodError } from "zod";
import { runAgent } from "./agent/run.js";
import { loadConfig } from "./config.js";
import { ModelConfigurationError, ModelRequestError } from "./llm/errors.js";
import { HttpModelProvider } from "./llm/httpProvider.js";

const program = new Command();

program
  .name("tiny-coding-cli")
  .description("A tiny coding-agent CLI built without an LLM SDK.")
  .argument("<task...>", "the task or question to send to the agent")
  .option("-m, --model <model>", "model name")
  .option("-t, --temperature <number>", "sampling temperature", parseNumber)
  .option("--max-tokens <number>", "maximum response tokens", parseInteger)
  .action(async (taskParts: string[], options: CliOptions) => {
    try {
      const config = loadConfig();
      const task = taskParts.join(" ").trim();

      const provider = new HttpModelProvider({
        baseUrl: config.modelBaseUrl,
        apiKey: config.modelApiKey,
        timeoutMs: config.modelTimeoutMs,
        defaultHeaders: buildOpenRouterHeaders(config)
      });

      const response = await runAgent({
        task,
        provider,
        model: options.model ?? config.modelName,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: config.modelStream,
        onToken: config.modelStream
          ? (token) => {
              process.stdout.write(token);
            }
          : undefined
      });

      if (config.modelStream) {
        process.stdout.write("\n");
      } else {
        console.log(response);
      }
    } catch (error) {
      handleCliError(error);
    }
  });

program.parseAsync().catch(handleCliError);

type CliOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

type OpenRouterHeaderConfig = {
  openRouterSiteUrl?: string;
  openRouterAppName?: string;
};

function buildOpenRouterHeaders(
  config: OpenRouterHeaderConfig
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (config.openRouterSiteUrl) {
    headers["HTTP-Referer"] = config.openRouterSiteUrl;
  }

  if (config.openRouterAppName) {
    headers["X-Title"] = config.openRouterAppName;
  }

  return headers;
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a number, received "${value}".`);
  }

  return parsed;
}

function parseInteger(value: string): number {
  const parsed = parseNumber(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received "${value}".`);
  }

  return parsed;
}

function handleCliError(error: unknown): void {
  if (error instanceof ModelConfigurationError) {
    console.error(`Configuration error: ${error.message}`);
    process.exit(1);
  }

  if (error instanceof ModelRequestError) {
    console.error(`Model error: ${error.message}`);
    if (error.responseBody) {
      console.error(error.responseBody);
    }
    process.exit(1);
  }

  if (error instanceof ZodError) {
    console.error("Configuration error:");
    console.error(error.issues.map((issue) => `- ${issue.message}`).join("\n"));
    process.exit(1);
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unexpected error: ${message}`);
  process.exit(1);
}
