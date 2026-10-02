# Plan: "Ask Lama Ole" – RAG Chat over the Q&A Collection

A chat app that answers questions by showing Lama Ole Nydahl's published Q&As in full, highlights the passages that answer the question, and uses three tools to find answers more effectively. The app never writes an answer in its own words.

Data source: https://lama-ole-nydahl.org/questions/ (≈ 278 Q&As, WordPress)

---

## 1. Goal

- Answer user questions **only** from the stored Q&A collection.
- Show each relevant Q&A **in full** with a link to the original page, and **highlight** the passages that answer the question (word for word, never paraphrased).
- Use **3 tools** so the LLM can pick the right way to search.
- Rewrite each question before searching (**query translation**), so follow-ups and German questions work.
- Say clearly when the collection has **no matching answer** instead of inventing one.
- Protect against **prompt injection** (nobody can make the bot "speak as Lama Ole" without sources).
- Measure quality with **RAGAs**.

The sources are in English. German questions are accepted (query translation turns them into English search queries).

---

## 2. Tech stack

| Part | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Popover, Card, Badge, Sheet, …) |
| LLM framework | LangChain.js **v1** interfaces |
| LLM | `openai/gpt-4o-mini` via OpenRouter (OpenAI-compatible, `ChatOpenAI` with OpenRouter `baseURL`) |
| Embeddings | `openai/text-embedding-3-small` via OpenRouter `/api/v1/embeddings` (`OpenAIEmbeddings` with OpenRouter `baseURL`) |
| Vector DB | Chroma, running locally via Docker (`docker run -p 8000:8000 chromadb/chroma`), accessed with the official `chromadb` JS client (no LangChain wrapper: `@langchain/community` is deprecated) |
| Validation | Zod (request body, tool arguments, guard output) |
| Streaming | Own stream of JSON lines (one object per line) from a Next.js route handler, read in React |
| Chat history | React state only; full history is sent with each request |
| Evaluation | TS script collects results → Python script with the `ragas` library scores them |

Environment variables (`.env.local`): `OPENROUTER_API_KEY`, `CHROMA_URL`, `CHAT_MODEL`, `EMBEDDING_MODEL`.

---

## 3. Data pipeline

### Step 1 – Collect (run once, `scripts/fetch-qa.ts`)

1. Fetch all posts from the WordPress REST API:
   `https://lama-ole-nydahl.org/questions/wp-json/wp/v2/posts?per_page=100&page=1..3`
2. Also fetch category and tag names (`/wp-json/wp/v2/categories`, `/wp-json/wp/v2/tags`) to turn IDs into readable names.
3. Strip HTML from the answer text and decode HTML entities.
4. Add a 1-second pause between requests.
5. Save everything to `data/qa.jsonl`, one Q&A per line:

```json
{"id": 123, "question": "How can we best practice equanimity in everyday life?", "answer": "Most people have little control...", "url": "https://lama-ole-nydahl.org/questions/how-can-we-best-practice-equanimity-in-everyday-life/", "category": "View and Meditation", "tags": ["Equanimity", "Patience"], "published": "2017-10-04", "fetched": "2026-09-24"}
```

### Step 2 – Index (`scripts/index.ts`, re-run whenever chunking or model changes)

1. Read `qa.jsonl`.
2. One Q&A = one chunk (answers are short, no further splitting).
3. Embed the text `"Question: … Answer: …"`.
4. Store in Chroma with metadata: `id, question, url, category, tags, published`.
   - `tags` is stored as a real array and filtered in Chroma with `where: { tags: { $contains: "Anger" } }` (verified). Chroma rejects empty arrays, so Q&As without tags get no `tags` field.
5. Collection `lama-ole-qa`, cosine distance, no Chroma embedding function (we pass our own vectors), `upsert` by Q&A id so re-running never duplicates.

**How search works:** the search query is embedded with the **same** model, and Chroma returns the closest vectors along with their distance. We convert the distance into a similarity score (0–1) for the threshold and the UI.

---

## 4. Request pipeline (one user message)

```
User message + chat history
   │
   ▼
1. Input validation (Zod: non-empty, max length, history shape)
   │
   ▼
2. Guard classifier (cheap LLM call → ok | injection | off_topic)
   │  blocked → friendly message, stop
   ▼
3. Query translation: rewrite with history
   │  history + new message → one standalone English question
   ▼
4. Tool choice (one LLM call with 3 tools; parallel calls allowed)
   │  LLM requests tool calls ──► backend runs them (no second LLM round:
   │  the LLM never writes the answer, our code uses the tool results)
   ▼
5. Highlight: an LLM picks word-for-word passages per source (structured output),
   │  the server keeps only passages that really appear in the source text
   │
   ▼
6. Sources (full text + highlights) and tool results are sent to the UI as the last line
```

