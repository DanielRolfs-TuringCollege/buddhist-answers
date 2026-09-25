import { z } from "zod";
import { selectPassages, toSegments } from "@/lib/passages";
import { rewriteQuestion } from "@/lib/rewrite";
import { runAgent } from "@/lib/agent";
import type { Topics } from "@/lib/tools/list-topics";
import type { SearchResult } from "@/lib/tools/search-answers";

const questionSchema = z.string().trim().min(1, "Question is empty").max(500, "Question is too long");

// The body comes from the browser, so it is untrusted: check it at runtime.
const requestSchema = z.object({
  text: questionSchema,
  // Earlier questions of this chat, oldest first. Limited to keep prompts small.
  history: z.array(questionSchema).max(10, "History is too long").default([]),
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

    // The first search the agent ran. No search (e.g. an off-topic question) → no sources.
    const searchResult = toolResults.find((toolResult) => toolResult.name === "search_answers");
    if (!searchResult) {
      return Response.json({ rewritten, sources: [] });
    }
    // Safe cast: the artifact of search_answers is always its SearchResult list.
    const sources = searchResult.result as SearchResult;

    const passages = await selectPassages(rewritten, sources);

    // Keep only sources with at least one passage that answers the question.
    const relevantSources = sources
      .filter((source) => passages.some((passage) => passage.n === source.n))
      .map(({ n, question, url, tags, answer }) => {
        const highlights = passages.filter((passage) => passage.n === n).map((passage) => passage.text);
        return { n, question, url, tags, segments: toSegments(answer, highlights) };
      });
      
    return Response.json({ rewritten, sources: relevantSources });
  } catch (error) {
    console.error("[chat] request failed:", error);
    return Response.json(
      { error: "The answer could not be created right now. Please try again." },
      { status: 500 },
    );
  }
}
