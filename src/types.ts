/** Une ligne d'usage normalisée, quel que soit le fournisseur. */
export interface UsageRecord {
  provider: string;
  model: string;
  /** Début de la période agrégée (ISO 8601). */
  periodStart: string;
  /** Tokens d'entrée facturés plein tarif (hors cache). */
  inputTokens: number;
  /** Tokens d'entrée lus depuis le cache (prefill quasi gratuit). */
  cachedInputTokens: number;
  /** Tokens générés, raisonnement caché inclus. */
  outputTokens: number;
  requests?: number;
}

export interface UsageQuery {
  /** Début de la fenêtre (inclus). */
  start: Date;
  /** Fin de la fenêtre (exclue). */
  end: Date;
}

/**
 * Un connecteur ne fait QUE des lectures (GET) sur les endpoints d'usage.
 * Aucune autre route de l'API d'administration n'est appelée.
 */
export interface UsageConnector {
  readonly provider: string;
  fetchUsage(query: UsageQuery): Promise<UsageRecord[]>;
}

/** Une fourchette basse / médiane / haute. */
export interface Range {
  low: number;
  mid: number;
  high: number;
}
