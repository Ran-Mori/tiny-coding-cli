import type { ModelProvider } from "../llm/provider.js";
import type { Tracer } from "../tracing/tracer.js";
import { runToolLoop } from "./toolLoop.js";

export type RunAgentOptions = {
  task: string;
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  workspaceRoot: string;
  tracer?: Tracer;
};

export async function runAgent(options: RunAgentOptions): Promise<string> {
  return runToolLoop({
    task: options.task,
    provider: options.provider,
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    workspaceRoot: options.workspaceRoot,
    tracer: options.tracer
  });
}
