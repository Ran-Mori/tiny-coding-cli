import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { rgIgnoreArgs } from "./workspace.js";

const execFileAsync = promisify(execFile);

const SearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(200).default(50)
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export type SearchOutput = {
  matches: Array<{
    path: string;
    line: number;
    column: number;
    text: string;
  }>;
  truncated: boolean;
};

export const searchTool: ToolDefinition<SearchInput, SearchOutput> = {
  name: "search",
  description:
    "Search the workspace with ripgrep. Returns path, line, column, and matching line text.",
  inputSchema: SearchInputSchema,
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Literal text or ripgrep regex to search for."
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 200,
        description: "Maximum number of matches to return. Defaults to 50."
      }
    },
    required: ["query"],
    additionalProperties: false
  },
  async execute(input, context) {
    try {
      const { stdout } = await execFileAsync(
        "rg",
        [
          "--line-number",
          "--column",
          "--color",
          "never",
          "--no-heading",
          ...rgIgnoreArgs(),
          "--",
          input.query,
          "."
        ],
        {
          cwd: context.workspaceRoot,
          maxBuffer: 1024 * 1024
        }
      );

      const allMatches = stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map(parseRipgrepMatch)
        .filter((match) => match !== undefined);

      return {
        matches: allMatches.slice(0, input.limit),
        truncated: allMatches.length > input.limit
      };
    } catch (error) {
      if (isNoMatchError(error)) {
        return {
          matches: [],
          truncated: false
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Search failed: ${message}`);
    }
  }
};

function parseRipgrepMatch(line: string): SearchOutput["matches"][number] | undefined {
  const match = /^(.*?):(\d+):(\d+):(.*)$/.exec(line);
  if (!match) {
    return undefined;
  }

  return {
    path: trimLeadingDotSlash(match[1] ?? ""),
    line: Number(match[2]),
    column: Number(match[3]),
    text: match[4] ?? ""
  };
}

function trimLeadingDotSlash(value: string): string {
  return value.startsWith("./") ? value.slice(2) : value;
}

function isNoMatchError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 1
  );
}
