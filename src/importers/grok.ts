import type { UsageRecord } from "../types.js";
import { parseTime, threadToRecords, type Role, type ThreadMessage } from "./thread.js";

/**
 * Export Grok (grok.com > Paramètres > Données > Exporter, fichier type `prod-grok-backend.json`).
 *
 * xAI ne documente pas ce format. Plutôt que de figer un schéma, on parcourt
 * le JSON et on traite comme une conversation tout tableau dont les éléments
 * ressemblent à des messages : un rôle (`sender` | `role` | `author`) et un texte
 * (`message` | `content` | `text`), éventuellement enveloppés dans `response` ou `message`.
 */
export const GROK_FALLBACK_MODEL = "grok (modèle inconnu)";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function normalizeRole(v: unknown): Role | undefined {
  if (typeof v !== "string") return undefined;
  const r = v.toLowerCase();
  if (r === "human" || r === "user") return "user";
  if (r === "assistant" || r === "grok" || r === "model" || r === "bot") return "assistant";
  if (r === "system" || r === "tool") return "other";
  return undefined;
}

function asMessage(item: unknown): ThreadMessage | undefined {
  if (!isObj(item)) return undefined;
  for (const candidate of [item, item.response, item.message]) {
    if (!isObj(candidate)) continue;
    const role = normalizeRole(candidate.sender ?? candidate.role ?? candidate.author);
    const text = [candidate.message, candidate.content, candidate.text].find((t) => typeof t === "string") as
      | string
      | undefined;
    if (role && text !== undefined) {
      const model = [candidate.model, item.model].find((m) => typeof m === "string") as string | undefined;
      return {
        role,
        text,
        model,
        time: parseTime(candidate.create_time ?? candidate.created_at ?? candidate.timestamp ?? item.create_time),
      };
    }
  }
  return undefined;
}

function findThreads(node: unknown, out: ThreadMessage[][]) {
  if (Array.isArray(node)) {
    const messages = node.map(asMessage).filter((m): m is ThreadMessage => m !== undefined);
    if (messages.length > 0) {
      if (messages.every((m) => m.time)) messages.sort((a, b) => a.time!.getTime() - b.time!.getTime());
      out.push(messages);
      return;
    }
    for (const child of node) findThreads(child, out);
  } else if (isObj(node)) {
    for (const child of Object.values(node)) findThreads(child, out);
  }
}

export function importGrok(data: unknown): UsageRecord[] {
  const threads: ThreadMessage[][] = [];
  findThreads(data, threads);
  return threads.flatMap((t) => threadToRecords("grok", t, GROK_FALLBACK_MODEL));
}
