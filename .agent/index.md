# HA Agent — Documentation

## Index

- [system/architecture.md](system/architecture.md) — Architecture technique, stack, flux de données
- [sop/setup.md](sop/setup.md) — Guide de mise en place (Telegram, HA token, déploiement)
- [sop/add-tool.md](sop/add-tool.md) — Comment ajouter un outil Claude (nouvelle capacité)

## Vue d'ensemble

Agent domotique conversationnel qui permet de contrôler Home Assistant via Telegram en langage naturel. Alimenté par Claude (Anthropic) avec tool use.

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/index.ts` | Point d'entrée, initialisation, alertes proactives |
| `src/config.ts` | Configuration via variables d'environnement |
| `src/ha/client.ts` | Client Home Assistant (REST + WebSocket) |
| `src/agent/index.ts` | Boucle agent Claude (tool use loop) |
| `src/agent/tools/ha.ts` | Définitions des outils + exécution |
| `src/agent/prompts.ts` | System prompt dynamique |
| `src/bot/telegram.ts` | Bot Telegraf (handlers, sécurité) |