Before each slow step the route sends a progress line, so the UI can show what it is working on (see §8).

---

## 5. Query translation – rewrite with history

**Why:** the raw user message is often a bad search query: follow-ups ("and what about jealousy?"), vague wording, or German.

**How:** one LLM call before the agent. Input: the last few chat turns + the new message. Output: **one standalone English question**.

| User types | History | Rewritten question |
|---|---|---|
| "and jealousy?" | previous question was about anger in relationships | "What does Lama Ole say about jealousy in relationships?" |
| "Wie gehe ich mit Wut um?" | – | "How should I deal with anger?" |
| "ugh my boyfriend drives me crazy" | – | "How can I deal with frustration and anger at my partner?" |

The agent receives the rewritten question. The UI shows it ("Searched for: …") so the user can see what was searched.

---

## 6. The three tools

| Tool | Request type | What it does |
|---|---|---|
| `search_answers(query)` | Specific question | Vector search over the whole collection, top 5. Returns answers + similarity scores. |
| `list_topics()` | Exploring | Returns all categories and tags with counts. Also tells the LLM which tag names are valid. |
| `list_questions(topic)` | "Show me everything about X", "What else should I know about X?" | All Q&As of one tag or category (`where` filter). The 10 closest to the topic (vector search inside the filter) get highlighted passages where the topic is discussed; the rest are listed as question + URL. |

**Why three:** each covers a different operation (ranking, overview, complete listing) with no overlap, so the LLM always has a clear choice.

**Why `list_questions` exists:** a broad topic question has no specific question for vector search to match, so `search_answers` finds unrelated Q&As and passage selection rejects them all. `topic` accepts any tag or category name from `list_topics()` (the tag "Meditation" has 7 Q&As, the category "View and Meditation" has 106). Highlighting is capped at 10 Q&As to keep the LLM call small.

Tool arguments are validated with Zod. A failing tool fails the request (`error` in the answer, details in the server log): there is no second LLM round to return the error to.

---

## 7. Passage selection rules (system prompt) & highlights

Instead of a generated answer, the user sees the original Q&As with the answering passages highlighted (`lib/passages.ts`).

1. Select passages only from the retrieved sources. Copy them word for word: never change, shorten, or combine text.
2. At most 2 passages per source: the most direct ones.
3. Only include sources that really answer the question; sources without a passage are not shown.
4. The LLM replies with structured output (`{ passages: [{ n, text }] }`, Zod schema, `strict: true`). The server drops every passage that does not appear verbatim in its source, so a highlight can never contain words he didn't say.
5. **Similarity threshold:** if the best score is below the threshold (tune on test questions), reply:
   *"There's no answer from Lama Ole on this topic in the collection."* (also shown when no source gets a passage) and suggest related topics via `list_topics()`.
6. One tool-choice LLM call per question, no agent loop (saves one LLM call per question). Valid topic names go into the `list_questions` schema as a `z.enum`, so no `list_topics` → `list_questions` chaining is needed.

---

## 8. Streaming (progress steps)

Invalid input (bad JSON, failed Zod check) gets plain JSON with status 400. After that, `POST /api/chat` streams its response as one JSON object per line (`application/x-ndjson`): a `{ step }` before each slow step, then the answer as the last line.

```
{"step":"Checking question"}
{"step":"Rewriting"}
{"step":"Searching"}
{"step":"Highlighting passages"}
{"rewritten":"…","sources":[…],"toolCalls":[…]}      // or {"error":"…"}
```

Each `step(...)` is called right before the real work it names, so the UI always shows what the server is doing at that moment. Only typed questions send steps; a clicked topic and "Show topics" show the default spinner text.

Why not full SSE with separate events (`rewrite`, `tool_start`, `sources`, …): nothing on screen changes until the highlights are ready, so only the steps need streaming. Plain JSON lines need no SSE parsing.

The status code is sent with the first line, so errors after validation (unknown topic, OpenRouter or Chroma down) come back as `{"error": …}` in the last line, not as a 400/500.

The React client reads the stream with `fetch` + `ReadableStream`, shows the newest step next to a spinner, and uses the last line as the answer. `eval/run.ts` only parses the last line.

---

## 9. Prompt injection protection

Three layers:

1. **Input validation:** Zod schema, max message length (e.g. 500 characters), history length limit, control characters stripped. Invalid input → HTTP 400 with a clear message.
2. **Guard classifier:** a cheap LLM call with structured output (`{verdict: "ok" | "injection" | "off_topic", reason}`) before anything else. Blocked messages get a friendly reply, and the agent never runs.
3. **Hardened system prompt:** user text and retrieved texts are wrapped in clear delimiters (`<user_question>…</user_question>`, `<source n="1">…</source>`). The prompt states that content inside them is data, never instructions, and that the assistant never speaks *as* Lama Ole.

