# Buddhist Answers

A Next.js RAG app that answers questions with quotes from Lama Ole Nydahl's Q&As (`data/qa.jsonl`, 271 Q&As), using a local Chroma vector database.

## Start
![Preview](https://github.com/DanielRolfs/media/blob/main/buddhist-answers/Start.png?raw=true)

## "What can I ask about?"
![Preview](https://github.com/DanielRolfs/media/blob/main/buddhist-answers/%22What%20can%20I%20ask%20about%3F%22.png?raw=true)

## "Tell me about X"
![Preview](https://github.com/DanielRolfs/media/blob/main/buddhist-answers/%22Tell%20me%20about%20X%22.png?raw=true)

## A specific question
![Preview](https://github.com/DanielRolfs/media/blob/main/buddhist-answers/A%20specific%20question.png?raw=true)


The Q&As come from [lama-ole-nydahl.org/questions](https://lama-ole-nydahl.org/questions/). They were fetched once (2026-09-24) through the site's WordPress REST API (`/wp-json/wp/v2/posts`, plus categories and tags), with HTML stripped and saved as one JSON object per line.

Optional tasks: source citations (easy), prompt injection protection (medium), tool call result visualisation in a popover (medium), RAGAs evaluation (hard).

## Setup

Requirements: Node.js, [pnpm](https://pnpm.io), [Docker](https://www.docker.com) and an [OpenRouter](https://openrouter.ai) API key.

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and add your key:

   ```bash
   OPENROUTER_API_KEY=sk-or-...
   # Optional, these are the defaults:
   CHROMA_URL=http://localhost:8000
   CHAT_MODEL=openai/gpt-4o-mini
   EMBEDDING_MODEL=openai/text-embedding-3-small
   ```
3. Start Chroma in the background. The data lives in `chroma-data/` (not in git), so the container itself holds nothing:

   ```bash
   # first time: create the container
   docker run -d --name chroma -p 8000:8000 -v ./chroma-data:/data chromadb/chroma
   # afterwards: start and stop the same container
   docker start chroma
   docker stop chroma
   ```
4. Build the index: `pnpm index`. Embeds every Q&A through OpenRouter into the collection `lama-ole-qa`. Re-run it when the data, chunking or embedding model changes; it upserts by id, so no duplicates.
5. `pnpm dev` and open [http://localhost:3000](http://localhost:3000).

## How a question is answered

All steps run in `app/api/chat/route.ts`. **LLM** = chat model call, **Embedding** = embedding model call.

```
POST /api/chat { text, history, topic?, showTopics? }
│
├─ 1. Validate the request (Zod)
│     Shortcuts (the user already chose the tool, no LLM needed):
│     ├─ "Show topics" button  → list_topics, return
│     └─ clicked topic         → list_questions(topic), go to 5
│
├─ 2. Guard: ok | injection | off_topic          LLM   (lib/guard.ts)
│     blocked → friendly message, stop
│
├─ 3. Rewrite: history + question                 LLM   (lib/rewrite.ts)
│     → one standalone English question (query translation)
│
├─ 4. Tool choice: the LLM picks tool(s)          LLM   (lib/agent.ts, lib/tools/)
│     ├─ search_answers(query)  → top 5 Q&As       Embedding
│     ├─ list_topics()          → categories + tags with counts
│     ├─ list_questions(topic)  → all Q&As of a topic, 10 closest with answers   Embedding
│     └─ no tool                → "no answer"
│
├─ 5. Highlight word-for-word passages            LLM   (lib/passages.ts)
│     passages not found in the source are dropped
│     search found nothing that answers → list the topic most results share
│
└─ 6. Return sources with highlights + tool calls
```

The response is streamed as one JSON object per line: `{"step":"Rewriting"}` etc. for the progress indicator, the answer last. The status 200 is already sent then, so later errors come back as `{"error":"…"}` in the last line.

## Evaluation

Step 1 runs the app on test questions with our own checks; step 2 scores the collected answers with [RAGAs](https://docs.ragas.io) (it only reads `eval/results.json`, so always run step 1 first).

```bash
# Once: Python env for RAGAs
uv venv eval/.venv --python 3.12
uv pip install --python eval/.venv/bin/python -r eval/requirements.txt

# 1. Own checks (Chroma and pnpm dev running) → eval/results.json, eval/summary.json
pnpm exec tsx eval/run.ts

# 2. RAGAs (LLM judge via OpenRouter) → eval/ragas_scores.json, eval/ragas_summary.json
eval/.venv/bin/python eval/ragas_eval.py
```

Latest results: retrieval hit rate 100%, correct tool choice 100%, injections blocked 5/5, legitimate questions wrongly blocked 0/31. RAGAs: context precision 0.91, context recall 0.97, faithfulness 0.98, answer relevancy 0.4. Both summary files are committed, so `git diff` shows changes between runs.

## Reflection

### Core concepts

**How RAG works here.** `pnpm index` embeds every Q&A (one Q&A = one chunk) into Chroma. At question time the rewritten question is embedded with the same model, and Chroma returns the 5 closest Q&As (cosine similarity). `list_questions` adds structured retrieval: a metadata filter on category/tags combined with vector search.

**Design choice: quotes, not generated answers.** The LLM never writes an answer. It only picks word-for-word passages, and the server drops any passage that is not in the source. A spiritual teacher's words should not be paraphrased or invented, so this matters more here than a fluent reply. The cost: it feels less like a normal chatbot, and RAGAs answer relevancy is low (see below).

**How tool calling works.** `lib/agent.ts` binds three LangChain tools to the chat model (`bindTools`). The model reads their names, descriptions and Zod schemas and replies with tool calls. Our code runs them and takes the raw data from `ToolMessage.artifact` (`responseFormat: "content_and_artifact"`). There is no second LLM round, because the LLM never writes the answer.


| Tool                    | Used for                | Why a separate tool                                                                                                        |
| ------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `search_answers(query)` | A specific question     | Vector search, top 5                                                                                                       |
| `list_topics()`         | "What can I ask about?" | Data analysis: counts Q&As per category and tag, no search                                                                 |
| `list_questions(topic)` | "Tell me about X"       | Metadata filter, returns every Q&A of the topic.`topic` is a `z.enum` of the names in Chroma, so the LLM cannot invent one |

All three read the same collection, but each answers a different kind of request that the others can't: a top-5 search can't list a whole topic or count topics.

**Code organisation.** One small module per step (`lib/guard.ts`, `lib/rewrite.ts`, `lib/agent.ts`, `lib/passages.ts`, one file per tool in `lib/tools/`), setup in `lib/env.ts` / `lib/chroma.ts` / `lib/llm.ts`. The route only connects the steps. Everything from outside (request body, env vars, Chroma metadata, LLM structured output) is checked with Zod.

**Errors and edge cases.**

- Invalid JSON, empty or too long question (> 500 chars), too much history → 400 with a clear message.
- Unknown topic, OpenRouter or Chroma down, unknown tool → `error` in the stream; the UI shows a generic message, details only in the server log.
- Missing or invalid env vars → clear error at startup (`lib/env.ts`).
- Prompt injection and off-topic questions → blocked by the guard before any other LLM call. All prompts wrap user text and sources in tags and treat them as data.
- Misquoted passage → dropped. No tool fits → "no answer" instead of an invented one.
- Follow-ups and non-English questions → resolved by the rewrite step.

### Known problems and improvements

- **Slow answers.** Up to 5 LLM calls run one after another. Improvement: send the source cards right after the search, highlights later.
- **One chunk per Q&A.** Most Q&As are short (median 224 words), but the longest has 1,452 words, so its vector blurs several topics. Improvement: split long answers into paragraphs and link chunks back to their Q&A.
- **No similarity threshold.** Weak matches still go to passage selection; only the LLM decides nothing fits. Improvement: tune a threshold on the eval questions.
- **Follow-ups are weaker** (2/3). The history only contains earlier questions, not what was shown. Improvement: also send the shown Q&A titles to the rewrite step.
- **Low answer relevancy (0.4).** RAGAs expects a reply written to the question, not quoted passages, so the metric fits this design poorly. Retrieval and faithfulness are high.
- **The guard is an LLM.** It can be fooled or block a valid question, but it only returns a verdict, never text. 5 test attacks are not proof.
- **Cost and abuse.** No rate limiting or authentication. Improvement: rate limit per IP.
- **Static data.** New Q&As on the website need a manual re-fetch and re-index.
- **Extra Chroma reads.** Each question reads all metadata to build the topic enum. Fine for 271 Q&As; cache it for a larger collection.
