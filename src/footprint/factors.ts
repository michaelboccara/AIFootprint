import type { Range } from "../types.js";

/**
 * Facteurs d'émission. Les valeurs sont des ordres de grandeur à vérifier
 * et sourcer précisément (ADEME Base Empreinte, Ember, Electricity Maps)
 * avant toute publication.
 */

/**
 * Intensité carbone de l'électricité des datacenters, en gCO₂e/kWh.
 * Par défaut : réseau américain, où tournent la majorité des inférences
 * d'OpenAI et d'Anthropic. Les achats d'énergie renouvelable des fournisseurs
 * (comptabilité « market-based ») ne sont volontairement pas pris en compte.
 */
export const GRID_G_PER_KWH: Range = { low: 200, mid: 370, high: 450 };

/** Voiture thermique essence moyenne, gCO₂e par km (avec ou sans amont et fabrication). */
export const CAR_G_PER_KM: Range = { low: 120, mid: 170, high: 220 };

/** Avion, gCO₂e par passager-km (selon la distance et la prise en compte des traînées). */
export const PLANE_G_PER_PKM: Range = { low: 150, mid: 200, high: 260 };