Attack prompts are added to the eval set to show the defences work (§12).

---

## 10. UI

### Layout (desktop)

```
┌──────────────────────┬──────────────────────────────────────────────┐
│ Topics               │  Ask Lama Ole                                │
│                      │                                              │
│ Search topics…       │  ┌────────────────────────────────────────┐  │
│                      │  │ You: I get angry at my partner quickly │  │
│ Anger (39)           │  └────────────────────────────────────────┘  │
│ Partnership (28)     │                                              │
│ Emotions (39)        │  ✓ Checked · ✓ Rewritten · ● Searching…      │
│ Dreams (18)          │  [Searched "Anger"] [Searched "Partnership"] │
│ Faithfulness (19)    │        ▲ click → popover with tool result    │
│ …                    │                                              │
│                      │  ┌──────────────────────────────────────┐    │
│ Show all answers     │  │ How should I deal with anger?        │    │
│ for a topic          │  │ Full original answer … ▓highlighted  │    │
│                      │  │ passage that answers the question▓ … │    │
│                      │  │ … rest of the answer.                │    │
│                      │  │ Anger · Emotions  Open original page↗│    │
│                      │  └──────────────────────────────────────┘    │
│                      │  (one card per relevant Q&A)                 │
│                      │                                              │
│                      │  Related questions                           │
│                      │  • Why do we get angry at those we love?     │
│                      │                                              │
│                      │  ┌────────────────────────────────┐ [Ask]    │
│                      │  │ Ask a question…                │          │
│                      │  └────────────────────────────────┘          │
└──────────────────────┴──────────────────────────────────────────────┘
```

On mobile, the topic sidebar becomes a "Topics" button that opens a sheet.

### How each UI part maps to the backend

| UI element | Purpose | Backed by |
|---|---|---|
| Chat window | Main question/answer flow | last line of the stream (the answer) |
| Progress steps (Checking question → Rewriting → Searching → Highlighting passages) | Progress indicator for long operations | `{ step }` lines |
| "Searched for: …" line | Shows the rewritten question | `rewritten` in the answer |
| Tool chips ("Searched 'Anger'") | Shows which tools ran | `toolCalls` in the answer |
| **Tool popover** (click on a chip) | Visualises the tool result (see below) | `toolCalls[].result` |
| Source cards | Question title, full answer with highlighted passages, tags, link to original page | `sources` in the answer (`segments`) |
| "Open original page" link | Lets users verify the answer on the real website | `url` metadata |
| Topic sidebar with counts | Browse and explore | `list_topics()` |
| Clicking a topic | Shows the questions for that tag or category, the top 10 with highlights | `list_questions(topic)` |
| Tag chip on a source card | Click = list the Q&As of that tag | `list_questions(tag)` |
| Related questions | Follow-up reading | 2nd `search_answers` call using the top answer's text |
| No-match state | "No answer on this in the collection. Try these topics: …" | Similarity threshold + `list_topics()` |
| Blocked state | Friendly message for injection/off-topic attempts | `blocked` in the answer |

### Tool-call visualisation (popover)

| Tool | Popover content |
|---|---|
| `search_answers` | Argument (query) + list of results with a horizontal bar per similarity score; threshold shown as a line |
| `list_topics` | Tags with counts as a small bar list |
| `list_questions` | Topic name, number of results, list of question links |

### UX details

- Highlighted passages are clearly marked (`<mark>`), and the rest of the answer stays readable around them.
- Header and question input stay visible while scrolling.
- Source cards show the publish date; data fetch date appears in a footer ("Data from lama-ole-nydahl.org, fetched 2026-09-24").
- Empty start screen: three example questions as clickable suggestions plus the topic list.
- Keyboard accessible: Enter sends, visible focus on links, chips, and popovers.

---

## 11. Error handling

- Chroma not reachable / OpenRouter error / tool error → `{"error": …}` as the last line; the UI shows a generic message and the user can send again (details only in the server log).
- Not built: stopping the server's work when the user leaves the page (`AbortSignal`).

---

## 12. Evaluation

The app never writes an answer: it retrieves whole Q&As and highlights verbatim passages. So the evaluation focuses on **retrieval** and **behaviour** (right tool, blocked, no answer). Generation metrics are only a sanity check.

### Test set: `eval/questions.jsonl`

38 hand-written test questions, one JSON object per line. Expected URLs are real Q&As from `data/qa.jsonl`.

| Type | Count | Expected behaviour |
|---|---|---|
| `specific` | 20 (2 in German) | answer; expected URL(s) + short reference answer |
| `followup` | 3 (1 German), with `history` | answer; tests query translation |
| `explore` | 3 | topics (`list_topics`) |
| `listing` | 3 | listing (`list_questions` with `expected_topic`) |
| `no_answer` | 2 | no direct answer (in the domain, but not in the collection) |
| `off_topic` | 2 | blocked |
| `injection` | 5 | blocked |

