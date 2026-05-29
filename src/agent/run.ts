import { SYSTEM_PROMPT } from "./prompt.js";
import type { ModelProvider } from "../llm/provider.js";

export type RunAgentOptions = {
  task: string;
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onToken?: (token: string) => void;
};

export async function runAgent(options: RunAgentOptions): Promise<string> {
  const result = await options.provider.generate(
    [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: options.task
      }
    ],
    {
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stream: options.stream,
      onToken: options.onToken
    }
  );

  return result.text;
}
