import type { Tracer } from "./tracer.js";
import type { TraceEvent } from "./types.js";

export type ConsoleTracerOptions = {
  raw?: boolean;
};

export class ConsoleTracer implements Tracer {
  private readonly raw: boolean;

  constructor(options: ConsoleTracerOptions = {}) {
    this.raw = options.raw ?? false;
  }

  emit(event: TraceEvent): void {
    console.error(formatSummary(event));

    if (this.raw) {
      console.error(JSON.stringify(event, null, 2));
    }
  }
}

function formatSummary(event: TraceEvent): string {
  switch (event.type) {
    case "run_start":
      return `[run] start model=${event.model} workspace=${event.workspaceRoot}`;
    case "run_end":
      return `[run] ${event.status} turns=${event.turns} duration=${event.durationMs}ms`;
    case "llm_request":
      return `[llm:${event.turn}] request -> ${event.model}, messages=${event.messages.length}`;
    case "llm_response":
      return `[llm:${event.turn}] response <- ${event.durationMs}ms, chars=${event.rawText.length}`;
    case "model_decision":
      return `[agent:${event.turn}] decision ${summarize(event.decision)}`;
    case "parse_error":
      return `[agent:${event.turn}] parse error ${event.error}`;
    case "tool_start":
      return `[tool${formatTurn(event.turn)}] ${event.tool} start input=${summarize(event.input)}`;
    case "tool_end":
      return `[tool${formatTurn(event.turn)}] ${event.tool} end ${event.durationMs}ms output=${summarize(event.output)}`;
    case "tool_error":
      return `[tool${formatTurn(event.turn)}] ${event.tool} error ${event.durationMs}ms ${event.error}`;
    case "http_request":
      return `[http${formatTurn(event.turn)}] ${event.method} ${event.url}`;
    case "http_response":
      return `[http${formatTurn(event.turn)}] response status=${event.status} duration=${event.durationMs}ms chars=${event.body.length}`;
    case "http_error":
      return `[http${formatTurn(event.turn)}] error ${event.durationMs}ms ${event.error}`;
  }
}

function formatTurn(turn: number | undefined): string {
  return turn === undefined ? "" : `:${turn}`;
}

function summarize(value: unknown): string {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 0);

  if (text === undefined) {
    return "undefined";
  }

  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}
