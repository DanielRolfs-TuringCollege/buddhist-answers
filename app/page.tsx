"use client";

import { FormEvent, useState } from "react";
import { type Source, SourceCard } from "@/components/source-card";

type Message = {
  id: number;
  text: string;
  // The standalone English question that was actually searched.
  rewritten: string;
  sources: Source[];
};

// How many earlier questions are sent along, so follow-ups can be understood.
const HISTORY_LENGTH = 4;

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

    let data: { rewritten: string; sources: Source[] };

    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({
          text: message.trim(),
          history: messages.slice(-HISTORY_LENGTH).map((earlier) => earlier.text),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      data = await response.json();
    } catch {
      setError("We could not process your question. Please try again.");
      return;
    } finally {
      setIsLoading(false);
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      { id: Date.now(), text: message.trim(), ...data },
    ]);
    setMessage("");
  }

  return (
    <main className="flex min-h-screen flex-col bg-stone-100 text-stone-900">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <p className="text-xl font-extralight uppercase tracking-[0.2em]">
            Questions to
          </p>
          <h1 className="text-4xl font-semibold">
            Lama Ole
          </h1>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pt-8">
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
                <p className="text-right text-xs text-stone-500">
                  Searched for: {currentMessage.rewritten}
                </p>
                {currentMessage.sources.length === 0 ? (
                  <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-stone-700">
                    There&apos;s no answer from Lama Ole on this topic in the collection.
                  </p>
                ) : (
                  currentMessage.sources.map((source) => (
                    <SourceCard key={source.n} source={source} />
                  ))
                )}
              </div>
            ))
          )}
        </div>

        {/* Sticks to the bottom of the screen; the background hides answers scrolling behind it. */}
        <div className="sticky bottom-0 mt-8 bg-stone-100 pb-6 pt-2">
          {error && <p className="mb-2 text-sm text-red-700">{error}</p>}

          <form
            className="flex items-end gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm"
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
        </div>
      </section>
    </main>
  );
}
