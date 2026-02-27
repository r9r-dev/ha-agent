import { HAClient } from './ha/client';
import { HAAgent } from './agent';
import { createBot } from './bot/telegram';
import { config } from './config';
import type { HAEvent } from './ha/client';

async function main() {
  console.log('[HA Agent] Démarrage...');

  // Init HA client
  const ha = new HAClient(config.ha.url, config.ha.token);

  // Verify HA connection
  try {
    const states = await ha.getStates();
    console.log(`[HA] Connecté. ${states.length} entités trouvées.`);
  } catch (error) {
    console.error('[HA] Impossible de se connecter à Home Assistant:', error);
    process.exit(1);
  }

  // Init agent
  const agent = new HAAgent(ha);

  // Init Telegram bot
  const bot = createBot(agent);

  // Setup proactive alerts
  if (
    config.alerts.watchedEntities.length > 0 &&
    config.alerts.notifyChatIds.length > 0
  ) {
    setupAlerts(ha, bot, config.alerts.watchedEntities, config.alerts.notifyChatIds);
  }

  // Launch bot (long polling)
  await bot.launch();
  console.log('[HA Agent] Bot Telegram démarré.');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

function setupAlerts(
  ha: HAClient,
  bot: ReturnType<typeof createBot>,
  watchedEntities: string[],
  notifyChatIds: number[]
) {
  const watched = new Set(watchedEntities);

  ha.startEventListener('state_changed', async (event: HAEvent) => {
    if (event.event_type !== 'state_changed') return;

    const { entity_id, old_state, new_state } = event.data;
    if (!entity_id || !watched.has(entity_id)) return;

    const oldVal = old_state?.state ?? 'inconnu';
    const newVal = new_state?.state ?? 'inconnu';
    if (oldVal === newVal) return;

    const name = (new_state?.attributes?.friendly_name as string) ?? entity_id;
    const msg = `Alerte domotique\n${name}: ${oldVal} → ${newVal}`;

    for (const chatId of notifyChatIds) {
      try {
        await bot.telegram.sendMessage(chatId, msg);
      } catch (err) {
        console.error(`[Alert] Envoi échoué vers ${chatId}:`, err);
      }
    }
  });

  console.log(
    `[Alerts] Surveillance de ${watched.size} entité(s): ${[...watched].join(', ')}`
  );
}

main().catch((err) => {
  console.error('[HA Agent] Erreur fatale:', err);
  process.exit(1);
});
