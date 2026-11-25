import type { UsageConnector, UsageQuery, UsageRecord } from "../types.js";
import { getJson, type FetchLike } from "./http.js";

interface AnthropicUsageResult {
  uncached_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  cache_read_input_tokens?: number;
  output_tokens?: number;
  model?: string | null;
}

interface AnthropicUsagePage {
  data: { starting_at: string; results: AnthropicUsageResult[] }[];
  has_more: boolean;
  next_page?: string | null;
}

/**
 * Anthropic Usage & Cost Admin API (clé admin `sk-ant-admin...`).
 * GET /v1/organizations/usage_report/messages, groupé par modèle, par jour.
 */
export class AnthropicConnector implements UsageConnector {
  readonly provider = "anthropic";

  constructor(
    private readonly adminKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = "https://api.anthropic.com",
  ) {}

  async fetchUsage({ start, end }: UsageQuery): Promise<UsageRecord[]> {
    const records: UsageRecord[] = [];
    let page: string | undefined;
    do {
      const url = new URL("/v1/organizations/usage_report/messages", this.baseUrl);
      url.searchParams.set("starting_at", start.toISOString());
      url.searchParams.set("ending_at", end.toISOString());
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.append("group_by[]", "model");
      url.searchParams.set("limit", "31");
      if (page) url.searchParams.set("page", page);

      const body = await getJson<AnthropicUsagePage>(this.fetchImpl, this.provider, url, {
        "x-api-key": this.adminKey,
        "anthropic-version": "2023-06-01",
      });

      for (const bucket of body.data) {
        for (const r of bucket.results) {
          const cacheWrite =
            (r.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
            (r.cache_creation?.ephemeral_1h_input_tokens ?? 0);
          records.push({
            provider: this.provider,
            model: r.model ?? "unknown",
            periodStart: bucket.starting_at,
            // L'écriture en cache demande un vrai prefill : comptée comme entrée normale.
            inputTokens: (r.uncached_input_tokens ?? 0) + cacheWrite,
            cachedInputTokens: r.cache_read_input_tokens ?? 0,
            outputTokens: r.output_tokens ?? 0,
          });
        }
      }
      page = body.has_more && body.next_page ? body.next_page : undefined;
    } while (page);
    return records;
  }
}
