# Design decisions — and how I'd defend each one

A reviewer's questions, with the honest answer, the alternative I rejected, and what would make me change my mind. Nothing here is aspirational: every claim maps to code or a test in this repo.

---

## Data & backend

### Why MongoDB?
The seed dataset is document-shaped (an author with nested books, royalty fields and a production stage) and a ticket thread is an append-only list of messages. Every author-facing query is one indexed filter on `author`. **Rejected:** Postgres. It would be equally valid; I'd pick it for reporting-heavy or multi-entity transactional work. **I'd switch if** we needed cross-ticket analytics joins or financial-grade transactions (royalty payout *execution*, not just display).

### Why is authorization in the service layer, not just route middleware?
Middleware says *who you are*; only the query knows *what you may see*. Each author service call is scoped by the caller's own author id, so forgetting a check in a new route cannot leak data. Someone else's ticket returns **404 not 403** so ids can't be probed. Author DTOs are separate types with no AI/priority/internal fields, so leaking them would need a code change, not a missed `if`. **Proven by:** cross-author isolation tests in `api.test.ts` and the e2e raw-JSON check that internal notes never reach the author.

### Why JWT in an httpOnly cookie (and Bearer too)?
httpOnly + SameSite=Lax means XSS can't read the token and cross-site POSTs don't carry it. Bearer is accepted for API clients and Swagger. **Trade-off:** stateless JWTs can't be revoked individually before expiry. **Next step:** short expiry + refresh token or a session store when we add password reset/SSO.

### Why SSE instead of WebSockets or just polling?
The data flow is one-way (server → browser); the browser already has REST for the other direction. SSE reconnects by itself, works through proxies, needs no library, and carries **only ids** — the client re-fetches through the normal authorised API, so the event channel can't leak data. Polling every 30 s is the safety net, and the header says "Live" or "Polling" honestly. **I'd switch to WebSockets if** we added typing indicators or collaborative editing (bidirectional, high frequency).

### What breaks at 100× scale?
The in-process SSE hub, triage queue and rate-limit stores are single-instance. At scale: Redis pub/sub for events, BullMQ for triage/draft jobs with retries and dead-lettering, shared rate-limit store, Atlas Search instead of regex. The crash-recovery sweep already makes the queue safe to lose; it just doesn't coordinate across instances. I chose not to build this now because it adds two infrastructure dependencies to a one-service demo and would be untestable by a reviewer.

---

## AI

### Why forced tool-calling + Zod, rather than "reply in JSON"?
Forcing a function call gives the provider a schema to satisfy; Zod then re-validates because a schema-valid-looking reply can still have an out-of-range enum or a 5,000-character string. A reply that doesn't validate is a *failure* (classified `invalid_output`, falls back), never trusted. **Proven by:** the fault-injecting provider tests.

### Why are priority floors in code, not in the prompt?
A prompt is a request; code is a guarantee. Legal/fraud language → Critical, ISBN error → ≥ High, overdue royalty → ≥ High, whatever the model says (`applyPriorityPolicy`). The model still adds value on the 90% that isn't a hard rule. Measured live: the model gets the category right 22/22 but priority only 17–19/22 exactly across runs — which is exactly why the business-critical floors can't depend on it.

### Why compute facts in code (payout dates, overdue)?
LLMs are unreliable at date arithmetic and will happily invent a "next payout date". The domain layer computes payout state deterministically and hands it to the model as facts; the model writes, it doesn't calculate.

### The bug I found in my own draft prompt (and the fix)
The live Groq run on the "no royalty ever" ticket (an *overdue* payout) produced a polite draft that told the author to wait for the next regular payout date — i.e. promising a **second delay** for a payment that is already BookLeaf's fault. Root cause: the FACTS block contained `NEXT_PAYOUT_DATE … (regular quarterly cycle)` even for overdue payouts, which invited it. Fixes, in layers:
1. **Facts:** for an overdue payout the next-payout fact is withheld and replaced by a deterministic `REQUIRED_ACTION` ("this is on us", escalate to finance, 48 hours, never point to a future date).
2. **Prompt:** rule 6 says `REQUIRED_ACTION` overrides every other instruction, plus a worked example with invented figures.
3. **Grounding validator (code):** after generation, `checkGrounding` compares every rupee amount, date, ISBN, URL and turnaround promise in the reply with the policy + facts the model was given — **never the author's text, and never the prompt's example** — and flags anything unsupported. It has one explicit business rule: an overdue payout answered with "next payout" is flagged. Warnings appear as `Auto-check:` lines in the "verify before sending" box.

I deliberately made the validator **advisory, not blocking**: a false alarm costs a reviewer a glance; a blocked reply or a silent rewrite costs trust in the tool. A human always sends.

### Why no RAG / vector database?
The whole knowledge base is ~750 tokens. Embedding retrieval would add a service, latency and a failure mode to *remove* a few hundred tokens. Instead the ticket's **category selects the KB section** deterministically. **I'd add retrieval when** the KB grows past what fits comfortably (several thousand tokens) or becomes per-book.

### Why gpt-oss-120b on Groq?
Short, structured, policy-bound tasks with a human reviewer: what matters is reliable tool-calling, latency and cost, not frontier reasoning. Measured live: triage median ≈ 0.65 s, drafts ≈ 1.1 s. It's a reasoning model, so `reasoning_effort: low` plus 1,024 tokens of head-room stops hidden reasoning tokens from eating the budget and leaving an empty tool call. The provider is an environment variable — Anthropic or any OpenAI-compatible model is one setting away.

