# Guide de mise en place

## 1. Créer le bot Telegram

1. Ouvre Telegram et parle à `@BotFather`
2. Envoie `/newbot` et suis les instructions
3. Copie le token → `TELEGRAM_TOKEN`

## 2. Obtenir ton Chat ID Telegram

1. Envoie un message à `@userinfobot`
2. Copie l'ID retourné → `ALLOWED_CHAT_IDS`

## 3. Créer un token Home Assistant

1. Dans HA: **Profil** > **Sécurité** > **Tokens d'accès longue durée**
2. Clique "Créer un token", donne-lui un nom (ex: "ha-agent")
3. Copie le token → `HA_TOKEN`

## 4. Configurer l'environnement

```bash
cp .env.example .env
# Édite .env avec tes valeurs
```

## 5. Lancer en développement

```bash
bun run dev
```

## 6. Lancer en production (Docker)

```bash
docker compose up -d
```

## 7. Surveiller les logs

```bash
docker compose logs -f ha-agent
```

## Alertes proactives

Pour recevoir des alertes quand une entité change d'état, configure:

```env
WATCHED_ENTITIES=binary_sensor.porte_entree,binary_sensor.mouvement_salon
NOTIFY_CHAT_IDS=123456789
```

### Trouver les entity_id
Demande au bot: "liste les capteurs binaires" ou "liste les capteurs de mouvement"
