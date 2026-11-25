#!/usr/bin/env node
import { connectorsFromEnv } from "./connectors/index.js";
import { computeReport, type Report } from "./footprint/compute.js";
import { importFile } from "./importers/index.js";
import type { Range, UsageRecord } from "./types.js";

const HELP = `Usage :
  aifootprint api    [--days N] [--json]          usage des API (clés admin)
  aifootprint import <fichier...> [--days N] [--json]   exports de conversations

api — variables d'environnement (au moins une) :
  OPENAI_ADMIN_KEY      clé admin OpenAI (sk-admin-...)
  ANTHROPIC_ADMIN_KEY   clé admin Anthropic (sk-ant-admin-...)
  Seuls les endpoints d'usage sont appelés, et uniquement en lecture (GET).

import — fichiers .zip ou .json, traités en local :
  ChatGPT   Paramètres > Gestion des données > Exporter (conversations.json)
  Claude    Paramètres > Confidentialité > Exporter les données (conversations.json)
  Gemini    Google Takeout > Mon activité > Applications Gemini, format JSON
  Grok      grok.com > Paramètres > Données > Exporter (prod-grok-backend.json)`;

function parseArgs(argv: string[]) {
  const [command = "api", ...rest] = argv[0]?.startsWith("-") ? ["api", ...argv] : argv;
  let days: number | undefined;
  let json = false;
  const files: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--days") days = Number(rest[++i]);
    else if (a === "--json") json = true;
    else if (a === "--help" || a === "-h") {
      console.log(HELP);
      process.exit(0);
    } else files.push(a);
  }
  if (command === "--help" || command === "-h" || command === "help") {
    console.log(HELP);
    process.exit(0);
  }
  if (days !== undefined && (!Number.isFinite(days) || days <= 0)) throw new Error("--days doit être un nombre positif");
  return { command, days, json, files };
}

const fmt = (n: number) =>
  n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n >= 0.01 ? n.toFixed(2) : n === 0 ? "0" : n.toExponential(1);
const fmtRange = (r: Range, unit: string) => `${fmt(r.mid)} ${unit}  [${fmt(r.low)} – ${fmt(r.high)}]`;
const fmtTokens = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} G` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} k` : String(n);

function printReport(report: Report, period: string) {
  const t = report.total;
  console.log(`\nEmpreinte IA (${period})\n`);
  console.log(`  Énergie          ${fmtRange(t.energyWh, "Wh")}`);
  console.log(`  CO₂e             ${fmtRange(t.co2eGrams, "g")}`);
  console.log(`  Voiture essence  ${fmtRange(t.carKm, "km")}`);
  console.log(`  Avion            ${fmtRange(t.planeKm, "km (passager)")}`);
  console.log(`\nPar modèle :`);
  for (const m of report.byModel) {
    console.log(
      `  ${m.provider}/${m.model} (${m.modelClass}) — entrée ${fmtTokens(m.inputTokens)}, ` +
        `cache ${fmtTokens(m.cachedInputTokens)}, sortie ${fmtTokens(m.outputTokens)} → ` +
        `${fmt(m.carKm.mid)} km voiture`,
    );
  }
  console.log(`\nFourchettes [bas – haut] : incertitude sur l'énergie par modèle, le réseau électrique et les facteurs voiture/avion.`);
}

async function fromApi(start: Date, end: Date): Promise<UsageRecord[]> {
  const connectors = connectorsFromEnv();
  if (connectors.length === 0) {
    throw new Error("Aucune clé fournie. Définissez OPENAI_ADMIN_KEY et/ou ANTHROPIC_ADMIN_KEY (voir --help).");
  }
  const records: UsageRecord[] = [];
  for (const c of connectors) {
    try {
      records.push(...(await c.fetchUsage({ start, end })));
    } catch (err) {
      console.error(`⚠ ${c.provider} ignoré : ${(err as Error).message}`);
    }
  }
  return records;
}

async function fromExports(files: string[], json: boolean): Promise<UsageRecord[]> {
  if (files.length === 0) throw new Error("Indiquez au moins un fichier d'export (voir --help).");
  const records: UsageRecord[] = [];
  let imported = 0;
  for (const f of files) {
    try {
      for (const r of await importFile(f)) {
        if (!json) console.error(`✓ ${r.source} : ${r.provider}, ${r.records.length} réponses`);
        records.push(...r.records);
        imported++;
      }
    } catch (err) {
      console.error(`⚠ ${(err as Error).message}`);
    }
  }
  if (imported === 0) throw new Error("Aucun export n'a pu être lu.");
  return records;
}

async function main() {
  const { command, days, json, files } = parseArgs(process.argv.slice(2));
  const end = new Date();
  const start = days ? new Date(end.getTime() - days * 86_400_000) : undefined;

  let records: UsageRecord[];
  if (command === "api") records = await fromApi(start ?? new Date(end.getTime() - 30 * 86_400_000), end);
  else if (command === "import") {
    records = await fromExports(files, json);
    if (start) records = records.filter((r) => new Date(r.periodStart) >= start);
  } else throw new Error(`Commande inconnue : ${command}\n\n${HELP}`);

  const report = computeReport(records);
  if (json) console.log(JSON.stringify(report, null, 2));
  else printReport(report, days || command === "api" ? `${days ?? 30} derniers jours` : "tout l'historique");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
