import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config';
import type { HAAgent } from '../agent';
import { transcribeAudio } from '../transcription/whisper';

export function createBot(agent: HAAgent): Telegraf {
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

  async function handleMessage(ctx: any, agent: HAAgent, userMessage: string) {
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
        'Tu peux me parler en langage naturel pour contrôler ta maison :\n' +
        '- "Allume la lumière du salon"\n' +
        '- "Quelle est la température dans la chambre ?"\n' +
        '- "Éteins tout dans le bureau"\n' +
        '- "Mets le thermostat à 20 degrés"\n\n' +
        '/reset — Effacer l\'historique de conversation\n' +
        '/help — Afficher l\'aide'
    );
  });

  bot.command('reset', async (ctx) => {
    agent.clearHistory(ctx.chat.id);
    await ctx.reply('Historique effacé.');
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Commandes disponibles :\n\n' +
        '/start — Message de bienvenue\n' +
        '/reset — Effacer l\'historique de conversation\n' +
        '/help — Afficher cette aide\n\n' +
        'Envoie n\'importe quel message en langage naturel pour contrôler ta maison.'
    );
  });

  bot.on(message('text'), async (ctx) => {
    await handleMessage(ctx, agent, ctx.message.text);
  });

  bot.on(message('voice'), async (ctx) => {
    await ctx.sendChatAction('typing');
    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const transcription = await transcribeAudio(fileLink.toString(), config.openai.apiKey);
      console.log(`[Bot] Transcription: "${transcription}"`);
      await handleMessage(ctx, agent, transcription);
    } catch (error) {
      console.error('[Bot] Transcription error:', error);
      await ctx.reply('Impossible de transcrire le message audio. Réessaie.');
    }
  });

  return bot;
}
