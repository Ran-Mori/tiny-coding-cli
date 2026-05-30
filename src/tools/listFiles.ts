import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { collectFilesFallback, rgIgnoreArgs } from "./workspace.js";

const execFileAsync = promisify(execFile);

const ListFilesInputSchema = z.object({
  limit: z.number().int().positive().max(1_000).default(200)
});

export type ListFilesInput = z.infer<typeof ListFilesInputSchema>;

export type ListFilesOutput = {
  files: string[];
  truncated: boolean;
};

export const listFilesTool: ToolDefinition<ListFilesInput, ListFilesOutput> = {
  name: "list_files",
  description:
    "List files in the current workspace. Ignores .git, node_modules, dist, build, coverage, and .env files.",
  inputSchema: ListFilesInputSchema,
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 1000,
        description: "Maximum number of files to return. Defaults to 200."
      }
    },
    additionalProperties: false
  },
  async execute(input, context) {
    const limit = input.limit;

    try {
      const { stdout } = await execFileAsync(
        "rg",
        ["--files", ...rgIgnoreArgs()],
        {
          cwd: context.workspaceRoot,
          maxBuffer: 1024 * 1024
        }
      );

      const allFiles = stdout.split(/\r?\n/).filter(Boolean);

      return {
        files: allFiles.slice(0, limit),
        truncated: allFiles.length > limit
      };
    } catch {
      return collectFilesFallback(context.workspaceRoot, limit);
    }
  }
};
