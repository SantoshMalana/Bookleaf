import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

/**
 * Anthropic Messages API with forced tool use for structured output.
 * The API key is read from the environment on the server only; it is never sent to the browser.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    opts: { timeoutMs: number; maxRetries: number },
  ) {
    this.client = new Anthropic({ apiKey, timeout: opts.timeoutMs, maxRetries: opts.maxRetries });
  }

  async callStructured(req: LlmRequest): Promise<LlmResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      tools: [{ name: req.tool.name, description: req.tool.description, input_schema: req.tool.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: req.tool.name },
    });

    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    return {
      data: block?.input ?? null,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      model: res.model,
    };
  }
}
