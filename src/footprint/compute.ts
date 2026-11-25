import type { Range, UsageRecord } from "../types.js";
import { CAR_G_PER_KM, GRID_G_PER_KWH, PLANE_G_PER_PKM } from "./factors.js";
import {
  CACHED_INPUT_TOKEN_RELATIVE_COST,
  classifyModel,
  ENERGY_WH_PER_1K_OUTPUT,
  INPUT_TOKEN_RELATIVE_COST,
  type ModelClass,
} from "./models.js";

export interface Footprint {
  energyWh: Range;
  co2eGrams: Range;
  /** Km de voiture essence. Borne basse = scénario le plus favorable à l'IA. */
  carKm: Range;
  planeKm: Range;
}

export interface ModelBreakdown extends Footprint {
  provider: string;
  model: string;
  modelClass: ModelClass;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface Report {
  total: Footprint;
  byModel: ModelBreakdown[];
}

const scale = (r: Range, k: number): Range => ({ low: r.low * k, mid: r.mid * k, high: r.high * k });
const mul = (a: Range, b: Range): Range => ({ low: a.low * b.low, mid: a.mid * b.mid, high: a.high * b.high });
/** a / b avec bornes croisées : le scénario « bas » divise par le facteur haut. */
const div = (a: Range, b: Range): Range => ({ low: a.low / b.high, mid: a.mid / b.mid, high: a.high / b.low });
const add = (a: Range, b: Range): Range => ({ low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high });
const ZERO: Range = { low: 0, mid: 0, high: 0 };

function footprintFromEnergy(energyWh: Range): Footprint {
  const co2eGrams = scale(mul(energyWh, GRID_G_PER_KWH), 1 / 1000);
  return {
    energyWh,
    co2eGrams,
    carKm: div(co2eGrams, CAR_G_PER_KM),
    planeKm: div(co2eGrams, PLANE_G_PER_PKM),
  };
}

/** Tokens « équivalent sortie » : on ramène l'entrée et le cache au coût d'un token généré. */
function outputEquivalentTokens(r: Pick<UsageRecord, "inputTokens" | "cachedInputTokens" | "outputTokens">) {
  return (
    r.outputTokens +
    r.inputTokens * INPUT_TOKEN_RELATIVE_COST +
    r.cachedInputTokens * CACHED_INPUT_TOKEN_RELATIVE_COST
  );
}

export function computeReport(records: UsageRecord[]): Report {
  const groups = new Map<string, ModelBreakdown>();

  for (const r of records) {
    const key = `${r.provider}\u0000${r.model}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        provider: r.provider,
        model: r.model,
        modelClass: classifyModel(r.model),
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        ...footprintFromEnergy(ZERO),
      };
      groups.set(key, g);
    }
    g.inputTokens += r.inputTokens;
    g.cachedInputTokens += r.cachedInputTokens;
    g.outputTokens += r.outputTokens;
  }

  let totalEnergy = ZERO;
  const byModel = [...groups.values()].map((g) => {
    const energy = scale(ENERGY_WH_PER_1K_OUTPUT[g.modelClass], outputEquivalentTokens(g) / 1000);
    totalEnergy = add(totalEnergy, energy);
    return { ...g, ...footprintFromEnergy(energy) };
  });
  byModel.sort((a, b) => b.co2eGrams.mid - a.co2eGrams.mid);

  return { total: footprintFromEnergy(totalEnergy), byModel };
}
