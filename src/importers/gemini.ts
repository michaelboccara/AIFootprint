import type { UsageRecord } from "../types.js";
import { estimateTokens, parseTime } from "./thread.js";

export interface GeminiActivity {
  header?: string;
  title?: string;
  time?: string;
  products?: string[];
  safeHtmlItem?: { html?: string }[];
}

/** Takeout ne précise pas le modèle utilisé. */
export const GEMINI_FALLBACK_MODEL = "gemini (modèle inconnu)";

const isGeminiItem = (a: GeminiActivity) =>
  /gemini|bard/i.test(a.header ?? "") || (a.products ?? []).some((p) => /gemini|bard/i.test(p));

export function isGeminiExport(data: unknown): data is GeminiActivity[] {
  return Array.isArray(data) && data.length > 0 && typeof data[0]?.time === "string" && data.some(isGeminiItem);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Google Takeout, « Mon activité » > « Applications Gemini » au format JSON
 * (`MyActivity.json`). Chaque entrée est un tour (requête → réponse).
 * Takeout ne regroupe pas les tours en conversations : l'historique relu à
 * chaque tour n'est pas connu, l'entrée est donc sous-estimée.
 * Le titre contient la requête précédée d'un libellé traduit (« Prompted »,
 * « Eingegebener Prompt: »…), compté tel quel : quelques tokens de plus, sans effet notable.
 */
export function importGemini(activities: GeminiActivity[]): UsageRecord[] {
  const records: UsageRecord[] = [];
  for (const a of activities) {
    if (!isGeminiItem(a)) continue;
    const response = (a.safeHtmlItem ?? []).map((i) => htmlToText(i.html ?? "")).join("\n");
    const output = estimateTokens(response);
    if (output === 0) continue;
    records.push({
      provider: "gemini",
      model: GEMINI_FALLBACK_MODEL,
      periodStart: (parseTime(a.time) ?? new Date(0)).toISOString(),
      inputTokens: estimateTokens(a.title ?? ""),
      cachedInputTokens: 0,
      outputTokens: output,
      requests: 1,
    });
  }
  return records;
}
