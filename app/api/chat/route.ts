import { z } from "zod";
import { chroma, COLLECTION_NAME } from "@/lib/chroma";
import { embeddings } from "@/lib/llm";
import { selectPassages, toSegments } from "@/lib/passages";

const TOP_K = 5;

// The body comes from the browser, so it is untrusted: check it at runtime.
const requestSchema = z.object({
  text: z.string().trim().min(1, "Question is empty").max(500, "Question is too long"),
});

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

  // 2. Search and highlight. If OpenRouter or Chroma fails, that's our
  //    fault → 500, with details only in the server log.
  try {
    const embedding = await embeddings.embedQuery(parsed.data.text);

    const collection = await chroma.getCollection({ name: COLLECTION_NAME });
    const result = await collection.query({
      queryEmbeddings: [embedding],
      nResults: TOP_K,
      include: ["metadatas", "documents"],
    });

    // rows()[0] = the matches for our first (and only) query vector.
    // n lets the LLM say which source a passage comes from.
    const sources = result.rows()[0].map((row, index) => ({
      n: index + 1,
      answer: toAnswerText(row.document ?? ""),
      ...metadataSchema.parse(row.metadata),
    }));

    const passages = await selectPassages(parsed.data.text, sources);

    // Keep only sources with at least one passage that answers the question.
    const relevantSources = sources
      .filter((source) => passages.some((passage) => passage.n === source.n))
      .map(({ n, question, url, tags, answer }) => {
        const highlights = passages.filter((passage) => passage.n === n).map((passage) => passage.text);
        return { n, question, url, tags, segments: toSegments(answer, highlights) };
      });

    return Response.json({ sources: relevantSources });
  } catch (error) {
    console.error("[chat] request failed:", error);
    return Response.json(
      { error: "The answer could not be created right now. Please try again." },
      { status: 500 },
    );
  }
}
