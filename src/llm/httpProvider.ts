import { ModelConfigurationError, ModelRequestError } from "./errors.js";
import type { ModelProvider } from "./provider.js";
import type {
  GenerateOptions,
  GenerateResult,
  ModelMessage,
  ModelToolCall
} from "./types.js";
import { nullTracer, type Tracer } from "../tracing/tracer.js";

type HttpModelProviderOptions = {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  defaultHeaders?: Record<string, string>;
  tracer?: Tracer;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: unknown;
    };
    finish_reason?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
};

type ChatCompletionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
};

export class HttpModelProvider implements ModelProvider {
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly tracer: Tracer;

  constructor(options: HttpModelProviderOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.tracer = options.tracer ?? nullTracer;
  }

  async generate(
    messages: ModelMessage[],
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const { baseUrl, apiKey } = this.getConfiguration();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startTime = Date.now();
    const headers = {
      ...this.defaultHeaders,
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    };
    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      stream: options.stream ?? false
    };

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    if (options.toolChoice !== undefined) {
      body.tool_choice = options.toolChoice;
    }

    if (options.parallelToolCalls !== undefined) {
      body.parallel_tool_calls = options.parallelToolCalls;
    }

    try {
      await this.tracer.emit({
        type: "http_request",
        turn: options.trace?.turn,
        method: "POST",
        url: baseUrl,
        headers,
        body
      });

      const response = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const responseBody = await response.text();
        await this.tracer.emit({
          type: "http_response",
          turn: options.trace?.turn,
          status: response.status,
          ok: response.ok,
          body: responseBody,
          durationMs: Date.now() - startTime
        });
        throw new ModelRequestError(
          `Model request failed with HTTP ${response.status}.`,
          response.status,
          responseBody
        );
      }

      if (options.stream) {
        const text = await extractStreamingAssistantText(response, options.onToken);
        await this.tracer.emit({
          type: "http_response",
          turn: options.trace?.turn,
          status: response.status,
          ok: response.ok,
          body: text,
          durationMs: Date.now() - startTime
        });

        return {
          text,
          message: {
            role: "assistant",
            content: text
          },
          toolCalls: [],
          rawResponse: text
        };
      }

      const responseBody = await response.text();
      await this.tracer.emit({
        type: "http_response",
        turn: options.trace?.turn,
        status: response.status,
        ok: response.ok,
        body: responseBody,
        durationMs: Date.now() - startTime
      });

      return extractChatCompletionResult(responseBody);
    } catch (error) {
      if (error instanceof ModelRequestError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        await this.tracer.emit({
          type: "http_error",
          turn: options.trace?.turn,
          error: `Model request timed out after ${this.timeoutMs}ms.`,
          durationMs: Date.now() - startTime
        });
        throw new ModelRequestError(
          `Model request timed out after ${this.timeoutMs}ms.`
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.tracer.emit({
        type: "http_error",
        turn: options.trace?.turn,
        error: message,
        durationMs: Date.now() - startTime
      });
      throw new ModelRequestError(`Model request failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private getConfiguration(): {
    baseUrl: string;
    apiKey: string;
  } {
    if (!this.baseUrl || !this.apiKey) {
      throw new ModelConfigurationError(
        "Model is not configured yet. Copy .env.example to .env, then set OPENROUTER_API_KEY."
      );
    }

    return {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey
    };
  }
}

async function extractStreamingAssistantText(
  response: Response,
  onToken?: (token: string) => void
): Promise<string> {
  if (!response.body) {
    throw new ModelRequestError("Streaming model response did not include a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  const handleEvent = (event: string): void => {
    for (const line of event.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const payload = trimmed.slice("data:".length).trim();
      if (payload === "[DONE]") {
        return;
      }

      const token = extractDeltaText(payload);
      if (token.length > 0) {
        fullText += token;
        onToken?.(token);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      handleEvent(event);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim().length > 0) {
    handleEvent(buffer);
  }

  if (fullText.length === 0) {
    throw new ModelRequestError("Streaming model response did not contain text.");
  }

  return fullText;
}

function extractChatCompletionResult(responseBody: string): GenerateResult {
  let data: ChatCompletionResponse;

  try {
    data = JSON.parse(responseBody) as ChatCompletionResponse;
  } catch {
    throw new ModelRequestError("Model response was not valid JSON.");
  }

  const apiError = data.error?.message;
  if (typeof apiError === "string" && apiError.length > 0) {
    throw new ModelRequestError(`Model API error: ${apiError}`);
  }

  const choice = data.choices?.[0];
  const message = choice?.message;

  if (!message) {
    throw new ModelRequestError(
      "Model response did not contain choices[0].message."
    );
  }

  const content = normalizeContent(message.content);
  const toolCalls = normalizeToolCalls(message.tool_calls);

  if ((content === null || content.length === 0) && toolCalls.length === 0) {
    throw new ModelRequestError(
      "Model response did not contain assistant content or tool_calls."
    );
  }

  const assistantMessage: GenerateResult["message"] = {
    role: "assistant",
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
  };

  return {
    text: content ?? "",
    message: assistantMessage,
    toolCalls,
    finishReason:
      typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
    rawResponse: responseBody
  };
}

function extractDeltaText(payload: string): string {
  let data: ChatCompletionStreamChunk;

  try {
    data = JSON.parse(payload) as ChatCompletionStreamChunk;
  } catch {
    throw new ModelRequestError("Streaming model response contained invalid JSON.");
  }

  const apiError = data.error?.message;
  if (typeof apiError === "string" && apiError.length > 0) {
    throw new ModelRequestError(`Model API error: ${apiError}`);
  }

  const content = data.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
}

function normalizeContent(content: unknown): string | null {
  if (content === null || content === undefined) {
    return null;
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
          ? part.text
          : ""
      )
      .join("");
  }

  return String(content);
}

function normalizeToolCalls(toolCalls: unknown): ModelToolCall[] {
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls
    .map((toolCall): ModelToolCall | undefined => {
      if (typeof toolCall !== "object" || toolCall === null) {
        return undefined;
      }

      const raw = toolCall as {
        id?: unknown;
        type?: unknown;
        function?: {
          name?: unknown;
          arguments?: unknown;
        };
      };

      if (
        typeof raw.id !== "string" ||
        raw.type !== "function" ||
        typeof raw.function?.name !== "string"
      ) {
        return undefined;
      }

      return {
        id: raw.id,
        type: "function",
        function: {
          name: raw.function.name,
          arguments:
            typeof raw.function.arguments === "string"
              ? raw.function.arguments
              : JSON.stringify(raw.function.arguments ?? {})
        }
      };
    })
    .filter((toolCall): toolCall is ModelToolCall => toolCall !== undefined);
}
