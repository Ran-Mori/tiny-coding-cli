# tiny-coding-cli

A tiny TypeScript coding-agent CLI skeleton for learning how agents are built from the bottom up.

The first step only wires:

```text
CLI input -> agent prompt -> handwritten HTTP model provider -> terminal output
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
OPENROUTER_STREAM=true
```

## Run

```bash
npm run dev -- "Explain what an agent loop is"
```

Override model settings from the CLI:

```bash
npm run dev -- "Explain agent tools" --model deepseek/deepseek-v4-flash --temperature 0.2
```

## Check

```bash
npm run typecheck
```
