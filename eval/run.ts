// Runs every test question through the real chat API and checks what came back.
// Needs the app (pnpm dev) and Chroma running. Writes eval/results.json for eval/ragas_eval.py.
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

const API_URL = process.env.EVAL_URL ?? "http://localhost:3000/api/chat";

// What we expect the app to do with a question.
const behaviourSchema = z.enum(["answer", "topics", "listing", "no_answer", "blocked"]);
type Behaviour = z.infer<typeof behaviourSchema> | "error";

// One line of eval/questions.jsonl. Hand-written, but still checked so a typo fails loudly.
const testQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["specific", "followup", "explore", "listing", "no_answer", "off_topic", "injection"]),
  question: z.string(),
  history: z.array(z.string()),
  expected: behaviourSchema,
  expected_tool: z.enum(["search_answers", "list_topics", "list_questions"]).optional(),
  expected_urls: z.array(z.url()).optional(),
  expected_topic: z.string().optional(),
  reference: z.string().optional(),
});
type TestQuestion = z.infer<typeof testQuestionSchema>;

// The parts of the /api/chat response we look at (see app/api/chat/route.ts).
type ChatResponse = {
  error?: string;
  blocked?: string;
  rewritten?: string;
  topics?: unknown;
  listing?: { topic: string; fallback: boolean };
  sources?: { url: string; segments: { text: string; highlight: boolean }[] }[];
  toolCalls?: { name: string; args: Record<string, unknown>; result: unknown }[];
};

type Retrieved = { url: string; question: string; answer: string; score: number };

function readQuestions() {
  return readFileSync("eval/questions.jsonl", "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => testQuestionSchema.parse(JSON.parse(line)));
}

async function ask(test: TestQuestion): Promise<ChatResponse> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: test.question, history: test.history }),
  });
  return response.json();
}

// Which of the five outcomes the response shows. Same order of checks as the UI.
function behaviourOf(response: ChatResponse): Behaviour {
  if (response.error) return "error";
  if (response.blocked) return "blocked";
  if (response.topics) return "topics";
  // A fallback listing means: no direct answer, here are related Q&As.
  if (response.listing) return response.listing.fallback ? "no_answer" : "listing";
  return response.sources?.length ? "answer" : "no_answer";
}

async function evaluate(test: TestQuestion) {
  const response = await ask(test);
  const behaviour = behaviourOf(response);
  const toolCalls = response.toolCalls ?? [];

  // What vector search returned (all TOP_K results), before passage selection filtered them.
  const search = toolCalls.find((call) => call.name === "search_answers");
  const retrieved = (search?.result as Retrieved[] | undefined) ?? [];
  // The Q&As the user actually sees as cards (only those with a highlight).
  const shownUrls = (response.sources ?? []).map((source) => source.url);
  const highlights = (response.sources ?? []).flatMap((source) =>
    source.segments.filter((segment) => segment.highlight).map((segment) => segment.text),
  );

  // The agent's choice is the first tool call; a fallback listing is appended later by the route.
  const firstTool = toolCalls[0]?.name;
  const expectedUrls = test.expected_urls ?? [];

  const checks = {
    behaviour: behaviour === test.expected,
    tool: test.expected_tool ? firstTool === test.expected_tool : undefined,
    // Hit = at least one expected Q&A is among the search results / among the shown cards.
    retrievalHit: expectedUrls.length ? retrieved.some((r) => expectedUrls.includes(r.url)) : undefined,
    shownHit: expectedUrls.length ? shownUrls.some((url) => expectedUrls.includes(url)) : undefined,
    topic: test.expected_topic ? toolCalls[0]?.args.topic === test.expected_topic : undefined,
  };

  return {
    ...test,
    behaviour,
    rewritten: response.rewritten ?? "",
    tools: toolCalls.map((call) => ({ name: call.name, args: call.args })),
    retrieved: retrieved.map(({ url, question, answer, score }) => ({ url, question, answer, score })),
    shownUrls,
    highlights,
    error: response.error,
    checks,
  };
}

type Result = Awaited<ReturnType<typeof evaluate>>;

// Share of results where the check passed, ignoring results the check doesn't apply to.
function rate(results: Result[], check: (result: Result) => boolean | undefined) {
  const values = results.map(check).filter((value) => value !== undefined);
  if (values.length === 0) return "-";
  const passed = values.filter(Boolean).length;
  return `${passed}/${values.length} (${Math.round((passed / values.length) * 100)}%)`;
}

function printSummary(results: Result[]) {
  const ofType = (...types: TestQuestion["type"][]) => results.filter((result) => types.includes(result.type));
  const answerable = ofType("specific", "followup");
  const legitimate = ofType("specific", "followup", "explore", "listing", "no_answer");

  const summary = {
    "Retrieval hit rate (expected Q&A in search results)": rate(answerable, (r) => r.checks.retrievalHit),
    "Shown hit rate (expected Q&A shown as a card)": rate(answerable, (r) => r.checks.shownHit),
    "Specific: answered": rate(ofType("specific"), (r) => r.checks.behaviour),
    "Follow-ups: answered": rate(ofType("followup"), (r) => r.checks.behaviour),
    "Tool choice correct": rate(results, (r) => r.checks.tool),
    "Listing topic correct": rate(results, (r) => r.checks.topic),
    "Explore: topics shown": rate(ofType("explore"), (r) => r.checks.behaviour),
    "No answer: correctly no direct answer": rate(ofType("no_answer"), (r) => r.checks.behaviour),
    "Off topic: blocked": rate(ofType("off_topic"), (r) => r.checks.behaviour),
    "Injection: blocked": rate(ofType("injection"), (r) => r.checks.behaviour),
    "Legitimate questions wrongly blocked": rate(legitimate, (r) => r.behaviour === "blocked"),
  };
  console.table(summary);
  // Saved so runs can be compared with git diff (e.g. agent vs. plain pipeline).
  writeFileSync("eval/summary.json", JSON.stringify(summary, null, 2));

  const failed = results.filter((result) => Object.values(result.checks).includes(false));
  for (const result of failed) {
    const failedChecks = Object.entries(result.checks).filter(([, passed]) => passed === false);
    console.log(
      `✗ ${result.id} "${result.question}" → ${result.behaviour}` +
        ` (rewritten: "${result.rewritten}", tools: ${result.tools.map((tool) => tool.name).join(", ") || "none"})` +
        ` failed: ${failedChecks.map(([name]) => name).join(", ")}`,
    );
  }
}

async function main() {
  const questions = readQuestions();
  const results: Result[] = [];

  // One at a time: easier to follow in the log and gentle on the OpenRouter rate limit.
  for (const test of questions) {
    process.stdout.write(`${test.id} ${test.question.slice(0, 60)} … `);
    const result = await evaluate(test);
    console.log(result.behaviour);
    results.push(result);
  }

  writeFileSync("eval/results.json", JSON.stringify(results, null, 2));
  console.log(`\nWrote eval/results.json (${results.length} questions)\n`);
  printSummary(results);
}

main();
