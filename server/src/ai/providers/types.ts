import type { ToolDefinition } from '../schemas.js';

export interface LlmRequest {
  system: string;
  user: string;
  /** The model is forced to answer by calling this tool → structured JSON output. */
  tool: ToolDefinition;
  maxTokens: number;
  temperature: number;
}

export interface LlmResult {
  /** Raw (unvalidated) tool input from the model. */
  data: unknown;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  callStructured(req: LlmRequest): Promise<LlmResult>;
}

export type AiFailureReason = 'not_configured' | 'circuit_open' | 'rate_limited' | 'timeout' | 'auth' | 'provider_error' | 'invalid_output' | 'budget_exceeded';

/** Anything that stops the AI path; callers degrade gracefully instead of failing the request. */
export class AiUnavailableError extends Error {
  constructor(
    public readonly reason: AiFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
