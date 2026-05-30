#!/usr/bin/env node
import { Command } from "commander";
import { ZodError } from "zod";
import { runAgent } from "./agent/run.js";
import { AgentLoopError } from "./agent/toolLoop.js";
import { loadConfig } from "./config.js";
import { ModelConfigurationError, ModelRequestError } from "./llm/errors.js";
import { HttpModelProvider } from "./llm/httpProvider.js";
import { ConsoleTracer } from "./tracing/consoleTracer.js";
import { JsonlTracer } from "./tracing/jsonlTracer.js";
import { createCompositeTracer, nullTracer, type Tracer } from "./tracing/tracer.js";

const program = new Command();

program
  .name("tiny-coding-cli")
  .description("A tiny coding-agent CLI built without an LLM SDK.")
  .argument("<task...>", "the task or question to send to the agent")
  .option("-m, --model <model>", "model name")
  .option("-t, --temperature <number>", "sampling temperature", parseNumber)
  .option("--max-tokens <number>", "maximum response tokens", parseInteger)
  .option("--verbose", "print trace summaries to stderr")
  .option("--trace-file <path>", "write full trace events to a JSONL file")
  .option("--trace-raw", "print full raw trace events with --verbose")
  .action(async (taskParts: string[], options: CliOptions) => {
    try {
      const config = loadConfig();
      const task = taskParts.join(" ").trim();
      const tracer = createTracer(options);

      const provider = new HttpModelProvider({
        baseUrl: config.modelBaseUrl,
        apiKey: config.modelApiKey,
        timeoutMs: config.modelTimeoutMs,
        defaultHeaders: buildOpenRouterHeaders(config),
        tracer
      });

      const response = await runAgent({
        task,
        provider,
        model: options.model ?? config.modelName,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        workspaceRoot: process.cwd(),
        tracer
      });

      console.log(response);
    } catch (error) {
      handleCliError(error);
    }
  });

program.parseAsync().catch(handleCliError);

type CliOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
  traceFile?: string;
  traceRaw?: boolean;
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

function createTracer(options: CliOptions): Tracer {
  const tracers: Tracer[] = [];

  if (options.verbose) {
    tracers.push(
      new ConsoleTracer({
        raw: options.traceRaw
      })
    );
  }

  if (options.traceFile) {
    tracers.push(new JsonlTracer(options.traceFile));
  }

  return tracers.length > 0 ? createCompositeTracer(tracers) : nullTracer;
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

  if (error instanceof AgentLoopError) {
    console.error(`Agent error: ${error.message}`);
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
