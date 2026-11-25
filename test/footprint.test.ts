import { describe, expect, it } from "vitest";
import { computeReport } from "../src/footprint/compute.js";
import { classifyModel } from "../src/footprint/models.js";

describe("classifyModel", () => {
  it.each([
    ["gpt-4o-mini-2024-07-18", "small"],
    ["gpt-4o-2024-08-06", "large"],
    ["o3", "large"],
    ["o4-mini", "small"],
    ["gpt-5-nano", "small"],
    ["claude-3-5-haiku-20241022", "small"],
    ["claude-sonnet-4-5-20250929", "medium"],
    ["claude-opus-4-1-20250805", "large"],
    ["gemini-2.5-flash", "medium"],
    ["gemini-2.5-pro", "large"],
    ["some-unknown-model", "medium"],
  ])("%s → %s", (model, cls) => {
    expect(classifyModel(model)).toBe(cls);
  });
});

describe("computeReport", () => {
  it("agrège par modèle et convertit en km avec bornes ordonnées", () => {
    const report = computeReport([
      { provider: "openai", model: "gpt-4o", periodStart: "2026-11-01T00:00:00Z", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 },
      { provider: "openai", model: "gpt-4o", periodStart: "2026-11-02T00:00:00Z", inputTokens: 0, cachedInputTokens: 0, outputTokens: 1_000_000 },
    ]);
    expect(report.byModel).toHaveLength(1);
    const m = report.byModel[0];
    expect(m.outputTokens).toBe(2_000_000);
    // large, mid = 0,9 Wh/1k → (2 000 000 + 1 000 000 × 0,05) / 1000 × 0,9
    expect(m.energyWh.mid).toBeCloseTo(2050 * 0.9);
    // 1 845 Wh × 370 g/kWh = 682,65 g → /170 g/km
    expect(m.carKm.mid).toBeCloseTo((1845 * 0.37) / 170);
    for (const r of [m.energyWh, m.co2eGrams, m.carKm, m.planeKm]) {
      expect(r.low).toBeLessThan(r.mid);
      expect(r.mid).toBeLessThan(r.high);
    }
    expect(report.total.carKm.mid).toBeCloseTo(m.carKm.mid);
  });

  it("rend un rapport vide sans erreur", () => {
    expect(computeReport([]).total.carKm.mid).toBe(0);
  });
});
