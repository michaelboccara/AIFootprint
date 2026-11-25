import type { UsageConnector, UsageQuery, UsageRecord } from "../types.js";
import { getJson, type FetchLike } from "./http.js";

interface OpenAIUsageResult {
  input_tokens?: number;
  input_cached_tokens?: number;
  output_tokens?: number;
  num_model_requests?: number;
  model?: string | null;
}

interface OpenAIUsagePage {
  data: { start_time: number; results: OpenAIUsageResult[] }[];
  has_more: boolean;
  next_page?: string | null;
}

/**
 * OpenAI Usage API (clé admin `sk-admin-...`).
 * GET /v1/organization/usage/completions, groupé par modèle, par jour.
 */
export class OpenAIConnector implements UsageConnector {
  readonly provider = "openai";

  constructor(
    private readonly adminKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = "https://api.openai.com",
  ) {}

  async fetchUsage({ start, end }: UsageQuery): Promise<UsageRecord[]> {
    const records: UsageRecord[] = [];
    let page: string | undefined;
    do {
      const url = new URL("/v1/organization/usage/completions", this.baseUrl);
      url.searchParams.set("start_time", String(Math.floor(start.getTime() / 1000)));
      url.searchParams.set("end_time", String(Math.floor(end.getTime() / 1000)));
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.append("group_by", "model");
      url.searchParams.set("limit", "31");
      if (page) url.searchParams.set("page", page);

      const body = await getJson<OpenAIUsagePage>(this.fetchImpl, this.provider, url, {
        Authorization: `Bearer ${this.adminKey}`,
      });

      for (const bucket of body.data) {
        for (const r of bucket.results) {
          const input = r.input_tokens ?? 0;
          const cached = r.input_cached_tokens ?? 0;
          records.push({
            provider: this.provider,
            model: r.model ?? "unknown",
            periodStart: new Date(bucket.start_time * 1000).toISOString(),
            // Chez OpenAI, input_tokens inclut les tokens en cache.
            inputTokens: Math.max(0, input - cached),
            cachedInputTokens: cached,
            outputTokens: r.output_tokens ?? 0,
            requests: r.num_model_requests,
          });
        }
      }
      page = body.has_more && body.next_page ? body.next_page : undefined;
    } while (page);
    return records;
  }
}
