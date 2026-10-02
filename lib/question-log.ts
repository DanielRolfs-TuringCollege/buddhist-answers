import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

// One JSON object per line, so the file can be appended to and read line by line.
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "feedback.jsonl");

// Appends a vote on an answer to logs/feedback.jsonl (not in git).
// The vote comes first and the session id next, so good and bad answers and the lines
// of one chat are easy to spot; the time goes last.
// Logging must never break a request, so errors only go to the server log.
type Entry = { vote: string; sessionId: string } & Record<string, unknown>;

export async function logEntry({ vote, sessionId, ...entry }: Entry) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ vote, sessionId, ...entry, time: new Date().toISOString() });
    await appendFile(LOG_FILE, line + "\n");
  } catch (error) {
    console.error("[question-log] could not write:", error);
  }
}
