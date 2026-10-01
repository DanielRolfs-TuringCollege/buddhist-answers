"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MoreQuestions } from "@/components/more-questions";
import { type Source, SourceCard } from "@/components/source-card";
import type { Topics } from "@/lib/tools/list-topics";

type Message = {
  id: number;
  text: string;
  // The standalone English question that was actually searched.
  rewritten: string;
  sources: Source[];
  // Only set when the agent used list_topics ("What can I ask about?").
  topics?: Topics;
  // Only set when the agent used list_questions ("What else should I know about X?").
  listing?: Listing;
};

type Listing = {
  topic: string;
  total: number;
  // The topic's questions without a highlighted card.
  moreQuestions: { question: string; url: string }[];
};

// How many earlier questions are sent along, so follow-ups can be understood.
const HISTORY_LENGTH = 1;

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Points to the newest message, so we can scroll it into view.
  const lastMessageRef = useRef<HTMLDivElement>(null);

  // A new message (typed or a clicked topic) may appear far below: scroll to its start.
  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [messages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!message.trim()) {
      return;
    }

    if (await ask(message.trim())) {
      setMessage("");
    }
  }

  // Sends a question, a clicked topic or "Show topics" (then the server skips the LLMs).
  // Returns whether it worked, so the form only clears the input on success.
  async function ask(text: string, options: { topic?: string; showTopics?: boolean } = {}) {
    setIsLoading(true);
    setError(null);

    let data: { rewritten: string; sources: Source[]; topics?: Topics; listing?: Listing };

    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({
          text,
          ...options,
          // Rewritten questions are standalone, so the resolved topic carries over to the next turn.
          history: messages.slice(-HISTORY_LENGTH).map((earlier) => earlier.rewritten),
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
      return false;
    } finally {
      setIsLoading(false);
    }

    setMessages((currentMessages) => [...currentMessages, { id: Date.now(), text, ...data }]);
    return true;
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
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-stone-500">
              <p>Ask a question below or request a list of topics to explore.</p>
              <button
                className="mt-4 rounded-xl bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isLoading}
                onClick={() => ask("Show topics", { showTopics: true })}
                type="button"
              >
                Show topics
              </button>
            </div>
          ) : (
            messages.map((currentMessage, index) => (
              <div
                // scroll-mt keeps the message from hiding under the sticky header.
                className="scroll-mt-36 space-y-4"
                key={currentMessage.id}
                ref={index === messages.length - 1 ? lastMessageRef : undefined}
              >
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-amber-700 px-4 py-3 text-white">
                  {currentMessage.text}
                </div>
                {currentMessage.topics ? (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-stone-700">
                    <p className="mb-3">You can ask about these topics:</p>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Categories
                    </h2>
                    <ul className="mb-4 flex flex-wrap gap-2">
                      {currentMessage.topics.categories.map((category) => (
                        <li key={category.name}>
                          <button
                            className="rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={isLoading}
                            onClick={() => ask(category.name, { topic: category.name })}
                            type="button"
                          >
                            {category.name} ({category.count})
                          </button>
                        </li>
                      ))}
                    </ul>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Tags
                    </h2>
                    <ul className="flex flex-wrap gap-2">
                      {currentMessage.topics.tags.map((tag) => (
                        <li key={tag.name}>
                          <button
                            className="rounded-full bg-stone-100 px-3 py-1 text-sm transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={isLoading}
                            onClick={() => ask(tag.name, { topic: tag.name })}
                            type="button"
                          >
                            {tag.name} ({tag.count})
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : currentMessage.listing ? (
                  <>
                    <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-stone-700">
                      {currentMessage.listing.total} Q&amp;As on &ldquo;{currentMessage.listing.topic}&rdquo;
                      {currentMessage.sources.length > 0 && ", these discuss it most directly:"}
                    </p>
                    {currentMessage.sources.map((source) => (
                      <SourceCard key={source.n} source={source} />
                    ))}
                    {currentMessage.listing.moreQuestions.length > 0 && (
                      <MoreQuestions questions={currentMessage.listing.moreQuestions} />
                    )}
                  </>
                ) : currentMessage.sources.length === 0 ? (
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
