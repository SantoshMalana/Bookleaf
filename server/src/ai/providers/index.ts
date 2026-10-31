import { env } from '../../config/env.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAiProvider } from './openai.js';
import { MockProvider } from './mock.js';
import type { LlmProvider } from './types.js';

let provider: LlmProvider | null | undefined;

function createProvider(): LlmProvider | null {
  const opts = { timeoutMs: env.AI_TIMEOUT_MS, maxRetries: env.AI_MAX_RETRIES };
  switch (env.llm.provider) {
    case 'anthropic':
      return env.ANTHROPIC_API_KEY ? new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL, opts) : null;
    case 'openai':
      return env.OPENAI_API_KEY ? new OpenAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL, opts) : null;
    case 'groq':
      return env.GROQ_API_KEY
        ? new OpenAiProvider(env.GROQ_API_KEY, env.GROQ_MODEL, {
            ...opts,
            name: 'groq',
            baseURL: 'https://api.groq.com/openai/v1',
            reasoning: { effort: env.GROQ_REASONING_EFFORT, headroomTokens: 1024 },
          })
        : null;
    case 'mock':
      return new MockProvider();
    default:
      return null;
  }
}

/** The configured provider, or null when AI is disabled (the app keeps working without it). */
export function getProvider(): LlmProvider | null {
  if (provider === undefined) provider = createProvider();
  return provider;
}

/** Test hook: swap the provider (pass null to simulate "not configured"). */
export function setProvider(p: LlmProvider | null): void {
  provider = p;
}

export { AiUnavailableError } from './types.js';
export type { LlmProvider } from './types.js';
