import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { haTools, executeTool } from './tools/ha';
import { getSystemPrompt } from './prompts';
import { config } from '../config';
import type { HAClient } from '../ha/client';

const MAX_HISTORY = 10;
const MAX_ITERATIONS = 10;

export class HAAgent {
  private anthropic: Anthropic;
  private ha: HAClient;
  private history = new Map<number, MessageParam[]>();

  constructor(ha: HAClient) {
    this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.ha = ha;
  }

  private getHistory(chatId: number): MessageParam[] {
    if (!this.history.has(chatId)) {
      this.history.set(chatId, []);
    }
    return this.history.get(chatId)!;
  }

  clearHistory(chatId: number): void {
    this.history.delete(chatId);
  }

  async chat(chatId: number, userMessage: string): Promise<string> {
    const messages = this.getHistory(chatId);
    messages.push({ role: 'user', content: userMessage });

    try {
      const reply = await this.runLoop(messages);
      // Trim history to avoid bloating context
      if (messages.length > MAX_HISTORY) {
        messages.splice(0, messages.length - MAX_HISTORY);
      }
      return reply;
    } catch (error) {
      // Remove the failed user message so history stays consistent
      messages.pop();
      throw error;
    }
  }

  private async runLoop(messages: MessageParam[]): Promise<string> {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: 4096,
        system: getSystemPrompt(),
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
            console.log(`[Agent] Tool call: ${block.name}`, block.input);
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              this.ha
            );
            console.log(`[Agent] Tool result: ${result.slice(0, 100)}...`);
            results.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        messages.push({ role: 'user', content: results });
        continue;
      }

      // stop_reason: 'max_tokens' or unexpected
      break;
    }

    return 'Nombre maximum de tours atteint.';
  }
}
