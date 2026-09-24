import { chatModel } from "./llm";

const SYSTEM_PROMPT = `You turn the user's latest question into one standalone English search question for a collection of Lama Ole Nydahl's answers.

Rules:
- Use the earlier questions only to fill in what the latest question refers to (e.g. "and in relationships?").
- If the latest question already stands on its own, keep its meaning. Translate it to English if needed.
- Reply with the rewritten question only, nothing else.`;

// Query translation: history + new question → one standalone English question.
export async function rewriteQuestion(question: string, history: string[]) {
  // Without history there's nothing to fill in, but the LLM still translates and cleans up.
  const historyText = history.map((earlier) => `- ${earlier}`).join("\n") || "(none)";

  const response = await chatModel.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `<earlier_questions>\n${historyText}\n</earlier_questions>\n\n<user_question>${question}</user_question>`,
    },
  ]);

  return response.text.trim();
}
