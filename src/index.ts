import { HAClient } from './ha/client';
import { HAAgent } from './agent';
import { HADatabase } from './db';
import { createBot } from './bot/telegram';
import { config } from './config';
import type { HAEvent } from './ha/client';

async function main() {
  console.log('[HA Agent] Démarrage...');

  const ha = new HAClient(config.ha.url, config.ha.token);
  const db = new HADatabase();

  try {
    const states = await ha.getStates();
    console.log(`[HA] Connecté. ${states.length} entités trouvées.`);
  } catch (error) {
    console.error('[HA] Impossible de se connecter à Home Assistant:', error);
    process.exit(1);
  }

  const agent = new HAAgent(ha, db);
  const bot = createBot(agent, db);

  setupAlerts(ha, bot, db);
  startScheduler(ha, bot, db);

  await bot.launch();
  console.log('[HA Agent] Bot Telegram démarré.');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

function setupAlerts(
  ha: HAClient,
  bot: ReturnType<typeof createBot>,
  db: HADatabase
) {
  ha.startEventListener('state_changed', async (event: HAEvent) => {
    if (event.event_type !== 'state_changed') return;

    const { entity_id, old_state, new_state } = event.data;
    if (!entity_id) return;

    const oldVal = old_state?.state ?? 'inconnu';
    const newVal = new_state?.state ?? 'inconnu';
    if (oldVal === newVal) return;

    // Récupère dynamiquement tous les chats qui surveillent cette entité
    const activeAlerts = db.getAllActiveAlerts().filter((a) => a.entityId === entity_id);
    if (activeAlerts.length === 0) return;

    const name = (new_state?.attributes?.friendly_name as string) ?? entity_id;
    const msg = `Alerte domotique\n${name}: ${oldVal} → ${newVal}`;

    for (const { chatId } of activeAlerts) {
      try {
        await bot.telegram.sendMessage(chatId, msg);
      } catch (err) {
        console.error(`[Alert] Envoi échoué vers ${chatId}:`, err);
      }
    }
  });

  const count = db.getAllActiveAlerts().length;
  console.log(`[Alerts] ${count} alerte(s) active(s) au démarrage.`);
}

function startScheduler(
  ha: HAClient,
  bot: ReturnType<typeof createBot>,
  db: HADatabase
) {
  const INTERVAL_MS = 15_000;

  setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);
    const tasks = db.getPendingTasks(now);

    for (const task of tasks) {
      try {
        await ha.callService(task.domain, task.service, task.data);
        db.markTaskExecuted(task.id);
        console.log(`[Scheduler] Tâche ${task.id} exécutée: ${task.description}`);
        await bot.telegram.sendMessage(
          task.chatId,
          `Action effectuée: ${task.description}`
        );
      } catch (err) {
        console.error(`[Scheduler] Erreur tâche ${task.id}:`, err);
        await bot.telegram.sendMessage(
          task.chatId,
          `Erreur lors de l'exécution: ${task.description}`
        ).catch(() => {});
      }
    }
  }, INTERVAL_MS);

  console.log(`[Scheduler] Démarré (vérification toutes les ${INTERVAL_MS / 1000}s).`);
}

main().catch((err) => {
  console.error('[HA Agent] Erreur fatale:', err);
  process.exit(1);
});
