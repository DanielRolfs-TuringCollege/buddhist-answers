import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { chroma, COLLECTION_NAME } from "../chroma";
import { embeddings } from "../llm";

const TOP_K = 5;

// Chroma metadata is untyped at runtime, so check the fields we rely on.
const metadataSchema = z.object({
  question: z.string(),
  url: z.url(),
  // Q&As without tags have no tags field in Chroma (see scripts/index.ts).
  tags: z.array(z.string()).default([]),
});

// Stored documents look like "Question: …\nAnswer: Lama Ole’s answer:\n\n…".
// Returns only his answer, with paragraphs kept.
function toAnswerText(document: string) {
  return (document.split("\nAnswer: ")[1] ?? "").replace(/^Lama Ole’s answer:\s*/, "");
}

// The TOP_K Q&As whose meaning is closest to the query (vector search).
export async function searchAnswers(query: string) {
  const embedding = await embeddings.embedQuery(query);

  const collection = await chroma.getCollection({ name: COLLECTION_NAME });
  const result = await collection.query({
    queryEmbeddings: [embedding],
    nResults: TOP_K,
    include: ["metadatas", "documents"],
  });

  // rows()[0] = the matches for our first (and only) query vector.
  // n lets the LLM say which source a passage comes from.
  return result.rows()[0].map((row, index) => ({
    n: index + 1,
    answer: toAnswerText(row.document ?? ""),
    ...metadataSchema.parse(row.metadata),
  }));
}

export type SearchResult = Awaited<ReturnType<typeof searchAnswers>>;

// The LLM only gets the found questions (enough to see what was found, and cheap).
// The full answers stay in the artifact for our code: passage selection needs them.
export const searchAnswersTool = tool(
  async ({ query }) => {
    const sources = await searchAnswers(query);
    const found = sources.map(({ n, question }) => ({ n, question }));
    return [JSON.stringify(found), sources];
  },
  {
    name: "search_answers",
    responseFormat: "content_and_artifact",
    description:
      "Searches Lama Ole's Q&A collection for the answers closest in meaning to a question. " +
      "Use it for every specific question the user asks.",
    schema: z.object({
      query: z.string().describe("The user's question, in English"),
    }),
  },
);
