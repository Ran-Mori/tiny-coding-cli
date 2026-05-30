import type { TraceEvent } from "./types.js";

export type Tracer = {
  emit(event: TraceEvent): void | Promise<void>;
};

export const nullTracer: Tracer = {
  emit() {
    // Intentionally empty.
  }
};

export function createCompositeTracer(tracers: Tracer[]): Tracer {
  const activeTracers = tracers.filter((tracer) => tracer !== nullTracer);

  if (activeTracers.length === 0) {
    return nullTracer;
  }

  return {
    async emit(event) {
      await Promise.all(activeTracers.map((tracer) => tracer.emit(event)));
    }
  };
}
