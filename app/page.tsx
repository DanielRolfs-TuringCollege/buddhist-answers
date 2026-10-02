"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { FeedbackButtons, type Vote } from "@/components/feedback-buttons";
import { MoreQuestions } from "@/components/more-questions";
import { type Source, SourceCard } from "@/components/source-card";
import { type ToolCall, ToolCalls } from "@/components/tool-calls";
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
  // What the agent called. Empty or missing when no agent ran (clicked topic, "Show topics").
  toolCalls?: ToolCall[];
  // Only set when the guard blocked the question: the text to show instead of an answer.
  blocked?: string;
  // The user's thumbs up/down, once they clicked one.
  vote?: Vote;
};

type Listing = {
  topic: string;
  total: number;
  // The topic's questions without a highlighted card.
  moreQuestions: { question: string; url: string }[];
  // True when the question had no direct answer and this related topic is shown instead.
  fallback: boolean;
};

// What one tool call found, for the feedback log: the Q&As without their long answer texts.
function summarizeToolCall(toolCall: ToolCall) {
  switch (toolCall.name) {
    case "search_answers":
      return {
        tool: toolCall.name,
        args: toolCall.args,
        found: toolCall.result.map(({ question, url, score }) => ({ question, url, score })),
      };
    case "list_questions":
      return {
        tool: toolCall.name,
        args: toolCall.args,
        found: toolCall.result.sources.map(({ question, url }) => ({ question, url })),
      };
    case "list_topics":
      // Only topic names and counts: nothing was retrieved to judge.
      return { tool: toolCall.name, args: {}, found: [] };
  }
}

// How many earlier questions are sent along, so follow-ups can be understood.
const HISTORY_LENGTH = 1;

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The step the server is working on, e.g. "Rewriting". Null until the first step arrives.
  const [step, setStep] = useState<string | null>(null);
  // Identifies this chat in the server's feedback log. A reload starts a new session.
  const [sessionId] = useState(() => crypto.randomUUID());
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
    setStep(null);

    let data: Omit<Message, "id" | "text" | "vote">;

    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({
          text,
          ...options,
          // Rewritten questions are standalone, so the resolved topic carries over to the next turn.
          // Blocked questions are skipped: they have no rewritten question to carry over.
          history: messages
            .filter((earlier) => !earlier.blocked)
            .slice(-HISTORY_LENGTH)
            .map((earlier) => earlier.rewritten),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      // The server sends one JSON object per line: a { step } while it works, the answer last.
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let streamed = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        streamed += value;
        // The second-to-last piece is the newest complete line (the last one may still be arriving).
        const newest = JSON.parse(streamed.split("\n").at(-2) ?? "{}");
        if (newest.step) setStep(newest.step);
      }

      const answer = JSON.parse(streamed.trim().split("\n").at(-1)!);
      if (answer.error) {
        throw new Error(answer.error);
      }
      data = answer;
    } catch {
      setError("We could not process your question. Please try again.");
      return false;
    } finally {
      setIsLoading(false);
    }

    setMessages((currentMessages) => [...currentMessages, { id: Date.now(), text, ...data }]);
    return true;
  }

  // Shows the thumbs up/down on one message and sends it to the question log with a short
  // version of the answer. Every click is sent, so a changed vote shows up as a later line.
  function handleVote(votedMessage: Message, vote: Vote) {
    setMessages((currentMessages) =>
      currentMessages.map((earlier) => (earlier.id === votedMessage.id ? { ...earlier, vote } : earlier)),
    );

    fetch("/api/feedback", {
      body: JSON.stringify({
        vote,
        sessionId,
        text: votedMessage.text,
        retrieved: (votedMessage.toolCalls ?? []).map(summarizeToolCall),
        result: {
          rewritten: votedMessage.rewritten,
          blocked: votedMessage.blocked,
          topic: votedMessage.listing?.topic,
          sources: votedMessage.sources.map(({ question, url }) => ({ question, url })),
        },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => {
      // Feedback is only for our log: if it fails, the user doesn't need to know.
    });
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
                {currentMessage.toolCalls && currentMessage.toolCalls.length > 0 && (
                  <ToolCalls toolCalls={currentMessage.toolCalls} />
                )}
                {currentMessage.blocked ? (
                  <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-amber-50 px-4 py-3 text-amber-900">
                    {currentMessage.blocked}
                  </p>
                ) : currentMessage.topics ? (
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
                      {currentMessage.listing.fallback ? (
                        <>
                          Lama Ole doesn&apos;t answer this exact question, but these Q&amp;As
                          on &ldquo;{currentMessage.listing.topic}&rdquo; might still help:
                        </>
                      ) : (
                        <>
                          {currentMessage.listing.total} Q&amp;As on &ldquo;{currentMessage.listing.topic}&rdquo;
                          {currentMessage.sources.length > 0 && ", these discuss it most directly:"}
                        </>
                      )}
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
                <FeedbackButtons
                  onVote={(vote) => handleVote(currentMessage, vote)}
                  vote={currentMessage.vote}
                />
              </div>
            ))
          )}
        </div>

        {/* Sticks to the bottom of the screen; the background hides answers scrolling behind it. */}
        <div className="sticky bottom-0 mt-8 bg-stone-100 pb-6 pt-2">
          {error && <p className="mb-2 text-sm text-red-700">{error}</p>}

          {/* Shown while the server checks, rewrites, searches and highlights (several seconds). */}
          {isLoading && (
            <p className="mb-2 flex items-center gap-2 text-sm text-stone-500" role="status">
              <span className="size-4 animate-spin rounded-full border-2 border-stone-300 border-t-amber-700" />
              {step ?? "Searching Lama Ole's answers"}…
            </p>
          )}

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
