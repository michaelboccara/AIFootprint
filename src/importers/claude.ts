import type { UsageRecord } from "../types.js";
import { parseTime, threadToRecords, type ThreadMessage } from "./thread.js";

interface ClaudeBlock {
  type?: string;
  text?: string;
  thinking?: string;
  input?: unknown;
  content?: unknown;
}

interface ClaudeMessage {
  sender?: string;
  text?: string;
  content?: ClaudeBlock[];
  created_at?: string;
  attachments?: { extracted_content?: string }[];
}

export interface ClaudeConversation {
  created_at?: string;
  model?: string;
  chat_messages: ClaudeMessage[];
}

/** L'export Claude.ai n'indique pas le modèle : on suppose la classe intermédiaire (Sonnet). */
export const CLAUDE_FALLBACK_MODEL = "claude-sonnet (supposé)";

export function isClaudeExport(data: unknown): data is ClaudeConversation[] {
  return Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.chat_messages);
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

function toThreadMessage(m: ClaudeMessage): ThreadMessage {
  const role = m.sender === "human" ? "user" : m.sender === "assistant" ? "assistant" : "other";
  const generated: string[] = [];
  const context: string[] = [];

  if (Array.isArray(m.content) && m.content.length > 0) {
    for (const b of m.content) {
      if (b.type === "text") generated.push(b.text ?? "");
      else if (b.type === "thinking") generated.push(b.thinking ?? "");
      else if (b.type === "tool_use") generated.push(str(b.input));
      // Les résultats d'outils (recherche web…) entrent dans le contexte, ils ne sont pas générés.
      else if (b.type === "tool_result") context.push(str(b.content));
    }
  } else {
    generated.push(m.text ?? "");
  }
  for (const a of m.attachments ?? []) context.push(a.extracted_content ?? "");

  const gen = generated.join("\n");
  return {
    role,
    text: [gen, ...context].join("\n"),
    generated: gen,
    model: undefined,
    time: parseTime(m.created_at),
  };
}

/** Export Claude.ai (`conversations.json`). */
export function importClaude(conversations: ClaudeConversation[]): UsageRecord[] {
  return conversations.flatMap((c) =>
    threadToRecords("claude", c.chat_messages.map(toThreadMessage), c.model || CLAUDE_FALLBACK_MODEL, parseTime(c.created_at)),
  );
}
