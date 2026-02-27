function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante: ${name}`);
  return value;
}

export const config = {
  telegram: {
    token: required('TELEGRAM_TOKEN'),
    allowedChatIds: process.env.ALLOWED_CHAT_IDS
      ? process.env.ALLOWED_CHAT_IDS.split(',').map(Number)
      : [],
  },
  ha: {
    url: process.env.HA_URL ?? 'http://homeassistant.local:8123',
    token: required('HA_TOKEN'),
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
  },
  openai: {
    apiKey: required('OPENAI_API_KEY'),
  },
  alerts: {
    watchedEntities: process.env.WATCHED_ENTITIES
      ? process.env.WATCHED_ENTITIES.split(',').filter(Boolean)
      : [],
    notifyChatIds: process.env.NOTIFY_CHAT_IDS
      ? process.env.NOTIFY_CHAT_IDS.split(',').map(Number).filter(Boolean)
      : [],
  },
};
