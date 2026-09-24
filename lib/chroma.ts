import { ChromaClient } from "chromadb";
import { env } from "./env";

export const COLLECTION_NAME = "lama-ole-qa";

// The client wants host/port/ssl separately, so split CHROMA_URL into its parts.
const chromaUrl = new URL(env.CHROMA_URL);

export const chroma = new ChromaClient({
  host: chromaUrl.hostname,
  port: Number(chromaUrl.port),
  ssl: chromaUrl.protocol === "https:",
});
