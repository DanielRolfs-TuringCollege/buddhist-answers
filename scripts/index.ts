// Builds the Chroma index from data/qa.jsonl.
// Run with: pnpm index (re-run whenever the data, chunking or embedding model changes)
import { readFileSync } from "node:fs";
import { ChromaClient } from "chromadb";
import { z } from "zod";
import { env } from "../lib/env";
import { embeddings } from "../lib/llm";

const COLLECTION_NAME = "lama-ole-qa";

const qaSchema = z.object({
  id: z.number(),
  question: z.string(),
  answer: z.string(),
  url: z.url(),
  category: z.string(),
  tags: z.array(z.string()),
  published: z.string(),
});

async function main() {
  // 1. Read qa.jsonl: one JSON object per line.
  const lines = readFileSync("data/qa.jsonl", "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const qas = lines.map((line) => qaSchema.parse(JSON.parse(line)));

  // 2. One Q&A = one chunk. Question and answer are embedded together.
  const texts = qas.map((qa) => `Question: ${qa.question}\nAnswer: ${qa.answer}`);
  const metadatas = qas.map((qa) => ({
    id: qa.id,
    question: qa.question,
    url: qa.url,
    category: qa.category,
    published: qa.published,
    // Chroma rejects empty arrays, so Q&As without tags get no tags field.
    ...(qa.tags.length > 0 && { tags: qa.tags }),
  }));

  // 3. Turn every text into a vector (LangChain sends them in batches).
  console.log(`Embedding ${texts.length} Q&As…`);
  const vectors = await embeddings.embedDocuments(texts);
  console.log(texts[0], vectors[0].slice(0, 5)); // first 5 numbers of the first vector (run pnpm index to see console.log output)

  // 4. Store in Chroma. We pass our own vectors, so the collection gets no embedding function.
  const chromaUrl = new URL(env.CHROMA_URL);
  const client = new ChromaClient({
    host: chromaUrl.hostname,
    port: Number(chromaUrl.port),
    ssl: chromaUrl.protocol === "https:",
  });
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    embeddingFunction: null,
    configuration: { hnsw: { space: "cosine" } },
  });

  // upsert = insert or replace by id, so re-running never creates duplicates.
  await collection.upsert({
    ids: qas.map((qa) => String(qa.id)),
    embeddings: vectors,
    documents: texts,
    metadatas,
  });

  console.log(`Done: "${COLLECTION_NAME}" now holds ${await collection.count()} Q&As.`);
}

main();
