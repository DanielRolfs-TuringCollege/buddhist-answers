import { ThumbsDown, ThumbsUp } from "lucide-react";

export type Vote = "positive" | "negative";

// Thumbs up/down under an answer. The chosen one stays highlighted; clicking the other changes the vote.
export function FeedbackButtons({ vote, onVote }: { vote?: Vote; onVote: (vote: Vote) => void }) {
  const buttons = [
    { value: "positive", label: "Helpful", Icon: ThumbsUp },
    { value: "negative", label: "Not helpful", Icon: ThumbsDown },
  ] as const;

  return (
    <div className="flex gap-1">
      {buttons.map(({ value, label, Icon }) => (
        <button
          aria-label={label}
          aria-pressed={vote === value}
          className={`rounded-md p-1.5 transition hover:bg-stone-200 ${
            vote === value ? "text-amber-700" : "text-stone-400"
          }`}
          key={value}
          onClick={() => onVote(value)}
          type="button"
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
