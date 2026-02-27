import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config';
import type { HAAgent } from '../agent';
import type { HADatabase } from '../db';
import { transcribeAudio } from '../transcription/whisper';

export function createBot(agent: HAAgent, db: HADatabase): Telegraf {
  const bot = new Telegraf(config.telegram.token);

  // Security middleware — block unauthorized users
  bot.use(async (ctx, next) => {
    if (config.telegram.allowedChatIds.length === 0) return next();
    const chatId = ctx.chat?.id;
    if (!chatId || !config.telegram.allowedChatIds.includes(chatId)) {
      await ctx.reply('Accès non autorisé.');
      return;
    }
    return next();
  });

  async function handleMessage(ctx: any, userMessage: string) {
    const chatId = ctx.chat.id;
    await ctx.sendChatAction('typing');
    const typingInterval = setInterval(() => ctx.sendChatAction('typing'), 4000);
    try {
      const reply = await agent.chat(chatId, userMessage);
      clearInterval(typingInterval);
      await ctx.reply(reply, { parse_mode: 'HTML' });
    } catch (error) {
      clearInterval(typingInterval);
      console.error('[Bot] Agent error:', error);
      await ctx.reply("Une erreur s'est produite. Réessaie dans un instant.");
    }
  }

  bot.command('start', async (ctx) => {
    await ctx.reply(
      'Bonjour ! Je suis ton assistant domotique.\n\n' +
        'Parle-moi en langage naturel :\n' +
        '- "Allume la lumière du salon"\n' +
        '- "Quelle est la température dans la chambre ?"\n' +
        '- "Alerte-moi quand la porte d\'entrée s\'ouvre"\n\n' +
        '/alertes — Voir tes alertes actives\n' +
        '/reset — Effacer l\'historique de conversation\n' +
        '/help — Aide'
    );
  });

  bot.command('reset', async (ctx) => {
    agent.clearHistory(ctx.chat.id);
    await ctx.reply('Historique effacé.');
  });

  bot.command('alertes', async (ctx) => {
    const chatId = ctx.chat.id;
    const alerts = db.getAlerts(chatId);
    if (alerts.length === 0) {
      await ctx.reply(
        'Aucune alerte active.\n\nDis-moi "alerte-moi quand [entité] change" pour en ajouter une.'
      );
    } else {
      const list = alerts.map((e) => `- <code>${e}</code>`).join('\n');
      await ctx.reply(`Alertes actives :\n${list}`, { parse_mode: 'HTML' });
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Commandes disponibles :\n\n' +
        '/start — Message de bienvenue\n' +
        '/alertes — Voir les alertes actives\n' +
        '/reset — Effacer l\'historique de conversation\n' +
        '/help — Afficher cette aide\n\n' +
        'Envoie n\'importe quel message texte ou vocal pour contrôler ta maison.'
    );
  });

  bot.on(message('text'), async (ctx) => {
    await handleMessage(ctx, ctx.message.text);
  });

  bot.on(message('voice'), async (ctx) => {
    await ctx.sendChatAction('typing');
    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const transcription = await transcribeAudio(fileLink.toString(), config.openai.apiKey);
      console.log(`[Bot] Transcription: "${transcription}"`);
      await handleMessage(ctx, transcription);
    } catch (error) {
      console.error('[Bot] Transcription error:', error);
      await ctx.reply('Impossible de transcrire le message audio. Réessaie.');
    }
  });

  return bot;
}
