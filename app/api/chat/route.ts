import { z } from "zod";
import { BLOCKED_MESSAGES, checkMessage } from "@/lib/guard";
import { selectPassages, selectTopicPassages, toSegments } from "@/lib/passages";
import { rewriteQuestion } from "@/lib/rewrite";
import { runAgent, type ToolResult } from "@/lib/agent";
import { listQuestions, type TopicListing } from "@/lib/tools/list-questions";
import { countNames, listTopics, type Topics } from "@/lib/tools/list-topics";
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

    // Typed text goes to the LLMs, so check it first. Blocked → no rewrite, agent or search.
    const { verdict, reason } = await checkMessage(parsed.data.text);
    if (verdict !== "ok") {
      console.log(`[chat] blocked (${verdict}):`, reason);
      return Response.json({ rewritten: "", sources: [], blocked: BLOCKED_MESSAGES[verdict] });
    }

    // Search with a standalone English question, not the raw (maybe follow-up) text.
    const rewritten = await rewriteQuestion(parsed.data.text, parsed.data.history);
    console.log("[chat] rewritten question:", rewritten);

    // Let the agent pick a tool. The route then uses that tool's result.
    const toolResults = await runAgent(rewritten);
    console.log("[chat] tool results:", toolResults);
    // Every response below also sends the tool calls, so the UI can show what the agent did.

    const topicsResult = toolResults.find((toolResult) => toolResult.name === "list_topics");
    if (topicsResult) {
      // Safe cast: the artifact of list_topics is always its Topics object.
      return Response.json({ rewritten, sources: [], topics: topicsResult.result as Topics, toolCalls: toolResults });
    }

    const listingResult = toolResults.find((toolResult) => toolResult.name === "list_questions");
    if (listingResult) {
      // Safe cast: the artifact of list_questions is always its TopicListing.
      return respondWithListing(rewritten, listingResult.result as TopicListing, toolResults);
    }

    // The first search the agent ran. No search (e.g. an off-topic question) → no sources.
    const searchResult = toolResults.find((toolResult) => toolResult.name === "search_answers");
    if (!searchResult) {
      return Response.json({ rewritten, sources: [], toolCalls: toolResults });
    }
    // Safe cast: the artifact of search_answers is always its SearchResult list.
    const sources = searchResult.result as SearchResult;

    const passages = await selectPassages(rewritten, sources);

    // None of the found Q&As answers the question. Instead of "no answer", list the topic
    // most of them share: related Q&As that may still help.
    if (passages.length === 0) {
      const topic = countNames(sources.flatMap((source) => source.tags))[0]?.name;
      if (topic) {
        const listing = await listQuestions(topic);
        // Run by our code, not the agent, but shown like the other tool calls.
        const fallbackCall = { name: "list_questions", args: { topic }, result: listing };
        return respondWithListing(rewritten, listing, [...toolResults, fallbackCall], true);
      }
    }

    return Response.json({ rewritten, sources: withHighlights(sources, passages), toolCalls: toolResults });
  } catch (error) {
    console.error("[chat] request failed:", error);
    return Response.json(
      { error: "The answer could not be created right now. Please try again." },
      { status: 500 },
    );
  }
}

// Highlights the closest Q&As of a topic; the rest of its questions become plain links.
// A clicked topic has no agent, so no tool calls to show.
async function respondWithListing(
  rewritten: string,
  { topic, sources, questions }: TopicListing,
  toolCalls: ToolResult[] = [],
  // True when the question had no direct answer and this topic is the fallback.
  fallback = false,
) {
  const passages = await selectTopicPassages(topic, sources);
  const relevantSources = withHighlights(sources, passages);

  // Every question of the topic that didn't get a card is listed as a plain link.
  const shownUrls = new Set(relevantSources.map((source) => source.url));
  const moreQuestions = questions.filter((question) => !shownUrls.has(question.url));

  return Response.json({
    rewritten,
    sources: relevantSources,
    listing: { topic, total: questions.length, moreQuestions, fallback },
    toolCalls,
  });
}

type Passage = Awaited<ReturnType<typeof selectPassages>>[number];

// Keep only sources with at least one passage, and cut their answers into highlight segments.
// Typed as a topic's sources: search results have the same fields (plus a score we don't need here).
function withHighlights(sources: TopicListing["sources"], passages: Passage[]) {
  return sources
    .filter((source) => passages.some((passage) => passage.n === source.n))
    .map(({ n, question, url, tags, answer }) => {
      const highlights = passages.filter((passage) => passage.n === n).map((passage) => passage.text);
      return { n, question, url, tags, segments: toSegments(answer, highlights) };
    });
}
