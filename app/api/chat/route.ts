import { z } from "zod";
import { selectPassages, selectTopicPassages, toSegments } from "@/lib/passages";
import { rewriteQuestion } from "@/lib/rewrite";
import { runAgent } from "@/lib/agent";
import { listQuestions, type TopicListing } from "@/lib/tools/list-questions";
import { listTopics, type Topics } from "@/lib/tools/list-topics";
import type { SearchResult } from "@/lib/tools/search-answers";

const questionSchema = z.string().trim().min(1, "Question is empty").max(500, "Question is too long");

// The body comes from the browser, so it is untrusted: check it at runtime.
const requestSchema = z.object({
  text: questionSchema,
  // Earlier questions of this chat, oldest first. Limited to keep prompts small.
  history: z.array(questionSchema).max(10, "History is too long").default([]),
  // Set when the user clicked a topic: then we skip rewrite and agent and list it directly.
  // Whether the name really exists is checked against Chroma below.
  topic: z.string().trim().min(1).max(100).optional(),
  // Set when the user clicked "Show topics": then we list the topics directly.
  showTopics: z.boolean().optional(),
});

export async function POST(request: Request) {
  // 1. Validate input. Bad input is the client's fault → 400.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  // 2. Rewrite, search and highlight. If OpenRouter or Chroma fails, that's our
  //    fault → 500, with details only in the server log.
  try {
    // The "Show topics" button: like a clicked topic, no LLM has to choose the tool.
    if (parsed.data.showTopics) {
      return Response.json({ rewritten: "What topics can I ask about?", sources: [], topics: await listTopics() });
    }

    // A clicked topic: the user already chose the tool and its argument, so no LLM has to.
    const { topic } = parsed.data;
    if (topic) {
      const { categories, tags } = await listTopics();
      if (![...categories, ...tags].some((known) => known.name === topic)) {
        return Response.json({ error: `Unknown topic "${topic}"` }, { status: 400 });
      }
      // Stands in for the rewritten question, so follow-ups have something to refer to.
      return respondWithListing(`Tell me about ${topic}`, await listQuestions(topic));
    }

    // Search with a standalone English question, not the raw (maybe follow-up) text.
    const rewritten = await rewriteQuestion(parsed.data.text, parsed.data.history);
    console.log("[chat] rewritten question:", rewritten);

    // Let the agent pick a tool. The route then uses that tool's result.
    const toolResults = await runAgent(rewritten);
    console.log("[chat] tool results:", toolResults);

    const topicsResult = toolResults.find((toolResult) => toolResult.name === "list_topics");
    if (topicsResult) {
      // Safe cast: the artifact of list_topics is always its Topics object.
      return Response.json({ rewritten, sources: [], topics: topicsResult.result as Topics });
    }

    const listingResult = toolResults.find((toolResult) => toolResult.name === "list_questions");
    if (listingResult) {
      // Safe cast: the artifact of list_questions is always its TopicListing.
      return respondWithListing(rewritten, listingResult.result as TopicListing);
    }

    // The first search the agent ran. No search (e.g. an off-topic question) → no sources.
    const searchResult = toolResults.find((toolResult) => toolResult.name === "search_answers");
    if (!searchResult) {
      return Response.json({ rewritten, sources: [] });
    }
    // Safe cast: the artifact of search_answers is always its SearchResult list.
    const sources = searchResult.result as SearchResult;

    const passages = await selectPassages(rewritten, sources);

    return Response.json({ rewritten, sources: withHighlights(sources, passages) });
  } catch (error) {
    console.error("[chat] request failed:", error);
    return Response.json(
      { error: "The answer could not be created right now. Please try again." },
      { status: 500 },
    );
  }
}

// Highlights the closest Q&As of a topic; the rest of its questions become plain links.
async function respondWithListing(rewritten: string, { topic, sources, questions }: TopicListing) {
  const passages = await selectTopicPassages(topic, sources);
  const relevantSources = withHighlights(sources, passages);

  // Every question of the topic that didn't get a card is listed as a plain link.
  const shownUrls = new Set(relevantSources.map((source) => source.url));
  const moreQuestions = questions.filter((question) => !shownUrls.has(question.url));

  return Response.json({
    rewritten,
    sources: relevantSources,
    listing: { topic, total: questions.length, moreQuestions },
  });
}

type Passage = Awaited<ReturnType<typeof selectPassages>>[number];

// Keep only sources with at least one passage, and cut their answers into highlight segments.
function withHighlights(sources: SearchResult, passages: Passage[]) {
  return sources
    .filter((source) => passages.some((passage) => passage.n === source.n))
    .map(({ n, question, url, tags, answer }) => {
      const highlights = passages.filter((passage) => passage.n === n).map((passage) => passage.text);
      return { n, question, url, tags, segments: toSegments(answer, highlights) };
    });
}
