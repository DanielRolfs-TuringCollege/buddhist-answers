"""Scores eval/results.json (written by eval/run.ts) with RAGAs metrics.

Only the specific and follow-up questions are scored: they have a reference answer,
and the other types (topics, listings, blocked) have no answer for RAGAs to judge.
"""

import asyncio
import json
import os
from pathlib import Path

# ragas sends usage analytics after every call, and that blocked each embedding for ~30 s.
# Must be set before ragas is imported.
os.environ.setdefault("RAGAS_DO_NOT_TRACK", "true")

from openai import AsyncOpenAI
from ragas.embeddings import OpenAIEmbeddings
from ragas.llms import llm_factory
from ragas.metrics.collections import AnswerRelevancy, ContextPrecision, ContextRecall, Faithfulness

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
# How many questions are scored at the same time (each one makes several judge calls).
CONCURRENCY = 4


def read_api_key() -> str:
    """The same key the app uses, read from .env.local so it isn't needed twice."""
    for line in Path(".env.local").read_text().splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "OPENROUTER_API_KEY":
            return value.strip().strip('"')
    raise SystemExit("OPENROUTER_API_KEY is missing in .env.local")


# OpenRouter speaks the OpenAI API, so the OpenAI client works once base_url points to it.
client = AsyncOpenAI(api_key=read_api_key(), base_url=OPENROUTER_BASE_URL)
# The judge: the same model as the app, so scores are cheap but not from a stronger model.
judge = llm_factory(os.environ.get("JUDGE_MODEL", "openai/gpt-4o-mini"), client=client)
embeddings = OpenAIEmbeddings(client=client, model="openai/text-embedding-3-small")

# Retrieval: are the search results relevant and ranked well / do they cover the reference?
context_precision = ContextPrecision(llm=judge)
context_recall = ContextRecall(llm=judge)
# Answer: is every claim in the highlights backed by the sources / do they address the question?
faithfulness = Faithfulness(llm=judge)
answer_relevancy = AnswerRelevancy(llm=judge, embeddings=embeddings)


def to_sample(result: dict) -> dict:
    # A follow-up only makes sense with the earlier question, so the judge gets both.
    user_input = result["question"]
    if result["history"]:
        user_input = f"Earlier question: {result['history'][-1]}\nFollow-up: {user_input}"

    return {
        "id": result["id"],
        "user_input": user_input,
        # The app's "answer" is the highlighted passages, word for word.
        "response": "\n\n".join(result["highlights"]) or "No answer found in the collection.",
        # All TOP_K search results, in rank order, as the LLM saw them.
        "retrieved_contexts": [
            f"Question: {r['question']}\nAnswer: {r['answer']}" for r in result["retrieved"]
        ],
        "reference": result["reference"],
    }


async def score(sample: dict, limit: asyncio.Semaphore) -> dict:
    async with limit:
        precision, recall, faithful, relevancy = await asyncio.gather(
            context_precision.ascore(
                user_input=sample["user_input"],
                reference=sample["reference"],
                retrieved_contexts=sample["retrieved_contexts"],
            ),
            context_recall.ascore(
                user_input=sample["user_input"],
                retrieved_contexts=sample["retrieved_contexts"],
                reference=sample["reference"],
            ),
            faithfulness.ascore(
                user_input=sample["user_input"],
                response=sample["response"],
                retrieved_contexts=sample["retrieved_contexts"],
            ),
            answer_relevancy.ascore(user_input=sample["user_input"], response=sample["response"]),
        )
        print(f"scored {sample['id']}")
        return {
            "id": sample["id"],
            "question": sample["user_input"],
            "context_precision": precision.value,
            "context_recall": recall.value,
            "faithfulness": faithful.value,
            "answer_relevancy": relevancy.value,
        }


METRICS = ["context_precision", "context_recall", "faithfulness", "answer_relevancy"]


def average_scores(scores: list[dict]) -> dict[str, float]:
    return {name: round(sum(row[name] for row in scores) / len(scores), 2) for name in METRICS}


def print_table(scores: list[dict], averages: dict[str, float]) -> None:
    print(f"\n{'id':<5}" + "".join(f"{name:>19}" for name in METRICS))
    for row in scores:
        print(f"{row['id']:<5}" + "".join(f"{row[name]:>19.2f}" for name in METRICS))
    print(f"{'avg':<5}" + "".join(f"{averages[name]:>19.2f}" for name in METRICS))

    print("\nAverages:")
    for name in METRICS:
        print(f"  {name:<19}{averages[name]:.2f}")


async def main() -> None:
    results = json.loads(Path("eval/results.json").read_text())
    samples = [to_sample(r) for r in results if r["type"] in ("specific", "followup")]

    limit = asyncio.Semaphore(CONCURRENCY)
    scores = await asyncio.gather(*(score(sample, limit) for sample in samples))

    averages = average_scores(scores)
    Path("eval/ragas_scores.json").write_text(json.dumps(scores, indent=2))
    # Only the averages, to compare runs with git diff (like eval/summary.json).
    Path("eval/ragas_summary.json").write_text(json.dumps(averages, indent=2))
    print_table(scores, averages)
    print(f"\nWrote eval/ragas_scores.json ({len(scores)} questions) and eval/ragas_summary.json")


asyncio.run(main())
