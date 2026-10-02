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
POST /api/chat { text, history, topic?, showTopics? }
│
├─ 1. Validate the request (Zod)                         no model call
│
│     Shortcuts that skip steps 2–4 (the user already chose the tool):
│     ├─ "Show topics" button  → list_topics, return     no model call
│     └─ clicked topic         → list_questions(topic), go to step 5b
│
├─ 2. Guard: is it a real question?                      LLM
│     ok | injection | off_topic (structured output)
│     blocked → friendly message, stop
│     (lib/guard.ts)
│
├─ 3. Rewrite the question                               LLM
│     history + new question → one standalone English question
│     (lib/rewrite.ts)
│
├─ 4. Tool choice: the LLM picks tool(s)                  LLM
│     (lib/agent.ts, tools in lib/tools/)
│     │
│     ├─ search_answers(query)  → specific question
│     │     embed the query                              Embedding
│     │     find the 5 closest Q&As in Chroma            no model call
│     │
│     ├─ list_topics()          → "What can I ask about?"
│     │     read all categories and tags from Chroma     no model call
│     │
│     ├─ list_questions(topic)  → "Tell me about X"
│     │     all Q&As of one tag or category,
│     │     the 10 closest to the topic with answers     Embedding
│     │
│     └─ no tool                → question doesn't fit the collection
│
│     The results are not sent back to the LLM (no agent loop):
│     it never writes the answer, so our code uses them directly.
│
├─ 5. Route uses the agent's tool result
│     │
│     ├─ list_topics ran        → return the topics, stop
│     ├─ list_questions ran     → 5b. highlight where the topic is discussed   LLM
│     ├─ no search ran          → return no sources ("no answer" message)
│     └─ search_answers ran     → 5a. highlight passages that answer it        LLM
│           no passage found    → list the topic most of the 5 Q&As share
│                                 (list_questions + 5b)    Embedding + LLM
│
│     Highlighting picks word-for-word sentences (structured output);
│     the server keeps only passages that really appear in the source
│     (lib/passages.ts)
│
└─ 6. Return the sources that have a passage, with highlights, and the tool calls
```

### Progress steps

After validation, the route streams its response as one JSON object per line. The UI shows the newest step next to a spinner, and the last line is the answer:

```
{"step":"Checking question"}
{"step":"Rewriting"}
{"step":"Searching"}
{"step":"Highlighting passages"}
{"rewritten":"…","sources":[…],"toolCalls":[…]}
```

Because the status code is sent with the first line, errors after validation come back as `{"error":"…"}` in the last line instead of a 400/500.

### Model calls per question


| Question type                                          | LLM calls                                         | Embedding calls |
| -------------------------------------------------------- | --------------------------------------------------- | ----------------- |
| Specific question (search)                             | 4: guard, rewrite, tool choice, passage selection | 1               |
| Specific question, no passage found (fallback listing) | 5: the 4 above + topic passages                   | 2               |
| "Tell me about X" (list_questions)                     | 4: guard, rewrite, tool choice, topic passages    | 1               |
| "What can I ask about?" (list_topics)                  | 3: guard, rewrite, tool choice                    | 0               |
| Doesn't fit (no tool)                                  | 3: guard, rewrite, tool choice                    | 0               |
| Blocked by the guard                                   | 1: guard                                          | 0               |
| Clicked topic                                          | 1: topic passages                                 | 1               |
| "Show topics" button                                   | 0                                                 | 0               |

The largest calls are the passage selections, because they read the full answers (5 for a search, up to 10 for a topic). The tool-choice call stays small: it only sends the question and the tool schemas.

## Evaluation

The evaluation has two separate steps. Step 1 collects the app's answers and runs our own checks; step 2 scores those collected answers with [RAGAs](https://docs.ragas.io). RAGAs never calls the app itself, it only reads `eval/results.json`.

```
eval/run.ts  →  /api/chat  →  results.json + summary.json (own checks)
                                   ↓
                     eval/ragas_eval.py  →  ragas_scores.json + ragas_summary.json
