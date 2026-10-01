import { tool } from "@langchain/core/tools";
import type { Where } from "chromadb";
import { z } from "zod";
import { chroma, COLLECTION_NAME } from "../chroma";
import { embeddings } from "../llm";
import { toAnswerText } from "./search-answers";

// How many Q&As of the topic get highlights (one LLM call over all of them).
const HIGHLIGHT_K = 10;

// Chroma metadata is untyped at runtime, so check the fields we rely on.
const metadataSchema = z.object({
  question: z.string(),
  url: z.url(),
  // Q&As without tags have no tags field in Chroma (see scripts/index.ts).
  tags: z.array(z.string()).default([]),
});

// All Q&As of one tag or category, plus the HIGHLIGHT_K closest to the topic with their answers.
export async function listQuestions(topic: string) {
  // A topic name is either a category or a tag (no name is both), so match either field.
  const where: Where = { $or: [{ category: topic }, { tags: { $contains: topic } }] };

  const collection = await chroma.getCollection({ name: COLLECTION_NAME });
  const embedding = await embeddings.embedQuery(topic);

  // get = every match, unranked. query = vector search, but only inside the filter.
  const [all, closest] = await Promise.all([
    collection.get({ where, include: ["metadatas"] }),
    collection.query({
      queryEmbeddings: [embedding],
      nResults: HIGHLIGHT_K,
      where,
      include: ["metadatas", "documents"],
    }),
  ]);

  const sources = closest.rows()[0].map((row, index) => ({
    n: index + 1,
    answer: toAnswerText(row.document ?? ""),
    ...metadataSchema.parse(row.metadata),
  }));

  const questions = all.metadatas.map((metadata) => {
    const { question, url } = metadataSchema.parse(metadata);
    return { question, url };
  });

  return { topic, sources, questions };
}

export type TopicListing = Awaited<ReturnType<typeof listQuestions>>;

// Built per request, because the valid topic names come from Chroma (see lib/agent.ts).
// z.enum means the LLM can only pick an existing tag or category name.
export function createListQuestionsTool(topicNames: [string, ...string[]]) {
  return tool(
    async ({ topic }) => {
      const listing = await listQuestions(topic);
      // The LLM only gets the count; the Q&As stay in the artifact for our code.
      return [JSON.stringify({ topic, count: listing.questions.length }), listing];
    },
    {
      name: "list_questions",
      responseFormat: "content_and_artifact",
      description:
        "Lists the Q&As of one topic (a tag or a category) from Lama Ole's collection. " +
        "Use it when the user asks broadly about a topic instead of a specific question, " +
        'e.g. "Tell me about X" or "What else should I know about X?".',
      schema: z.object({
        topic: z.enum(topicNames).describe("The tag or category that best matches the user's topic"),
      }),
    },
  );
}
