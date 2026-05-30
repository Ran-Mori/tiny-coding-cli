import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_IGNORES = [
  ".git/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".env",
  ".env.*"
];

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?:\..*)?$/,
  /^id_rsa$/,
  /^id_dsa$/,
  /^id_ecdsa$/,
  /^id_ed25519$/,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i
];

export function resolveWorkspacePath(
  workspaceRoot: string,
  requestedPath: string
): string {
  if (requestedPath.trim().length === 0) {
    throw new Error("Path must not be empty.");
  }

  const absolutePath = path.resolve(workspaceRoot, requestedPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Path is outside the workspace.");
  }

  if (isSensitivePath(relativePath)) {
    throw new Error("Refusing to read sensitive files such as .env or private keys.");
  }

  return absolutePath;
}

export function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

export function rgIgnoreArgs(): string[] {
  return DEFAULT_IGNORES.flatMap((pattern) => ["-g", `!${pattern}`]);
}

export async function collectFilesFallback(
  workspaceRoot: string,
  limit: number
): Promise<{
  files: string[];
  truncated: boolean;
}> {
  const files: string[] = [];
  let truncated = false;

  async function walk(directory: string): Promise<void> {
    if (files.length >= limit) {
      truncated = true;
      return;
    }

    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= limit) {
        truncated = true;
        return;
      }

      const absolutePath = path.join(directory, entry.name);
      const relativePath = toRelativePath(workspaceRoot, absolutePath);

      if (shouldIgnoreRelativePath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  await walk(workspaceRoot);
  return {
    files,
    truncated
  };
}

export async function assertReadableFile(
  workspaceRoot: string,
  requestedPath: string
): Promise<string> {
  const absolutePath = resolveWorkspacePath(workspaceRoot, requestedPath);
  const fileStat = await stat(absolutePath);

  if (!fileStat.isFile()) {
    throw new Error("Path is not a file.");
  }

  return absolutePath;
}

function shouldIgnoreRelativePath(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");

  if (isSensitivePath(normalized)) {
    return true;
  }

  return normalized
    .split("/")
    .some((part) =>
      [".git", "node_modules", "dist", "build", "coverage"].includes(part)
    );
}

function isSensitivePath(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  const fileName = normalized.split("/").at(-1) ?? normalized;

  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}
