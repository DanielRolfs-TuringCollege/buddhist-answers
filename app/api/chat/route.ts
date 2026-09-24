import { z } from "zod";
import { chroma, COLLECTION_NAME } from "@/lib/chroma";
import { embeddings } from "@/lib/llm";

const TOP_K = 5;

// The body comes from the browser, so it is untrusted: check it at runtime.
const requestSchema = z.object({
  text: z.string().trim().min(1, "Question is empty").max(500, "Question is too long"),
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

  // 2. Embed the question and find the closest Q&As. If OpenRouter or Chroma
  //    fails, that's our fault → 500, with details only in the server log.
  try {
    const embedding = await embeddings.embedQuery(parsed.data.text);

    const collection = await chroma.getCollection({ name: COLLECTION_NAME });
    const result = await collection.query({
      queryEmbeddings: [embedding],
      nResults: TOP_K,
      include: ["metadatas", "distances"],
    });

    // rows()[0] = the matches for our first (and only) query vector.
    const results = result.rows()[0].map((row) => ({
      question: row.metadata?.question,
      url: row.metadata?.url,
      distance: row.distance,
    }));

    return Response.json({ results });
  } catch (error) {
    console.error("[chat] search failed:", error);
    return Response.json(
      { error: "Search is not available right now. Please try again." },
      { status: 500 },
    );
  }
}
