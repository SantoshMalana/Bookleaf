import OpenAI from 'openai';
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

export interface OpenAiCompatibleOptions {
  timeoutMs: number;
  maxRetries: number;
  /** Provider label used in logs / the usage page (default "openai"). */
  name?: string;
  /** Point the SDK at any OpenAI-compatible endpoint (e.g. Groq). */
  baseURL?: string;
  /**
   * For reasoning models (e.g. gpt-oss): hidden "thinking" tokens are billed against the completion
   * budget, so we cap the effort and add head-room on top of the visible answer budget — otherwise a
   * tight max_tokens can be spent entirely on reasoning and no tool call is produced.
   */
  reasoning?: { effort: 'low' | 'medium' | 'high'; headroomTokens: number };
}

/** OpenAI Chat Completions (or any compatible API) with a forced function call for structured output. */
export class OpenAiProvider implements LlmProvider {
  readonly name: string;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly opts: OpenAiCompatibleOptions,
  ) {
    this.name = opts.name ?? 'openai';
    this.client = new OpenAI({ apiKey, baseURL: opts.baseURL, timeout: opts.timeoutMs, maxRetries: opts.maxRetries });
  }

  async callStructured(req: LlmRequest): Promise<LlmResult> {
    const reasoning = this.opts.reasoning;
    const res = await this.client.chat.completions.create({
      model: this.model,
      ...(reasoning
        ? { max_completion_tokens: req.maxTokens + reasoning.headroomTokens, reasoning_effort: reasoning.effort }
        : { max_tokens: req.maxTokens }),
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
