# tiny-coding-cli

A tiny TypeScript coding-agent CLI skeleton for learning how agents are built from the bottom up.

It currently wires:

```text
CLI input -> native tool-calling agent loop -> read-only tools -> handwritten HTTP model provider -> terminal output
```

No LLM SDK or agent framework is used.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `OPENROUTER_API_KEY` after you get an OpenRouter key.

```env
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
```

## Run

```bash
npm run dev -- "Explain what an agent loop is"
```

Override model settings from the CLI:

```bash
npm run dev -- "Explain agent tools" --model deepseek/deepseek-v4-flash --temperature 0.2
```

Try project-aware questions:

```bash
npm run dev -- "What are the core modules in this project?"
npm run dev -- "Where is OPENROUTER_API_KEY used?"
npm run dev -- "Explain src/llm/httpProvider.ts"
```

The agent can only inspect files with read-only tools. It cannot edit files or run arbitrary shell commands yet.

The model integration uses OpenAI-compatible native tool calling through OpenRouter:

```text
request tools schema -> model returns tool_calls -> CLI executes local tool -> CLI sends role=tool result -> model answers
```

The agent no longer asks the model to emit a custom `{"type":"tool_call"}` JSON response in assistant text.

## Trace And Debug

Print a readable step-by-step trace to stderr:

```bash
npm run dev -- "What are the core modules in this project?" --verbose
```

Print the full raw trace events in the terminal:

```bash
npm run dev -- "Where is OPENROUTER_API_KEY used?" --verbose --trace-raw
```

Save full trace events as JSONL:

```bash
npm run dev -- "Explain src/llm/httpProvider.ts" --trace-file traces/run.jsonl
```

Use both terminal summaries and a full trace file:

```bash
npm run dev -- "Explain the agent loop" --verbose --trace-raw --trace-file traces/run.jsonl
```

The trace file records raw details such as:

- LLM prompt messages
- LLM raw responses
- native tool call decisions
- tool names, inputs, outputs, and errors
- HTTP request body, headers, status, and response body
- run durations and per-step timings

This project intentionally does not redact trace output right now, so traces may include local source snippets and request headers.

## Check

```bash
npm run typecheck
```
