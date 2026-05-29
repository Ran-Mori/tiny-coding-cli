import type { GenerateOptions, GenerateResult, ModelMessage } from "./types.js";

export type ModelProvider = {
  generate(
    messages: ModelMessage[],
    options: GenerateOptions
  ): Promise<GenerateResult>;
};