### Cost, with the maths
Groq list price for gpt-oss-120b: $0.15 / M input, $0.60 / M output. Triage ≈ 900 tokens in/out total ≈ **$0.00018**; a draft (~1,300 in, ~300 out) ≈ **$0.00038**. Together ≈ **$0.0006 per ticket, ≈ $0.55–0.60 per 1,000 tickets**. Drafts are lazy, cached against a basis hash and de-duplicated, so unread tickets cost only the triage call. (An earlier version of this README said $0.0003 per ticket; that was wrong by about 2× and has been corrected.)

### What the eval does and doesn't prove
22 labelled cases, live model (this is the tuned-against set — see the held-out set and `eval:drafts` in the README): **category 22/22; priority 18/22 exact (17–19 across runs), 22/22 within one level**. Caveat I'd state unprompted: the author supplied the first seven cases, I wrote the rest, and I tuned prompts against the set — so it's a regression suite, not a held-out benchmark. The real quality signal is in the app: the **AI usage** page tracks drafts sent as-is vs edited and triage override rate, and authors can now rate answers.

### Graceful degradation
No key, timeout, 429, bad output or an open circuit breaker all end at the same place: the ticket exists, a rule-based classifier and policy-template draft are available, and the admin can override or write by hand. Ticket creation never awaits the AI (`setImmediate`), so the AI is *incapable* of breaking submission.

---

## Product

### Why lazy drafts?
Drafting at creation pays for replies nobody reads and goes stale when the author adds a message. Lazy + cached-by-basis-hash is cheaper and always current, at the price of a ~1–3 s wait the first time a ticket is opened (skeleton state covers it).

### Why quick replies, Ctrl/Cmd+Enter and the "Was this helpful?" rating?
Quick replies are fixed, human-written templates for the repetitive cases (works even when AI is down). Ctrl+Enter is a speed feature for people who answer dozens of tickets. The rating closes the quality loop: it's one tap for the author, clears if the ticket is reopened, and surfaces as a **Helpful rate** tile in the queue — a number the business can actually watch.

---

### Escalation must survive the first message
Triage runs once, on the first message. A ticket that begins as a bio question and later says "this is fraud, I'll go to the police" would have stayed Low with a 72-hour SLA — the exact failure the priority floors exist to prevent. So the same deterministic floors now run on every author follow-up (cheap regex, no AI call). They win even over an admin's manual priority, because the admin set it before the threat existed; the change and its reason are logged on the timeline. Writing the test also caught a real race: my first version read follow-ups *before* the model call, so one arriving during the call was missed — it is now read after.

### Spend cap vs circuit breaker
They solve different problems. The breaker stops us hammering a *failing* provider; the daily cap (`AI_DAILY_BUDGET_USD`) stops a *working* provider from running up a bill during a spam burst or a regeneration bug. Both end in the same place — rules and templates — so the cap adds no new failure mode, only a new reason code.

### Data minimisation
Authors paste bank accounts and phone numbers into support tickets. The model needs the situation, not the identifiers, so they are masked before the prompt is built (the stored ticket is unchanged). ISBNs, amounts and dates are deliberately kept because replies depend on them. Regex masking is a safety net, not a guarantee — real PII handling would add a vetted detection library and a provider data-processing agreement.

### Idempotent ticket creation
A double-click or a retry on a flaky connection should not create two tickets for the same complaint, which would split the thread and double the SLA noise. Same author + book + subject + text within two minutes returns the existing ticket with `200`. A deliberately edited resubmission is a new ticket.

### The overfitting I caught in my own fallback
I wrote the rule-based fallback while looking at the 22 eval cases and it scored 21/22. On 24 fresh cases it scored 17/24 category and 8/24 exact priority. I then fixed its misses — so I now quote the 17/24 as the honest held-out figure and treat the post-fix 23/24 as contaminated. The same caution applies to the live model: `heldout.json` was written after the prompts were final.

### What the live evals changed
The held-out triage run (live, 24 cases) got category right on every case it answered but priority exactly right only 16/24, and the misses clustered: damaged copies and a misspelt author name came back Medium when the rubric says High. I didn't tune the prompt against the set — I added two narrow code floors, consistent with "business-critical priority is code, not a prompt", and I quote the pre-fix numbers. The draft run (13 cases) was clean on grounding and injection, and every overdue case escalated to finance. Its two "failures" were my length check being too strict, which I said rather than quietly changing. The real draft weakness came from using the live app: a bare "ok" from the author got a reply that repeated itself and said "immediately" — now handled in the prompt and flagged by the grounding check.

## What I'd do next (in order)
1. Run the eval in CI against the live model and gate on category accuracy.
2. Redis + a durable job queue (scale-out safety).
3. SSO / magic-link login, password reset, admin MFA, audit log.
4. Email/WhatsApp notifications for replies.
5. PII redaction before text reaches the provider; per-day spend cap.

## What I'd say if asked "what are you least happy with?"
Priority accuracy isn't deterministic run-to-run (17–19/22), the eval set is small and tuned-against, attachments are UI-only, and realtime/queue are single-instance. The first is mitigated by code-level floors and human override; the rest are listed in the README's known limitations rather than hidden.
