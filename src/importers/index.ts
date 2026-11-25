import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import type { UsageRecord } from "../types.js";
import { importChatGPT, isChatGPTExport } from "./chatgpt.js";
import { importClaude, isClaudeExport } from "./claude.js";
import { importGemini, isGeminiExport } from "./gemini.js";
import { importGrok } from "./grok.js";

export interface ImportResult {
  source: string;
  provider: string;
  records: UsageRecord[];
}

/** Reconnaît le format d'un JSON d'export et le convertit. */
export function importJson(data: unknown, source: string): ImportResult {
  if (isChatGPTExport(data)) return { source, provider: "chatgpt", records: importChatGPT(data) };
  if (isClaudeExport(data)) return { source, provider: "claude", records: importClaude(data) };
  if (isGeminiExport(data)) return { source, provider: "gemini", records: importGemini(data) };
  if (/grok/i.test(source)) {
    const records = importGrok(data);
    if (records.length > 0) return { source, provider: "grok", records };
  }
  throw new Error(
    `${source} : format non reconnu (formats pris en charge : ChatGPT, Claude.ai, Gemini via Takeout en JSON, Grok)`,
  );
}

/** Dans une archive, seuls certains JSON contiennent les conversations. */
const RELEVANT_IN_ZIP = /(^|\/)(conversations\.json|MyActivity\.json)$|grok[^/]*\.json$/i;

/**
 * Charge un export (.json ou .zip). Tout se fait en local : aucun contenu
 * de conversation n'est envoyé où que ce soit.
 */
export async function importFile(path: string): Promise<ImportResult[]> {
  const buf = await readFile(path);
  const name = basename(path);

  if (name.toLowerCase().endsWith(".zip")) {
    const files = unzipSync(new Uint8Array(buf), { filter: (f) => RELEVANT_IN_ZIP.test(f.name) });
    const results: ImportResult[] = [];
    for (const [inner, bytes] of Object.entries(files)) {
      // Takeout range Gemini dans « Mon activité/Applications Gemini/ » ; on ignore les autres services.
      if (/MyActivity\.json$/i.test(inner) && !/gemini|bard/i.test(inner)) continue;
      try {
        results.push(importJson(JSON.parse(strFromU8(bytes)), `${name}/${inner}`));
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
  return [importJson(JSON.parse(buf.toString("utf8")), name)];
}
