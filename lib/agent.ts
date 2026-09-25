import { HumanMessage, SystemMessage, type ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { chatModel } from "./llm";
import { listTopicsTool } from "./tools/list-topics";
import { searchAnswersTool } from "./tools/search-answers";

const SYSTEM_PROMPT = `You help users find answers in a collection of Lama Ole Nydahl's Q&As.

Rules:
- Call a tool only when it fits the user's question. If no tool fits, reply without calling one.
- Never answer the question in your own words.`;

const tools = [searchAnswersTool, listTopicsTool];
// Typed as general tools, because the LLM's tool call names are plain strings.
const toolsByName = new Map<string, StructuredToolInterface>(tools.map((tool) => [tool.name, tool]));

// bindTools sends the tools' names, descriptions and schemas along with every request,
// so the LLM can answer with tool calls instead of text.
const agentModel = chatModel.bindTools(tools);

export type ToolResult = {
  name: string;
  args: Record<string, unknown>;
  // The tool's raw data (ToolMessage.artifact), for our code and the UI.
  result: unknown;
};

// One LLM decision: the LLM picks the tool(s) for the question, we run them.
// No loop: the results aren't sent back to the LLM, because it never writes the answer.
// Our code uses the results directly (see app/api/chat/route.ts).
export async function runAgent(question: string) {
  const response = await agentModel.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(`<user_question>${question}</user_question>`),
  ]);

  const toolResults: ToolResult[] = [];

  // The LLM may ask for several tools at once (parallel tool calls), or for none.
  for (const toolCall of response.tool_calls ?? []) {
    const tool = toolsByName.get(toolCall.name);
    // No LLM round to recover in, so a failing tool fails the request (→ 500 in the route).
    if (!tool) throw new Error(`Unknown tool "${toolCall.name}"`);
    // Invoking a tool with the whole tool call returns a ToolMessage; its artifact holds the raw data.
    const toolMessage: ToolMessage = await tool.invoke(toolCall);
    toolResults.push({ name: toolCall.name, args: toolCall.args, result: toolMessage.artifact });
  }

  return toolResults;
}
