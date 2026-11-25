export type FetchLike = typeof fetch;

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    body: string,
  ) {
    super(`${provider}: HTTP ${status} — ${body.slice(0, 300)}`);
  }
}

/** GET JSON uniquement : les connecteurs n'ont aucune méthode d'écriture. */
export async function getJson<T>(
  fetchImpl: FetchLike,
  provider: string,
  url: URL,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetchImpl(url, { method: "GET", headers });
  if (!res.ok) throw new ProviderError(provider, res.status, await res.text());
  return (await res.json()) as T;
}
