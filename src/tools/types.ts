import type { z } from "zod";
import type { ModelToolDefinition } from "../llm/types.js";

export type ToolContext = {
  workspaceRoot: string;
};

export type ToolDefinition<Input, Output> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  parameters: ModelToolDefinition["function"]["parameters"];
  execute(input: Input, context: ToolContext): Promise<Output>;
};

export type ToolResult = {
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
};
