# BookLeaf Author Portal — Write-up

## What I prioritised, and why

The brief weights AI integration and architecture highest, so I built the foundation for those first and treated the UI as the thing that makes them visible.

1. **Correctness of what authors see.** Royalty and payout facts are computed in code (45-day-after-quarter-end payout, ₹1,000 account-level minimum, overdue detection). A wrong number in an author's support reply is worse than a slow reply, so the model is given facts rather than asked to derive them.
2. **AI that is useful and safe.** Triage runs asynchronously so it can never block or break ticket creation. Drafts are grounded in the category-specific part of the knowledge base plus real account facts, include "verify before sending" and escalation flags, and a human always edits and sends. Legal/fraud, ISBN-error and overdue-royalty tickets have deterministic priority floors the model cannot lower.
3. **Graceful degradation.** No key, a timeout, a 429, invalid output or an open circuit breaker all lead to the same place: the ticket exists, a rule-based classifier and policy-template draft are available, and the admin can override or write by hand.
4. **Real isolation.** Author scoping is enforced in the service layer; other authors' resources return 404; author responses are separate DTOs with no internal or AI fields; the notes are excluded in the query itself. Tests cover the cross-author cases.
5. **Ops ergonomics.** The queue sorts by urgency and age, shows SLA/overdue pills and whether each label came from AI, rules or a person, and keeps filters in the URL.

## Trade-offs I made

- **In-process triage queue and SSE hub** instead of Redis/BullMQ. It is the simplest thing that is correct on one instance and keeps deployment to a single free service. A recovery sweep makes losing the queue safe. The cost is horizontal scaling, listed below.
- **Lazy drafts** (generated when an admin opens a ticket) rather than at creation: cheaper and always based on the latest conversation, at the price of a 1–3 s wait the first time a ticket is opened. A skeleton state covers it.
- **Small model by default.** Cheaper and fast enough for structured, policy-bound tasks where a human reviews the output; configurable per environment if drafts need more depth.
- **UI-only attachments, regex search, no password reset or email notifications**: in scope for "UI-only" or out of scope for the time, and listed as limitations rather than hidden.
- **Single origin (API serves the SPA)**: less flexible than separate hosting, but no CORS, cookie or SSE-proxy failure modes on a live demo.

## Path to production

1. **Scale-out safety:** Redis pub/sub for events, a durable job queue for triage/draft with retries and dead-lettering, shared rate-limit store.
2. **Data and files:** object storage with virus scanning for attachments; Atlas Search for ticket search; indexes reviewed against real query patterns; backups and retention.
3. **Security:** SSO or magic-link login, password reset, MFA for admins, CSRF token for cookie auth if the SPA moves cross-site, audit log of admin actions, secret rotation.
4. **AI operations:** run the eval set against the chosen model in CI, track draft acceptance (sent as-is vs edited) and triage override rate as quality metrics, add prompt caching and per-day spend caps, redact PII before it reaches the provider, and consider a larger model only for ticket types where edits are frequent.
5. **Observability:** structured logs already carry request ids; add metrics/traces, alerting on AI failure rate and SLA breaches, and a public status for the AI circuit.
6. **Product:** email/WhatsApp notifications for replies, canned responses built from accepted drafts, SLA breach escalation, and an author-facing royalty statement download.
