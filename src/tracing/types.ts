import type { ModelMessage } from "../llm/types.js";

export type TraceEvent =
  | {
      type: "run_start";
      task: string;
      workspaceRoot: string;
      model: string;
      maxTurns: number;
    }
  | {
      type: "run_end";
      status: "completed" | "failed";
      durationMs: number;
      turns: number;
      answer?: string;
      error?: string;
    }
  | {
      type: "llm_request";
      turn: number;
      model: string;
      options: {
        temperature?: number;
        maxTokens?: number;
        stream?: boolean;
      };
      tools?: unknown;
      messages: ModelMessage[];
    }
  | {
      type: "llm_response";
      turn: number;
      rawText: string;
      message?: unknown;
      toolCalls?: unknown;
      finishReason?: string;
      durationMs: number;
    }
  | {
      type: "model_decision";
      turn: number;
      decision: unknown;
    }
  | {
      type: "parse_error";
      turn: number;
      rawText: string;
      error: string;
    }
  | {
      type: "tool_start";
      turn?: number;
      tool: string;
      input: unknown;
    }
  | {
      type: "tool_end";
      turn?: number;
      tool: string;
      input: unknown;
      output: unknown;
      durationMs: number;
    }
  | {
      type: "tool_error";
      turn?: number;
      tool: string;
      input: unknown;
      error: string;
      durationMs: number;
    }
  | {
      type: "http_request";
      turn?: number;
      method: string;
      url: string;
      headers: Record<string, string>;
      body: unknown;
    }
  | {
      type: "http_response";
      turn?: number;
      status: number;
      ok: boolean;
      body: string;
      durationMs: number;
    }
  | {
      type: "http_error";
      turn?: number;
      error: string;
      durationMs: number;
    };

export type TraceRecord = TraceEvent & {
  timestamp: string;
};
