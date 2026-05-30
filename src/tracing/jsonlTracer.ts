import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import type { Tracer } from "./tracer.js";
import type { TraceEvent, TraceRecord } from "./types.js";

export class JsonlTracer implements Tracer {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async emit(event: TraceEvent): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const record: TraceRecord = {
      timestamp: new Date().toISOString(),
      ...event
    };

    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }
}
