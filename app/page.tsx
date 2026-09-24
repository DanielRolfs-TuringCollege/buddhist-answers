"use client";

import { FormEvent, useState } from "react";

type Message = {
  id: number;
  text: string;
  // Temporary: the search results as plain text, until the LLM writes a real answer.
  resultText: string;
};

type SearchResult = {
  question: string;
  url: string;
  distance: number;
};

function formatResults(results: SearchResult[]) {
  return results
    .map((result, index) => {
      const distance = result.distance.toFixed(3);
      return `${index + 1}. ${result.question} (distance ${distance})\n   ${result.url}`;
    })
    .join("\n");
}

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!message.trim()) {
      return;
    }

    setIsLoading(true);
    setError(null);

    let resultText: string;

    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({ text: message.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      const data = (await response.json()) as { results: SearchResult[] };
      resultText = formatResults(data.results);
    } catch {
      setError("We could not process your question. Please try again.");
      return;
    } finally {
      setIsLoading(false);
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      { id: Date.now(), text: message.trim(), resultText },
    ]);
    setMessage("");
  }

  return (
    <main className="flex min-h-screen flex-col bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-700">
            Ask Lama Ole
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            Questions and answers from Lama Ole Nydahl
          </h1>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <div className="flex-1 space-y-4">
          {messages.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-stone-500">
              Ask a question about the collection to get started.
            </p>
          ) : (
            messages.map((currentMessage) => (
              <div className="space-y-4" key={currentMessage.id}>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-amber-700 px-4 py-3 text-white">
                  {currentMessage.text}
                </div>
                <pre className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white px-4 py-3 font-sans text-sm text-stone-700">
                  {currentMessage.resultText}
                </pre>
              </div>
            ))
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

        <form
          className="mt-8 flex items-end gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm"
          onSubmit={handleSubmit}
        >
          <label className="sr-only" htmlFor="message">
            Your question
          </label>
          <textarea
            className="min-h-12 flex-1 resize-none bg-transparent px-2 py-3 text-stone-900 outline-none placeholder:text-stone-400"
            id="message"
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter adds a new line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!isLoading) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            placeholder="Ask a question..."
            rows={1}
            value={message}
          />
          <button
            className="rounded-xl bg-stone-900 px-4 py-3 font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!message.trim() || isLoading}
            type="submit"
          >
            {isLoading ? "Searching..." : "Send"}
          </button>
        </form>
      </section>
    </main>
  );
}
