"use client";

import { useState } from "react";
import type { Segment } from "@/lib/passages";

export type Source = {
  n: number;
  question: string;
  url: string;
  tags: string[];
  // The full answer, cut into pieces; highlighted pieces answer the question.
  segments: Segment[];
};

const MARK_CLASS = "rounded bg-amber-100 px-0.5 text-stone-900";

// Collapsed: only the highlighted passages. Expanded: the question and the full answer.
export function SourceCard({ source }: { source: Source }) {
  // Each card has its own state, so opening one card doesn't open the others.
  const [isExpanded, setIsExpanded] = useState(false);

  const highlights = source.segments.filter((segment) => segment.highlight);

  return (
    <article className="rounded-2xl bg-white p-5">
      {isExpanded && <h2 className="mb-3 font-semibold">{source.question}</h2>}

      {isExpanded ? (
        <p className="whitespace-pre-wrap leading-relaxed text-stone-700">
          {source.segments.map((segment, index) =>
            segment.highlight ? (
              <mark className={MARK_CLASS} key={index}>
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
      ) : (
        <div className="space-y-2 leading-relaxed">
          {highlights.map((segment, index) => (
            <p key={index}>
              <mark className={MARK_CLASS}>{segment.text}</mark>
            </p>
          ))}
        </div>
      )}

      {/* Bottom row: toggle left, tags center, link right. The two outer columns
          are equally wide (1fr), so the middle one sits exactly in the center. */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <button
          aria-expanded={isExpanded}
          // -ml-3 cancels the left padding, so the text lines up with the card content.
          className="-ml-3 justify-self-start rounded-lg px-3 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
          onClick={() => setIsExpanded(!isExpanded)}
          type="button"
        >
          {isExpanded ? "Show less" : "Show full Q&A"}
        </button>
        <p className="text-center text-xs text-stone-500">{source.tags.join(" · ")}</p>
        <a
          className="justify-self-end rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
          href={source.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Source
        </a>
      </div>
    </article>
  );
}
