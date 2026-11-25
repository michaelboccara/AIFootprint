import type { Range } from "../types.js";

/**
 * Classes de modèles. Les fournisseurs ne publient pas la taille de leurs modèles :
 * on raisonne par classe, avec une fourchette large.
 */
export type ModelClass = "small" | "medium" | "large";

/**
 * Énergie par 1 000 tokens de SORTIE, en Wh, PUE du datacenter inclus.
 *
 * Hypothèses de calibrage (à remplacer par EcoLogits quand on l'intègre) :
 * - Google (août 2025) : ~0,24 Wh pour une requête texte Gemini médiane ;
 * - OpenAI (juin 2025) : ~0,34 Wh pour une requête ChatGPT moyenne ;
 * - avec quelques centaines de tokens générés par réponse, on obtient
 *   ~0,5–1 Wh / 1k tokens pour un modèle phare. Les fourchettes sont
 *   volontairement larges pour couvrir l'incertitude.
 */
export const ENERGY_WH_PER_1K_OUTPUT: Record<ModelClass, Range> = {
  small: { low: 0.05, mid: 0.15, high: 0.4 },
  medium: { low: 0.15, mid: 0.4, high: 1.0 },
  large: { low: 0.3, mid: 0.9, high: 2.5 },
};

/**
 * Coût d'un token d'entrée (prefill) relatif à un token de sortie.
 * Le prefill est parallélisé et bien moins coûteux par token que le décodage.
 */
export const INPUT_TOKEN_RELATIVE_COST = 0.05;
/** Lecture de cache : quasiment pas de calcul. */
export const CACHED_INPUT_TOKEN_RELATIVE_COST = 0.005;

/** Premier motif qui correspond = classe retenue. L'ordre compte. */
const PATTERNS: [RegExp, ModelClass][] = [
  [/\b(nano|mini|lite|small|tiny|flash-8b)\b|haiku|ministral/i, "small"],
  [/flash|sonnet|medium|gpt-3\.5|llama.*(8b|70b)/i, "medium"],
  [/opus|gpt-4|gpt-5|\bo[134]\b|o[134]-|pro|large|ultra|405b/i, "large"],
];

export const DEFAULT_CLASS: ModelClass = "medium";

export function classifyModel(model: string): ModelClass {
  for (const [re, cls] of PATTERNS) if (re.test(model)) return cls;
  return DEFAULT_CLASS;
}
