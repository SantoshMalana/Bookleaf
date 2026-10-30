/**
 * Minimal circuit breaker around the LLM provider.
 *
 * When the provider is down or rate-limiting us, every ticket would otherwise wait out a
 * full timeout (plus retries) before falling back. After N consecutive failures we "open"
 * the breaker and skip the provider entirely for a cool-down period, so tickets get their
 * rule-based triage instantly. After the cool-down a single trial call is allowed
 * ("half-open"); success closes the breaker again.
 */
export type BreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private trialInFlight = false;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  get state(): BreakerState {
    if (this.failures < this.threshold) return 'closed';
    return this.clock() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  /** May a call go through right now? */
  allow(): boolean {
    const s = this.state;
    if (s === 'closed') return true;
    if (s === 'half-open' && !this.trialInFlight) {
      this.trialInFlight = true;
      return true;
    }
    return false;
  }

  success(): void {
    this.failures = 0;
    this.trialInFlight = false;
  }

  failure(): void {
    this.trialInFlight = false;
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.clock();
  }

  retryAfterMs(): number {
    return this.state === 'open' ? Math.max(0, this.cooldownMs - (this.clock() - this.openedAt)) : 0;
  }
}