```

Always run step 1 first after changing the app. Otherwise RAGAs scores the old answers in `results.json`.

### Setup (once)

RAGAs is a Python library. Create a virtual environment with [uv](https://docs.astral.sh/uv/):

```bash
uv venv eval/.venv --python 3.12
uv pip install --python eval/.venv/bin/python -r eval/requirements.txt
```

### 1. Own checks

With Chroma and `pnpm dev` running:

```bash
pnpm exec tsx eval/run.ts
```

Sends every question in `eval/questions.jsonl` to `/api/chat` (uses OpenRouter credit) and writes:

- `eval/results.json`: everything the app returned per question (input for step 2)
- `eval/summary.json`: hit rates, tool choice, blocked, etc.

### 2. RAGAs scores

```bash
eval/.venv/bin/python eval/ragas_eval.py
```

Scores the `specific` and `followup` questions with an LLM judge via OpenRouter. This is slower and costs more than step 1, because the judge makes several calls per question. It writes:

- `eval/ragas_scores.json`: the four metrics per question
- `eval/ragas_summary.json`: the averages

### Compare runs

Both summary files are committed. After a new run, `git diff eval/summary.json eval/ragas_summary.json` shows what changed compared to the last commit.

## Reflection

### Core concepts

**How RAG works here.** `pnpm index` embeds every Q&A (question and answer together, one Q&A = one chunk) and stores the vectors in Chroma. At question time the question is rewritten into one standalone English question (query translation), embedded with the same model, and Chroma returns the 5 Q&As with the closest vectors (cosine similarity). The LLM never writes an answer: it only picks word-for-word passages from those Q&As, and the server drops any passage that does not appear in the source.

**How tool calling works.** `lib/agent.ts` binds three LangChain tools to the chat model (`bindTools`). The model reads their names, descriptions and Zod schemas and replies with tool calls instead of text. Our code runs them and takes the raw data from `ToolMessage.artifact` (`responseFormat: "content_and_artifact"`). There is no second LLM round, because the LLM never writes the answer.


| Tool                    | Used for                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `search_answers(query)` | A specific question: vector search, top 5                                                                           |
| `list_topics()`         | "What can I ask about?": all categories and tags with counts                                                        |
| `list_questions(topic)` | "Tell me about X": all Q&As of one topic.`topic` is a `z.enum` of the names in Chroma, so the LLM cannot invent one |

**Code organisation.** One small module per step: `lib/guard.ts`, `lib/rewrite.ts`, `lib/agent.ts`, `lib/passages.ts`, one file per tool in `lib/tools/`, and `lib/env.ts` / `lib/chroma.ts` / `lib/llm.ts` for setup. `app/api/chat/route.ts` only connects the steps. Everything from outside (request body, env vars, Chroma metadata, LLM structured output) is checked with Zod.

**Error scenarios and edge cases handled.**

- Invalid JSON, an empty question, a question over 500 characters or too much history → 400 with a clear message.
- An unknown topic, OpenRouter or Chroma down, or the LLM calls a tool that does not exist → an `error` field in the streamed answer (the status 200 is already sent, see "Progress steps"). The UI shows a generic message; details only in the server log.
- Missing or invalid env vars → a clear error listing the bad variables as soon as `lib/env.ts` is loaded.
- Prompt injection and off-topic questions → blocked by the guard before any other LLM call. All prompts also wrap user text and sources in tags and treat them as data.
- The LLM misquotes a passage → the passage is dropped, so a highlight never contains words Lama Ole didn't say.
- No tool fits → "no answer" instead of an invented one. Search finds Q&As but none answers the question → the app lists the topic most of them share.
- Follow-ups and non-English questions → resolved by the rewrite step.

### Known problems and improvements

- **Slow answers.** Up to 5 LLM calls run one after another (see the table above), so an answer takes several seconds. The UI shows the current step, but the cards only appear at the end. Improvement: send the source cards as soon as the search is done and add the highlights when they are ready.
- **No similarity threshold.** Weak matches still go to passage selection; only the LLM decides that nothing fits. Improvement: tune a score threshold on the eval questions.
- **Follow-ups are weaker** (2/3 in `eval/summary.json`). The history only contains earlier questions, not what was shown. Improvement: send the shown Q&A titles as context to the rewrite step.
- **Low RAGAs answer relevancy (0.4).** The "answer" is a set of quoted passages, not a reply written to the question, so this metric is not a good fit. Retrieval (precision 0.91, recall 0.97) and faithfulness (0.98) are high.
- **The guard is an LLM.** It can be fooled or block a valid question. It only decides ok/blocked and never writes text, so the damage is limited. A small eval set (5 attacks) is not proof.
- **Cost and abuse.** No rate limiting or authentication, so anyone with the URL can spend OpenRouter credit. Improvement: rate limit per IP.
- **Static data.** `data/qa.jsonl` is a snapshot; new Q&As on the website need a manual re-run of the scripts. Improvement: scheduled re-fetch and re-index.
- **Extra Chroma reads.** Each question reads all metadata to build the topic list for `list_questions`. Fine for ~270 Q&As, but it should be cached for a larger collection.
