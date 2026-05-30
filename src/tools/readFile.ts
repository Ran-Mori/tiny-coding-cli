import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { assertReadableFile, toRelativePath } from "./workspace.js";

const MAX_LINES = 200;

const ReadFileInputSchema = z
  .object({
    path: z.string().min(1),
    startLine: z.number().int().positive().default(1),
    endLine: z.number().int().positive().optional()
  })
  .refine(
    (input) => input.endLine === undefined || input.endLine >= input.startLine,
    {
      message: "endLine must be greater than or equal to startLine.",
      path: ["endLine"]
    }
  );

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

export type ReadFileOutput = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  truncated: boolean;
};

export const readFileTool: ToolDefinition<ReadFileInput, ReadFileOutput> = {
  name: "read_file",
  description:
    "Read a workspace file by relative path. Supports optional startLine and endLine. Refuses .env files and private keys.",
  inputSchema: ReadFileInputSchema,
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Workspace-relative file path to read."
      },
      startLine: {
        type: "integer",
        minimum: 1,
        description: "1-based starting line. Defaults to 1."
      },
      endLine: {
        type: "integer",
        minimum: 1,
        description:
          "1-based ending line. If omitted, reads up to 200 lines from startLine."
      }
    },
    required: ["path"],
    additionalProperties: false
  },
  async execute(input, context) {
    const absolutePath = await assertReadableFile(context.workspaceRoot, input.path);
    const rawContent = await readFile(absolutePath, "utf8");
    const lines = rawContent.split(/\r?\n/);

    const hasExplicitEndLine = input.endLine !== undefined;
    const requestedEndLine = input.endLine ?? input.startLine + MAX_LINES - 1;
    const cappedEndLine = Math.min(requestedEndLine, input.startLine + MAX_LINES - 1);
    const startIndex = input.startLine - 1;
    const endIndex = Math.min(cappedEndLine, lines.length);

    if (startIndex >= lines.length) {
      return {
        path: toRelativePath(context.workspaceRoot, absolutePath),
        startLine: input.startLine,
        endLine: input.startLine,
        content: "",
        truncated: false
      };
    }

    const numberedLines = lines
      .slice(startIndex, endIndex)
      .map((line, index) => `${input.startLine + index}: ${line}`);

    return {
      path: toRelativePath(context.workspaceRoot, absolutePath),
      startLine: input.startLine,
      endLine: input.startLine + numberedLines.length - 1,
      content: numberedLines.join("\n"),
      truncated:
        requestedEndLine > cappedEndLine ||
        (!hasExplicitEndLine && endIndex < lines.length)
    };
  }
};
