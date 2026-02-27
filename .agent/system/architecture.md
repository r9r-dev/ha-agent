# Architecture

## Stack

| Composant | Technologie |
|---|---|
| Runtime | Bun |
| Langage | TypeScript strict |
| Bot Telegram | Telegraf 4.x |
| LLM | Claude claude-sonnet-4-6 (Anthropic SDK) |
| Home Assistant | REST API + WebSocket natif Bun |
| Déploiement | Docker (oven/bun:1-alpine) |

## Flux d'une requête

```
Utilisateur (Telegram)
  → bot.on(message('text'))
  → agent.chat(chatId, message)
    → runLoop(messages)
      → anthropic.messages.create(tools, history)
      → si tool_use → executeTool() → HA REST API
      → boucle jusqu'à end_turn
    → retourne texte
  → ctx.reply(texte)
```

## Flux alertes proactives

```
HA WebSocket (state_changed)
  → startEventListener callback
  → filtre entités surveillées (WATCHED_ENTITIES)
  → bot.telegram.sendMessage() vers NOTIFY_CHAT_IDS
```

## Composants

### HAClient (`src/ha/client.ts`)
- `getState(entityId)` — état d'une entité via GET /api/states/{id}
- `getStates()` — toutes les entités
- `getStatesByDomain(domain)` — filtre par domaine
- `callService(domain, service, data)` — POST /api/services/{domain}/{service}
- `getHistory(entityId, hours)` — historique
- `startEventListener(eventType, handler)` — WebSocket avec reconnexion auto

### HAAgent (`src/agent/index.ts`)
- Historique de conversation par chatId (Map)
- Boucle tool use manuelle (max 10 itérations)
- Trim automatique à 30 messages pour éviter dépassement de contexte

### Outils Claude (`src/agent/tools/ha.ts`)
| Outil | Description |
|---|---|
| `get_entity_state` | État d'une entité spécifique |
| `list_entities` | Liste filtrée par domaine/recherche |
| `call_ha_service` | Appel de service HA |
| `get_entity_history` | Historique des états |

## Variables d'environnement

| Variable | Description |
|---|---|
| `TELEGRAM_TOKEN` | Token du bot (@BotFather) |
| `ALLOWED_CHAT_IDS` | IDs autorisés (séparés par virgule) |
| `HA_URL` | URL de Home Assistant |
| `HA_TOKEN` | Token d'accès longue durée HA |
| `ANTHROPIC_API_KEY` | Clé API Anthropic |
| `WATCHED_ENTITIES` | Entités pour alertes proactives |
| `NOTIFY_CHAT_IDS` | IDs qui reçoivent les alertes |
