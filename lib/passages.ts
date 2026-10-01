import { z } from "zod";
import { chatModel } from "./llm";

const QUESTION_PROMPT = `You find the passages in Lama Ole Nydahl's answers that answer the user's question.

Rules:
- Copy passages word for word from the "Answer" part of a source. Never change, shorten or combine the text.
- A passage is one or a few whole sentences that directly answer the question.
- Pick at most 2 passages per source: the most direct ones.
- Only include sources that really answer the question. If none do, return an empty list.`;

// Same rules, but for a topic (list_questions): find where the topic is discussed.
const TOPIC_PROMPT = `You find the passages in Lama Ole Nydahl's answers where the user's topic is discussed.

Rules:
- Copy passages word for word from the "Answer" part of a source. Never change, shorten or combine the text.
- A passage is one or a few whole sentences that say something about the topic.
- Pick at most 2 passages per source: the most telling ones.
- Only include sources that really discuss the topic. If none do, return an empty list.`;

// The LLM must reply in exactly this shape (structured output), checked with Zod.
const selectionSchema = z.object({
  passages: z
    .array(
      z.object({
        n: z.number().describe("The number of the source the passage comes from"),
        text: z.string().describe("The passage, copied word for word from the source's answer"),
      }),
    )
    .describe("Passages that answer the question. Empty if no source answers it."),
});

type Source = {
  n: number;
  question: string;
  answer: string;
};

// strict: true asks OpenAI to guarantee the JSON matches the schema.
const selector = chatModel.withStructuredOutput(selectionSchema, {
  name: "select_passages",
  strict: true,
});

// Highlights for a specific question (search_answers).
export function selectPassages(question: string, sources: Source[]) {
  return select(QUESTION_PROMPT, `<user_question>${question}</user_question>`, sources);
}

// Highlights for a topic (list_questions).
export function selectTopicPassages(topic: string, sources: Source[]) {
  return select(TOPIC_PROMPT, `<topic>${topic}</topic>`, sources);
}

async function select(systemPrompt: string, task: string, sources: Source[]) {
  const sourcesText = sources
    .map(
      (source) =>
        `<source n="${source.n}">\nQuestion: ${source.question}\nAnswer: ${source.answer}\n</source>`,
    )
    .join("\n\n");

  const { passages } = await selector.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: `${sourcesText}\n\n${task}` },
  ]);

  // The LLM can still misquote. Keep only passages that really appear in their source.
  return passages.filter((passage) =>
    sources.some((source) => source.n === passage.n && source.answer.includes(passage.text)),
  );
}

export type Segment = {
  text: string;
  highlight: boolean;
};

// Cuts the answer into pieces, marking the pieces that are highlights,
// e.g. "A B C" with highlight "B" → [A, B (highlight), C].
export function toSegments(answer: string, highlights: string[]): Segment[] {
  const ranges = highlights
    .map((highlight) => {
      const start = answer.indexOf(highlight);
      return { start, end: start + highlight.length, highlight };
    })
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let position = 0;

  for (const range of ranges) {
    if (range.start < position) continue; // overlaps a previous highlight
    if (range.start > position) {
      segments.push({ text: answer.slice(position, range.start), highlight: false });
    }
    segments.push({ text: range.highlight, highlight: true });
    position = range.end;
  }

  if (position < answer.length) {
    segments.push({ text: answer.slice(position), highlight: false });
  }

  return segments;
}
