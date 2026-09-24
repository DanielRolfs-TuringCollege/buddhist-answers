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
