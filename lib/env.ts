import { z } from "zod";

// All settings the app reads from the environment (.env.local).
// Only the API key is required; everything else has a sensible default.
const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is missing"),
  CHROMA_URL: z.url().default("http://localhost:8000"),
  CHAT_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),
  EMBEDDING_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
}

export const env = result.data;
