import type { UsageConnector } from "../types.js";
import { AnthropicConnector } from "./anthropic.js";
import { OpenAIConnector } from "./openai.js";

/** Construit les connecteurs à partir des variables d'environnement présentes. */
export function connectorsFromEnv(env: NodeJS.ProcessEnv = process.env): UsageConnector[] {
  const connectors: UsageConnector[] = [];
  if (env.OPENAI_ADMIN_KEY) connectors.push(new OpenAIConnector(env.OPENAI_ADMIN_KEY));
  if (env.ANTHROPIC_ADMIN_KEY) connectors.push(new AnthropicConnector(env.ANTHROPIC_ADMIN_KEY));
  return connectors;
}

export { AnthropicConnector, OpenAIConnector };
