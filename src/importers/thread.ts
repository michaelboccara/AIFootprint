import type { UsageRecord } from "../types.js";

/**
 * Estimation du nombre de tokens sans tokenizer : ~4 caractères par token
 * pour les écritures latines, ~1 token par caractère pour le chinois, le japonais et le coréen.
 * L'erreur de ±20 % est négligeable devant l'incertitude sur l'énergie.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af)) cjk++;
  }
  return Math.ceil((text.length - cjk) / 4 + cjk);
}

export type Role = "user" | "assistant" | "other";

export interface ThreadMessage {
  role: Role;
  /** Texte qui entre dans le contexte des tours suivants. */
  text: string;
  /** Texte généré par le modèle (par défaut, `text` pour un message assistant). */
  generated?: string;
  model?: string;
  time?: Date;
}

/**
 * Convertit une conversation linéaire en lignes d'usage.
 * Chaque réponse du modèle relit tout l'historique : celui-ci compte en entrée
 * (prefill), la réponse en sortie.
 */
export function threadToRecords(
  provider: string,
  messages: ThreadMessage[],
  fallbackModel: string,
  fallbackTime?: Date,
): UsageRecord[] {
  const records: UsageRecord[] = [];
  let context = 0;
  for (const m of messages) {
    if (m.role === "assistant") {
      const output = estimateTokens(m.generated ?? m.text);
      if (output > 0) {
        records.push({
          provider,
          model: m.model || fallbackModel,
          periodStart: (m.time ?? fallbackTime ?? new Date(0)).toISOString(),
          inputTokens: context,
          cachedInputTokens: 0,
          outputTokens: output,
          requests: 1,
        });
      }
    }
    context += estimateTokens(m.text);
  }
  return records;
}

/** Accepte une date ISO, un timestamp en s ou en ms, ou le format MongoDB `{ $date: ... }`. */
export function parseTime(v: unknown): Date | undefined {
  if (v == null) return undefined;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("$date" in o) return parseTime(o.$date);
    if ("$numberLong" in o) return parseTime(Number(o.$numberLong));
    return undefined;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return undefined;
    return new Date(v < 1e11 ? v * 1000 : v);
  }
  if (typeof v === "string") {
    if (/^\d+(\.\d+)?$/.test(v)) return parseTime(Number(v));
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}
