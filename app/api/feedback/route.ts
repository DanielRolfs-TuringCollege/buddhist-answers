import { z } from "zod";
import { logEntry } from "@/lib/question-log";

// A thumbs up/down on one answer. The body comes from the browser, so it is untrusted:
// check it at runtime, with limits like the chat route, so nobody can fill the log file.
const feedbackSchema = z.object({
  vote: z.enum(["positive", "negative"]),
  sessionId: z.uuid(),
  // What the user typed or clicked.
  text: z.string().trim().min(1).max(500),
  // What each tool call found, before passage selection dropped anything: shows why an answer was bad.
  // Empty when no agent ran (clicked topic, "Show topics").
  retrieved: z
    .array(
      z.object({
        tool: z.string().max(50),
        args: z.record(z.string(), z.string().max(500)),
        found: z
          .array(z.object({ question: z.string().max(1000), url: z.url(), score: z.number().optional() }))
          .max(50),
      }),
    )
    .max(10),
  // A short version of what the user got: enough to judge the answer, without the full texts.
  result: z.object({
    rewritten: z.string().max(500),
    blocked: z.string().max(500).optional(),
    topic: z.string().max(100).optional(),
    sources: z.array(z.object({ question: z.string().max(1000), url: z.url() })).max(50),
  }),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  await logEntry(parsed.data);
  // Nothing to send back: 204 No Content.
  return new Response(null, { status: 204 });
}
