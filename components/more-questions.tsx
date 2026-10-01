"use client";

import { useState } from "react";

type Question = { question: string; url: string };

// How many questions are shown before "Show more".
const PREVIEW_LENGTH = 5;

// The topic's questions without a highlighted card, as links to the original pages.
export function MoreQuestions({ questions }: { questions: Question[] }) {
  // Each list has its own state, so expanding one doesn't expand the others.
  const [isExpanded, setIsExpanded] = useState(false);

  const visibleQuestions = isExpanded ? questions : questions.slice(0, PREVIEW_LENGTH);
  const hiddenCount = questions.length - visibleQuestions.length;

  return (
    <div className="rounded-2xl bg-white px-5 py-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
        More questions on this topic
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-sm marker:text-stone-400">
        {visibleQuestions.map((item) => (
          <li key={item.url}>
            <a
              className="text-amber-800 hover:underline"
              href={item.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {item.question}
            </a>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          // -ml-3 cancels the left padding, so the text lines up with the list.
          className="-ml-3 mt-3 rounded-lg px-3 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
          onClick={() => setIsExpanded(true)}
          type="button"
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}
