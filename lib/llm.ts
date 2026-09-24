import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { env } from "./env";

// OpenRouter speaks the OpenAI API, so the OpenAI classes work once baseURL points to it.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Used both for indexing and for search queries: vectors are only comparable
// when they come from the same model.
export const embeddings = new OpenAIEmbeddings({
  model: env.EMBEDDING_MODEL,
  apiKey: env.OPENROUTER_API_KEY,
  configuration: { baseURL: OPENROUTER_BASE_URL },
});

// temperature 0 = as little randomness as possible: we want faithful answers, not creative ones.
export const chatModel = new ChatOpenAI({
  model: env.CHAT_MODEL,
  apiKey: env.OPENROUTER_API_KEY,
  temperature: 0,
  configuration: { baseURL: OPENROUTER_BASE_URL },
});
