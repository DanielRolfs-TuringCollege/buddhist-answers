import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { chroma, COLLECTION_NAME } from "../chroma";

// Chroma metadata is untyped at runtime, so check the fields we count.
const metadataSchema = z.object({
  category: z.string(),
  // Q&As without tags have no tags field in Chroma (see scripts/index.ts).
  tags: z.array(z.string()).default([]),
});

type TopicCount = { name: string; count: number };

// Turns ["Anger", "Love", "Anger"] into [{ name: "Anger", count: 2 }, { name: "Love", count: 1 }].
export function countNames(names: string[]): TopicCount[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// All categories and tags in the collection, with how many Q&As each one has.
export async function listTopics() {
  const collection = await chroma.getCollection({ name: COLLECTION_NAME });
  // No ids, no filter = every record. We only need the metadata, not texts or vectors.
  const result = await collection.get({ include: ["metadatas"] });
  const metadatas = result.metadatas.map((metadata) => metadataSchema.parse(metadata));

  return {
    categories: countNames(metadatas.map((metadata) => metadata.category)),
    tags: countNames(metadatas.flatMap((metadata) => metadata.tags)),
  };
}

export type Topics = Awaited<ReturnType<typeof listTopics>>;

// The LLM reads name + description to decide when to call this tool.
// No arguments, so the schema is an empty object.
// "content_and_artifact": the tool returns [text for the LLM, raw data for our code].
// The raw data ends up in ToolMessage.artifact and is never sent to the LLM.
export const listTopicsTool = tool(
  async () => {
    const topics = await listTopics();
    return [JSON.stringify(topics), topics];
  },
  {
    name: "list_topics",
    responseFormat: "content_and_artifact",
    description:
      "Lists all categories and tags of Lama Ole's Q&A collection with the number of answers for each. " +
      "Use it only when the user wants to explore or asks what they can ask about.",
    schema: z.object({}),
  },
);
