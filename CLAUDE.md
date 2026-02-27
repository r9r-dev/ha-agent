# HA Agent

Agent domotique conversationnel : Telegram → Claude (tool use) → Home Assistant.

## Stack

- **Runtime**: Bun
- **Langage**: TypeScript strict
- **Bot**: Telegraf 4.x
- **LLM**: Claude claude-sonnet-4-6 via Anthropic SDK
- **HA**: REST + WebSocket (pas de lib externe)

## Commandes

```bash
bun run dev        # Développement avec hot reload
bun run start      # Production
bun run typecheck  # Vérification types
docker compose up  # Production Docker
```

## Structure

```
src/
  config.ts              # Variables d'environnement
  index.ts               # Point d'entrée + alertes
  ha/client.ts           # Client HA (REST + WebSocket)
  agent/
    index.ts             # Boucle agent (tool use)
    prompts.ts           # System prompt dynamique
    tools/ha.ts          # Outils Claude + exécution
  bot/telegram.ts        # Bot Telegraf
```

## Configuration

Copier `.env.example` en `.env`. Variables requises: `TELEGRAM_TOKEN`, `HA_TOKEN`, `ANTHROPIC_API_KEY`.

## Documentation

Voir `.agent/index.md` pour l'index complet de la documentation.