Specific questions are worded differently from the stored questions, so retrieval isn't trivial.

### Own checks (TS, `eval/run.ts`)

Run: `pnpm exec tsx eval/run.ts` (needs `pnpm dev` and Chroma running). It calls the real `/api/chat` endpoint, so it tests exactly what the UI gets, and prints:

1. **Retrieval hit rate:** is an expected Q&A among the search results?
2. **Shown hit rate:** is an expected Q&A shown as a card (survived passage selection)?
3. **Tool choice / listing topic:** did the LLM pick the right tool and topic?
4. **Behaviour per type:** answered, topics shown, no direct answer, blocked.
5. **False blocks:** legitimate questions the guard blocked.

It writes `eval/results.json` (question, history, rewritten question, tools, all retrieved Q&As, shown URLs, highlights, reference, checks) and `eval/summary.json` (the summary table, to compare runs with `git diff`).

### RAGAs (Python, `eval/ragas_eval.py`)

Setup once: `uv venv eval/.venv --python 3.12 && uv pip install --python eval/.venv/bin/python -r eval/requirements.txt`. Run: `eval/.venv/bin/python eval/ragas_eval.py`.

Scores only `specific` + `followup` questions (the others have no answer to judge). LLM judge: `openai/gpt-4o-mini` via OpenRouter. Writes `eval/ragas_scores.json`.

| Metric | Role | Question it answers |
|---|---|---|
| Context precision | **main** | Are the 5 retrieved Q&As relevant to the reference, and are the relevant ones ranked first? |
| Context recall | **main** | Do the retrieved Q&As cover everything in the reference answer? |
| Faithfulness | sanity check | Is every claim in the highlights supported by the sources? The app already guarantees verbatim highlights (`lib/passages.ts` drops any passage not found in its source), so this mostly measures the judge. |
| Answer relevancy | secondary | Do the highlights address the question? Weak fit: it generates questions from the "answer" and scores 0 when the judge finds the text noncommittal, which happens with hedged verbatim quotes. |

Next: compare **plain pipeline** (always search → highlight) vs. **agent with 3 tools**, and **with vs. without query rewrite**.

---

## 13. Project structure (planned)

```
app/
  page.tsx                  chat page
  api/chat/route.ts         streaming endpoint (pipeline)
  api/topics/route.ts       topic sidebar data
components/                 chat, source cards, tool popover, sidebar (+ components/ui from shadcn)
lib/
  env.ts                    validated environment variables
  llm.ts                    ChatOpenAI + OpenAIEmbeddings configured for OpenRouter
  chroma.ts                 shared Chroma client + collection name
  passages.ts               LLM passage selection + splitting answers into highlight segments
  validation.ts             Zod schemas
  guard.ts                  guard classifier
  rewrite.ts                query translation
  tools/                    search_answers, list_topics, list_questions
  agent.ts                  tool choice (one LLM call) + system prompt
scripts/
  fetch-qa.ts               collect data
  index.ts                  build Chroma index (read qa.jsonl → embed → upsert, all in one file)
data/qa.jsonl
eval/
  questions.jsonl
  run.ts
  ragas_eval.py
  requirements.txt
```

---

## 14. Milestones

Each milestone is split into small steps; every step = one micro commit.

1. **Setup:** Next.js + Tailwind + shadcn/ui, `.env.local`, Chroma in Docker.
2. **Data:** fetch via API → `qa.jsonl` (check a few entries by hand).
3. **Index:** embeddings via OpenRouter into Chroma, test raw search in a script.
4. **Plain RAG:** question → search → full Q&As with highlighted passages (no tools yet, no streaming).
5. **Tools:** add the 3 tools + tool choice (one LLM call).
6. **Query translation:** rewrite with history.
7. **Streaming:** progress steps as JSON lines + client reader.
8. **UI:** chat window, source cards with highlights, topic sidebar.
9. **Tool popover:** visualisation of tool results.
10. **Prompt injection:** validation, guard classifier, hardened prompt.
11. **Error handling:** polish all error states.
12. **Eval:** test set, `run.ts`, own checks, tune threshold.
13. **RAGAs:** Python script, compare variants, write up findings.

---

## 15. Notes

- The texts belong to the site owner. Use for a personal learning project; ask before publishing the app or database.
- Answers are one teacher's words: never generate "his" answer without a source behind it.
- Known limitations to reflect on: one chunk per Q&A (long answers lose detail), English-only sources, threshold tuned on a small test set, highlights depend on the LLM's selection (misquoted passages are dropped, so a relevant source can be hidden), guard classifier can be fooled or can block harmless questions.
