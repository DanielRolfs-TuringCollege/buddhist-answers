# CLAUDE.md

## Project

"Ask Lama Ole": a Next.js RAG chatbot over Lama Ole Nydahl's published Q&A collection (Turing College sprint project).

- **Task / requirements:** [overview/task.md](overview/task.md). The grading criteria live here.
- **Plan / architecture:** [overview/plan.md](overview/plan.md), the single source of truth for decisions (stack, pipeline, tools, SSE events, eval).
- **Learning notes:** [overview/learned.md](overview/learned.md), written by the user. Don't edit it unless asked.

Chosen optional tasks: citations (easy), prompt injection protection (medium), tool-call result visualisation in a popover (medium), RAGAs evaluation (hard).

Key stack: Next.js App Router + TypeScript, Tailwind + shadcn/ui, LangChain.js v1, OpenRouter (`openai/gpt-4o-mini` chat, `openai/text-embedding-3-small` embeddings), Chroma via Docker, Zod, own SSE streaming, Python `ragas` for evaluation.

## How we work (important)

The user is building this to **fully understand every part** of the application.

1. **Only build what the user asks for in the current message.** Never add features, files, dependencies, refactors, or "nice to haves" that were not requested, even if they are in plan.md. If something else seems necessary, say so and ask first.
2. **Micro steps.** Keep each change small enough to be one focused commit (one concept, a handful of lines to a small file). If a request is big, propose how to split it into steps and do only the first.
3. **Never stage or commit.** Do not run `git add`, `git commit`, `git stash`, `git reset`, or anything else that changes git state. The user reviews, stages, and commits themself. After each step, suggest a short commit message they can use.
4. **Explain after each step:** what changed, why, and how it connects to the plan (briefly, in plain language). Point out any new concept (e.g. a LangChain interface, an SSE detail).
5. **Stick to the plan.** If an implementation detail contradicts plan.md or a better option comes up, explain the trade-off and let the user decide. Update plan.md only after the user agrees.
6. **Look up current docs** (ctx7 / Context7) before writing code for LangChain.js v1, Next.js, shadcn/ui, Chroma, OpenRouter, or ragas. APIs change often, and the task explicitly requires LangChain v1 interfaces.

## Code conventions

- TypeScript strict; validate external input (request bodies, tool args, env vars, LLM structured output) with Zod.
- Keep modules small and single-purpose (see "Project structure" in plan.md).
- Readable over clever: this code must be explainable in a review.
- Secrets only in `.env.local` (never committed).
