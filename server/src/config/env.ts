import 'dotenv/config';
import { z } from 'zod';

/** Treat `FOO=` (empty) in a .env file the same as "not set". */
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const optionalNumber = z.preprocess((v) => (v === '' || v === undefined ? undefined : Number(v)), z.number().positive().optional());
const bool = (def: boolean) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : String(v).toLowerCase() === 'true'), z.boolean());

const DEV_SECRET = 'dev-only-secret-change-me-please';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/bookleaf'),

  JWT_SECRET: z.string().min(16).default(DEV_SECRET),
  JWT_EXPIRES_IN: z.string().default('12h'),
  /** Only needed if the SPA is served from a different origin (local dev uses the Vite proxy instead). */
  CLIENT_ORIGIN: optionalString,

  /** Seed the database on boot when it is empty (makes one-click deploys demo-ready). */
  AUTO_SEED: bool(false),
  /** Exposes /auth/demo-accounts so reviewers can log in with one click. Keep OFF for a real deployment. */
  DEMO_MODE: bool(false),
  SEED_AUTHOR_PASSWORD: z.string().default('Author@123'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@123'),

  /** Override "today" for derived facts (payout dates etc.). Defaults to the real clock. */
  REFERENCE_DATE: optionalString,

  // ---- AI ----
  /** anthropic | openai | mock (dev/test only) | none. Auto-detected from available API keys when omitted. */
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'groq', 'mock', 'none']).optional(),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5'),
  GROQ_API_KEY: optionalString,
  /** Groq-hosted open-weight model (OpenAI-compatible API). */
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  GROQ_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  /** USD per million tokens, used only for the cost estimate on the AI usage page. */
  AI_PRICE_INPUT_PER_MTOK: optionalNumber,
  AI_PRICE_OUTPUT_PER_MTOK: optionalNumber,
  /** Hard daily ceiling on AI spend in USD (UTC day). When reached, triage/drafts fall back to rules/templates until tomorrow. 0 disables the cap. */
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).default(5),
  AI_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(4),
  AI_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(45000),

  LOG_LEVEL: z.string().default('info'),
  CLIENT_DIST: optionalString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}
const raw = parsed.data;

if (raw.NODE_ENV === 'production' && raw.JWT_SECRET === DEV_SECRET) {
  throw new Error('JWT_SECRET must be set to a strong random value in production.');
}

type Provider = 'anthropic' | 'openai' | 'groq' | 'mock' | 'none';

function resolveProvider(): Provider {
  if (raw.LLM_PROVIDER) return raw.LLM_PROVIDER;
  if (raw.ANTHROPIC_API_KEY) return 'anthropic';
  if (raw.GROQ_API_KEY) return 'groq';
  if (raw.OPENAI_API_KEY) return 'openai';
  return 'none';
}

/** Rough public list prices (USD / MTok); override with AI_PRICE_* when they change. */
const DEFAULT_PRICES: Record<Provider, { in: number; out: number }> = {
  anthropic: { in: 1, out: 5 },
  openai: { in: 0.15, out: 0.6 },
  groq: { in: 0.15, out: 0.6 }, // openai/gpt-oss-120b on Groq
  mock: { in: 0, out: 0 },
  none: { in: 0, out: 0 },
};

const provider = resolveProvider();

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  llm: {
    provider,
    model: provider === 'anthropic' ? raw.ANTHROPIC_MODEL : provider === 'groq' ? raw.GROQ_MODEL : provider === 'openai' ? raw.OPENAI_MODEL : provider === 'mock' ? 'mock-llm' : 'none',
    priceInPerMTok: raw.AI_PRICE_INPUT_PER_MTOK ?? DEFAULT_PRICES[provider].in,
    priceOutPerMTok: raw.AI_PRICE_OUTPUT_PER_MTOK ?? DEFAULT_PRICES[provider].out,
  },
} as const;

export type Env = typeof env;
