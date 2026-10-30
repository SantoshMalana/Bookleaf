import { fallbackClassify } from '../fallback-classifier.js';
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

export interface MockOptions {
  /** Throw this for every call (simulates an outage). */
  failWith?: Error;
  /** Return this instead of well-formed output (simulates a model returning junk). */
  returnData?: unknown;
  latencyMs?: number;
}

/**
 * Deterministic stand-in for a real LLM. Used by the test-suite and by `LLM_PROVIDER=mock`
 * for local UI development without an API key. NOT meant for production: drafts it writes
 * are clearly labelled as mock output.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'mock-llm';
  calls: LlmRequest[] = [];

  constructor(public opts: MockOptions = {}) {}

  async callStructured(req: LlmRequest): Promise<LlmResult> {
    this.calls.push(req);
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    if (this.opts.failWith) throw this.opts.failWith;
    if (this.opts.returnData !== undefined) return { data: this.opts.returnData, inputTokens: 100, outputTokens: 20, model: this.model };

    const inputTokens = Math.ceil((req.system.length + req.user.length) / 4);

    if (req.tool.name === 'classify_ticket') {
      const subject = /<subject>([\s\S]*?)<\/subject>/.exec(req.user)?.[1] ?? '';
      const description = /<description>([\s\S]*?)<\/description>/.exec(req.user)?.[1] ?? '';
      const r = fallbackClassify(subject, description);
      return {
        data: { category: r.category, priority: r.priority, confidence: 0.9, rationale: 'Mock LLM classification.' },
        inputTokens,
        outputTokens: 40,
        model: this.model,
      };
    }

    const first = /first name: (\S+)/.exec(req.user)?.[1] ?? 'there';
    return {
      data: {
        reply: `Hi ${first},\n\nThank you for your message — we understand how important this is to you. [MOCK DRAFT: no LLM is configured, so this text is a placeholder generated locally.]\n\nOur team will review the details on your account and get back to you within 48 hours with a clear update.\n\nNext step: reply here with any extra details you would like us to look at.`,
        verify_before_sending: ['This is mock output — replace with a real draft or write manually.'],
        needs_escalation: false,
        escalation_team: 'none',
      },
      inputTokens,
      outputTokens: 120,
      model: this.model,
    };
  }
}
