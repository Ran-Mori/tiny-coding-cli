import type { ModelProvider } from "../llm/provider.js";
import type { ModelMessage, ModelToolCall } from "../llm/types.js";
import {
  createModelToolDefinitions,
  createToolRegistry,
  describeTools,
  executeToolCall
} from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import { nullTracer, type Tracer } from "../tracing/tracer.js";
import { buildSystemPrompt } from "./prompt.js";

const MAX_TURNS = 8;

export type RunToolLoopOptions = {
  task: string;
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  workspaceRoot: string;
  tracer?: Tracer;
};

export class AgentLoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentLoopError";
  }
}

export async function runToolLoop(
  options: RunToolLoopOptions
): Promise<string> {
  const tracer = options.tracer ?? nullTracer;
  const runStartTime = Date.now();
  let turnsCompleted = 0;
  const registry = createToolRegistry();
  const modelTools = createModelToolDefinitions();
  const toolContext: ToolContext = {
    workspaceRoot: options.workspaceRoot
  };

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(describeTools())
    },
    {
      role: "user",
      content: [
        `User task: ${options.task}`,
        `Workspace root: ${options.workspaceRoot}`,
        "Inspect the workspace with tools when needed, then answer directly."
      ].join("\n")
    }
  ];

  await tracer.emit({
    type: "run_start",
    task: options.task,
    workspaceRoot: options.workspaceRoot,
    model: options.model,
    maxTurns: MAX_TURNS
  });

  try {
    for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
      turnsCompleted = turn;
      await tracer.emit({
        type: "llm_request",
        turn,
        model: options.model,
        options: {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          stream: false
        },
        tools: modelTools,
        messages
      });

      const llmStartTime = Date.now();
      const modelResult = await options.provider.generate(messages, {
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: false,
        tools: modelTools,
        toolChoice: "auto",
        parallelToolCalls: false,
        trace: {
          turn
        }
      });

      await tracer.emit({
        type: "llm_response",
        turn,
        rawText:
          modelResult.rawResponse ??
          JSON.stringify(modelResult.message, null, 2),
        message: modelResult.message,
        toolCalls: modelResult.toolCalls,
        finishReason: modelResult.finishReason,
        durationMs: Date.now() - llmStartTime
      });

      messages.push(modelResult.message);

      await tracer.emit({
        type: "model_decision",
        turn,
        decision:
          modelResult.toolCalls.length > 0
            ? {
                type: "tool_calls",
                toolCalls: modelResult.toolCalls
              }
            : {
                type: "final",
                answer: modelResult.text
              }
      });

      if (modelResult.toolCalls.length === 0) {
        await tracer.emit({
          type: "run_end",
          status: "completed",
          durationMs: Date.now() - runStartTime,
          turns: turn,
          answer: modelResult.text
        });

        return modelResult.text;
      }

      for (const toolCall of modelResult.toolCalls) {
        const toolResultContent = await executeNativeToolCall({
          toolCall,
          registry,
          toolContext,
          turn,
          tracer
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResultContent
        });
      }
    }

    throw new AgentLoopError(
      `Agent did not finish within ${MAX_TURNS} tool-loop turns.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await tracer.emit({
      type: "run_end",
      status: "failed",
      durationMs: Date.now() - runStartTime,
      turns: turnsCompleted,
      error: message
    });

    throw error;
  }
}

async function executeNativeToolCall(options: {
  toolCall: ModelToolCall;
  registry: ReturnType<typeof createToolRegistry>;
  toolContext: ToolContext;
  turn: number;
  tracer: Tracer;
}): Promise<string> {
  const parsedArguments = parseToolArguments(options.toolCall);

  if (!parsedArguments.ok) {
    await options.tracer.emit({
      type: "parse_error",
      turn: options.turn,
      rawText: options.toolCall.function.arguments,
      error: parsedArguments.error
    });

    return JSON.stringify({
      tool: options.toolCall.function.name,
      input: options.toolCall.function.arguments,
      error: parsedArguments.error
    });
  }

  const result = await executeToolCall(
    options.registry,
    options.toolContext,
    options.toolCall.function.name,
    parsedArguments.value,
    {
      turn: options.turn,
      tracer: options.tracer
    }
  );

  return JSON.stringify(result);
}

function parseToolArguments(
  toolCall: ModelToolCall
):
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      error: string;
    } {
  if (toolCall.function.arguments.trim().length === 0) {
    return {
      ok: true,
      value: {}
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(toolCall.function.arguments)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
