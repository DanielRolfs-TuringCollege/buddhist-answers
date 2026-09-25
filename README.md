# Buddhist Answers

A Next.js RAG app that answers questions using Lama Ole Nydahl's Q&As (`data/qa.jsonl`), with a local Chroma vector database.

## Setup

Requirements: Node.js, [pnpm](https://pnpm.io), [Docker](https://www.docker.com) and an [OpenRouter](https://openrouter.ai) API key.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create `.env.local`

```bash
OPENROUTER_API_KEY=sk-or-...

# Optional, these are the defaults:
CHROMA_URL=http://localhost:8000
CHAT_MODEL=openai/gpt-4o-mini
EMBEDDING_MODEL=openai/text-embedding-3-small
```

### 3. Start Chroma

```bash
docker run -p 8000:8000 -v ./chroma-data:/data chromadb/chroma
```

The database is stored in `chroma-data/`. It is not in git, so every new machine starts with an empty database.

### 4. Build the index

With Chroma running, in a second terminal:

```bash
pnpm index
```

This embeds every Q&A from `data/qa.jsonl` through OpenRouter and stores the vectors in the Chroma collection `lama-ole-qa`. It uses OpenRouter credit and prints:

```
Embedding <n> Q&As…
Done: "lama-ole-qa" now holds <n> Q&As.
```

Re-run it whenever `data/qa.jsonl`, the chunking or `EMBEDDING_MODEL` changes. Re-running is safe: it replaces entries by id instead of duplicating them.

### 5. Start the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## How a question is answered

Each question goes through these steps in `app/api/chat/route.ts`. Steps marked **LLM** are chat model calls (`CHAT_MODEL`); **Embedding** is a call to `EMBEDDING_MODEL`. Chroma runs locally and costs nothing.

```
POST /api/chat { text, history }
│
├─ 1. Validate the request (Zod)                         no model call
│
├─ 2. Rewrite the question                               LLM
│     history + new question → one standalone English question
│     (lib/rewrite.ts)
│
├─ 3. Tool choice: the LLM picks tool(s)                  LLM
│     (lib/agent.ts)
│     │
│     ├─ search_answers(query)  → specific question
│     │     embed the query                              Embedding
│     │     find the 5 closest Q&As in Chroma            no model call
│     │     LLM sees only the found questions; the full answers stay in the artifact
│     │
│     ├─ list_topics()          → "What can I ask about?"
│     │     read all categories and tags from Chroma     no model call
│     │
│     └─ no tool                → question doesn't fit the collection
│
│     The results are not sent back to the LLM (no agent loop):
│     it never writes the answer, so our code uses them directly.
│
├─ 4. Route uses the agent's tool result
│     │
│     ├─ list_topics ran        → return the topics, stop
│     ├─ no search ran          → return no sources ("no answer" message)
│     └─ search_answers ran     → continue with its 5 Q&As
│
├─ 5. Select passages to highlight                       LLM
│     picks word-for-word sentences from the 5 answers (structured output);
│     the server keeps only passages that really appear in the source
│     (lib/passages.ts)
│
└─ 6. Return the sources that have a passage, with highlights
```

### Model calls per question

| Question type | LLM calls | Embedding calls |
|---|---|---|
| Specific question (search) | 3: rewrite, tool choice, passage selection | 1 |
| "What can I ask about?" (list_topics) | 2: rewrite, tool choice | 0 |
| Doesn't fit (no tool) | 2: rewrite, tool choice | 0 |

The largest call is passage selection, because it reads the 5 full answers. The tool-choice call stays small: it only sends the question and the tool schemas.
