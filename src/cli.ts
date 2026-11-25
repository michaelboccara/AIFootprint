#!/usr/bin/env node
import { connectorsFromEnv } from "./connectors/index.js";
import { computeReport, type Report } from "./footprint/compute.js";
import type { Range, UsageRecord } from "./types.js";

function parseArgs(argv: string[]) {
  let days = 30;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--days") days = Number(argv[++i]);
    else if (argv[i] === "--json") json = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(`Usage : aifootprint [--days N] [--json]

Variables d'environnement (au moins une est nécessaire) :
  OPENAI_ADMIN_KEY      clé admin OpenAI (sk-admin-...)
  ANTHROPIC_ADMIN_KEY   clé admin Anthropic (sk-ant-admin...)

Seuls les endpoints d'usage sont appelés, et uniquement en lecture (GET).`);
      process.exit(0);
    }
  }
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days doit être un nombre positif");
  return { days, json };
}

const fmt = (n: number) =>
  n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n >= 0.01 ? n.toFixed(2) : n.toExponential(1);
const fmtRange = (r: Range, unit: string) => `${fmt(r.mid)} ${unit}  [${fmt(r.low)} – ${fmt(r.high)}]`;
const fmtTokens = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} G` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} k` : String(n);

function printReport(report: Report, days: number) {
  const t = report.total;
  console.log(`\nEmpreinte IA (${days} derniers jours)\n`);
  console.log(`  Énergie        ${fmtRange(t.energyWh, "Wh")}`);
  console.log(`  CO₂e           ${fmtRange(t.co2eGrams, "g")}`);
  console.log(`  Voiture essence ${fmtRange(t.carKm, "km")}`);
  console.log(`  Avion          ${fmtRange(t.planeKm, "km (passager)")}`);
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

async function main() {
  const { days, json } = parseArgs(process.argv.slice(2));
  const connectors = connectorsFromEnv();
  if (connectors.length === 0) {
    console.error("Aucune clé fournie. Définissez OPENAI_ADMIN_KEY et/ou ANTHROPIC_ADMIN_KEY (voir --help).");
    process.exit(1);
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const records: UsageRecord[] = [];
  for (const c of connectors) {
    try {
      records.push(...(await c.fetchUsage({ start, end })));
    } catch (err) {
      console.error(`⚠ ${c.provider} ignoré : ${(err as Error).message}`);
    }
  }

  const report = computeReport(records);
  if (json) console.log(JSON.stringify(report, null, 2));
  else printReport(report, days);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
