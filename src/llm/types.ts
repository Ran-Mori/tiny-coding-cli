export type ModelToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ModelToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ModelMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ModelToolCall[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

export type GenerateOptions = {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onToken?: (token: string) => void;
  tools?: ModelToolDefinition[];
  toolChoice?: "auto" | "none";
  parallelToolCalls?: boolean;
  trace?: {
    turn?: number;
  };
};

export type GenerateResult = {
  text: string;
  message: Extract<ModelMessage, { role: "assistant" }>;
  toolCalls: ModelToolCall[];
  finishReason?: string;
  rawResponse?: string;
};
