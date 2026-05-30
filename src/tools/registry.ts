import { listFilesTool } from "./listFiles.js";
import { readFileTool } from "./readFile.js";
import { searchTool } from "./search.js";
import type { ModelToolDefinition } from "../llm/types.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./types.js";
import { nullTracer, type Tracer } from "../tracing/tracer.js";

const tools = [listFilesTool, readFileTool, searchTool] as const;

export type ToolName = (typeof tools)[number]["name"];

export type ToolRegistry = Map<string, ToolDefinition<unknown, unknown>>;

export function createToolRegistry(): ToolRegistry {
  return new Map(
    tools.map((tool) => [
      tool.name,
      tool as ToolDefinition<unknown, unknown>
    ])
  );
}

export function describeTools(): string {
  return tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");
}

export function createModelToolDefinitions(): ModelToolDefinition[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

export async function executeToolCall(
  registry: ToolRegistry,
  context: ToolContext,
  toolName: string,
  input: unknown,
  options: {
    turn?: number;
    tracer?: Tracer;
  } = {}
): Promise<ToolResult> {
  const tracer = options.tracer ?? nullTracer;
  const startTime = Date.now();
  const tool = registry.get(toolName);

  await tracer.emit({
    type: "tool_start",
    turn: options.turn,
    tool: toolName,
    input
  });

  if (!tool) {
    const result = {
      tool: toolName,
      input,
      error: `Unknown tool "${toolName}".`
    };

    await tracer.emit({
      type: "tool_error",
      turn: options.turn,
      tool: toolName,
      input,
      error: result.error,
      durationMs: Date.now() - startTime
    });

    return result;
  }

  const parsedInput = tool.inputSchema.safeParse(input);
  if (!parsedInput.success) {
    const result = {
      tool: toolName,
      input,
      error: parsedInput.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ")
    };

    await tracer.emit({
      type: "tool_error",
      turn: options.turn,
      tool: toolName,
      input,
      error: result.error,
      durationMs: Date.now() - startTime
    });

    return result;
  }

  try {
    const output = await tool.execute(parsedInput.data, context);
    const result = {
      tool: toolName,
      input: parsedInput.data,
      output
    };

    await tracer.emit({
      type: "tool_end",
      turn: options.turn,
      tool: toolName,
      input: parsedInput.data,
      output,
      durationMs: Date.now() - startTime
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = {
      tool: toolName,
      input: parsedInput.data,
      error: message
    };

    await tracer.emit({
      type: "tool_error",
      turn: options.turn,
      tool: toolName,
      input: parsedInput.data,
      error: message,
      durationMs: Date.now() - startTime
    });

    return result;
  }
}
