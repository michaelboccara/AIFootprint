import type { UsageRecord } from "../types.js";
import { estimateTokens, parseTime } from "./thread.js";

interface ChatGPTNode {
  parent?: string | null;
  message?: {
    author?: { role?: string };
    content?: Record<string, unknown>;
    create_time?: number | null;
    metadata?: { model_slug?: string; default_model_slug?: string };
  } | null;
}

export interface ChatGPTConversation {
  create_time?: number;
  default_model_slug?: string;
  mapping: Record<string, ChatGPTNode>;
}

export function isChatGPTExport(data: unknown): data is ChatGPTConversation[] {
  return Array.isArray(data) && data.length > 0 && typeof data[0]?.mapping === "object";
}

/** Texte d'un message ChatGPT, quel que soit son `content_type` (text, code, thoughts…). */
function contentText(content: Record<string, unknown> | undefined): string {
  if (!content) return "";
  const out: string[] = [];
  if (Array.isArray(content.parts)) {
    for (const p of content.parts) if (typeof p === "string") out.push(p);
  }
  for (const k of ["text", "result", "summary"] as const) {
    if (typeof content[k] === "string") out.push(content[k] as string);
  }
  if (Array.isArray(content.thoughts)) {
    for (const t of content.thoughts as { summary?: string; content?: string }[]) {
      out.push(t.summary ?? "", t.content ?? "");
    }
  }
  return out.filter(Boolean).join("\n");
}

/**
 * Export ChatGPT (`conversations.json`). Les conversations sont des arbres :
 * chaque réponse régénérée ou branche éditée a vraiment été calculée, donc
 * tous les nœuds assistant sont comptés, avec en entrée le chemin depuis la racine.
 */
export function importChatGPT(conversations: ChatGPTConversation[]): UsageRecord[] {
  const records: UsageRecord[] = [];

  for (const conv of conversations) {
    const nodes = conv.mapping ?? {};
    const ownTokens = new Map<string, number>();
    const pathTokens = new Map<string, number>();

    const own = (id: string) => {
      let t = ownTokens.get(id);
      if (t === undefined) {
        t = estimateTokens(contentText(nodes[id]?.message?.content));
        ownTokens.set(id, t);
      }
      return t;
    };

    /** Tokens cumulés de la racine jusqu'au nœud inclus (itératif : les arbres peuvent être profonds). */
    const path = (id: string): number => {
      const chain: string[] = [];
      let cur: string | null | undefined = id;
      while (cur && nodes[cur] && !pathTokens.has(cur)) {
        chain.push(cur);
        cur = nodes[cur].parent;
      }
      let acc = cur && pathTokens.has(cur) ? pathTokens.get(cur)! : 0;
      for (let i = chain.length - 1; i >= 0; i--) {
        acc += own(chain[i]);
        pathTokens.set(chain[i], acc);
      }
      return acc;
    };

    for (const [id, node] of Object.entries(nodes)) {
      const msg = node.message;
      if (msg?.author?.role !== "assistant") continue;
      const output = own(id);
      if (output === 0) continue;
      const time = parseTime(msg.create_time) ?? parseTime(conv.create_time) ?? new Date(0);
      records.push({
        provider: "chatgpt",
        model: msg.metadata?.model_slug || msg.metadata?.default_model_slug || conv.default_model_slug || "chatgpt-inconnu",
        periodStart: time.toISOString(),
        inputTokens: node.parent ? path(node.parent) : 0,
        cachedInputTokens: 0,
        outputTokens: output,
        requests: 1,
      });
    }
  }
  return records;
}
