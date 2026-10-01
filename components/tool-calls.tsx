"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TopicListing } from "@/lib/tools/list-questions";
import type { Topics } from "@/lib/tools/list-topics";
import type { SearchResult } from "@/lib/tools/search-answers";

// What the agent called and what the tool returned (its artifact), as sent by app/api/chat/route.ts.
// The name tells TypeScript which args and result belong together.
export type ToolCall =
  | { name: "search_answers"; args: { query: string }; result: SearchResult }
  | { name: "list_topics"; args: Record<string, never>; result: Topics }
  | { name: "list_questions"; args: { topic: string }; result: TopicListing };

// One chip per tool call; clicking a chip opens a popover with that tool's result.
export function ToolCalls({ toolCalls }: { toolCalls: ToolCall[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {toolCalls.map((toolCall, index) => (
        <li key={index}>
          <Popover>
            <PopoverTrigger className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-amber-700">
              {chipLabel(toolCall)}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 sm:w-96">
              <p className="font-mono text-xs text-stone-500">
                {toolCall.name}({JSON.stringify(toolCall.args)})
              </p>
              {/* Long results scroll inside the popover instead of covering the page. */}
              <div className="max-h-80 overflow-y-auto">
                <ToolResultView toolCall={toolCall} />
              </div>
            </PopoverContent>
          </Popover>
        </li>
      ))}
    </ul>
  );
}

function chipLabel(toolCall: ToolCall) {
  switch (toolCall.name) {
    case "search_answers":
      return `Searched “${toolCall.args.query}”`;
    case "list_topics":
      return "Listed topics";
    case "list_questions":
      return `Listed “${toolCall.args.topic}”`;
  }
}

function ToolResultView({ toolCall }: { toolCall: ToolCall }) {
  switch (toolCall.name) {
    case "search_answers":
      return <SearchResultView results={toolCall.result} />;
    case "list_topics":
      return <TopicsView topics={toolCall.result} />;
    case "list_questions":
      return <ListingView listing={toolCall.result} />;
  }
}

// The found Q&As, closest first, each with a bar for its similarity score (0 to 1).
function SearchResultView({ results }: { results: SearchResult }) {
  return (
    <ol className="space-y-3">
      {results.map((result) => (
        <li key={result.n}>
          <QuestionLink question={result.question} url={result.url} />
          <div className="mt-1 flex items-center gap-2">
            <Bar fraction={result.score} />
            <span className="w-8 text-right font-mono text-xs text-stone-500">{result.score.toFixed(2)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Every tag with its number of Q&As. Bars are relative to the biggest tag.
function TopicsView({ topics }: { topics: Topics }) {
  const maxCount = Math.max(...topics.tags.map((tag) => tag.count));

  return (
    <ul className="space-y-1.5">
      {topics.tags.map((tag) => (
        <li className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-xs" key={tag.name}>
          <span className="truncate text-stone-700">{tag.name}</span>
          <Bar fraction={tag.count / maxCount} />
          <span className="text-right font-mono text-stone-500">{tag.count}</span>
        </li>
      ))}
    </ul>
  );
}

// The topic, how many Q&As it has, and all of them as links.
function ListingView({ listing }: { listing: TopicListing }) {
  return (
    <>
      <p className="mb-2 text-stone-700">
        {listing.questions.length} Q&amp;As on &ldquo;{listing.topic}&rdquo;
      </p>
      <ul className="list-disc space-y-1 pl-5 marker:text-stone-400">
        {listing.questions.map((item) => (
          <li key={item.url}>
            <QuestionLink question={item.question} url={item.url} />
          </li>
        ))}
      </ul>
    </>
  );
}

// A horizontal bar; fraction 0 = empty, 1 = full width.
function Bar({ fraction }: { fraction: number }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-stone-100">
      <div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.max(0, fraction) * 100}%` }} />
    </div>
  );
}

function QuestionLink({ question, url }: { question: string; url: string }) {
  return (
    <a className="text-amber-800 hover:underline" href={url} rel="noopener noreferrer" target="_blank">
      {question}
    </a>
  );
}
