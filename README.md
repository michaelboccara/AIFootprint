# AIFootprint

Convertit votre usage des API d'IA (tokens consommés, par modèle) en **équivalent kilomètres
de voiture essence et d'avion**, avec une fourchette basse – médiane – haute.

## Démarrage

```bash
npm install
# Comptes grand public : exports de conversations (.zip ou .json), traités en local
npm start -- import chatgpt-export.zip claude-export.zip takeout.zip prod-grok-backend.json
# API : clés admin
OPENAI_ADMIN_KEY=sk-admin-... ANTHROPIC_ADMIN_KEY=sk-ant-admin-... npm start -- api --days 30
npm start -- import export.zip --days 90 --json   # filtre de période et sortie JSON
npm test
```

## Exports de conversations (comptes gratuits et payants)

| Service | Où l'obtenir | Modèle connu ? | Fiabilité |
|---|---|---|---|
| ChatGPT | Paramètres → Gestion des données → Exporter → `conversations.json` | Oui, par message | Bonne : arbre complet, réponses régénérées comprises |
| Claude.ai | Paramètres → Confidentialité → Exporter les données → `conversations.json` | Non : Sonnet supposé | Bonne : réflexion et pièces jointes comprises |
| Gemini | Google Takeout → Mon activité → Applications Gemini, **format JSON** | Non | Moyenne : pas de regroupement en conversations, donc historique sous-estimé |
| Grok | grok.com → Paramètres → Données → Exporter → `prod-grok-backend.json` | Parfois | À valider : format non documenté par xAI, lecture tolérante |

Principe : chaque réponse du modèle relit tout l'historique de la conversation. Cet historique est
compté en tokens d'entrée, la réponse en tokens de sortie. Les tokens sont estimés à environ
4 caractères par token, sans tokenizer.

Limites connues, qui vont toutes dans le sens d'une **sous-estimation** :
- la réflexion cachée des modèles de raisonnement (o3, GPT-5 Thinking…) n'apparaît pas dans les exports,
  seul son résumé y figure ;
- les images, l'audio et la vidéo générés ne sont pas encore comptés ;
- pour Gemini, l'historique relu à chaque tour n'est pas connu.

## Sources de données API

| Fournisseur | Endpoint (lecture seule) | Type de clé |
|---|---|---|
| OpenAI | `GET /v1/organization/usage/completions` | Clé admin d'organisation (`sk-admin-…`) |
| Anthropic | `GET /v1/organizations/usage_report/messages` | Clé admin d'organisation (`sk-ant-admin-…`) |

Les comptes grand public (ChatGPT, Claude.ai, Gemini en version gratuite ou payante) **n'exposent
aucune API d'usage** : ils ne sont pas couverts par ces connecteurs. Pour eux, il faudra passer
par les exports de données RGPD ou une extension navigateur (voir la feuille de route).

### Sécurité des clés

À notre connaissance, ni OpenAI ni Anthropic ne proposent de clé admin restreinte à la lecture de
l'usage : une clé admin peut aussi gérer les membres et les clés de l'organisation. Mesures prises
pour limiter le risque :

- l'outil tourne **en local** : les clés ne quittent pas votre machine et ne sont jamais stockées ;
- le code n'appelle **que des `GET`** sur les endpoints d'usage (`src/connectors/http.ts`, vérifié par les tests) ;
- créez une clé admin **dédiée** à AIFootprint et révoquez-la après usage.

Sur Google Cloud (Vertex AI), Azure OpenAI et AWS Bedrock, en revanche, il existe de vrais rôles en
lecture seule sur les métriques (par exemple `roles/monitoring.viewer`, le rôle « Lecteur » d'Azure
Monitor, `cloudwatch:GetMetricData`). Ce sont les prochains connecteurs prévus.

## Méthodologie

```
énergie (Wh)  = Σ par modèle  [ sortie + 0,05 × entrée + 0,005 × cache ] / 1000 × Wh/1k(classe)
CO₂e (g)      = énergie (kWh) × intensité du réseau (g/kWh)
km voiture    = CO₂e / g par km
```

- **Classe de modèle** (`src/footprint/models.ts`) : petit, moyen ou grand, déduite du nom du modèle.
  Les fournisseurs ne publient pas la taille de leurs modèles.
- **Énergie par token** : calibrée sur les chiffres publiés par Google (environ 0,24 Wh par requête Gemini
  médiane) et OpenAI (environ 0,34 Wh par requête). Les tokens de raisonnement sont inclus dans la sortie.
- **Facteurs** (`src/footprint/factors.ts`) : réseau américain d'environ 370 g/kWh, voiture d'environ
  170 g/km, avion d'environ 200 g par passager-km.
- **Fourchettes** : le scénario bas combine toutes les hypothèses favorables, le haut toutes les défavorables.

> ⚠️ Ce sont des **ordres de grandeur**. Avant publication, il faut sourcer chaque facteur
> (ADEME Base Empreinte, Ember / Electricity Maps) et remplacer les classes par la méthodologie
> [EcoLogits](https://ecologits.ai).

## Feuille de route

1. Connecteurs Google Vertex AI, Azure OpenAI et AWS Bedrock (OAuth ou IAM en lecture seule).
2. Comptage des images et vidéos générées ; estimation de la réflexion cachée des modèles de raisonnement.
3. Intégration d'EcoLogits et de l'intensité carbone par région de datacenter.
4. Interface web et suivi dans le temps.
