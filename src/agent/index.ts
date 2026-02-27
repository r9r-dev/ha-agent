import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { haTools, executeTool } from './tools/ha';
import { getSystemPrompt } from './prompts';
import { config } from '../config';
import type { HAClient } from '../ha/client';
import type { HADatabase } from '../db';

const MAX_HISTORY = 10;
const MAX_ITERATIONS = 10;

export class HAAgent {
  private anthropic: Anthropic;
  private ha: HAClient;
  private db: HADatabase;

  constructor(ha: HAClient, db: HADatabase) {
    this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.ha = ha;
    this.db = db;
  }

  clearHistory(chatId: number): void {
    this.db.clearHistory(chatId);
  }

  async chat(chatId: number, userMessage: string): Promise<string> {
    const history = this.db.getHistory(chatId, MAX_HISTORY);
    const existingCount = history.length;

    history.push({ role: 'user', content: userMessage });

    try {
      const prefs = this.db.getPreferences(chatId);
      const reply = await this.runLoop(history, chatId, prefs);
      // Persist all new messages (user + tool calls + response)
      this.db.appendMessages(chatId, history.slice(existingCount));
      return reply;
    } catch (error) {
      throw error;
    }
  }

  private async runLoop(
    messages: MessageParam[],
    chatId: number,
    prefs: Record<string, string>
  ): Promise<string> {
    const prefText = Object.entries(prefs)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
    const system =
      getSystemPrompt() +
      (prefText ? `\n\nInformations mémorisées sur l'utilisateur:\n${prefText}` : '');

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: 4096,
        system,
        tools: haTools,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const text = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text'
        );
        return text?.text ?? 'Pas de réponse.';
      }

      if (response.stop_reason === 'tool_use') {
        const results: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            console.log(`[Agent] Tool: ${block.name}`, block.input);
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              { ha: this.ha, db: this.db, chatId }
            );
            results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          }
        }

        messages.push({ role: 'user', content: results });
        continue;
      }

      break;
    }

    return 'Nombre maximum de tours atteint.';
  }
}
