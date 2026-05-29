import { ModelConfigurationError, ModelRequestError } from "./errors.js";
import type { ModelProvider } from "./provider.js";
import type { GenerateOptions, GenerateResult, ModelMessage } from "./types.js";

type HttpModelProviderOptions = {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  defaultHeaders?: Record<string, string>;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
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

  constructor(options: HttpModelProviderOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async generate(
    messages: ModelMessage[],
    options: GenerateOptions
  ): Promise<GenerateResult> {
    const { baseUrl, apiKey } = this.getConfiguration();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          ...this.defaultHeaders,
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          stream: options.stream ?? false,
          temperature: options.temperature,
          max_tokens: options.maxTokens
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new ModelRequestError(
          `Model request failed with HTTP ${response.status}.`,
          response.status,
          responseBody
        );
      }

      if (options.stream) {
        return {
          text: await extractStreamingAssistantText(response, options.onToken)
        };
      }

      const responseBody = await response.text();
      return {
        text: extractAssistantText(responseBody)
      };
    } catch (error) {
      if (error instanceof ModelRequestError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new ModelRequestError(
          `Model request timed out after ${this.timeoutMs}ms.`
        );
      }

      const message = error instanceof Error ? error.message : String(error);
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

function extractAssistantText(responseBody: string): string {
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

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new ModelRequestError(
      "Model response did not contain choices[0].message.content."
    );
  }

  return content;
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
