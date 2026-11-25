import { describe, expect, it } from "vitest";
import { AnthropicConnector } from "../src/connectors/anthropic.js";
import { OpenAIConnector } from "../src/connectors/openai.js";

function mockFetch(pages: unknown[]) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const impl = (async (url: URL, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(pages[calls.length - 1]), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const query = { start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-11-03T00:00:00Z") };

describe("OpenAIConnector", () => {
  it("pagine, soustrait le cache de l'entrée et n'utilise que GET", async () => {
    const { impl, calls } = mockFetch([
      {
        data: [{ start_time: 1793491200, results: [{ model: "gpt-4o", input_tokens: 100, input_cached_tokens: 40, output_tokens: 10, num_model_requests: 2 }] }],
        has_more: true,
        next_page: "p2",
      },
      { data: [{ start_time: 1793577600, results: [{ model: "o3", input_tokens: 5, output_tokens: 50 }] }], has_more: false },
    ]);
    const records = await new OpenAIConnector("sk-admin-test", impl).fetchUsage(query);

    expect(records).toEqual([
      expect.objectContaining({ model: "gpt-4o", inputTokens: 60, cachedInputTokens: 40, outputTokens: 10, requests: 2 }),
      expect.objectContaining({ model: "o3", inputTokens: 5, cachedInputTokens: 0, outputTokens: 50 }),
    ]);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.init?.method === "GET")).toBe(true);
    expect(calls[0].url.pathname).toBe("/v1/organization/usage/completions");
    expect(calls[0].url.searchParams.get("group_by")).toBe("model");
    expect(calls[1].url.searchParams.get("page")).toBe("p2");
  });

  it("remonte une erreur HTTP lisible", async () => {
    const impl = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    await expect(new OpenAIConnector("bad", impl).fetchUsage(query)).rejects.toThrow("openai: HTTP 401");
  });
});

describe("AnthropicConnector", () => {
  it("compte l'écriture en cache comme entrée et la lecture comme cache", async () => {
    const { impl, calls } = mockFetch([
      {
        data: [
          {
            starting_at: "2026-11-01T00:00:00Z",
            results: [
              {
                model: "claude-sonnet-4-5-20250929",
                uncached_input_tokens: 100,
                cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 5 },
                cache_read_input_tokens: 300,
                output_tokens: 70,
              },
            ],
          },
        ],
        has_more: false,
      },
    ]);
    const records = await new AnthropicConnector("sk-ant-admin-test", impl).fetchUsage(query);

    expect(records).toEqual([
      expect.objectContaining({ model: "claude-sonnet-4-5-20250929", inputTokens: 125, cachedInputTokens: 300, outputTokens: 70 }),
    ]);
    const { url, init } = calls[0];
    expect(init?.method).toBe("GET");
    expect(url.pathname).toBe("/v1/organizations/usage_report/messages");
    expect(url.searchParams.get("group_by[]")).toBe("model");
    expect((init?.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });
});
