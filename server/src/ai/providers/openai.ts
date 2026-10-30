import OpenAI from 'openai';
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

/** OpenAI Chat Completions with a forced function call for structured output. */
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    opts: { timeoutMs: number; maxRetries: number },
  ) {
    this.client = new OpenAI({ apiKey, timeout: opts.timeoutMs, maxRetries: opts.maxRetries });
  }

  async callStructured(req: LlmRequest): Promise<LlmResult> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      tools: [{ type: 'function', function: { name: req.tool.name, description: req.tool.description, parameters: req.tool.schema } }],
      tool_choice: { type: 'function', function: { name: req.tool.name } },
    });

    const call = res.choices[0]?.message.tool_calls?.[0];
    let data: unknown = null;
    if (call && call.type === 'function') {
      try {
        data = JSON.parse(call.function.arguments);
      } catch {
        data = null; // caller's schema validation turns this into invalid_output
      }
    }
    return {
      data,
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      model: res.model,
    };
  }
}
