import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import type { UsageRecord } from "../types.js";
import { importChatGPT, isChatGPTExport } from "./chatgpt.js";
import { importClaude, isClaudeExport } from "./claude.js";
import { importGemini, isGeminiExport } from "./gemini.js";
import { importGrok, importMistral } from "./tolerant.js";

export interface ImportResult {
  source: string;
  provider: string;
  records: UsageRecord[];
}

export const PROVIDERS = ["chatgpt", "claude", "gemini", "grok", "mistral"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Formats non documentés : reconnus par le nom du fichier, ou imposés par l'utilisateur. */
const TOLERANT: Partial<Record<Provider, { name: RegExp; read: (d: unknown) => UsageRecord[] }>> = {
  grok: { name: /grok/i, read: importGrok },
  mistral: { name: /mistral|le-?chat/i, read: importMistral },
};

function guessTolerant(source: string): Provider | undefined {
  return (Object.keys(TOLERANT) as Provider[]).find((p) => TOLERANT[p]!.name.test(source));
}

/**
 * Reconnaît le format d'un JSON d'export et le convertit.
 * `provider` force le fournisseur quand le nom du fichier ne suffit pas à le deviner.
 */
export function importJson(data: unknown, source: string, provider?: Provider): ImportResult {
  if ((!provider || provider === "chatgpt") && isChatGPTExport(data))
    return { source, provider: "chatgpt", records: importChatGPT(data) };
  if ((!provider || provider === "claude") && isClaudeExport(data))
    return { source, provider: "claude", records: importClaude(data) };
  if ((!provider || provider === "gemini") && isGeminiExport(data))
    return { source, provider: "gemini", records: importGemini(data) };
  const tolerant = provider ?? guessTolerant(source);
  if (tolerant && TOLERANT[tolerant]) {
    const records = TOLERANT[tolerant]!.read(data);
    if (records.length > 0) return { source, provider: tolerant, records };
  }
  throw new Error(
    `${source} : format non reconnu (pris en charge : ChatGPT, Claude.ai, Gemini via Takeout en JSON, Grok, Mistral). ` +
      `Pour un export Grok ou Mistral renommé, ajoutez --provider grok|mistral.`,
  );
}

/** Dans une archive, seuls certains JSON contiennent les conversations. */
const RELEVANT_IN_ZIP = /(^|\/)(conversations\.json|MyActivity\.json)$|(grok|mistral|le-?chat)[^/]*\.json$/i;

/**
 * Charge un export (.json ou .zip). Tout se fait en local : aucun contenu
 * de conversation n'est envoyé où que ce soit.
 */
export async function importFile(path: string, provider?: Provider): Promise<ImportResult[]> {
  const buf = await readFile(path);
  const name = basename(path);

  if (name.toLowerCase().endsWith(".zip")) {
    const hint = provider ?? guessTolerant(name);
    // Archive d'un format non documenté : on ne sait pas quel JSON contient les conversations, on les lit tous.
    const readAll = hint !== undefined && TOLERANT[hint] !== undefined;
    const files = unzipSync(new Uint8Array(buf), {
      filter: (f) => (readAll ? f.name.toLowerCase().endsWith(".json") : RELEVANT_IN_ZIP.test(f.name)),
    });
    const results: ImportResult[] = [];
    for (const [inner, bytes] of Object.entries(files)) {
      // Takeout range Gemini dans « Mon activité/Applications Gemini/ » ; on ignore les autres services.
      if (/MyActivity\.json$/i.test(inner) && !/gemini|bard/i.test(inner)) continue;
      try {
        results.push(importJson(JSON.parse(strFromU8(bytes)), `${name}/${inner}`, hint));
      } catch {
        // Fichier présent mais pas au format attendu : ignoré.
      }
    }
    if (results.length === 0) {
      throw new Error(
        `${name} : aucune conversation trouvée. Pour Gemini, choisissez le format JSON (et non HTML) dans Takeout.`,
      );
    }
    return results;
  }

  if (name.toLowerCase().endsWith(".html")) {
    throw new Error(`${name} : export HTML non pris en charge. Dans Google Takeout, choisissez le format JSON.`);
  }
  return [importJson(JSON.parse(buf.toString("utf8")), name, provider)];
}
