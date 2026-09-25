import { chatModel } from "./llm";

const SYSTEM_PROMPT = `You turn the user's latest question into one standalone English question, phrased the way the user would ask it.

Rules:
- Keep the user's meaning, scope and perspective. Do not make a question more general or more specific than the user asked it.
- Do not turn it into a question about what someone says or teaches.
- Use the earlier questions only to resolve what the latest question refers to. Replace the reference with the shortest phrase that captures it, usually the topic, not a copy of the earlier question.
- If the latest question already stands on its own, only translate it to English if needed.
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
